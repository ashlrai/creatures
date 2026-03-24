"""Tests for the pharmacology engine: drug effects on neural networks."""

import numpy as np
import pytest
from brian2 import mV

from creatures.connectome.types import Connectome
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.pharmacology import DRUG_LIBRARY, PharmacologyEngine


@pytest.fixture()
def engine(connectome: Connectome) -> Brian2Engine:
    """Build a Brian2Engine from the session connectome."""
    eng = Brian2Engine()
    eng.build(connectome)
    return eng


@pytest.fixture()
def pharma(engine: Brian2Engine, connectome: Connectome) -> PharmacologyEngine:
    """Create a PharmacologyEngine from a built Brian2Engine."""
    return PharmacologyEngine(engine, connectome)


# ── Initialization ───────────────────────────────────────────────────


class TestPharmacologyInit:
    """Tests for PharmacologyEngine construction."""

    def test_initializes_from_brian2_engine(self, pharma: PharmacologyEngine):
        assert pharma.engine is not None

    def test_stores_original_weights(self, pharma: PharmacologyEngine):
        assert pharma._original_weights is not None
        assert len(pharma._original_weights) > 0

    def test_no_drugs_applied_initially(self, pharma: PharmacologyEngine):
        assert len(pharma.applied_drugs) == 0

    def test_list_drugs_returns_all(self):
        drugs = PharmacologyEngine.list_drugs()
        assert len(drugs) == len(DRUG_LIBRARY)
        keys = {d["key"] for d in drugs}
        assert "picrotoxin" in keys
        assert "aldicarb" in keys


# ── Picrotoxin (GABA antagonist) ─────────────────────────────────────


class TestPicrotoxin:
    """Picrotoxin should block all GABA synapses (weight -> 0)."""

    def test_apply_picrotoxin_returns_result(self, pharma: PharmacologyEngine):
        result = pharma.apply_drug("picrotoxin")
        assert result["drug"] == "Picrotoxin"
        assert result["dose"] == 1.0

    def test_picrotoxin_zeroes_gaba_weights(
        self, pharma: PharmacologyEngine, connectome: Connectome, engine: Brian2Engine
    ):
        """After picrotoxin, all synapses from GABA neurons should be zero."""
        pharma.apply_drug("picrotoxin")

        # Identify GABA presynaptic neuron indices
        gaba_indices = set()
        for nid, neuron in connectome.neurons.items():
            if neuron.neurotransmitter and neuron.neurotransmitter.upper() == "GABA":
                idx = engine._id_to_idx.get(nid)
                if idx is not None:
                    gaba_indices.add(idx)

        if not gaba_indices:
            pytest.skip("No GABA neurons found in connectome")

        # Check that all synapses from GABA neurons have zero weight
        pre_arr = np.array(engine._synapses.i)
        weights = np.array(engine._synapses.w / mV)
        for syn_idx in range(len(pre_arr)):
            if int(pre_arr[syn_idx]) in gaba_indices:
                assert weights[syn_idx] == pytest.approx(0.0, abs=1e-10), (
                    f"GABA synapse at index {syn_idx} not zeroed after picrotoxin"
                )

    def test_picrotoxin_affects_synapses(self, pharma: PharmacologyEngine):
        result = pharma.apply_drug("picrotoxin")
        assert result["synapses_affected"] > 0


# ── Aldicarb (AChE inhibitor) ────────────────────────────────────────


class TestAldicarb:
    """Aldicarb should double ACh synaptic weights."""

    def test_aldicarb_doubles_ach_weights(
        self, pharma: PharmacologyEngine, connectome: Connectome, engine: Brian2Engine
    ):
        """After aldicarb, ACh synapse weights should be doubled."""
        # Record pre-drug weights for ACh synapses
        ach_indices = set()
        for nid, neuron in connectome.neurons.items():
            if neuron.neurotransmitter and neuron.neurotransmitter.upper() == "ACH":
                idx = engine._id_to_idx.get(nid)
                if idx is not None:
                    ach_indices.add(idx)

        if not ach_indices:
            pytest.skip("No ACh neurons found in connectome")

        pre_arr = np.array(engine._synapses.i)
        original_weights = np.array(engine._synapses.w / mV).copy()

        pharma.apply_drug("aldicarb")

        new_weights = np.array(engine._synapses.w / mV)
        for syn_idx in range(len(pre_arr)):
            if int(pre_arr[syn_idx]) in ach_indices:
                expected = original_weights[syn_idx] * 2.0
                assert new_weights[syn_idx] == pytest.approx(expected, rel=1e-6), (
                    f"ACh synapse {syn_idx}: expected {expected}, got {new_weights[syn_idx]}"
                )

    def test_aldicarb_affects_synapses(self, pharma: PharmacologyEngine):
        result = pharma.apply_drug("aldicarb")
        assert result["synapses_affected"] > 0
        assert result["weight_scale_applied"] == pytest.approx(2.0)


# ── Reset ─────────────────────────────────────────────────────────────


class TestPharmacologyReset:
    """Tests for restoring original weights after drug application."""

    def test_reset_restores_original_weights(
        self, pharma: PharmacologyEngine, engine: Brian2Engine
    ):
        original = np.array(engine._synapses.w / mV).copy()
        pharma.apply_drug("picrotoxin")
        pharma.reset()
        restored = np.array(engine._synapses.w / mV)
        np.testing.assert_allclose(restored, original, rtol=1e-6)

    def test_reset_clears_applied_drugs(self, pharma: PharmacologyEngine):
        pharma.apply_drug("picrotoxin")
        pharma.reset()
        assert len(pharma.applied_drugs) == 0

    def test_reset_clears_injected_currents(self, pharma: PharmacologyEngine):
        pharma.apply_drug("levamisole")  # this one injects current
        pharma.reset()
        assert len(pharma._injected_currents) == 0


# ── Drug stacking ────────────────────────────────────────────────────


class TestDrugStacking:
    """Tests for applying multiple drugs simultaneously."""

    def test_stack_two_drugs(self, pharma: PharmacologyEngine):
        """Applying two drugs should both be recorded."""
        pharma.apply_drug("picrotoxin")
        pharma.apply_drug("aldicarb")
        assert len(pharma.applied_drugs) == 2
        assert pharma.applied_drugs[0] == ("picrotoxin", 1.0)
        assert pharma.applied_drugs[1] == ("aldicarb", 1.0)

    def test_stacked_effects_are_cumulative(
        self, pharma: PharmacologyEngine, engine: Brian2Engine
    ):
        """After stacking picrotoxin + aldicarb, weights should differ from original."""
        original = np.array(engine._synapses.w / mV).copy()
        pharma.apply_drug("picrotoxin")
        pharma.apply_drug("aldicarb")
        modified = np.array(engine._synapses.w / mV)
        assert not np.allclose(modified, original)

    def test_reset_undoes_all_stacked_drugs(
        self, pharma: PharmacologyEngine, engine: Brian2Engine
    ):
        original = np.array(engine._synapses.w / mV).copy()
        pharma.apply_drug("picrotoxin")
        pharma.apply_drug("aldicarb")
        pharma.reset()
        restored = np.array(engine._synapses.w / mV)
        np.testing.assert_allclose(restored, original, rtol=1e-6)

    def test_unknown_drug_raises_error(self, pharma: PharmacologyEngine):
        with pytest.raises(ValueError, match="Unknown drug"):
            pharma.apply_drug("fake_drug")
