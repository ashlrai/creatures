"""Tests for the VectorizedEngine and MassiveEcosystem."""

from __future__ import annotations

import numpy as np
import pytest

from creatures.neural.vectorized_engine import VectorizedEngine
from creatures.environment.massive_ecosystem import MassiveEcosystem


# ======================================================================
# VectorizedEngine tests
# ======================================================================


class TestVectorizedEngineBuild:
    """Test that VectorizedEngine builds correct structures."""

    def test_basic_build(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=100, neurons_per_organism=50)

        assert engine.n_total == 5000
        assert engine.n_organisms == 100
        assert engine.n_per == 50
        assert engine.v.shape == (5000,)
        assert engine.fired.shape == (5000,)
        assert engine.n_synapses > 0

    def test_initial_state(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=10, neurons_per_organism=20)

        # All neurons start at resting potential
        np.testing.assert_allclose(engine.v, -52.0)
        # No neuron has fired yet
        assert not np.any(engine.fired)
        # No external current
        np.testing.assert_allclose(engine.I_ext, 0.0)

    def test_synapse_indices_in_bounds(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=50, neurons_per_organism=30)

        assert np.all(engine.syn_pre >= 0)
        assert np.all(engine.syn_pre < engine.n_total)
        assert np.all(engine.syn_post >= 0)
        assert np.all(engine.syn_post < engine.n_total)

    def test_block_diagonal_no_cross_organism(self):
        """Synapses must stay within each organism's block."""
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=20, neurons_per_organism=10)

        pre_org = engine.syn_pre // engine.n_per
        post_org = engine.syn_post // engine.n_per
        assert np.all(pre_org == post_org), (
            "Found cross-organism synapses!"
        )

    def test_no_self_connections(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=10, neurons_per_organism=20)

        assert not np.any(engine.syn_pre == engine.syn_post)

    def test_seed_reproducibility(self):
        e1 = VectorizedEngine(use_gpu=False)
        e1.build(n_organisms=5, neurons_per_organism=10, seed=123)

        e2 = VectorizedEngine(use_gpu=False)
        e2.build(n_organisms=5, neurons_per_organism=10, seed=123)

        np.testing.assert_array_equal(e1.syn_pre, e2.syn_pre)
        np.testing.assert_array_equal(e1.syn_w, e2.syn_w)


class TestVectorizedEngineStep:
    """Test stepping the simulation."""

    def test_step_100_no_nan(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=100, neurons_per_organism=50)

        for _ in range(100):
            stats = engine.step()

        # No NaN in voltages or firing rates
        assert not np.any(np.isnan(engine.v)), "NaN in voltages"
        assert not np.any(np.isnan(engine.firing_rate)), "NaN in firing rates"

    def test_step_returns_dict(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=10, neurons_per_organism=20)

        stats = engine.step()
        assert "total_fired" in stats
        assert "fire_rate_percent" in stats
        assert isinstance(stats["total_fired"], int)

    def test_stimulus_produces_spikes(self):
        """Injecting strong current should cause spiking."""
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=10, neurons_per_organism=20, seed=99)

        # Inject strong current into first neuron of every organism
        engine.inject_stimulus(
            organism_indices=list(range(10)),
            neuron_indices=[0],
            current=50.0,
        )

        # Step enough times to see spikes
        total_fired = 0
        for _ in range(50):
            stats = engine.step()
            total_fired += stats["total_fired"]

        assert total_fired > 0, "No spikes despite strong stimulus"

    def test_clear_input(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=5, neurons_per_organism=10)

        engine.set_organism_input(0, 0, 10.0)
        assert engine.I_ext[0] == 10.0

        engine.clear_input()
        np.testing.assert_allclose(engine.I_ext, 0.0)


class TestVectorizedEngineOrganismState:
    """Test per-organism state extraction."""

    def test_get_organism_state(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=10, neurons_per_organism=20)

        state = engine.get_organism_state(0)
        assert "voltages" in state
        assert "fired" in state
        assert "firing_rates" in state
        assert len(state["voltages"]) == 20
        assert len(state["fired"]) == 20

    def test_get_organism_state_different_organisms(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=10, neurons_per_organism=20)

        # Inject current into organism 3 only
        engine.set_organism_input(3, 0, 100.0)
        for _ in range(20):
            engine.step()

        s0 = engine.get_organism_state(0)
        s3 = engine.get_organism_state(3)
        # Organism 3 should have different voltages from organism 0
        # (the stimulus drives them apart)
        assert s0["voltages"] != s3["voltages"]

    def test_set_organism_input(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=5, neurons_per_organism=10)

        engine.set_organism_input(2, 5, 7.5)
        idx = 2 * 10 + 5
        assert engine.I_ext[idx] == 7.5

    def test_inject_stimulus_bounds(self):
        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=5, neurons_per_organism=10)

        # Should not crash with out-of-bounds indices
        engine.inject_stimulus([0, 1, 100], [0, 1, 200], current=5.0)


