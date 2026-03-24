"""Pharmacology engine: biologically accurate neurotransmitter drug effects.

Models the effects of known pharmacological agents on C. elegans neural
circuits by modifying synaptic weights based on neurotransmitter type.

This enables in-silico drug experiments that mirror real wet-lab protocols:
- GABA antagonists (picrotoxin) -> remove inhibition -> seizure-like activity
- AChE inhibitors (aldicarb) -> enhanced cholinergic signaling -> paralysis
- Dopamine antagonists -> reduced locomotion initiation

References:
    - Richmond & Jorgensen, Nature Neuroscience 2, 791-797 (1999)
    - Mahoney et al., Current Biology 16(20), 2006
    - de Bono & Maricq, Annual Review of Neuroscience 28, 2005
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np
from brian2 import mV

if TYPE_CHECKING:
    from creatures.connectome.types import Connectome, NeuronType
    from creatures.neural.brian2_engine import Brian2Engine

logger = logging.getLogger(__name__)


@dataclass
class DrugEffect:
    """Definition of a pharmacological agent's effect on the neural network."""

    name: str
    target_nt: str | None  # neurotransmitter to affect (e.g., "GABA", "ACh")
    target_type: str | None  # neuron type to affect (e.g., "motor", "sensory")
    weight_scale: float = 1.0  # multiply matching synapse weights by this
    current_injection: float = 0.0  # inject current (mV) into target neurons
    description: str = ""


# Library of well-characterized C. elegans pharmacological agents
DRUG_LIBRARY: dict[str, DrugEffect] = {
    "picrotoxin": DrugEffect(
        name="Picrotoxin",
        target_nt="GABA",
        target_type=None,
        weight_scale=0.0,  # blocks all GABA synapses
        description=(
            "GABA_A receptor antagonist. Blocks inhibitory GABAergic "
            "transmission. In C. elegans, causes dorsal-ventral motor "
            "imbalance and 'shrinker' phenotype (Bamber et al., 1999)."
        ),
    ),
    "aldicarb": DrugEffect(
        name="Aldicarb",
        target_nt="ACh",
        target_type=None,
        weight_scale=2.0,  # doubles cholinergic transmission
        description=(
            "Acetylcholinesterase inhibitor. Enhances cholinergic signaling "
            "by preventing ACh breakdown at synapses. Causes progressive "
            "paralysis in C. elegans (Mahoney et al., 2006)."
        ),
    ),
    "levamisole": DrugEffect(
        name="Levamisole",
        target_nt="ACh",
        target_type=None,
        weight_scale=1.5,  # partial agonist effect
        current_injection=5.0,  # also directly activates ACh receptors
        description=(
            "Nicotinic ACh receptor agonist. Causes muscle hypercontraction "
            "and paralysis in C. elegans. Used as anthelmintic."
        ),
    ),
    "muscimol": DrugEffect(
        name="Muscimol",
        target_nt="GABA",
        target_type=None,
        weight_scale=2.5,  # enhances GABA transmission
        description=(
            "GABA_A receptor agonist. Enhances inhibitory transmission. "
            "Causes flaccid paralysis in C. elegans due to excessive "
            "inhibition of motor neurons."
        ),
    ),
    "dopamine": DrugEffect(
        name="Exogenous Dopamine",
        target_nt="dopamine",
        target_type=None,
        weight_scale=2.0,
        current_injection=3.0,
        description=(
            "Exogenous dopamine application. Causes 'basal slowing response' "
            "in C. elegans -- reduced locomotion speed, mimicking the "
            "presence of a bacterial food source (Sawin et al., 2000)."
        ),
    ),
    "serotonin": DrugEffect(
        name="Exogenous Serotonin",
        target_nt="serotonin",
        target_type=None,
        weight_scale=2.0,
        current_injection=3.0,
        description=(
            "Exogenous serotonin (5-HT). Inhibits locomotion and stimulates "
            "egg-laying in C. elegans. Mimics food-associated signals "
            "(Horvitz et al., 1982)."
        ),
    ),
    "ivermectin": DrugEffect(
        name="Ivermectin",
        target_nt="glutamate",
        target_type=None,
        weight_scale=3.0,  # potentiates glutamate-gated Cl- channels
        description=(
            "Glutamate-gated chloride channel agonist. In C. elegans, "
            "causes irreversible paralysis by enhancing inhibitory "
            "glutamatergic transmission (Dent et al., 2000)."
        ),
    ),
    "nemadipine": DrugEffect(
        name="Nemadipine-A",
        target_nt=None,
        target_type=None,
        weight_scale=0.7,  # broadly reduces synaptic transmission
        current_injection=-3.0,  # hyperpolarizes neurons
        description=(
            "L-type calcium channel blocker. Reduces synaptic transmission "
            "globally and decreases locomotion speed. Affects egg-laying "
            "and pharyngeal pumping (Bhatt & bhatt, 2022)."
        ),
    ),
}


