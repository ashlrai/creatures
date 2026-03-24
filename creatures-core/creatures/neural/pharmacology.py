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

if TYPE_CHECKING:
    from creatures.connectome.types import Connectome, NeuronType
    from creatures.neural.base import NeuralEngine

logger = logging.getLogger(__name__)


@dataclass
class DrugEffect:
    """Definition of a pharmacological agent's effect on the neural network."""

    name: str
    target_nt: str | None  # neurotransmitter to affect (e.g., "GABA", "ACh")
    target_type: str | None  # neuron type to affect (e.g., "motor", "sensory")
    weight_scale: float = 1.0  # multiply matching synapse weights by this
    current_injection: float = 0.0  # inject current (mV) into target neurons
    ec50: float = 1.0  # dose producing 50% of max effect
    hill_coefficient: float = 1.5  # steepness of dose-response curve
    description: str = ""


# Library of well-characterized C. elegans pharmacological agents
DRUG_LIBRARY: dict[str, DrugEffect] = {
    "picrotoxin": DrugEffect(
        name="Picrotoxin",
        target_nt="GABA",
        target_type=None,
        weight_scale=0.0,  # blocks all GABA synapses
        ec50=0.5,
        hill_coefficient=1.8,  # sharp threshold
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
        ec50=0.8,
        hill_coefficient=1.2,  # gradual
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
        ec50=0.3,
        hill_coefficient=2.0,  # very steep
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
        ec50=0.6,
        hill_coefficient=1.5,
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
        ec50=1.0,
        hill_coefficient=1.0,  # linear-ish
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
        ec50=0.8,
        hill_coefficient=1.0,
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
        ec50=0.2,
        hill_coefficient=2.5,  # extremely steep -- potent
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
        ec50=1.2,
        hill_coefficient=1.3,
        description=(
            "L-type calcium channel blocker. Reduces synaptic transmission "
            "globally and decreases locomotion speed. Affects egg-laying "
            "and pharyngeal pumping (Bhatt & bhatt, 2022)."
        ),
    ),
}


def _hill_response(dose: float, ec50: float, hill_n: float) -> float:
    """Compute normalized response (0-1) using the Hill equation.

    The Hill equation models the sigmoidal relationship between drug
    concentration and biological response:

        response = dose^n / (EC50^n + dose^n)

    where EC50 is the dose producing 50% of max effect and n (the Hill
    coefficient) controls the steepness of the curve.

    Args:
        dose: Drug concentration (arbitrary units, typically 0-2).
        ec50: Half-maximal effective concentration.
        hill_n: Hill coefficient (steepness). n=1 is Michaelis-Menten,
                n>1 gives cooperative (steep) curves, n<1 gives shallow curves.

    Returns:
        Normalized response in [0, 1].
    """
    if dose <= 0:
        return 0.0
    return dose**hill_n / (ec50**hill_n + dose**hill_n)


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

    def __init__(self, engine: NeuralEngine, connectome: Connectome) -> None:
        self.engine = engine
        self.connectome = connectome
        self._original_weights: np.ndarray | None = None
        self._applied_drugs: list[tuple[str, float]] = []
        self._injected_currents: dict[str, float] = {}

        # Cache original weights on construction
        weights = engine.get_synapse_weights()
        if len(weights) > 0:
            self._original_weights = weights.copy()

    def apply_drug(self, drug_name: str, dose: float = 1.0) -> dict:
        """Apply a drug effect to the neural network.

        Args:
            drug_name: Key from DRUG_LIBRARY (e.g., "picrotoxin").
            dose: Dose level (0.0-2.0+). Effect follows a sigmoidal
                  Hill equation curve: response = dose^n / (EC50^n + dose^n).
                  At dose=EC50, response is 50% of maximum effect.

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
        current_weights = self.engine.get_synapse_weights()
        if len(current_weights) == 0:
            raise RuntimeError("Engine not built. Call engine.build() first.")

        # Save original weights if not already saved
        if self._original_weights is None:
            self._original_weights = current_weights.copy()

        # Always apply scaling from original weights to prevent compounding
        # when multiple drugs are applied sequentially
        base_weights = self._original_weights.copy()

        # Compute dose-adjusted parameters using the Hill equation
        # Hill equation gives a sigmoidal dose-response: response in [0, 1]
        # At dose=EC50, response=0.5 (half-maximal effect)
        response = _hill_response(dose, drug.ec50, drug.hill_coefficient)

        if drug.weight_scale < 1.0:
            # For antagonists (scale < 1): interpolate from 1.0 down
            effective_scale = 1.0 - response * (1.0 - drug.weight_scale)
        else:
            # For agonists (scale > 1): interpolate from 1.0 up
            effective_scale = 1.0 + response * (drug.weight_scale - 1.0)

        effective_current = drug.current_injection * response

        # Build NT lookup: which presynaptic neurons use the target NT?
        target_pre_indices = set()
        target_neuron_ids = set()

        if drug.target_nt is not None:
            for nid, neuron in self.connectome.neurons.items():
                nt = neuron.neurotransmitter
                if nt is not None and nt.upper() == drug.target_nt.upper():
                    idx = self.engine.get_neuron_index(nid)
                    if idx is not None:
                        target_pre_indices.add(idx)
                        target_neuron_ids.add(nid)

        # If target_type specified, filter further
        if drug.target_type is not None:
            type_filtered = set()
            for nid, neuron in self.connectome.neurons.items():
                if neuron.neuron_type.value == drug.target_type:
                    idx = self.engine.get_neuron_index(nid)
                    if idx is not None:
                        type_filtered.add(idx)
            if target_pre_indices:
                target_pre_indices &= type_filtered
            else:
                target_pre_indices = type_filtered

        # If no specific target, affect all synapses
        # Use base_weights (originals) to prevent compounding on repeated apply
        if drug.target_nt is None and drug.target_type is None:
            # Global effect
            new_weights = base_weights * effective_scale
            self.engine.set_synapse_weights(new_weights)
            n_affected = len(base_weights)
        else:
            # Targeted effect: only modify synapses from target neurons
            pre_arr = self.engine.get_synapse_pre_indices()
            new_weights = base_weights.copy()
            mask = np.isin(pre_arr, list(target_pre_indices))
            new_weights[mask] *= effective_scale
            self.engine.set_synapse_weights(new_weights)
            n_affected = int(mask.sum())

        # Apply current injection to target neurons
        # Recompute from scratch (like weights) to prevent compounding
        n_injected = 0
        if effective_current != 0.0 and target_neuron_ids:
            for nid in target_neuron_ids:
                self._injected_currents[nid] = effective_current
                n_injected += 1

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
        if self._original_weights is not None:
            self.engine.set_synapse_weights(self._original_weights)
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
            "ec50": drug.ec50,
            "hill_coefficient": drug.hill_coefficient,
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
