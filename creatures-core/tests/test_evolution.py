"""Tests for the evolution module: genome, mutation, crossover, population, fitness."""

import numpy as np
import pytest

from creatures.connectome.types import Connectome, NeuronType
from creatures.evolution.crossover import crossover
from creatures.evolution.fitness import evaluate_genome_fast
from creatures.evolution.genome import Genome
from creatures.evolution.mutation import MutationConfig, mutate
from creatures.evolution.population import Population, PopulationConfig


@pytest.fixture()
def genome(connectome: Connectome) -> Genome:
    """Create a genome from the session connectome."""
    return Genome.from_connectome(connectome)


# ── Genome.from_connectome ──────────────────────────────────────────


class TestGenomeFromConnectome:
    """Tests for creating a genome from a biological connectome."""

    def test_neuron_count_matches(self, genome: Genome, connectome: Connectome):
        assert genome.n_neurons == connectome.n_neurons

    def test_synapse_count_matches(self, genome: Genome, connectome: Connectome):
        assert genome.n_synapses == connectome.n_synapses

    def test_neuron_ids_match(self, genome: Genome, connectome: Connectome):
        assert genome.neuron_ids == connectome.neuron_ids

    def test_weights_dtype_float64(self, genome: Genome):
        assert genome.weights.dtype == np.float64

    def test_pre_indices_dtype_int32(self, genome: Genome):
        assert genome.pre_indices.dtype == np.int32

    def test_post_indices_dtype_int32(self, genome: Genome):
        assert genome.post_indices.dtype == np.int32

    def test_indices_in_range(self, genome: Genome):
        n = genome.n_neurons
        assert np.all(genome.pre_indices >= 0) and np.all(genome.pre_indices < n)
        assert np.all(genome.post_indices >= 0) and np.all(genome.post_indices < n)

    def test_has_template_name(self, genome: Genome, connectome: Connectome):
        assert genome.template_name == connectome.name

    def test_generation_is_zero(self, genome: Genome):
        assert genome.generation == 0

    def test_neuron_types_populated(self, genome: Genome):
        motor = [nid for nid, nt in genome.neuron_types.items() if nt == NeuronType.MOTOR]
        sensory = [nid for nid, nt in genome.neuron_types.items() if nt == NeuronType.SENSORY]
        assert len(motor) > 0
        assert len(sensory) > 0


# ── Genome serialization round-trip ─────────────────────────────────


