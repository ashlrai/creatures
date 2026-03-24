"""Tests for evolutionary analytics: drift, behavior classification, summaries."""

import numpy as np
import pytest

from creatures.connectome.types import Connectome
from creatures.evolution.analytics import (
    ConnectomeDrift,
    analyze_drift,
    classify_behavior,
    summarize_evolution,
)
from creatures.evolution.genome import Genome
from creatures.evolution.mutation import MutationConfig, mutate


@pytest.fixture()
def genome(connectome: Connectome) -> Genome:
    """Create a genome from the session connectome."""
    return Genome.from_connectome(connectome)


@pytest.fixture()
def mutated_genome(genome: Genome) -> Genome:
    """Create a mutated child genome for drift analysis."""
    rng = np.random.default_rng(42)
    config = MutationConfig(weight_perturb_sigma=1.0)
    child = mutate(genome, config, rng)
    # Apply several rounds of mutation to ensure visible drift
    for _ in range(5):
        child = mutate(child, config, rng)
    return child


# ── Drift analysis ───────────────────────────────────────────────────


class TestAnalyzeDrift:
    """Tests for analyze_drift between template and mutated genome."""

    def test_returns_connectome_drift(self, genome: Genome, mutated_genome: Genome):
        drift = analyze_drift(genome, mutated_genome)
        assert isinstance(drift, ConnectomeDrift)

    def test_preserved_fraction_between_0_and_1(self, genome: Genome, mutated_genome: Genome):
        drift = analyze_drift(genome, mutated_genome)
        assert 0.0 <= drift.preserved_fraction <= 1.0

    def test_modified_weight_fraction_between_0_and_1(
        self, genome: Genome, mutated_genome: Genome
    ):
        drift = analyze_drift(genome, mutated_genome)
        assert 0.0 <= drift.modified_weight_fraction <= 1.0

    def test_identical_genomes_have_zero_drift(self, genome: Genome):
        drift = analyze_drift(genome, genome)
        assert drift.preserved_fraction == 1.0
        assert drift.novel_synapses == 0
        assert drift.deleted_synapses == 0
        assert drift.total_weight_change == pytest.approx(0.0)

    def test_mutated_genome_has_nonzero_weight_change(
        self, genome: Genome, mutated_genome: Genome
    ):
        drift = analyze_drift(genome, mutated_genome)
        assert drift.total_weight_change > 0

    def test_mutated_genome_has_modified_weights(
        self, genome: Genome, mutated_genome: Genome
    ):
        drift = analyze_drift(genome, mutated_genome)
        # After 5 rounds of mutation with sigma=1.0, many weights should differ
        assert drift.modified_weight_fraction > 0


# ── Behavior classification ──────────────────────────────────────────


class TestClassifyBehavior:
    """Tests for classify_behavior with synthetic trajectories."""

    def test_short_trajectory_returns_idle(self):
        trajectory = [(0.0, 0.0, 0.0)] * 5
        result = classify_behavior(trajectory)
        assert result == {"idle": 1.0}

    def test_straight_line_has_high_linearity(self):
        trajectory = [(float(i), 0.0, 0.0) for i in range(50)]
        result = classify_behavior(trajectory)
        assert result["linearity"] > 0.9

    def test_circular_trajectory_has_low_linearity(self):
        angles = np.linspace(0, 2 * np.pi, 50)
        trajectory = [(float(np.cos(a)), float(np.sin(a)), 0.0) for a in angles]
        result = classify_behavior(trajectory)
        assert result["linearity"] < 0.3

    def test_all_features_between_0_and_1(self):
        rng = np.random.default_rng(42)
        trajectory = [
            (float(rng.normal()), float(rng.normal()), 0.0) for _ in range(100)
        ]
        result = classify_behavior(trajectory)
        for key, value in result.items():
            assert 0.0 <= value <= 1.0, f"{key} = {value} out of range"

    def test_returns_expected_keys(self):
        trajectory = [(float(i * 0.1), float(i * 0.05), 0.0) for i in range(20)]
        result = classify_behavior(trajectory)
        expected_keys = {"linearity", "speed", "persistence", "exploration", "activity"}
        assert set(result.keys()) == expected_keys

    def test_stationary_has_low_speed(self):
        # Tiny movements around origin
        trajectory = [(0.001 * np.sin(i), 0.001 * np.cos(i), 0.0) for i in range(50)]
        result = classify_behavior(trajectory)
        assert result["speed"] < 0.2


# ── Evolution summary ────────────────────────────────────────────────


class TestSummarizeEvolution:
    """Tests for summarize_evolution producing valid reports."""

    def test_empty_genomes_returns_error(self, genome: Genome):
        result = summarize_evolution(genome, [])
        assert "error" in result

    def test_single_generation_summary(self, genome: Genome, mutated_genome: Genome):
        mutated_genome.fitness = 75.0
        result = summarize_evolution(genome, [mutated_genome])
        assert result["n_generations"] == 1
        assert result["final_fitness"] == 75.0

    def test_multi_generation_summary(self, genome: Genome):
        rng = np.random.default_rng(42)
        config = MutationConfig(weight_perturb_sigma=0.5)
        generations = []
        current = genome
        for i in range(5):
            current = mutate(current, config, rng)
            current.fitness = 50.0 + i * 5.0
            generations.append(current)

        result = summarize_evolution(genome, generations)
        assert result["n_generations"] == 5
        assert result["initial_fitness"] == 50.0
        assert result["final_fitness"] == 70.0
        assert result["fitness_improvement"] == pytest.approx(20.0)

    def test_summary_has_expected_keys(self, genome: Genome, mutated_genome: Genome):
        mutated_genome.fitness = 80.0
        result = summarize_evolution(genome, [mutated_genome])
        expected_keys = {
            "n_generations",
            "initial_fitness",
            "final_fitness",
            "fitness_improvement",
            "fitness_improvement_pct",
            "connections_preserved",
            "connections_modified",
            "novel_connections",
            "deleted_connections",
            "novel_neurons",
            "weight_drift",
            "template_neurons",
            "evolved_neurons",
            "template_synapses",
            "evolved_synapses",
        }
        assert expected_keys.issubset(set(result.keys()))

    def test_summary_neuron_counts(self, genome: Genome, mutated_genome: Genome):
        mutated_genome.fitness = 80.0
        result = summarize_evolution(genome, [mutated_genome])
        assert result["template_neurons"] == genome.n_neurons
        assert result["template_synapses"] == genome.n_synapses
