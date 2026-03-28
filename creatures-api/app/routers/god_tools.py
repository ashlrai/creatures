"""God Agent AI Tools — conversational Q&A, experiments, anomalies, stories, tuning."""

from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/god", tags=["god-tools"])


def _get_god_and_context(bw_id: str) -> tuple:
    """Get God Agent and current context for a brain-world.

    Lazily creates a God Agent if one doesn't exist yet (handles the case
    where /step was called manually without the background auto-run loop).
    """
    from app.routers.ecosystem import _brain_world_god, _brain_worlds

    if bw_id not in _brain_worlds:
        raise HTTPException(404, f"Brain-world {bw_id} not found")

    god = _brain_world_god.get(bw_id)
    if not god:
        from creatures.god.agent import GodAgent, GodConfig
        god = GodAgent(config=GodConfig(provider="auto"), run_id=bw_id)
        _brain_world_god[bw_id] = god

    bw = _brain_worlds[bw_id]
    eco = bw.ecosystem

    # Build rich context
    pop_stats = bw.get_population_stats() if hasattr(bw, 'get_population_stats') else {}
    context = {
        "alive": pop_stats.get("alive", int(eco.alive.sum())),
        "max_generation": pop_stats.get("max_generation", 0),
        "n_lineages": pop_stats.get("n_lineages", 0),
        "mean_energy": pop_stats.get("mean_energy", 0),
        "mean_lifetime_food": pop_stats.get("mean_lifetime_food", 0),
        "births": eco._total_born,
        "deaths": eco._total_died,
        "food_alive": int(eco.food_alive.sum()),
        "observations_count": len(god.observations),
        "recent_observations": god.observations[-3:] if god.observations else [],
        "intervention_history": [{"analysis": h.get("analysis", "")[:100]} for h in god.history[-3:]],
    }
    return god, context


class AskRequest(BaseModel):
    bw_id: str
    question: str = Field(..., max_length=500)


@router.post("/ask")
async def ask_god(req: AskRequest):
    """Ask the God Agent a question about the current ecosystem."""
    god, ctx = _get_god_and_context(req.bw_id)

    prompt = f"""ROLE: You are a computational biologist analyzing a real-time artificial evolution experiment.

CONTEXT: Organisms are virtual creatures with spiking neural networks (Izhikevich neurons). \
They forage for food using neural-driven motor output. Neural weights are inherited from parents \
with mutation. Each organism has sensory neurons that detect nearby food and obstacles, \
interneurons that process information, and motor neurons that drive movement. Evolution occurs \
through differential survival: organisms that eat more food gain energy, reproduce, and pass \
their neural wiring to offspring with small random mutations.

CURRENT STATE:
- Organisms alive: {ctx['alive']}
- Max generation reached: {ctx['max_generation']}
- Surviving lineages (distinct evolutionary lines): {ctx['n_lineages']}
- Mean energy across population: {ctx['mean_energy']:.1f}
- Mean lifetime food consumed: {ctx['mean_lifetime_food']:.1f}
- Total births: {ctx['births']}, total deaths: {ctx['deaths']}
- Survival ratio: {ctx['alive']}/{ctx['births']} ({100*ctx['alive']/max(ctx['births'],1):.0f}%)
- Food sources available: {ctx['food_alive']}

RECENT OBSERVATIONS:
{ctx['recent_observations']}

PAST INTERVENTIONS:
{ctx['intervention_history']}

USER QUESTION: {req.question}

Answer concisely and scientifically. Reference specific data points from the state above. \
Identify any evolutionary trends or emergent behaviors. If you can suggest a concrete \
intervention (food_scarcity, predator_surge, mutation_burst, climate_shift), include it \
with reasoning."""

    try:
        response = await god._call_llm(prompt)
        return {"question": req.question, "answer": response, "context": ctx}
    except Exception as exc:
        return {"question": req.question, "answer": f"AI unavailable: {exc}. Based on data: {ctx['alive']} organisms alive, generation {ctx['max_generation']}, {ctx['n_lineages']} lineages.", "context": ctx}


class ExperimentRequest(BaseModel):
    bw_id: str
    topic: str = Field("", max_length=300)


