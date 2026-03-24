"""Mutation operators for evolving connectome genomes.

Supports weight perturbation (most common), topology changes
(add/remove synapses and neurons), and configurable rates.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from creatures.connectome.types import NeuronType
from creatures.evolution.genome import Genome


@dataclass
class MutationConfig:
    # Weight mutations (most common)
    weight_perturb_rate: float = 0.8
    weight_perturb_sigma: float = 0.1
    weight_replace_rate: float = 0.1
    weight_replace_range: tuple = (-5.0, 5.0)

    # Topology mutations (rare)
    add_synapse_rate: float = 0.05
    remove_synapse_rate: float = 0.02
    add_neuron_rate: float = 0.01
    remove_neuron_rate: float = 0.005

    # Constraints
    max_neurons: int = 500
    max_synapses: int = 10000
    min_weight: float = -10.0
    max_weight: float = 10.0
    protect_sensory_motor: bool = True


def mutate_weights(genome: Genome, config: MutationConfig, rng: np.random.Generator) -> None:
    """Perturb synaptic weights with Gaussian noise."""
    n = genome.n_synapses
    if n == 0:
        return

    # Decide which weights to perturb
    perturb_mask = rng.random(n) < config.weight_perturb_rate
    replace_mask = rng.random(n) < config.weight_replace_rate

    # Gaussian perturbation
    noise = rng.normal(0, config.weight_perturb_sigma, n)
    genome.weights[perturb_mask] += noise[perturb_mask]

    # Full replacement
    lo, hi = config.weight_replace_range
    genome.weights[replace_mask] = rng.uniform(lo, hi, replace_mask.sum())

    # Clamp
    np.clip(genome.weights, config.min_weight, config.max_weight, out=genome.weights)


def add_synapse(genome: Genome, config: MutationConfig, rng: np.random.Generator) -> bool:
    """Add a new random connection between two neurons."""
    if genome.n_synapses >= config.max_synapses:
        return False

    n = genome.n_neurons
    existing = set(zip(genome.pre_indices.tolist(), genome.post_indices.tolist()))

    # Try up to 20 times to find a non-existing connection
    for _ in range(20):
        pre = rng.integers(0, n)
        post = rng.integers(0, n)
        if pre != post and (pre, post) not in existing:
            # Determine weight sign from neuron type
            pre_id = genome.neuron_ids[pre]
            nt = genome.neuron_nts.get(pre_id)
            sign = -1.0 if nt and nt.upper() in ("GABA", "GLYCINE") else 1.0
            weight = rng.normal(0, 1.0) * sign

            genome.pre_indices = np.append(genome.pre_indices, pre)
            genome.post_indices = np.append(genome.post_indices, post)
            genome.weights = np.append(genome.weights, weight)
            genome.synapse_types = np.append(genome.synapse_types, np.int8(0))
            return True

    return False


def remove_synapse(genome: Genome, config: MutationConfig, rng: np.random.Generator) -> bool:
    """Remove a random synapse."""
    if genome.n_synapses <= 1:
        return False

    idx = rng.integers(0, genome.n_synapses)

    # Keep all except the selected one
    mask = np.ones(genome.n_synapses, dtype=bool)
    mask[idx] = False
    genome.pre_indices = genome.pre_indices[mask]
    genome.post_indices = genome.post_indices[mask]
    genome.weights = genome.weights[mask]
    genome.synapse_types = genome.synapse_types[mask]
    return True


def add_neuron(genome: Genome, config: MutationConfig, rng: np.random.Generator) -> bool:
    """NEAT-style: split a synapse A→B into A→C→B with new interneuron C."""
    if genome.n_neurons >= config.max_neurons or genome.n_synapses == 0:
        return False

    # Pick a random synapse to split
    idx = rng.integers(0, genome.n_synapses)
    pre = genome.pre_indices[idx]
    post = genome.post_indices[idx]
    old_weight = genome.weights[idx]

    # Create new neuron
    new_id = f"EVO_{len(genome.neuron_ids):04d}"
    new_idx = len(genome.neuron_ids)
    genome.neuron_ids.append(new_id)
    genome.neuron_types[new_id] = NeuronType.INTER
    genome.neuron_nts[new_id] = None

    # Disable old synapse (set weight to 0) and add two new ones
    genome.weights[idx] = 0.0

    # A → C (weight 1.0) and C → B (weight = old_weight)
    genome.pre_indices = np.append(genome.pre_indices, [pre, new_idx])
    genome.post_indices = np.append(genome.post_indices, [new_idx, post])
    genome.weights = np.append(genome.weights, [1.0, old_weight])
    genome.synapse_types = np.append(genome.synapse_types, [np.int8(0), np.int8(0)])
    return True


def remove_neuron(genome: Genome, config: MutationConfig, rng: np.random.Generator) -> bool:
    """Remove a random interneuron and all its synapses."""
    # Find eligible neurons (interneurons only, not sensory/motor)
    eligible = [
        i for i, nid in enumerate(genome.neuron_ids)
        if genome.neuron_types.get(nid) == NeuronType.INTER
        and (not config.protect_sensory_motor or not nid.startswith("EVO_") or True)
    ]
    # Only remove evolved neurons or unprotected interneurons
    evolved = [i for i in eligible if genome.neuron_ids[i].startswith("EVO_")]
    if not evolved:
        return False

    victim_idx = int(rng.choice(evolved))

    # Remove all synapses involving this neuron
    mask = (genome.pre_indices != victim_idx) & (genome.post_indices != victim_idx)
    genome.pre_indices = genome.pre_indices[mask]
    genome.post_indices = genome.post_indices[mask]
    genome.weights = genome.weights[mask]
    genome.synapse_types = genome.synapse_types[mask]

    # Note: we don't actually remove the neuron from neuron_ids to keep indices stable
    # The neuron just becomes disconnected (orphan)
    return True


def mutate(genome: Genome, config: MutationConfig, rng: np.random.Generator) -> Genome:
    """Apply all mutation operators to a genome clone."""
    child = genome.clone()
    child.generation = genome.generation + 1

    # Weight mutations (almost always)
    mutate_weights(child, config, rng)

    # Topology mutations (rare)
    if rng.random() < config.add_synapse_rate:
        add_synapse(child, config, rng)

    if rng.random() < config.remove_synapse_rate:
        remove_synapse(child, config, rng)

    if rng.random() < config.add_neuron_rate:
        add_neuron(child, config, rng)

    if rng.random() < config.remove_neuron_rate:
        remove_neuron(child, config, rng)

    return child
