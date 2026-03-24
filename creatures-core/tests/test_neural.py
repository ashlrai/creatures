"""Tests for the Brian2 spiking neural network engine."""

import numpy as np
import pytest

from creatures.connectome.types import Connectome
from creatures.neural.base import NeuralConfig, SimulationState
from creatures.neural.brian2_engine import Brian2Engine


@pytest.fixture()
def engine(connectome: Connectome) -> Brian2Engine:
    """Build a Brian2Engine from the session connectome."""
    eng = Brian2Engine()
    eng.build(connectome)
    return eng


class TestBrian2Build:
    """Tests for building a Brian2 network from a connectome."""

    def test_build_sets_neuron_count(self, engine: Brian2Engine, connectome: Connectome):
        assert engine.n_neurons == connectome.n_neurons

    def test_build_sets_neuron_ids(self, engine: Brian2Engine, connectome: Connectome):
        assert engine.neuron_ids == connectome.neuron_ids

    def test_build_creates_network(self, engine: Brian2Engine):
        assert engine._net is not None


class TestInputCurrents:
    """Tests for setting external input currents."""

    def test_set_input_currents_accepts_dict(self, engine: Brian2Engine):
        engine.set_input_currents({"PLML": 20.0, "PLMR": 20.0})
        # Should not raise

    def test_set_input_currents_unknown_neuron_ignored(self, engine: Brian2Engine):
        engine.set_input_currents({"NONEXISTENT_NEURON": 100.0})
        # Should not raise


class TestStep:
    """Tests for stepping the simulation."""

    def test_step_returns_simulation_state(self, engine: Brian2Engine):
        state = engine.step(1.0)
        assert isinstance(state, SimulationState)

    def test_step_advances_time(self, engine: Brian2Engine):
        state1 = engine.step(1.0)
        state2 = engine.step(1.0)
        assert state2.t_ms > state1.t_ms

    def test_step_voltages_length(self, engine: Brian2Engine, connectome: Connectome):
        state = engine.step(1.0)
        assert len(state.voltages) == connectome.n_neurons

    def test_step_firing_rates_length(self, engine: Brian2Engine, connectome: Connectome):
        state = engine.step(1.0)
        assert len(state.firing_rates) == connectome.n_neurons


class TestStimulationAndSpikes:
    """Tests for stimulation producing spikes."""

    def test_PLML_stimulation_produces_spikes(self, engine: Brian2Engine):
        """Stimulating PLML with strong current should produce spikes within ~14ms."""
        engine.set_input_currents({"PLML": 30.0})
        all_spikes = set()
        for _ in range(14):
            state = engine.step(1.0)
            all_spikes.update(state.spikes)
        assert len(all_spikes) > 0, "Expected spikes after stimulating PLML for 14ms"


class TestLesion:
    """Tests for synapse lesioning."""

    def test_lesion_neuron_zeroes_synapses(self, engine: Brian2Engine):
        """Lesioning a neuron should zero all its synaptic weights."""
        engine.lesion_neuron("PLML")
        pre_arr = np.array(engine._synapses.i)
        post_arr = np.array(engine._synapses.j)
        idx = engine._id_to_idx["PLML"]
        mask = (pre_arr == idx) | (post_arr == idx)
        if mask.any():
            weights = np.array(engine._synapses.w)
            # All weights involving PLML should be zero
            assert np.allclose(weights[mask], 0.0), (
                "Expected all synapses involving PLML to have zero weight after lesion"
            )


class TestFiringRates:
    """Tests for firing rate estimation."""

    def test_get_firing_rates_returns_all_neurons(
        self, engine: Brian2Engine, connectome: Connectome
    ):
        engine.step(1.0)
        rates = engine.get_firing_rates()
        assert isinstance(rates, dict)
        assert len(rates) == connectome.n_neurons

    def test_firing_rates_initially_zero(self, engine: Brian2Engine):
        rates = engine.get_firing_rates()
        assert all(r == 0.0 for r in rates.values())