@router.post("/propose-experiment")
async def propose_experiment(req: ExperimentRequest):
    """Ask the God Agent to propose a scientific experiment."""
    god, ctx = _get_god_and_context(req.bw_id)

    topic_text = f"focusing on: {req.topic}" if req.topic else "based on what you observe"
    prompt = f"""ROLE: You are a computational biologist designing experiments for a real-time artificial evolution platform.

CONTEXT: Organisms are virtual creatures with spiking neural networks (Izhikevich neurons). \
They forage for food using neural-driven motor output. Neural weights are inherited from parents \
with mutation. Evolution is open-ended — there is no predetermined fitness function beyond survival.

CURRENT STATE:
- Organisms alive: {ctx['alive']}, max generation: {ctx['max_generation']}
- Surviving lineages: {ctx['n_lineages']}
- Total births: {ctx['births']}, deaths: {ctx['deaths']}
- Mean energy: {ctx['mean_energy']:.1f}, food sources: {ctx['food_alive']}

RECENT OBSERVATIONS:
{ctx['recent_observations']}

AVAILABLE INTERVENTIONS (these are the only ones the system can execute):
- food_scarcity: Remove 50-80% of food sources, forcing competition
- predator_surge: Introduce predator organisms that hunt based on proximity
- mutation_burst: Temporarily 10x mutation rate, creating rapid neural variation
- climate_shift: Change world temperature/toxicity, altering metabolic costs

Propose one specific, testable experiment {topic_text}. Choose an intervention that \
will produce observable, measurable results within 50-200 generations.

Respond in JSON:
{{
    "hypothesis": "A falsifiable scientific hypothesis",
    "experiment": "Step-by-step protocol: what to measure before, what to change, what to measure after",
    "intervention": "food_scarcity|predator_surge|mutation_burst|climate_shift",
    "intervention_params": {{"severity": 0.0-1.0, "duration_steps": 100-1000}},
    "expected_outcome": "Specific, measurable prediction",
    "null_hypothesis": "What would disprove this",
    "why": "Scientific reasoning grounded in evolutionary biology or neuroscience"
}}"""

    try:
        response = await god._call_llm(prompt)
        return {"proposal": response, "context": ctx}
    except Exception:
        return {"proposal": f"Suggest: trigger food_scarcity to test if evolved lineages (gen {ctx['max_generation']}) are more resilient than random organisms.", "context": ctx}


@router.post("/detect-anomalies")
async def detect_anomalies(req: AskRequest):
    """Ask the God Agent to identify unusual patterns."""
    god, ctx = _get_god_and_context(req.bw_id)

    prompt = f"""ROLE: You are a computational biologist monitoring a real-time artificial evolution experiment for anomalies.

CONTEXT: Organisms are virtual creatures with spiking neural networks (Izhikevich neurons) \
that forage for food. Neural weights are inherited with mutation. You are looking for deviations \
from expected evolutionary dynamics — things that would surprise a biologist.

CURRENT STATE:
- Organisms alive: {ctx['alive']}, max generation: {ctx['max_generation']}
- Surviving lineages: {ctx['n_lineages']}
- Total births: {ctx['births']}, deaths: {ctx['deaths']}
- Death rate: {ctx['deaths']/max(ctx['births'],1)*100:.0f}%
- Mean energy: {ctx['mean_energy']:.1f}, food sources: {ctx['food_alive']}

RECENT OBSERVATIONS:
{ctx['recent_observations']}

PAST INTERVENTIONS:
{ctx['intervention_history']}

Identify the 2-3 most anomalous or scientifically surprising patterns. For each anomaly:
1. OBSERVATION: What specific data point or trend is unusual (cite numbers)
2. EXPECTED: What you would normally expect based on evolutionary theory
3. SIGNIFICANCE: Why this deviation matters (link to real biology concepts)
4. INVESTIGATION: A concrete next step to understand the anomaly

Prioritize anomalies that suggest emergent complexity, unexpected cooperation, \
neural circuit innovation, or evolutionary dead ends."""

    try:
        response = await god._call_llm(prompt)
        return {"anomalies": response, "context": ctx}
    except Exception:
        return {"anomalies": f"Data summary: {ctx['alive']} alive from {ctx['births']} births and {ctx['deaths']} deaths. {ctx['n_lineages']} lineages competing.", "context": ctx}


