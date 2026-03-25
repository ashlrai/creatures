"""Tests for spike-timing-dependent plasticity (STDP) in Brian2 engine."""

import numpy as np
import pytest

from creatures.connectome.types import Connectome
from creatures.neural.base import MonitorConfig, NeuralConfig, PlasticityConfig
from creatures.neural.brian2_engine import Brian2Engine


# Use a broader set of sensory neurons to ensure enough cascading activity
SENSORY_IDS = ["PLML", "PLMR", "AVM", "ALML", "ALMR"]
STRONG_STIMULUS = 40.0  # mV — strong enough to drive spikes and cascade

# Use numpy codegen to avoid Cython compilation overhead in tests
_TEST_CONFIG = NeuralConfig(codegen_target="numpy")


@pytest.fixture()
def static_engine(connectome: Connectome) -> Brian2Engine:
    """Build a Brian2Engine with STDP disabled (static synapses)."""
    eng = Brian2Engine()
    eng.build(connectome, config=_TEST_CONFIG, monitor=MonitorConfig(record_spikes=True))
    return eng


@pytest.fixture()
def plastic_engine(connectome: Connectome) -> Brian2Engine:
    """Build a Brian2Engine with STDP enabled."""
    eng = Brian2Engine()
    plasticity = PlasticityConfig(
        enabled=True,
        a_plus=0.05,
        a_minus=0.02,
        w_max=20.0,
        w_min=-5.0,  # allow inhibitory weights
    )
    eng.build(connectome, config=_TEST_CONFIG, monitor=MonitorConfig(record_spikes=True), plasticity=plasticity)
    return eng


class TestStaticWeightsUnchanged:
    """With STDP disabled, weights must remain constant."""

    def test_weights_unchanged_after_simulation(self, static_engine: Brian2Engine):
        """Run 30ms with stimulus; static weights should not change."""
        weights_before = static_engine.get_synapse_weights().copy()
        static_engine.set_input_currents({nid: STRONG_STIMULUS for nid in SENSORY_IDS})
        for _ in range(30):
            static_engine.step(1.0)
        weights_after = static_engine.get_synapse_weights()
        np.testing.assert_array_equal(
            weights_before, weights_after,
            err_msg="Static synapse weights should not change during simulation",
        )


@pytest.mark.slow
class TestSTDPWeightsChange:
    """With STDP enabled, weights must change when there is activity."""

    def test_weights_change_with_stimulus(self, plastic_engine: Brian2Engine):
        """Stimulate sensory neurons for 80ms; STDP should modify some weights."""
        weights_before = plastic_engine.get_synapse_weights().copy()
        plastic_engine.set_input_currents({nid: STRONG_STIMULUS for nid in SENSORY_IDS})
        for _ in range(80):
            plastic_engine.step(1.0)
        weights_after = plastic_engine.get_synapse_weights()
        delta = weights_after - weights_before
        n_changed = int(np.sum(np.abs(delta) > 1e-6))
        assert n_changed > 0, (
            "STDP-enabled synapses should change weight when neurons are active; "
            f"0 of {len(delta)} synapses changed"
        )


@pytest.mark.slow
class TestHebbianPotentiation:
    """Pre-before-post pairing should strengthen synapses (classical Hebbian)."""

    def test_pre_before_post_strengthens(self, connectome: Connectome):
        """Repeated pre-before-post pairing should cause net potentiation.

        We stimulate sensory neurons which drive their postsynaptic targets.
        With a_plus > a_minus, pre-before-post (causal) pairings dominate,
        so net weight change should be positive.
        """
        eng = Brian2Engine()
        plasticity = PlasticityConfig(
            enabled=True,
            a_plus=0.05,     # larger amplitude for clear test signal
            a_minus=0.02,    # weaker depression -> net potentiation expected
            w_max=20.0,
            w_min=-5.0,
        )
        eng.build(connectome, config=_TEST_CONFIG, monitor=MonitorConfig(record_spikes=True), plasticity=plasticity)

        weights_before = eng.get_synapse_weights().copy()

        # Repeatedly stimulate sensory neurons to drive causal (pre->post) firing
        for trial in range(5):
            eng.set_input_currents({nid: STRONG_STIMULUS for nid in SENSORY_IDS})
            for _ in range(20):
                eng.step(1.0)
            eng.set_input_currents({})
            for _ in range(10):
                eng.step(1.0)

        weights_after = eng.get_synapse_weights()
        delta = weights_after - weights_before

        # At least some synapses should be potentiated (delta > 0)
        n_potentiated = int(np.sum(delta > 0.001))
        assert n_potentiated > 0, (
            f"Expected some potentiated synapses after Hebbian pairing, "
            f"got {n_potentiated}. Max delta={np.max(delta):.6f}"
        )