# ======================================================================
# MassiveEcosystem tests
# ======================================================================


class TestMassiveEcosystem:
    """Test the vectorized ecosystem."""

    def test_init(self):
        eco = MassiveEcosystem(n_organisms=1000, arena_size=50.0, seed=42)
        assert eco.n == 1000
        assert len(eco.x) == 1000
        assert np.all(eco.alive)

    def test_step_returns_stats(self):
        eco = MassiveEcosystem(n_organisms=500, seed=42)
        stats = eco.step(dt=1.0)
        assert "alive" in stats
        assert "dead" in stats
        assert "mean_energy" in stats

    def test_1000_steps_population_dynamics(self):
        """Over 1000 steps with no food, organisms should starve and die."""
        # No food at all -- organisms must starve
        eco = MassiveEcosystem(
            n_organisms=10_000, arena_size=200.0, n_food=0, seed=42
        )

        for _ in range(1000):
            eco.step(dt=1.0)

        alive = int(np.sum(eco.alive))
        # With 0.01 energy drain/step, 100 starting energy is gone
        # after 10K steps. At 1000 steps only 10 energy gone, so also
        # test with a bigger dt to force deaths within 1000 steps.
        # Actually, use dt=1.0 * 20 to drain faster.
        assert alive == eco.n  # at 0.01/step * 1000 = 10 loss, nobody dies yet

        # Now run with large dt to force starvation
        eco2 = MassiveEcosystem(
            n_organisms=10_000, arena_size=200.0, n_food=0, seed=42
        )
        for _ in range(1000):
            eco2.step(dt=15.0)  # 0.01 * 15 = 0.15/step => 150 total > 100

        alive2 = int(np.sum(eco2.alive))
        assert alive2 < eco2.n, "Expected deaths with no food and large dt"
        assert alive2 == 0, "With zero food and 150 energy drained, all should die"

    def test_energy_decreases(self):
        """Energy should decrease over time (metabolic cost)."""
        eco = MassiveEcosystem(n_organisms=100, arena_size=50.0, n_food=0, seed=42)
        initial_energy = eco.energy.copy()
        eco.step(dt=1.0)
        # All alive organisms should have lost energy (no food to eat)
        assert np.all(eco.energy[eco.alive] < initial_energy[eco.alive])

    def test_species_assignment(self):
        eco = MassiveEcosystem(n_organisms=10_000, seed=42)
        n_celegans = int(np.sum(eco.species == 0))
        n_drosophila = int(np.sum(eco.species == 1))
        assert n_celegans + n_drosophila == 10_000
        # Should have a mix (roughly 70/30)
        assert n_celegans > 5000
        assert n_drosophila > 1000

    def test_get_state_summary(self):
        eco = MassiveEcosystem(n_organisms=5000, seed=42)
        summary = eco.get_state_summary(max_display=100)
        assert summary["total_alive"] == 5000
        assert len(summary["organisms"]) <= 100
        assert "c_elegans" in summary["stats"]
        assert "drosophila" in summary["stats"]

    def test_no_nan_after_many_steps(self):
        eco = MassiveEcosystem(n_organisms=1000, seed=42)
        for _ in range(200):
            eco.step()
        alive = eco.alive
        assert not np.any(np.isnan(eco.x[alive]))
        assert not np.any(np.isnan(eco.y[alive]))
        assert not np.any(np.isnan(eco.energy[alive]))

    def test_arena_wrapping(self):
        """Organisms should stay within the arena bounds."""
        eco = MassiveEcosystem(n_organisms=1000, arena_size=50.0, seed=42)
        for _ in range(100):
            eco.step()
        half = eco.arena_size / 2.0
        alive = eco.alive
        assert np.all(eco.x[alive] >= -half)
        assert np.all(eco.x[alive] < half)
