"""Test the God Agent system with fallback (no API key) mode."""

from __future__ import annotations

import asyncio
import os
import sys

# Ensure no API key leaks into the test
os.environ.pop("XAI_API_KEY", None)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "creatures-core"))

from creatures.god.agent import GodAgent, GodConfig
from creatures.god.narrator import EvolutionNarrator
from creatures.evolution.mutation import MutationConfig
from creatures.evolution.fitness import FitnessConfig
from creatures.environment.arena import Arena, ArenaConfig


def test_god_agent_fallback():
    """Test that the God Agent detects stagnation and suggests interventions."""
    # 1. Create agent with no API key (forces fallback mode)
    config = GodConfig(api_key=None)
    agent = GodAgent(config=config)

    assert agent.config.api_key is None, "Should have no API key"
    assert len(agent.observations) == 0

    # 2. Feed 10 generations of mock observations with stagnating fitness
    for gen in range(10):
        agent.observe(
            generation_stats={
                "generation": gen,
                "best_fitness": 1.5,  # flat -- triggers stagnation detection
                "mean_fitness": 0.8,
                "population_size": 50,
            },
            population_summary={
                "n_species": 3,
                "diversity": 0.4,
            },
            environment_state={
                "n_food": 5,
                "n_obstacles": 3,
            },
        )

    assert len(agent.observations) == 10, f"Expected 10 observations, got {len(agent.observations)}"

    # 3. Call analyze_and_intervene (uses fallback since no API key)
    intervention = asyncio.run(agent.analyze_and_intervene())

    assert "analysis" in intervention, "Missing 'analysis' key"
    assert "interventions" in intervention, "Missing 'interventions' key"
    assert "hypothesis" in intervention, "Missing 'hypothesis' key"

    # 4. Verify stagnation was detected
    assert intervention["fitness_trend"] == "stagnating", (
        f"Expected 'stagnating', got '{intervention['fitness_trend']}'"
    )
    assert len(intervention["interventions"]) > 0, "Should have suggested interventions"

    # Check that at least one evolution intervention was suggested
    types = [a["type"] for a in intervention["interventions"]]
    assert "evolution" in types, f"Expected evolution intervention, got types: {types}"

    print(f"  Analysis: {intervention['analysis']}")
    print(f"  Trend: {intervention['fitness_trend']}")
    print(f"  Interventions: {len(intervention['interventions'])}")
    for a in intervention["interventions"]:
        print(f"    - [{a['type']}] {a['action']}: {a['reasoning']}")
    print(f"  Hypothesis: {intervention['hypothesis']}")

    # 5. Apply interventions to a MutationConfig
    mut_config = MutationConfig()
    original_sigma = mut_config.weight_perturb_sigma
    assert original_sigma == 0.1, f"Expected default sigma 0.1, got {original_sigma}"

    fit_config = FitnessConfig()
    arena = Arena(ArenaConfig(n_food=5, n_obstacles=3, seed=42))
    original_food_count = arena.active_food_count

    applied = agent.apply_interventions(
        intervention,
        arena=arena,
        mutation_config=mut_config,
        fitness_config=fit_config,
    )

    assert len(applied) > 0, "Should have applied at least one intervention"
    print(f"\n  Applied {len(applied)} interventions:")
    for desc in applied:
        print(f"    - {desc}")

    # Verify mutation config was actually changed
    assert mut_config.weight_perturb_sigma == 0.2, (
        f"Expected sigma 0.2, got {mut_config.weight_perturb_sigma}"
    )
    print(f"\n  Mutation sigma: {original_sigma} -> {mut_config.weight_perturb_sigma}")

    # Verify food was added to arena
    assert arena.active_food_count > original_food_count, (
        f"Expected more food, got {arena.active_food_count} (was {original_food_count})"
    )
    print(f"  Arena food: {original_food_count} -> {arena.active_food_count}")


def test_narrator():
    """Test the EvolutionNarrator produces sensible descriptions."""
    narrator = EvolutionNarrator()

    # Test generation narration
    msg0 = narrator.narrate_generation({"generation": 0, "population_size": 50})
    assert "Life begins" in msg0
    print(f"\n  Gen 0: {msg0}")

    msg_breakthrough = narrator.narrate_generation({
        "generation": 5,
        "best_fitness": 3.0,
        "prev_best": 1.5,
        "mean_fitness": 1.2,
        "n_species": 4,
    })
    assert "breakthrough" in msg_breakthrough.lower()
    print(f"  Gen 5: {msg_breakthrough}")

    msg_plateau = narrator.narrate_generation({
        "generation": 10,
        "best_fitness": 1.5,
        "prev_best": 1.5,
        "mean_fitness": 0.8,
        "prev_mean": 0.9,
        "n_species": 2,
    })
    assert "plateau" in msg_plateau.lower()
    print(f"  Gen 10: {msg_plateau}")

    # Test intervention narration
    intervention = {
        "interventions": [
            {"type": "evolution", "action": "increase_mutation"},
            {"type": "environment", "action": "add_food"},
        ]
    }
    narr = narrator.narrate_intervention(intervention)
    assert "mutation" in narr.lower()
    print(f"\n  Intervention: {narr}")

    # Empty intervention
    silent = narrator.narrate_intervention({"interventions": []})
    assert "silently" in silent.lower()
    print(f"  No action: {silent}")


def test_report():
    """Test the God Agent report generation."""
    agent = GodAgent(GodConfig(api_key=None))

    # Empty report
    assert agent.get_report() == "No interventions yet."

    # Feed observations and generate intervention
    for gen in range(10):
        agent.observe(
            generation_stats={"generation": gen, "best_fitness": 1.5, "mean_fitness": 0.8},
            population_summary={},
            environment_state={},
        )

    intervention = asyncio.run(agent.analyze_and_intervene())

    report = agent.get_report()
    assert "God Agent Report" in report
    assert "Intervention 1" in report
    print(f"\n{report}")


if __name__ == "__main__":
    print("=== Test 1: God Agent Fallback Mode ===")
    test_god_agent_fallback()
    print("\nPASSED\n")

    print("=== Test 2: Evolution Narrator ===")
    test_narrator()
    print("\nPASSED\n")

    print("=== Test 3: Report Generation ===")
    test_report()
    print("\nPASSED\n")

    print("All tests passed!")