@pytest.mark.slow
class TestWeightBounds:
    """STDP weight changes must respect w_min and w_max bounds."""

    def test_weights_stay_within_bounds(self, connectome: Connectome):
        """After prolonged stimulation, all weights should be within [w_min, w_max]."""
        w_min, w_max = -5.0, 5.0
        eng = Brian2Engine()
        plasticity = PlasticityConfig(
            enabled=True,
            a_plus=0.1,    # aggressive plasticity to push bounds
            a_minus=0.12,
            w_max=w_max,
            w_min=w_min,
        )
        eng.build(connectome, config=_TEST_CONFIG, monitor=MonitorConfig(record_spikes=True), plasticity=plasticity)

        # Drive hard for 100ms to push weights toward bounds
        eng.set_input_currents({nid: 50.0 for nid in SENSORY_IDS})
        for _ in range(100):
            eng.step(1.0)

        weights = eng.get_synapse_weights()
        assert np.all(weights >= w_min - 1e-3), (
            f"Weights below w_min: min={weights.min():.4f}, w_min={w_min}"
        )
        assert np.all(weights <= w_max + 1e-3), (
            f"Weights above w_max: max={weights.max():.4f}, w_max={w_max}"
        )


class TestGetWeightChanges:
    """get_weight_changes() should return valid statistics."""

    def test_returns_empty_before_build(self):
        """Unbuilt engine should return empty dict."""
        eng = Brian2Engine()
        assert eng.get_weight_changes() == {}

    def test_returns_valid_stats_after_simulation(self, plastic_engine: Brian2Engine):
        """After simulation with STDP, stats should contain all expected keys."""
        plastic_engine.set_input_currents({nid: STRONG_STIMULUS for nid in SENSORY_IDS})
        for _ in range(30):
            plastic_engine.step(1.0)

        stats = plastic_engine.get_weight_changes()
        expected_keys = {
            "mean_change", "std_change", "max_potentiation",
            "max_depression", "n_potentiated", "n_depressed", "n_unchanged",
        }
        assert set(stats.keys()) == expected_keys

    def test_stats_types_are_correct(self, plastic_engine: Brian2Engine):
        """All returned values should be the correct numeric types."""
        plastic_engine.set_input_currents({nid: STRONG_STIMULUS for nid in SENSORY_IDS})
        for _ in range(20):
            plastic_engine.step(1.0)

        stats = plastic_engine.get_weight_changes()
        for key in ("mean_change", "std_change", "max_potentiation", "max_depression"):
            assert isinstance(stats[key], float), f"{key} should be float"
        for key in ("n_potentiated", "n_depressed", "n_unchanged"):
            assert isinstance(stats[key], int), f"{key} should be int"

    def test_counts_sum_to_total_synapses(self, plastic_engine: Brian2Engine):
        """Potentiated + depressed + unchanged should equal total synapse count."""
        plastic_engine.set_input_currents({nid: STRONG_STIMULUS for nid in SENSORY_IDS})
        for _ in range(30):
            plastic_engine.step(1.0)

        stats = plastic_engine.get_weight_changes()
        total = stats["n_potentiated"] + stats["n_depressed"] + stats["n_unchanged"]
        n_synapses = len(plastic_engine.get_synapse_weights())
        assert total == n_synapses, (
            f"Sum of categories ({total}) != total synapses ({n_synapses})"
        )


class TestPlasticityConfig:
    """PlasticityConfig dataclass tests."""

    def test_default_disabled(self):
        cfg = PlasticityConfig()
        assert cfg.enabled is False

    def test_custom_values(self):
        cfg = PlasticityConfig(
            enabled=True, tau_pre=15.0, tau_post=25.0,
            a_plus=0.02, a_minus=0.025, w_max=20.0, w_min=-1.0,
        )
        assert cfg.enabled is True
        assert cfg.tau_pre == 15.0
        assert cfg.w_max == 20.0
        assert cfg.w_min == -1.0

    def test_importable_from_base(self):
        """PlasticityConfig should be importable from creatures.neural.base."""
        from creatures.neural.base import PlasticityConfig as PC
        assert PC is PlasticityConfig
