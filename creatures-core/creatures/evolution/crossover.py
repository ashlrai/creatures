"""NEAT-style crossover between two genomes.

Aligns synapses by (pre_index, post_index) tuple:
- Matching genes: weight from fitter parent (60%) or weaker (40%)
- Disjoint genes: inherit from fitter parent, 20% chance from weaker
- Child inherits all neurons from both parents
"""

from __future__ import annotations

import uuid

import numpy as np

from creatures.evolution.genome import Genome


def crossover(
    parent_a: Genome,
    parent_b: Genome,
    rng: np.random.Generator,
    max_neurons: int = 500,
    max_synapses: int = 10000,
) -> Genome:
    """Produce a child genome by NEAT-style crossover of two parents.

    The fitter parent is determined by the ``fitness`` attribute.
    If fitness is equal, the smaller genome (fewer synapses) is preferred
    to encourage compactness.

    Args:
        parent_a: First parent genome.
        parent_b: Second parent genome.
        rng: Numpy random generator for reproducibility.

    Returns:
        A new child Genome with generation = max(parents) + 1.
    """
    # Determine fitter parent
    if parent_a.fitness > parent_b.fitness:
        fitter, weaker = parent_a, parent_b
    elif parent_b.fitness > parent_a.fitness:
        fitter, weaker = parent_b, parent_a
    else:
        # Equal fitness: prefer smaller genome
        if parent_a.n_synapses <= parent_b.n_synapses:
            fitter, weaker = parent_a, parent_b
        else:
            fitter, weaker = parent_b, parent_a

    # Build edge maps: (pre_idx, post_idx) -> index in array
    fitter_edges: dict[tuple[int, int], int] = {}
    for i in range(fitter.n_synapses):
        key = (int(fitter.pre_indices[i]), int(fitter.post_indices[i]))
        fitter_edges[key] = i

    weaker_edges: dict[tuple[int, int], int] = {}
    for i in range(weaker.n_synapses):
        key = (int(weaker.pre_indices[i]), int(weaker.post_indices[i]))
        weaker_edges[key] = i

    all_keys = set(fitter_edges.keys()) | set(weaker_edges.keys())

    child_pre: list[int] = []
    child_post: list[int] = []
    child_weights: list[float] = []
    child_syn_types: list[int] = []

    for key in all_keys:
        in_fitter = key in fitter_edges
        in_weaker = key in weaker_edges

        if in_fitter and in_weaker:
            # Matching gene: 60% from fitter, 40% from weaker
            if rng.random() < 0.6:
                idx = fitter_edges[key]
                weight = float(fitter.weights[idx])
                syn_type = int(fitter.synapse_types[idx])
            else:
                idx = weaker_edges[key]
                weight = float(weaker.weights[idx])
                syn_type = int(weaker.synapse_types[idx])
            child_pre.append(key[0])
            child_post.append(key[1])
            child_weights.append(weight)
            child_syn_types.append(syn_type)

        elif in_fitter:
            # Disjoint/excess gene in fitter: always inherit
            idx = fitter_edges[key]
            child_pre.append(key[0])
            child_post.append(key[1])
            child_weights.append(float(fitter.weights[idx]))
            child_syn_types.append(int(fitter.synapse_types[idx]))

        else:
            # Disjoint/excess gene in weaker: 20% chance to inherit
            if rng.random() < 0.2:
                idx = weaker_edges[key]
                child_pre.append(key[0])
                child_post.append(key[1])
                child_weights.append(float(weaker.weights[idx]))
                child_syn_types.append(int(weaker.synapse_types[idx]))

    # Merge neurons from both parents (union)
    # Use fitter's neuron list as base, add any extras from weaker
    neuron_set = set(fitter.neuron_ids)
    child_neuron_ids = list(fitter.neuron_ids)
    child_neuron_types = dict(fitter.neuron_types)
    child_neuron_nts = dict(fitter.neuron_nts)

    for nid in weaker.neuron_ids:
        if nid not in neuron_set:
            child_neuron_ids.append(nid)
            neuron_set.add(nid)
            child_neuron_types[nid] = weaker.neuron_types.get(nid, fitter.neuron_types.get(nid))
            child_neuron_nts[nid] = weaker.neuron_nts.get(nid)

    # Filter out synapses with indices beyond the neuron count
    # (shouldn't happen if parents are well-formed, but safety check)
    n_neurons = len(child_neuron_ids)
    valid_pre, valid_post, valid_w, valid_st = [], [], [], []
    for i in range(len(child_pre)):
        if child_pre[i] < n_neurons and child_post[i] < n_neurons:
            valid_pre.append(child_pre[i])
            valid_post.append(child_post[i])
            valid_w.append(child_weights[i])
            valid_st.append(child_syn_types[i])

    # Enforce size constraints to prevent genome bloat across generations
    if len(valid_pre) > max_synapses:
        # Keep strongest synapses
        abs_w = np.abs(np.array(valid_w))
        keep_idx = np.argsort(-abs_w)[:max_synapses]
        valid_pre = [valid_pre[i] for i in keep_idx]
        valid_post = [valid_post[i] for i in keep_idx]
        valid_w = [valid_w[i] for i in keep_idx]
        valid_st = [valid_st[i] for i in keep_idx]

    if n_neurons > max_neurons:
        # Prioritize connected neurons, then fill remaining slots in order
        connected = {idx for pair in zip(valid_pre, valid_post) for idx in pair}
        # Build keep set: all connected neurons first, then fill up to max
        keep_indices = sorted(connected)
        if len(keep_indices) < max_neurons:
            for i in range(n_neurons):
                if i not in connected:
                    keep_indices.append(i)
                    if len(keep_indices) >= max_neurons:
                        break
        keep_indices = keep_indices[:max_neurons]
        # Build old→new index remapping
        old_to_new = {old_i: new_i for new_i, old_i in enumerate(keep_indices)}
        keep_set = set(keep_indices)
        # Remap neuron list
        child_neuron_ids = [child_neuron_ids[i] for i in keep_indices]
        child_neuron_types = {nid: child_neuron_types.get(nid) for nid in child_neuron_ids}
        child_neuron_nts = {nid: child_neuron_nts.get(nid) for nid in child_neuron_ids}
        # Remap synapse indices through the mapping
        remapped_pre, remapped_post, remapped_w, remapped_st = [], [], [], []
        for p, q, w, s in zip(valid_pre, valid_post, valid_w, valid_st):
            if p in keep_set and q in keep_set:
                remapped_pre.append(old_to_new[p])
                remapped_post.append(old_to_new[q])
                remapped_w.append(w)
                remapped_st.append(s)
        valid_pre, valid_post, valid_w, valid_st = remapped_pre, remapped_post, remapped_w, remapped_st

    return Genome(
        id=str(uuid.uuid4())[:8],
        parent_ids=(fitter.id, weaker.id),
        generation=max(fitter.generation, weaker.generation) + 1,
        neuron_ids=child_neuron_ids,
        neuron_types=child_neuron_types,
        neuron_nts=child_neuron_nts,
        pre_indices=np.array(valid_pre, dtype=np.int32),
        post_indices=np.array(valid_post, dtype=np.int32),
        weights=np.array(valid_w, dtype=np.float64),
        synapse_types=np.array(valid_st, dtype=np.int8),
        template_name=fitter.template_name,
        fitness=0.0,
    )
