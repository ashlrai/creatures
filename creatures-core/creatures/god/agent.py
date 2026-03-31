"""God Agent — AI overseer that guides evolution with intelligent interventions.

Observes evolutionary progress, analyzes patterns via an LLM (xAI/Grok),
and makes targeted modifications to push evolution toward producing
organisms with genuinely useful behaviors.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class GodConfig:
    api_key: str | None = None  # xAI API key (from env XAI_API_KEY)
    api_base: str = "https://api.x.ai/v1"  # xAI endpoint
    model: str = "grok-4-1-fast-reasoning"
    intervention_interval: int = 10  # intervene every N generations
    temperature: float = 0.7
    max_tokens: int = 4096
    # LLM provider: "auto" detects Ollama first, then API
    provider: str = "auto"  # "auto", "ollama", "xai", "openai"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:70b"


class GodAgent:
    """AI overseer that guides evolution with intelligent interventions.

    The God Agent observes evolutionary progress, analyzes patterns,
    and makes targeted modifications to push evolution toward
    producing organisms with genuinely useful behaviors.
    """

    def __init__(self, config: GodConfig | None = None, run_id: str = "") -> None:
        self.config = config or GodConfig()
        self.config.api_key = self.config.api_key or os.environ.get("XAI_API_KEY")
        self.history: list[dict] = []  # intervention history
        self.observations: list[dict] = []
        # Persistent intervention log
        data_dir = Path(os.environ.get("NEUREVO_DATA_DIR", "neurevo_data"))
        self._log_dir = data_dir / "god_agent_logs"
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        self._log_path = self._log_dir / f"interventions_{self._run_id}.jsonl"

    def observe(
        self,
        generation_stats: dict,
        population_summary: dict,
        environment_state: dict,
        consciousness_metrics: dict | None = None,
    ) -> None:
        """Record observations about the current state of evolution.

        Args:
            generation_stats: Fitness, generation number, etc.
            population_summary: Species counts, diversity metrics.
            environment_state: Arena configuration.
            consciousness_metrics: Optional Φ, CN, PCI measurements.
        """
        obs = {
            "generation": generation_stats.get("generation", 0),
            "stats": generation_stats,
            "population": population_summary,
            "environment": environment_state,
        }
        if consciousness_metrics:
            obs["consciousness"] = consciousness_metrics
        self.observations.append(obs)
        # Cap observations to prevent unbounded memory growth
        if len(self.observations) > 50:
            del self.observations[:len(self.observations) - 50]

    async def analyze_and_intervene(self) -> dict:
        """Ask the LLM to analyze evolution and suggest interventions.

        Returns a dict with:
        - analysis: str (what's happening)
        - interventions: list of dicts (what to change)
        - hypothesis: str (scientific question to test)
        - explanation: str (why these changes)
        """
        # Only skip LLM if provider is explicitly "fallback" (not auto/ollama)
        if self.config.provider == "fallback":
            intervention = self._fallback_intervention()
        else:
            prompt = self._build_analysis_prompt()
            response = await self._call_llm(prompt)
            intervention = self._parse_intervention(response)

        self.history.append(intervention)
        self._persist_intervention(intervention)
        return intervention

    def _persist_intervention(self, intervention: dict) -> None:
        """Append intervention to JSONL log on disk for auditability."""
        try:
            record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "generation": self.observations[-1]["generation"] if self.observations else -1,
                **intervention,
            }
            with open(self._log_path, "a") as f:
                f.write(json.dumps(record, default=str) + "\n")
        except Exception as e:
            logger.warning("Failed to persist God Agent intervention: %s", e)

    def _build_analysis_prompt(self) -> str:
        """Build the prompt for the LLM with current simulation context."""
        recent = self.observations[-5:] if self.observations else []

        # Extract consciousness data if available
        consciousness_section = ""
        for obs in recent:
            if "consciousness" in obs:
                c = obs["consciousness"]
                consciousness_section += (
                    f"\nGen {obs['generation']}: "
                    f"Φ={c.get('phi', 0):.4f}, "
                    f"CN={c.get('complexity', 0):.4f}, "
                    f"PCI={c.get('pci', 0):.4f}"
                )

        consciousness_prompt = ""
        if consciousness_section:
            consciousness_prompt = f"""

CONSCIOUSNESS METRICS (Integrated Information Theory):
{consciousness_section}

Φ (phi) measures integrated information — how much more the whole brain generates
than the sum of its parts. Higher Φ = more consciousness-like processing.
CN measures neural complexity across spatial scales.
PCI measures perturbational complexity.

You can also:
6. OPTIMIZE CONSCIOUSNESS: Adjust fitness weights to favor higher Φ,
   suggest neural architecture changes that increase integration,
   or propose experiments testing consciousness hypotheses.
"""

        prompt = f"""ROLE: You are a computational biologist overseeing a real-time artificial \
evolution experiment. You are the "God Agent" — an AI scientist with the power to observe, \
analyze, and intervene in the evolutionary process.

CONTEXT: Organisms are virtual creatures with spiking neural networks (Izhikevich neurons). \
Each organism has sensory neurons (detecting food, obstacles, boundaries), interneurons \
(processing and integrating information), and motor neurons (driving movement). Neural \
connection weights are inherited from parents with small random mutations. Organisms forage \
for food to gain energy; when energy exceeds a threshold, they reproduce. When energy hits \
zero, they die. There is no predetermined fitness function — evolution is driven entirely \
by differential survival. STDP learning allows individual organisms to adapt their neural \
wiring within their lifetime.

RECENT OBSERVATION DATA (last {len(recent)} snapshots):
{json.dumps(recent, indent=2, default=str)}
{consciousness_prompt}
ANALYSIS QUESTIONS — address each:
1. EVOLUTIONARY TRENDS: Is fitness improving, stagnating, or declining? Is the population \
diversifying or converging? Are new lineages emerging or are dominant ones taking over?
2. EMERGENT BEHAVIORS: Are organisms developing recognizable strategies (directed foraging, \
wall avoidance, energy conservation, clustering)? What neural circuit motifs might underlie \
these behaviors?
3. SURPRISING OBSERVATIONS: What is the single most unexpected thing in the data? What \
would a biologist find noteworthy?
4. RECOMMENDED INTERVENTION: What single change would be most scientifically interesting \
to make right now? Why?

AVAILABLE INTERVENTIONS:
1. MODIFY ENVIRONMENT: Change food positions, add/remove obstacles, create chemical \
gradients, change arena size
2. SHAPE FITNESS: Adjust fitness weights (distance, food, efficiency, consciousness)
3. TUNE EVOLUTION: Change mutation rates, population size, selection pressure, \
Izhikevich parameter mutation rates
4. DESIGN EXPERIMENT: Propose a specific hypothesis to test (e.g., "do organisms with \
higher Φ survive longer in stochastic environments?")
5. CREATE EVENT: Introduce a sudden environmental change (food_scarcity, predator_surge, \
mutation_burst, climate_shift)

Respond with ONLY a JSON object (no markdown, no explanation outside the JSON):
{{
    "analysis": "2-3 sentence scientific analysis of the current evolutionary state",
    "fitness_trend": "improving|stagnating|declining",
    "consciousness_trend": "increasing|stable|decreasing|no_data",
    "evolutionary_phase": "exploration|exploitation|stagnation|collapse|radiation",
    "interventions": [
        {{
            "type": "environment|fitness|evolution|experiment|event|consciousness",
            "action": "specific action to take",
            "parameters": {{}},
            "reasoning": "scientific reasoning for this intervention",
            "expected_effect": "what you predict will happen"
        }}
    ],
    "hypothesis": "A falsifiable scientific hypothesis to test in the next N generations",
    "surprising_observation": "The single most unexpected thing in the data",
    "report": "A brief scientific report suitable for a lab notebook"
}}

Ground all reasoning in evolutionary biology, computational neuroscience, and dynamical \
systems theory. Prioritize interventions that produce genuine scientific insight over \
those that merely optimize fitness."""

        # Add evolutionary context
        if self.observations:
            latest = self.observations[-1]
            stats = latest.get("stats", {})
            pop = latest.get("population", {})
            env = latest.get("environment", {})

            prompt += "\n\nEVOLUTIONARY CONTEXT:\n"
            prompt += f"  Max generation reached: {stats.get('max_generation', 'unknown')}\n"
            prompt += f"  Surviving lineages: {stats.get('n_lineages', 'unknown')}\n"
            prompt += f"  Total births: {pop.get('births_total', 'unknown')}\n"
            prompt += f"  Total deaths: {pop.get('deaths_total', 'unknown')}\n"
            prompt += f"  Mean organism age: {stats.get('mean_age', 'unknown')}\n"

            behaviors = env.get("emergent_behaviors", [])
            if behaviors:
                prompt += "\nEMERGENT BEHAVIORS DETECTED:\n"
                for b in behaviors:
                    prompt += f"  - {b}\n"

        return prompt

    async def _call_llm(self, prompt: str) -> str:
        """Call LLM via configured provider (auto-detects Ollama → API → fallback)."""
        from creatures.god.llm_providers import LLMConfig, call_llm

        llm_config = LLMConfig(
            provider=self.config.provider,
            api_key=self.config.api_key,
            api_base=self.config.api_base,
            model=self.config.model,
            ollama_host=self.config.ollama_host,
            ollama_model=self.config.ollama_model,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
        )

        try:
            return await call_llm(prompt, llm_config)
        except Exception:
            return json.dumps(self._fallback_intervention())

    def _parse_intervention(self, response: str) -> dict:
        """Parse LLM response into structured intervention."""
        text = response.strip()

        # Strip markdown code fences
        if "```" in text:
            parts = text.split("```")
            for part in parts:
                candidate = part.strip()
                if candidate.startswith("json"):
                    candidate = candidate[4:].strip()
                if candidate.startswith("{"):
                    text = candidate
                    break

        # Try to find JSON object in the response
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        # Full text parse attempt
        try:
            return json.loads(text)
        except (json.JSONDecodeError, IndexError):
            return {
                "analysis": response[:500],
                "interventions": [],
                "hypothesis": "Analysis complete — see report",
                "report": response[:300],
            }

    def _fallback_intervention(self) -> dict:
        """Rule-based fallback when no API key is available."""
        if not self.observations:
            return {
                "analysis": "No observations yet. Starting evolution.",
                "fitness_trend": "unknown",
                "interventions": [],
                "hypothesis": "Initial run — observe baseline behaviors.",
                "report": "Evolution has not started yet.",
            }

        recent = self.observations[-1]["stats"]
        gen = recent.get("generation", 0)
        best = recent.get("best_fitness", 0)
        mean = recent.get("mean_fitness", 0)
        std = recent.get("std_fitness", 0)

        interventions = []

        # Detect stagnation (fitness hasn't improved in 5 generations)
        if len(self.observations) >= 5:
            recent_bests = [
                o["stats"].get("best_fitness", 0) for o in self.observations[-5:]
            ]
            # Check if fitness is actually improving (monotonic upward trend)
            improving = all(
                recent_bests[i] <= recent_bests[i + 1]
                for i in range(len(recent_bests) - 1)
            ) and recent_bests[-1] > recent_bests[0]
            if not improving and max(recent_bests) - min(recent_bests) < 0.1:
                interventions.append(
                    {
                        "type": "evolution",
                        "action": "increase_mutation_rate",
                        "parameters": {"weight_perturb_sigma": 0.2},
                        "reasoning": (
                            "Fitness stagnated for 5 generations — increasing exploration"
                        ),
                    }
                )
                interventions.append(
                    {
                        "type": "environment",
                        "action": "add_food",
                        "parameters": {"n_food": 3},
                        "reasoning": "More food sources create new selection pressure",
                    }
                )
                # Increase selection pressure when stagnating
                interventions.append(
                    {
                        "type": "selection",
                        "action": "increase_selection_pressure",
                        "parameters": {"tournament_size": 7},
                        "reasoning": (
                            "Larger tournaments increase selection pressure to "
                            "break through fitness plateau"
                        ),
                    }
                )

        # Detect convergence (low diversity)
        if std < 1.0 and len(self.observations) >= 3:
            interventions.append(
                {
                    "type": "diversity",
                    "action": "inject_migrants",
                    "parameters": {"n_migrants": 5},
                    "reasoning": (
                        f"Population converged (std_fitness={std:.2f}). "
                        "Injecting migrants to restore diversity."
                    ),
                }
            )

        # Detect organisms not exploring (low mean but ok best)
        if best > 0 and mean < best * 0.3 and gen >= 5:
            interventions.append(
                {
                    "type": "fitness",
                    "action": "rebalance_fitness_weights",
                    "parameters": {"w_distance": 2.0, "w_efficiency": 0.2},
                    "reasoning": (
                        "Most organisms inactive — boosting distance reward "
                        "and reducing efficiency penalty to encourage exploration"
                    ),
                }
            )

        # Every 20 generations, shake things up
        if gen > 0 and gen % 20 == 0:
            interventions.append(
                {
                    "type": "event",
                    "action": "environmental_shift",
                    "parameters": {"move_all_food": True},
                    "reasoning": (
                        "Periodic environmental disruption prevents over-specialization"
                    ),
                }
            )

        return {
            "analysis": f"Generation {gen}: best={best:.2f}, mean={mean:.2f}, std={std:.2f}",
            "fitness_trend": "stagnating" if len(interventions) > 0 else "stable",
            "interventions": interventions,
            "hypothesis": (
                f"Testing if increased mutation helps break through "
                f"fitness plateau at gen {gen}"
            ),
            "report": (
                f"After {gen} generations, organisms achieve fitness {best:.2f}. "
                f"Population diversity: mean={mean:.2f}, std={std:.2f}."
            ),
        }

    def apply_interventions(
        self,
        intervention: dict,
        arena: Any | None = None,
        mutation_config: Any | None = None,
        fitness_config: Any | None = None,
        population: Any | None = None,
    ) -> list[str]:
        """Apply the God Agent's interventions to the simulation.

        Returns list of applied intervention descriptions.
        """
        applied = []

        for action in intervention.get("interventions", []):
            action_type = action.get("type", "")
            params = action.get("parameters", {})

            if action_type == "evolution" and mutation_config is not None:
                if "weight_perturb_sigma" in params:
                    mutation_config.weight_perturb_sigma = params[
                        "weight_perturb_sigma"
                    ]
                    applied.append(
                        f"Mutation sigma -> {params['weight_perturb_sigma']}"
                    )
                if "add_synapse_rate" in params:
                    mutation_config.add_synapse_rate = params["add_synapse_rate"]
                    applied.append(
                        f"Add synapse rate -> {params['add_synapse_rate']}"
                    )

            elif action_type == "fitness" and fitness_config is not None:
                # Robust fitness weight tuning — handle all known keys
                fitness_keys = [
                    "w_distance", "w_food", "w_efficiency",
                    "lifetime_ms", "poke_force",
                ]
                for key in fitness_keys:
                    if key in params:
                        setattr(fitness_config, key, params[key])
                        applied.append(f"Fitness {key} -> {params[key]}")

            elif action_type == "diversity" and population is not None:
                # Inject random migrants to break convergence
                import numpy as np
                from creatures.evolution.mutation import MutationConfig as _MC
                from creatures.evolution.mutation import mutate as _mutate

                n_migrants = params.get("n_migrants", 3)
                rng = np.random.default_rng()
                for _ in range(n_migrants):
                    migrant = population.genomes[0].clone()
                    heavy_mutation = _MC(
                        weight_perturb_sigma=0.5,
                        weight_perturb_rate=1.0,
                    )
                    migrant = _mutate(migrant, heavy_mutation, rng)
                    population.genomes.append(migrant)
                applied.append(f"Injected {n_migrants} random migrants")

            elif action_type == "selection" and population is not None:
                if "tournament_size" in params:
                    population._config.tournament_size = params["tournament_size"]
                    applied.append(
                        f"Tournament size -> {params['tournament_size']}"
                    )

            elif action_type == "environment" and arena is not None:
                if action.get("action") == "add_food":
                    import numpy as np

                    rng = np.random.default_rng()
                    n_food = params.get("n_food", 1)
                    for _ in range(n_food):
                        x = float(rng.uniform(-1, 1))
                        y = float(rng.uniform(-1, 1))
                        # Append directly to internal food list
                        arena._food_positions.append((x, y))
                    applied.append(f"Added {n_food} food sources")

            elif action_type == "event" and arena is not None:
                if params.get("move_all_food"):
                    import numpy as np

                    rng = np.random.default_rng()
                    arena.reset(rng)
                    applied.append(
                        "Environmental shift — all food/obstacles repositioned"
                    )

        return applied

    def get_report(self) -> str:
        """Generate a narrative report of the evolution so far."""
        if not self.history:
            return "No interventions yet."

        lines = ["## God Agent Report\n"]
        for i, h in enumerate(self.history):
            lines.append(f"### Intervention {i + 1}")
            lines.append(f"**Analysis**: {h.get('analysis', 'N/A')}")
            lines.append(f"**Trend**: {h.get('fitness_trend', 'N/A')}")
            lines.append(f"**Hypothesis**: {h.get('hypothesis', 'N/A')}")
            for a in h.get("interventions", []):
                lines.append(f"- {a.get('action', '?')}: {a.get('reasoning', '')}")
            lines.append("")

        return "\n".join(lines)