class PharmacologyEngine:
    """Apply pharmacological manipulations to a Brian2 neural network.

    Modifies synaptic weights and/or injects currents to model drug effects.
    Supports stacking multiple drugs and dose-response relationships.

    Usage:
        pharma = PharmacologyEngine(engine, connectome)
        result = pharma.apply_drug("picrotoxin", dose=1.0)
        # ... run simulation ...
        pharma.reset()  # restore original weights
    """

    def __init__(self, engine: Brian2Engine, connectome: Connectome) -> None:
        self.engine = engine
        self.connectome = connectome
        self._original_weights: np.ndarray | None = None
        self._applied_drugs: list[tuple[str, float]] = []
        self._injected_currents: dict[str, float] = {}

        # Cache original weights on construction
        if engine._synapses is not None:
            self._original_weights = np.array(engine._synapses.w / mV).copy()

    def apply_drug(self, drug_name: str, dose: float = 1.0) -> dict:
        """Apply a drug effect to the neural network.

        Args:
            drug_name: Key from DRUG_LIBRARY (e.g., "picrotoxin").
            dose: Dose multiplier (0.0-2.0). 1.0 = standard dose.
                  0.5 = half dose, 2.0 = double dose.
                  Effect scales linearly with dose for weight_scale,
                  and linearly for current_injection.

        Returns:
            Dictionary with:
                drug: drug name
                dose: applied dose
                synapses_affected: number of synapses modified
                neurons_injected: number of neurons with current injection
                weight_scale_applied: effective weight scale used
        """
        if drug_name not in DRUG_LIBRARY:
            available = ", ".join(sorted(DRUG_LIBRARY.keys()))
            raise ValueError(
                f"Unknown drug: {drug_name!r}. Available: {available}"
            )

        drug = DRUG_LIBRARY[drug_name]
        synapses = self.engine._synapses
        if synapses is None:
            raise RuntimeError("Engine not built. Call engine.build() first.")

        # Save original weights if not already saved
        if self._original_weights is None:
            self._original_weights = np.array(synapses.w / mV).copy()

        # Compute dose-adjusted parameters
        # weight_scale interpolates: dose=0 -> 1.0 (no effect), dose=1 -> drug.weight_scale
        if drug.weight_scale < 1.0:
            # For antagonists (scale < 1): interpolate from 1.0 down
            effective_scale = 1.0 - dose * (1.0 - drug.weight_scale)
        else:
            # For agonists (scale > 1): interpolate from 1.0 up
            effective_scale = 1.0 + dose * (drug.weight_scale - 1.0)

        effective_current = drug.current_injection * dose

        # Build NT lookup: which presynaptic neurons use the target NT?
        target_pre_indices = set()
        target_neuron_ids = set()

        if drug.target_nt is not None:
            for nid, neuron in self.connectome.neurons.items():
                nt = neuron.neurotransmitter
                if nt is not None and nt.upper() == drug.target_nt.upper():
                    idx = self.engine._id_to_idx.get(nid)
                    if idx is not None:
                        target_pre_indices.add(idx)
                        target_neuron_ids.add(nid)

        # If target_type specified, filter further
        if drug.target_type is not None:
            type_filtered = set()
            for nid, neuron in self.connectome.neurons.items():
                if neuron.neuron_type.value == drug.target_type:
                    type_filtered.add(self.engine._id_to_idx.get(nid))
            type_filtered.discard(None)
            if target_pre_indices:
                target_pre_indices &= type_filtered
            else:
                target_pre_indices = type_filtered

        # If no specific target, affect all synapses
        if drug.target_nt is None and drug.target_type is None:
            # Global effect
            current_weights = np.array(synapses.w / mV)
            synapses.w[:] = current_weights * effective_scale * mV
            n_affected = len(current_weights)
        else:
            # Targeted effect: only modify synapses from target neurons
            pre_arr = np.array(synapses.i)
            n_affected = 0
            for syn_idx in range(len(pre_arr)):
                if int(pre_arr[syn_idx]) in target_pre_indices:
                    current_w = float(synapses.w[syn_idx] / mV)
                    synapses.w[syn_idx] = current_w * effective_scale * mV
                    n_affected += 1

        # Apply current injection to target neurons
        n_injected = 0
        if effective_current != 0.0 and target_neuron_ids:
            for nid in target_neuron_ids:
                self._injected_currents[nid] = (
                    self._injected_currents.get(nid, 0.0) + effective_current
                )
                n_injected += 1

            # Apply accumulated currents
            self.engine.set_input_currents(self._injected_currents)

        self._applied_drugs.append((drug_name, dose))

        result = {
            "drug": drug.name,
            "dose": dose,
            "synapses_affected": n_affected,
            "neurons_injected": n_injected,
            "weight_scale_applied": effective_scale,
            "description": drug.description,
        }

        logger.info(
            f"Applied {drug.name} (dose={dose:.1f}): "
            f"{n_affected} synapses scaled by {effective_scale:.2f}, "
            f"{n_injected} neurons injected with {effective_current:.1f}mV"
        )

        return result

    def reset(self) -> None:
        """Restore original synaptic weights and remove injected currents."""
        if self._original_weights is not None and self.engine._synapses is not None:
            self.engine._synapses.w[:] = self._original_weights * mV
            logger.info("Restored original synaptic weights")

        self._injected_currents.clear()
        self.engine.set_input_currents({})
        self._applied_drugs.clear()

    @property
    def applied_drugs(self) -> list[tuple[str, float]]:
        """Return list of (drug_name, dose) currently applied."""
        return list(self._applied_drugs)

    def get_drug_info(self, drug_name: str) -> dict:
        """Return information about a drug from the library."""
        if drug_name not in DRUG_LIBRARY:
            raise ValueError(f"Unknown drug: {drug_name!r}")
        drug = DRUG_LIBRARY[drug_name]
        return {
            "name": drug.name,
            "target_nt": drug.target_nt,
            "target_type": drug.target_type,
            "weight_scale": drug.weight_scale,
            "current_injection": drug.current_injection,
            "description": drug.description,
        }

    @staticmethod
    def list_drugs() -> list[dict]:
        """Return information about all available drugs."""
        return [
            {
                "key": key,
                "name": drug.name,
                "target_nt": drug.target_nt,
                "description": drug.description,
            }
            for key, drug in sorted(DRUG_LIBRARY.items())
        ]