class TestGenomeSerialization:
    """Tests for to_dict / from_dict lossless round-trip."""

    def test_round_trip_preserves_id(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        assert restored.id == genome.id

    def test_round_trip_preserves_neuron_ids(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        assert restored.neuron_ids == genome.neuron_ids

    def test_round_trip_preserves_weights(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        np.testing.assert_array_equal(restored.weights, genome.weights)

    def test_round_trip_preserves_pre_indices(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        np.testing.assert_array_equal(restored.pre_indices, genome.pre_indices)

    def test_round_trip_preserves_post_indices(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        np.testing.assert_array_equal(restored.post_indices, genome.post_indices)

    def test_round_trip_preserves_synapse_types(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        np.testing.assert_array_equal(restored.synapse_types, genome.synapse_types)

    def test_round_trip_preserves_neuron_types(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        for nid in genome.neuron_ids:
            assert restored.neuron_types[nid] == genome.neuron_types[nid]

    def test_round_trip_preserves_generation(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        assert restored.generation == genome.generation

    def test_round_trip_preserves_template_name(self, genome: Genome):
        restored = Genome.from_dict(genome.to_dict())
        assert restored.template_name == genome.template_name


# ── Mutation ─────────────────────────────────────────────────────────


class TestMutate:
    """Tests for mutation operators."""

    def test_mutate_changes_weights(self, genome: Genome):
        rng = np.random.default_rng(42)
        child = mutate(genome, MutationConfig(), rng)
        # At least some weights should differ
        assert not np.array_equal(child.weights, genome.weights)

    def test_mutate_preserves_neuron_count(self, genome: Genome):
        rng = np.random.default_rng(42)
        config = MutationConfig(add_neuron_rate=0.0, remove_neuron_rate=0.0)
        child = mutate(genome, config, rng)
        assert child.n_neurons == genome.n_neurons

    def test_mutate_preserves_neuron_ids_without_topology(self, genome: Genome):
        rng = np.random.default_rng(42)
        config = MutationConfig(
            add_synapse_rate=0.0,
            remove_synapse_rate=0.0,
            add_neuron_rate=0.0,
            remove_neuron_rate=0.0,
        )
        child = mutate(genome, config, rng)
        assert child.neuron_ids == genome.neuron_ids

    def test_mutate_increments_generation(self, genome: Genome):
        rng = np.random.default_rng(42)
        child = mutate(genome, MutationConfig(), rng)
        assert child.generation == genome.generation + 1

    def test_mutate_produces_new_id(self, genome: Genome):
        rng = np.random.default_rng(42)
        child = mutate(genome, MutationConfig(), rng)
        assert child.id != genome.id

    def test_mutate_does_not_modify_parent(self, genome: Genome):
        original_weights = genome.weights.copy()
        rng = np.random.default_rng(42)
        mutate(genome, MutationConfig(), rng)
        np.testing.assert_array_equal(genome.weights, original_weights)

    def test_mutate_weights_within_bounds(self, genome: Genome):
        rng = np.random.default_rng(42)
        config = MutationConfig(min_weight=-10.0, max_weight=10.0)
        child = mutate(genome, config, rng)
        assert np.all(child.weights >= config.min_weight)
        assert np.all(child.weights <= config.max_weight)


# ── Crossover ────────────────────────────────────────────────────────


class TestCrossover:
    """Tests for NEAT-style crossover."""

    def test_crossover_produces_valid_genome(self, genome: Genome):
        rng = np.random.default_rng(42)
        parent_a = mutate(genome, MutationConfig(), rng)
        parent_b = mutate(genome, MutationConfig(), rng)
        parent_a.fitness = 10.0
        parent_b.fitness = 5.0
        child = crossover(parent_a, parent_b, rng)
        assert child.n_neurons > 0
        assert child.n_synapses > 0

    def test_crossover_has_two_parent_ids(self, genome: Genome):
        rng = np.random.default_rng(42)
        parent_a = mutate(genome, MutationConfig(), rng)
        parent_b = mutate(genome, MutationConfig(), rng)
        parent_a.fitness = 10.0
        parent_b.fitness = 5.0
        child = crossover(parent_a, parent_b, rng)
        assert len(child.parent_ids) == 2

    def test_crossover_generation_increments(self, genome: Genome):
        rng = np.random.default_rng(42)
        parent_a = mutate(genome, MutationConfig(), rng)
        parent_b = mutate(genome, MutationConfig(), rng)
        parent_a.fitness = 10.0
        parent_b.fitness = 5.0
        child = crossover(parent_a, parent_b, rng)
        assert child.generation == max(parent_a.generation, parent_b.generation) + 1

    def test_crossover_child_has_valid_indices(self, genome: Genome):
        rng = np.random.default_rng(42)
        parent_a = mutate(genome, MutationConfig(), rng)
        parent_b = mutate(genome, MutationConfig(), rng)
        parent_a.fitness = 10.0
        parent_b.fitness = 5.0
        child = crossover(parent_a, parent_b, rng)
        n = child.n_neurons
        assert np.all(child.pre_indices >= 0) and np.all(child.pre_indices < n)
        assert np.all(child.post_indices >= 0) and np.all(child.post_indices < n)

    def test_crossover_child_fitness_is_zero(self, genome: Genome):
        rng = np.random.default_rng(42)
        parent_a = mutate(genome, MutationConfig(), rng)
        parent_b = mutate(genome, MutationConfig(), rng)
        parent_a.fitness = 10.0
        parent_b.fitness = 5.0
        child = crossover(parent_a, parent_b, rng)
        assert child.fitness == 0.0


# ── Population ───────────────────────────────────────────────────────


class TestPopulation:
    """Tests for Population initialize / evaluate / advance."""

    def test_initialize_creates_correct_size(self, genome: Genome):
        pop = Population(
            PopulationConfig(size=10, seed=42, enable_speciation=False),
            genome,
        )
        pop.initialize()
        assert len(pop.genomes) == 10

    def test_evaluate_sets_fitness(self, genome: Genome):
        pop = Population(
            PopulationConfig(size=5, seed=42, enable_speciation=False),
            genome,
        )
        pop.initialize()
        pop.evaluate()
        for g in pop.genomes:
            assert g.fitness > 0

    def test_advance_increments_generation(self, genome: Genome):
        pop = Population(
            PopulationConfig(size=10, seed=42, enable_speciation=False),
            genome,
        )
        pop.initialize()
        pop.evaluate()
        stats = pop.advance_generation()
        assert stats.generation == 0
        assert pop.generation == 1

    def test_advance_returns_valid_stats(self, genome: Genome):
        pop = Population(
            PopulationConfig(size=10, seed=42, enable_speciation=False),
            genome,
        )
        pop.initialize()
        pop.evaluate()
        stats = pop.advance_generation()
        assert stats.best_fitness >= stats.mean_fitness
        assert stats.std_fitness >= 0
        assert len(stats.best_genome_id) > 0


# ── Fitness ──────────────────────────────────────────────────────────


class TestFitness:
    """Tests for fast fitness evaluation."""

    def test_evaluate_genome_fast_returns_positive(self, genome: Genome):
        score = evaluate_genome_fast(genome)
        assert score > 0

    def test_evaluate_genome_fast_sets_fitness_on_genome(self, genome: Genome):
        evaluate_genome_fast(genome)
        assert genome.fitness > 0

    def test_evaluate_genome_fast_records_breakdown(self, genome: Genome):
        evaluate_genome_fast(genome)
        assert "fitness_breakdown" in genome.metadata
        breakdown = genome.metadata["fitness_breakdown"]
        assert "topology" in breakdown
        assert "weight_optimization" in breakdown

    def test_fitness_improves_over_5_generations(self, genome: Genome):
        """Run 5 generations and verify the best fitness improves."""
        pop = Population(
            PopulationConfig(size=20, seed=42, enable_speciation=False),
            genome,
        )
        pop.initialize()

        best_fitnesses = []
        for _ in range(5):
            pop.evaluate()
            best = max(g.fitness for g in pop.genomes)
            best_fitnesses.append(best)
            pop.advance_generation()

        # The maximum fitness seen should increase over generations
        assert max(best_fitnesses) > best_fitnesses[0], (
            f"Fitness did not improve: {best_fitnesses}"
        )
