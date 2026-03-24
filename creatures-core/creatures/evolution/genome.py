"""Genome: a mutable connectome for evolutionary optimization.

The genome wraps a biological connectome's topology and weights as numpy
arrays for fast mutation, crossover, and serialization. It serves as the
unit of evolution — each organism in the population has its own genome.

Key design: the neuron IDs and connectivity structure (pre_indices,
post_indices) come from real biological data. Evolution modifies the
weights and optionally adds/removes connections and neurons.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from creatures.connectome.types import (
    Connectome,
    Neuron,
    NeuronType,
    Synapse,
    SynapseType,
)


@dataclass
class Genome:
    """A mutable genome derived from a biological connectome."""

    id: str
    parent_ids: tuple[str, ...]
    generation: int

    # Neuron data
    neuron_ids: list[str]
    neuron_types: dict[str, NeuronType]
    neuron_nts: dict[str, str | None]

    # Connectivity as sparse COO (fast mutation)
    pre_indices: np.ndarray  # int32 (n_synapses,)
    post_indices: np.ndarray  # int32 (n_synapses,)
    weights: np.ndarray  # float64 (n_synapses,) — THE EVOLVABLE PART
    synapse_types: np.ndarray  # int8 (n_synapses,) 0=chemical, 1=electrical

    # Template origin
    template_name: str = ""

    # Fitness (set during evaluation)
    fitness: float = 0.0
    metadata: dict = field(default_factory=dict)

    @property
    def n_neurons(self) -> int:
        return len(self.neuron_ids)

    @property
    def n_synapses(self) -> int:
        return len(self.weights)

    @property
    def density(self) -> float:
        n = self.n_neurons
        return self.n_synapses / (n * n) if n > 0 else 0

    @classmethod
    def from_connectome(cls, connectome: Connectome) -> Genome:
        """Create a genome from a biological connectome."""
        neuron_ids = connectome.neuron_ids
        id_to_idx = {nid: i for i, nid in enumerate(neuron_ids)}

        pre_list, post_list, weight_list, type_list = [], [], [], []
        for s in connectome.synapses:
            if s.pre_id in id_to_idx and s.post_id in id_to_idx:
                pre_list.append(id_to_idx[s.pre_id])
                post_list.append(id_to_idx[s.post_id])
                # Include neuron sign in weight
                pre_neuron = connectome.neurons[s.pre_id]
                weight_list.append(s.weight * pre_neuron.sign)
                type_list.append(0 if s.synapse_type == SynapseType.CHEMICAL else 1)

        return cls(
            id=str(uuid.uuid4())[:8],
            parent_ids=(),
            generation=0,
            neuron_ids=neuron_ids,
            neuron_types={nid: n.neuron_type for nid, n in connectome.neurons.items()},
            neuron_nts={nid: n.neurotransmitter for nid, n in connectome.neurons.items()},
            pre_indices=np.array(pre_list, dtype=np.int32),
            post_indices=np.array(post_list, dtype=np.int32),
            weights=np.array(weight_list, dtype=np.float64),
            synapse_types=np.array(type_list, dtype=np.int8),
            template_name=connectome.name,
        )

    def to_connectome(self) -> Connectome:
        """Convert back to a Connectome for use with Brian2Engine."""
        neurons = {}
        for nid in self.neuron_ids:
            neurons[nid] = Neuron(
                id=nid,
                neuron_type=self.neuron_types.get(nid, NeuronType.UNKNOWN),
                neurotransmitter=self.neuron_nts.get(nid),
            )

        synapses = []
        for i in range(self.n_synapses):
            pre_id = self.neuron_ids[self.pre_indices[i]]
            post_id = self.neuron_ids[self.post_indices[i]]
            w = abs(self.weights[i])
            syn_type = SynapseType.CHEMICAL if self.synapse_types[i] == 0 else SynapseType.ELECTRICAL
            synapses.append(Synapse(pre_id=pre_id, post_id=post_id, weight=w, synapse_type=syn_type))

        return Connectome(
            name=f"evolved_{self.template_name}_gen{self.generation}",
            neurons=neurons,
            synapses=synapses,
            metadata={"genome_id": self.id, "generation": self.generation, "fitness": self.fitness},
        )

    def to_dict(self) -> dict:
        """Serialize genome to a plain dict (numpy arrays become lists).

        Used for multiprocessing: genomes must be picklable across process
        boundaries.  We convert numpy arrays to lists so the dict is safe
        for ``multiprocessing.Pool.map``.
        """
        return {
            "id": self.id,
            "parent_ids": self.parent_ids,
            "generation": self.generation,
            "neuron_ids": list(self.neuron_ids),
            "neuron_types": {nid: nt.value for nid, nt in self.neuron_types.items()},
            "neuron_nts": dict(self.neuron_nts),
            "pre_indices": self.pre_indices.tolist(),
            "post_indices": self.post_indices.tolist(),
            "weights": self.weights.tolist(),
            "synapse_types": self.synapse_types.tolist(),
            "template_name": self.template_name,
            "fitness": self.fitness,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Genome:
        """Reconstruct a Genome from a dict produced by ``to_dict()``.

        Converts lists back to numpy arrays and enum values back to
        ``NeuronType`` instances.
        """
        return cls(
            id=d["id"],
            parent_ids=tuple(d["parent_ids"]),
            generation=d["generation"],
            neuron_ids=d["neuron_ids"],
            neuron_types={nid: NeuronType(v) for nid, v in d["neuron_types"].items()},
            neuron_nts=d["neuron_nts"],
            pre_indices=np.array(d["pre_indices"], dtype=np.int32),
            post_indices=np.array(d["post_indices"], dtype=np.int32),
            weights=np.array(d["weights"], dtype=np.float64),
            synapse_types=np.array(d["synapse_types"], dtype=np.int8),
            template_name=d.get("template_name", ""),
            fitness=d.get("fitness", 0.0),
            metadata=d.get("metadata", {}),
        )

    def clone(self) -> Genome:
        """Deep copy with new ID."""
        return Genome(
            id=str(uuid.uuid4())[:8],
            parent_ids=(self.id,),
            generation=self.generation,
            neuron_ids=list(self.neuron_ids),
            neuron_types=dict(self.neuron_types),
            neuron_nts=dict(self.neuron_nts),
            pre_indices=self.pre_indices.copy(),
            post_indices=self.post_indices.copy(),
            weights=self.weights.copy(),
            synapse_types=self.synapse_types.copy(),
            template_name=self.template_name,
            fitness=0.0,
        )

    def distance(self, other: Genome) -> float:
        """Structural distance for speciation (NEAT compatibility distance)."""
        # Build edge sets
        self_edges = set(zip(self.pre_indices.tolist(), self.post_indices.tolist()))
        other_edges = set(zip(other.pre_indices.tolist(), other.post_indices.tolist()))

        matching = self_edges & other_edges
        disjoint = len(self_edges ^ other_edges)

        # Weight difference on matching edges
        weight_diff = 0.0
        if matching:
            for pre, post in matching:
                self_idx = np.where((self.pre_indices == pre) & (self.post_indices == post))[0]
                other_idx = np.where((other.pre_indices == pre) & (other.post_indices == post))[0]
                if len(self_idx) > 0 and len(other_idx) > 0:
                    weight_diff += abs(self.weights[self_idx[0]] - other.weights[other_idx[0]])
            weight_diff /= len(matching)

        max_genes = max(self.n_synapses, other.n_synapses, 1)
        return (disjoint / max_genes) + 0.4 * weight_diff

    def save(self, path: str | Path) -> None:
        """Save genome to HDF5."""
        import h5py
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with h5py.File(path, "w") as f:
            f.create_dataset("weights", data=self.weights)
            f.create_dataset("pre_indices", data=self.pre_indices)
            f.create_dataset("post_indices", data=self.post_indices)
            f.create_dataset("synapse_types", data=self.synapse_types)
            f.attrs["id"] = self.id
            f.attrs["generation"] = self.generation
            f.attrs["fitness"] = self.fitness
            f.attrs["template_name"] = self.template_name
            f.attrs["n_neurons"] = self.n_neurons
            # Store neuron IDs as bytes
            dt = h5py.special_dtype(vlen=str)
            f.create_dataset("neuron_ids", data=self.neuron_ids, dtype=dt)

    @classmethod
    def load(cls, path: str | Path, connectome: Connectome) -> Genome:
        """Load genome from HDF5, using connectome for neuron metadata."""
        import h5py
        with h5py.File(path, "r") as f:
            genome = cls(
                id=str(f.attrs["id"]),
                parent_ids=(),
                generation=int(f.attrs["generation"]),
                neuron_ids=list(f["neuron_ids"][()]),
                neuron_types={nid: n.neuron_type for nid, n in connectome.neurons.items()},
                neuron_nts={nid: n.neurotransmitter for nid, n in connectome.neurons.items()},
                pre_indices=f["pre_indices"][()],
                post_indices=f["post_indices"][()],
                weights=f["weights"][()],
                synapse_types=f["synapse_types"][()],
                template_name=str(f.attrs["template_name"]),
                fitness=float(f.attrs["fitness"]),
            )
        return genome
