"""God Agent — AI overseer that guides evolution with intelligent interventions.

Observes evolutionary progress, analyzes patterns via an LLM (xAI/Grok),
and makes targeted modifications to push evolution toward producing
organisms with genuinely useful behaviors.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GodConfig:
    api_key: str | None = None  # xAI API key (from env XAI_API_KEY)
    api_base: str = "https://api.x.ai/v1"  # xAI endpoint
    model: str = "grok-3-mini"  # or grok-3
    intervention_interval: int = 10  # intervene every N generations
    temperature: float = 0.7
    max_tokens: int = 4096


class GodAgent:
    """AI overseer that guides evolution with intelligent interventions.

    The God Agent observes evolutionary progress, analyzes patterns,
    and makes targeted modifications to push evolution toward
    producing organisms with genuinely useful behaviors.
    """

    def __init__(self, config: GodConfig | None = None) -> None:
        self.config = config or GodConfig()
        self.config.api_key = self.config.api_key or os.environ.get("XAI_API_KEY")
        self.history: list[dict] = []  # intervention history
        self.observations: list[dict] = []

    def observe(
        self,
        generation_stats: dict,
        population_summary: dict,
        environment_state: dict,
    ) -> None:
        """Record observations about the current state of evolution."""
        self.observations.append(
            {
                "generation": generation_stats.get("generation", 0),
                "stats": generation_stats,
                "population": population_summary,
                "environment": environment_state,
            }
        )

    async def analyze_and_intervene(self) -> dict:
        """Ask the LLM to analyze evolution and suggest interventions.

        Returns a dict with:
        - analysis: str (what's happening)
        - interventions: list of dicts (what to change)
        - hypothesis: str (scientific question to test)
        - explanation: str (why these changes)
        """
        if not self.config.api_key:
            intervention = self._fallback_intervention()
            self.history.append(intervention)
            return intervention

        prompt = self._build_analysis_prompt()
        response = await self._call_llm(prompt)
        intervention = self._parse_intervention(response)
        self.history.append(intervention)
        return intervention

    def _build_analysis_prompt(self) -> str:
        """Build the prompt for the LLM with current simulation context."""
        recent = self.observations[-5:] if self.observations else []

        return f"""You are the God Agent overseeing an evolutionary simulation of C. elegans \
worms with real biological neural networks (299 neurons, 3363 synapses from OpenWorm \
connectome data).

CURRENT STATE:
{json.dumps(recent, indent=2, default=str)}

Your role is to guide evolution toward producing organisms with genuinely useful, complex \
behaviors. You can:

1. MODIFY ENVIRONMENT: Change food positions, add/remove obstacles, create chemical \
gradients, change arena size
2. SHAPE FITNESS: Adjust fitness weights (distance, food, efficiency, obstacle avoidance)
3. TUNE EVOLUTION: Change mutation rates, population size, selection pressure
4. DESIGN EXPERIMENT: Propose a specific hypothesis to test (e.g., "lesion all GABA \
neurons and observe if rhythmic locomotion degrades")
5. CREATE EVENT: Introduce a sudden environmental change (food scarcity, new obstacle, \
temperature shift)

Analyze the current evolutionary trajectory and respond with a JSON object:
{{
    "analysis": "Brief analysis of what's happening in evolution",
    "fitness_trend": "improving/stagnating/declining",
    "interventions": [
        {{
            "type": "environment|fitness|evolution|experiment|event",
            "action": "specific action to take",
            "parameters": {{...}},
            "reasoning": "why this will help"
        }}
    ],
    "hypothesis": "A scientific hypothesis to test in the next N generations",
    "report": "A brief scientific report of observations so far"
}}

Be creative but grounded in real neuroscience. Make interventions that will produce \
genuine scientific insight about how neural circuits evolve and adapt."""

    async def _call_llm(self, prompt: str) -> str:
        """Call the xAI API (OpenAI-compatible)."""
        try:
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.config.api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.config.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.config.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are the God Agent — an AI overseeing the "
                                    "evolution of virtual organisms with real biological "
                                    "neural networks. Respond with valid JSON only. "
                                    "Keep analysis concise (2-3 sentences). "
                                    "Keep report under 100 words."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": self.config.temperature,
                        "max_tokens": self.config.max_tokens,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=30.0,
                )
                data = response.json()
                return data["choices"][0]["message"]["content"]
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

        interventions = []

        # Detect stagnation (fitness hasn't improved in 5 generations)
        if len(self.observations) >= 5:
            recent_bests = [
                o["stats"].get("best_fitness", 0) for o in self.observations[-5:]
            ]
            if max(recent_bests) - min(recent_bests) < 0.1:
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
            "analysis": f"Generation {gen}: best={best:.2f}, mean={mean:.2f}",
            "fitness_trend": "stagnating" if len(interventions) > 0 else "stable",
            "interventions": interventions,
            "hypothesis": (
                f"Testing if increased mutation helps break through "
                f"fitness plateau at gen {gen}"
            ),
            "report": (
                f"After {gen} generations, organisms achieve fitness {best:.2f}. "
                f"Population diversity: mean={mean:.2f}."
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
                for key in ["w_distance", "w_food", "w_efficiency"]:
                    if key in params:
                        setattr(fitness_config, key, params[key])
                        applied.append(f"Fitness {key} -> {params[key]}")

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
