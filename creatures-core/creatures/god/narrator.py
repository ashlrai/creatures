"""Evolution narrator — generates natural language descriptions of events."""

from __future__ import annotations

import os


class EvolutionNarrator:
    """Generates natural language descriptions of evolutionary events."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("XAI_API_KEY")

    def narrate_generation(self, stats: dict) -> str:
        """Generate a one-line description of what happened this generation."""
        gen = stats.get("generation", 0)
        best = stats.get("best_fitness", 0)
        mean = stats.get("mean_fitness", 0)
        n_species = stats.get("n_species", 1)

        if gen == 0:
            return (
                f"Life begins. {stats.get('population_size', '?')} organisms "
                f"emerge from the primordial connectome."
            )

        # Simple rule-based narration (no API call needed)
        if best > stats.get("prev_best", 0) + 0.5:
            return (
                f"Gen {gen}: A breakthrough! Fitness leaps to {best:.1f}. "
                f"The population diversifies into {n_species} species."
            )
        elif mean > stats.get("prev_mean", 0):
            return (
                f"Gen {gen}: Steady improvement. "
                f"Average fitness rises to {mean:.1f}."
            )
        else:
            return (
                f"Gen {gen}: A plateau. The population searches for "
                f"new strategies. {n_species} species compete."
            )

    def narrate_intervention(self, intervention: dict) -> str:
        """Describe a God Agent intervention in narrative form."""
        actions = intervention.get("interventions", [])
        if not actions:
            return "The God Agent observes silently."

        descriptions = []
        for a in actions:
            t = a.get("type")
            if t == "event":
                descriptions.append(
                    "The environment shifts — food sources scatter to new locations."
                )
            elif t == "evolution":
                descriptions.append(
                    "The forces of mutation intensify — "
                    "new variations emerge faster."
                )
            elif t == "fitness":
                descriptions.append(
                    "The rules of survival change — "
                    "new traits become advantageous."
                )
            elif t == "environment":
                descriptions.append("New resources appear in the world.")

        return " ".join(descriptions)
