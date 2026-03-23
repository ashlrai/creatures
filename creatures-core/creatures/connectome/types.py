"""Core data types for representing biological connectomes."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Self

import numpy as np


class NeuronType(str, Enum):
    SENSORY = "sensory"
    INTER = "inter"
    MOTOR = "motor"
    UNKNOWN = "unknown"


class SynapseType(str, Enum):
    CHEMICAL = "chemical"
    ELECTRICAL = "electrical"  # gap junction


@dataclass
class Neuron:
    """A single neuron in a connectome."""

    id: str
    neuron_type: NeuronType = NeuronType.UNKNOWN
    neurotransmitter: str | None = None  # e.g., "ACh", "GABA", "glutamate"
    position: tuple[float, float, float] | None = None
    metadata: dict = field(default_factory=dict)

    @property
    def is_excitatory(self) -> bool:
        inhibitory = {"GABA", "glycine"}
        if self.neurotransmitter is None:
            return True  # default assumption
        return self.neurotransmitter.upper() not in inhibitory

    @property
    def sign(self) -> int:
        """Return +1 for excitatory, -1 for inhibitory."""
        return 1 if self.is_excitatory else -1


@dataclass
class Synapse:
    """A directed connection between two neurons."""

    pre_id: str
    post_id: str
    weight: float  # synapse count or normalized weight
    synapse_type: SynapseType = SynapseType.CHEMICAL
    neurotransmitter: str | None = None

    @property
    def is_excitatory(self) -> bool:
        inhibitory = {"GABA", "glycine"}
        if self.neurotransmitter is None:
            return True
        return self.neurotransmitter.upper() not in inhibitory


@dataclass
class Connectome:
    """A complete connectome: neurons + synapses forming a directed graph."""

    name: str
    neurons: dict[str, Neuron]  # id -> Neuron
    synapses: list[Synapse]
    metadata: dict = field(default_factory=dict)

    @property
    def neuron_ids(self) -> list[str]:
        """Sorted list of all neuron IDs."""
        return sorted(self.neurons.keys())

    @property
    def n_neurons(self) -> int:
        return len(self.neurons)

    @property
    def n_synapses(self) -> int:
        return len(self.synapses)

    @property
    def neuron_id_to_index(self) -> dict[str, int]:
        """Map from neuron ID to matrix index."""
        return {nid: i for i, nid in enumerate(self.neuron_ids)}

    @property
    def adjacency_matrix(self) -> np.ndarray:
        """Return (N x N) signed weight matrix, ordered by sorted neuron IDs.

        Weights are multiplied by the presynaptic neuron's sign (+1/-1)
        to encode excitation/inhibition.
        """
        n = self.n_neurons
        idx = self.neuron_id_to_index
        mat = np.zeros((n, n), dtype=np.float64)
        for s in self.synapses:
            if s.pre_id in idx and s.post_id in idx:
                pre_neuron = self.neurons[s.pre_id]
                sign = pre_neuron.sign
                mat[idx[s.pre_id], idx[s.post_id]] += s.weight * sign
        return mat

    def to_brian2_params(self) -> dict:
        """Return pre/post indices and weights for Brian2 Synapses.

        Returns dict with keys: 'i' (pre indices), 'j' (post indices),
        'w' (signed weights as float array).
        """
        idx = self.neuron_id_to_index
        i_list, j_list, w_list = [], [], []
        for s in self.synapses:
            if s.pre_id in idx and s.post_id in idx:
                pre_neuron = self.neurons[s.pre_id]
                i_list.append(idx[s.pre_id])
                j_list.append(idx[s.post_id])
                w_list.append(s.weight * pre_neuron.sign)
        return {
            "i": np.array(i_list, dtype=np.int32),
            "j": np.array(j_list, dtype=np.int32),
            "w": np.array(w_list, dtype=np.float64),
        }

    def subset(self, neuron_ids: list[str]) -> Self:
        """Return a sub-connectome containing only the specified neurons."""
        id_set = set(neuron_ids)
        neurons = {nid: self.neurons[nid] for nid in neuron_ids if nid in self.neurons}
        synapses = [
            s for s in self.synapses if s.pre_id in id_set and s.post_id in id_set
        ]
        return Connectome(
            name=f"{self.name}_subset",
            neurons=neurons,
            synapses=synapses,
            metadata={**self.metadata, "parent": self.name, "subset_size": len(neurons)},
        )

    def neurons_by_type(self, neuron_type: NeuronType) -> list[Neuron]:
        """Return all neurons of a given type."""
        return [n for n in self.neurons.values() if n.neuron_type == neuron_type]

    def degree(self, neuron_id: str, direction: str = "both") -> int:
        """Return the degree (number of connections) for a neuron."""
        count = 0
        for s in self.synapses:
            if direction in ("out", "both") and s.pre_id == neuron_id:
                count += 1
            if direction in ("in", "both") and s.post_id == neuron_id:
                count += 1
        return count

    def summary(self) -> str:
        """Return a human-readable summary of the connectome."""
        type_counts = {}
        for n in self.neurons.values():
            type_counts[n.neuron_type.value] = type_counts.get(n.neuron_type.value, 0) + 1
        chem = sum(1 for s in self.synapses if s.synapse_type == SynapseType.CHEMICAL)
        elec = sum(1 for s in self.synapses if s.synapse_type == SynapseType.ELECTRICAL)
        lines = [
            f"Connectome: {self.name}",
            f"  Neurons: {self.n_neurons} ({', '.join(f'{k}: {v}' for k, v in sorted(type_counts.items()))})",
            f"  Synapses: {self.n_synapses} (chemical: {chem}, electrical: {elec})",
        ]
        return "\n".join(lines)