@router.post("/story")
async def tell_story(req: AskRequest):
    """Ask the God Agent to narrate the evolutionary story."""
    god, ctx = _get_god_and_context(req.bw_id)

    all_obs = god.observations[-20:]  # Last 20 observations for narrative arc
    prompt = f"""ROLE: You are a science writer documenting a real artificial evolution experiment for a Nature-style narrative.

CONTEXT: This is a virtual ecosystem where organisms with spiking neural networks (Izhikevich neurons) \
evolve through natural selection. There is no predetermined goal — organisms must forage for food \
to gain energy, survive, and reproduce. Their neural wiring is inherited with mutation. What you \
are narrating is genuinely open-ended evolution of neural circuits.

FULL OBSERVATION HISTORY ({len(all_obs)} data points):
{all_obs}

CURRENT STATE:
- Organisms alive: {ctx['alive']}, max generation: {ctx['max_generation']}
- Surviving lineages: {ctx['n_lineages']}
- Total births: {ctx['births']}, deaths: {ctx['deaths']}
- Mean energy: {ctx['mean_energy']:.1f}, food sources: {ctx['food_alive']}

PAST INTERVENTIONS:
{ctx['intervention_history']}

Write a compelling 3-4 paragraph scientific narrative with a clear ARC structure:

PARAGRAPH 1 — GENESIS: How the ecosystem began. What was the initial state? Were organisms \
mostly random wanderers, or did some show early promise?

PARAGRAPH 2 — CONFLICT: The key turning points. When did lineages diverge? Were there \
extinction events, population crashes, or competitive exclusions? Name specific generations \
where things changed and why.

PARAGRAPH 3 — ADAPTATION: What neural/behavioral innovations emerged? Did organisms evolve \
food-seeking, obstacle avoidance, energy conservation, or surprising strategies? Be specific \
about what the neural circuits might be doing.

PARAGRAPH 4 — HORIZON: Where is this evolution heading? What pressures are shaping the \
next phase? What would you predict for the next 100 generations?

Write in vivid, precise scientific prose. Use specific numbers from the data. \
Treat these organisms as real subjects of scientific inquiry."""

    try:
        response = await god._call_llm(prompt)
        return {"story": response, "context": ctx}
    except Exception:
        return {"story": f"This ecosystem began with {ctx['births'] + ctx['deaths']} total organisms. Through {ctx['deaths']} deaths and {ctx['births']} births, {ctx['n_lineages']} lineages now compete across {ctx['max_generation']} generations.", "context": ctx}


class TuningRequest(BaseModel):
    bw_id: str
    goal: str = Field("improve evolution speed", max_length=300)


@router.post("/suggest-tuning")
async def suggest_tuning(req: TuningRequest):
    """Ask the God Agent to suggest parameter changes."""
    god, ctx = _get_god_and_context(req.bw_id)

    prompt = f"""ROLE: You are a computational biologist tuning parameters for an artificial evolution experiment.

CONTEXT: Organisms are virtual creatures with spiking neural networks (Izhikevich neurons). \
They forage for food using neural-driven motor output. Neural weights are inherited from parents \
with mutation. The simulation has tunable parameters that control evolutionary dynamics.

CURRENT STATE:
- Organisms alive: {ctx['alive']}, max generation: {ctx['max_generation']}
- Surviving lineages: {ctx['n_lineages']}
- Total births: {ctx['births']}, deaths: {ctx['deaths']}
- Mean energy: {ctx['mean_energy']:.1f}, food sources: {ctx['food_alive']}

TUNING GOAL: {req.goal}

TUNABLE PARAMETERS (with current approximate values):
- mutation_sigma: 0.02-0.05 (controls magnitude of weight changes per generation)
- metabolic_rate: 0.5/step (energy cost of being alive — higher = more pressure to eat)
- food_count: {ctx['food_alive']} sources (more food = easier survival = weaker selection)
- reproduction_threshold: energy > 150 (lower = faster reproduction = larger populations)
- neuron_noise: 0.01 (stochastic input to neurons — higher = more exploration)

Suggest 2-3 specific parameter changes to achieve the goal. For each, respond in this format:

1. **Parameter**: exact parameter name
   - Current: value
   - Suggested: value
   - Effect: what this change will do to evolutionary dynamics (cite real biology parallels)
   - Risk: what could go wrong (e.g., population collapse, convergence to trivial solutions)
   - Confidence: low/medium/high

Ground your suggestions in evolutionary theory. Consider tradeoffs between exploration \
and exploitation, selection pressure and genetic drift, population size and diversity."""

    try:
        response = await god._call_llm(prompt)
        return {"suggestions": response, "goal": req.goal, "context": ctx}
    except Exception:
        return {"suggestions": f"To {req.goal}: consider increasing mutation_sigma to 0.08 for faster exploration, or reducing food by 30% for stronger selection pressure.", "goal": req.goal, "context": ctx}
