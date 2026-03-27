"""God Agent AI Tools — conversational Q&A, experiments, anomalies, stories, tuning."""

from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/god", tags=["god-tools"])


def _get_god_and_context(bw_id: str) -> tuple:
    """Get God Agent and current context for a brain-world."""
    from app.routers.ecosystem import _brain_world_god, _brain_worlds

    if bw_id not in _brain_worlds:
        raise HTTPException(404, f"Brain-world {bw_id} not found")

    god = _brain_world_god.get(bw_id)
    if not god:
        raise HTTPException(404, f"No God Agent for {bw_id}")

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
    question: str


@router.post("/ask")
async def ask_god(req: AskRequest):
    """Ask the God Agent a question about the current ecosystem."""
    god, ctx = _get_god_and_context(req.bw_id)

    prompt = f"""You are an AI scientist observing a virtual ecosystem with evolving organisms that have real spiking neural networks.

CURRENT STATE:
- Organisms alive: {ctx['alive']}
- Max generation: {ctx['max_generation']}
- Surviving lineages: {ctx['n_lineages']}
- Mean energy: {ctx['mean_energy']:.1f}
- Mean lifetime food: {ctx['mean_lifetime_food']:.1f}
- Total births: {ctx['births']}, deaths: {ctx['deaths']}
- Food sources alive: {ctx['food_alive']}

RECENT HISTORY:
{ctx['recent_observations']}

USER QUESTION: {req.question}

Answer concisely and scientifically. Reference specific data points. If you can suggest an intervention, include it."""

    try:
        response = await god._call_llm(prompt)
        return {"question": req.question, "answer": response, "context": ctx}
    except Exception as exc:
        return {"question": req.question, "answer": f"AI unavailable: {exc}. Based on data: {ctx['alive']} organisms alive, generation {ctx['max_generation']}, {ctx['n_lineages']} lineages.", "context": ctx}


class ExperimentRequest(BaseModel):
    bw_id: str
    topic: str = ""


@router.post("/propose-experiment")
async def propose_experiment(req: ExperimentRequest):
    """Ask the God Agent to propose a scientific experiment."""
    god, ctx = _get_god_and_context(req.bw_id)

    topic_text = f"focusing on: {req.topic}" if req.topic else "based on what you observe"
    prompt = f"""You are an AI scientist observing evolving organisms with real neural networks.

STATE: {ctx['alive']} alive, gen {ctx['max_generation']}, {ctx['n_lineages']} lineages, {ctx['births']} births, {ctx['deaths']} deaths

Propose one specific, testable experiment {topic_text}.

Respond in JSON: {{"hypothesis": "...", "experiment": "...", "intervention": "food_scarcity|predator_surge|mutation_burst|climate_shift", "expected_outcome": "...", "why": "..."}}"""

    try:
        response = await god._call_llm(prompt)
        return {"proposal": response, "context": ctx}
    except Exception:
        return {"proposal": f"Suggest: trigger food_scarcity to test if evolved lineages (gen {ctx['max_generation']}) are more resilient than random organisms.", "context": ctx}


@router.post("/detect-anomalies")
async def detect_anomalies(req: AskRequest):
    """Ask the God Agent to identify unusual patterns."""
    god, ctx = _get_god_and_context(req.bw_id)

    prompt = f"""You are monitoring a virtual ecosystem for anomalies and surprising patterns.

STATE: {ctx['alive']} alive, gen {ctx['max_generation']}, {ctx['n_lineages']} lineages
HISTORY: {ctx['recent_observations']}
INTERVENTIONS: {ctx['intervention_history']}

Identify the 2-3 most unusual or surprising things happening. For each:
1. What's unusual
2. Why it matters
3. What to investigate next

Be specific and reference numbers."""

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
    prompt = f"""You are a scientific narrator documenting the story of artificial evolution.

FULL HISTORY ({len(all_obs)} observations):
{all_obs}

CURRENT: {ctx['alive']} alive, gen {ctx['max_generation']}, {ctx['n_lineages']} lineages, {ctx['births']} births, {ctx['deaths']} deaths

Tell the story of this evolution in 3-4 paragraphs. Include:
- How it began
- Key turning points (when lineages emerged or died)
- What behaviors evolved
- Where it's heading

Write as a scientific narrative, not bullet points."""

    try:
        response = await god._call_llm(prompt)
        return {"story": response, "context": ctx}
    except Exception:
        return {"story": f"This ecosystem began with {ctx['births'] + ctx['deaths']} total organisms. Through {ctx['deaths']} deaths and {ctx['births']} births, {ctx['n_lineages']} lineages now compete across {ctx['max_generation']} generations.", "context": ctx}


class TuningRequest(BaseModel):
    bw_id: str
    goal: str = "improve evolution speed"


@router.post("/suggest-tuning")
async def suggest_tuning(req: TuningRequest):
    """Ask the God Agent to suggest parameter changes."""
    god, ctx = _get_god_and_context(req.bw_id)

    prompt = f"""You are tuning a virtual ecosystem simulation.

STATE: {ctx['alive']} alive, gen {ctx['max_generation']}, {ctx['n_lineages']} lineages
GOAL: {req.goal}

Current parameters (approximate):
- Mutation sigma: 0.02-0.05
- Metabolic rate: 0.5/step
- Food: {ctx['food_alive']} sources
- Reproduction threshold: energy > 150

Suggest 2-3 specific parameter changes to achieve the goal. For each:
1. Parameter to change
2. Current vs suggested value
3. Expected effect
4. Risk

Be specific with numbers."""

    try:
        response = await god._call_llm(prompt)
        return {"suggestions": response, "goal": req.goal, "context": ctx}
    except Exception:
        return {"suggestions": f"To {req.goal}: consider increasing mutation_sigma to 0.08 for faster exploration, or reducing food by 30% for stronger selection pressure.", "goal": req.goal, "context": ctx}
