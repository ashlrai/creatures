"""Graph analysis tools for biological neural circuits.

Provides structural analysis of connectome data: shortest paths, hub detection,
community detection, motif counting, and information flow analysis.

Uses only numpy and stdlib -- no networkx dependency.
"""

from __future__ import annotations

from collections import deque
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from creatures.connectome.types import Connectome, NeuronType


def _build_adjacency_lists(connectome: Connectome) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Build forward and reverse adjacency lists from synapses.

    Returns (outgoing, incoming) where each maps neuron_id -> list of neighbor ids.
    """
    outgoing: dict[str, list[str]] = {nid: [] for nid in connectome.neurons}
    incoming: dict[str, list[str]] = {nid: [] for nid in connectome.neurons}
    for s in connectome.synapses:
        if s.pre_id in connectome.neurons and s.post_id in connectome.neurons:
            outgoing[s.pre_id].append(s.post_id)
            incoming[s.post_id].append(s.pre_id)
    return outgoing, incoming


def shortest_path(connectome: Connectome, source_id: str, target_id: str) -> list[str] | None:
    """BFS shortest path between two neurons. Returns list of neuron IDs or None.

    The path includes both source and target. Returns None if no path exists
    or if either neuron ID is invalid.
    """
    if source_id not in connectome.neurons or target_id not in connectome.neurons:
        return None
    if source_id == target_id:
        return [source_id]

    outgoing, _ = _build_adjacency_lists(connectome)

    visited: set[str] = {source_id}
    queue: deque[tuple[str, list[str]]] = deque([(source_id, [source_id])])

    while queue:
        current, path = queue.popleft()
        for neighbor in outgoing[current]:
            if neighbor == target_id:
                return path + [neighbor]
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))

    return None


def hub_neurons(connectome: Connectome, top_n: int = 10) -> list[dict]:
    """Find the most connected neurons by total degree.

    Returns list of dicts sorted by total degree descending:
    [{id, in_degree, out_degree, total, type, nt}, ...]
    """
    _, incoming = _build_adjacency_lists(connectome)
    outgoing, _ = _build_adjacency_lists(connectome)

    # More efficient: compute degrees from adjacency lists
    # But we already built them, so use set-based unique counts
    in_deg: dict[str, int] = {}
    out_deg: dict[str, int] = {}

    for s in connectome.synapses:
        if s.pre_id in connectome.neurons and s.post_id in connectome.neurons:
            out_deg[s.pre_id] = out_deg.get(s.pre_id, 0) + 1
            in_deg[s.post_id] = in_deg.get(s.post_id, 0) + 1

    results = []
    for nid, neuron in connectome.neurons.items():
        ind = in_deg.get(nid, 0)
        outd = out_deg.get(nid, 0)
        results.append({
            "id": nid,
            "in_degree": ind,
            "out_degree": outd,
            "total": ind + outd,
            "type": neuron.neuron_type.value,
            "nt": neuron.neurotransmitter,
        })

    results.sort(key=lambda x: x["total"], reverse=True)
    return results[:top_n]


def community_detection(connectome: Connectome, n_communities: int = 5) -> dict[str, int]:
    """Simple spectral community detection using adjacency matrix eigenvectors.

    Uses the symmetric version of the adjacency matrix (A + A^T) to compute
    a real-valued Laplacian, then clusters neurons based on the signs/values
    of the Fiedler-like eigenvectors.

    Returns {neuron_id: community_id} where community_id is in [0, n_communities).
    """
    adj = np.abs(connectome.adjacency_matrix)  # Use absolute weights for structure
    # Symmetrize for spectral analysis
    sym = adj + adj.T

    # Compute degree matrix and graph Laplacian
    degrees = sym.sum(axis=1)
    D = np.diag(degrees)
    L = D - sym

    # Compute eigenvectors of Laplacian (smallest eigenvalues)
    # The first eigenvector is trivial (constant), so we use eigenvectors 1..n_communities
    try:
        eigenvalues, eigenvectors = np.linalg.eigh(L)
    except np.linalg.LinAlgError:
        # Fallback: assign all to community 0
        return {nid: 0 for nid in connectome.neuron_ids}

    # Use eigenvectors 1 through n_communities for clustering
    n_vecs = min(n_communities, eigenvectors.shape[1] - 1)
    if n_vecs < 1:
        return {nid: 0 for nid in connectome.neuron_ids}

    # Feature matrix from Fiedler-like eigenvectors
    features = eigenvectors[:, 1:1 + n_vecs]

    # Simple k-means clustering (no sklearn dependency)
    labels = _kmeans(features, n_communities, max_iter=50)

    return {nid: int(labels[i]) for i, nid in enumerate(connectome.neuron_ids)}


def _kmeans(X: np.ndarray, k: int, max_iter: int = 50) -> np.ndarray:
    """Minimal k-means implementation using numpy only."""
    n = X.shape[0]
    if n == 0:
        return np.array([], dtype=int)

    rng = np.random.RandomState(42)
    # Initialize centroids with k-means++ style
    indices = rng.choice(n, size=min(k, n), replace=False)
    centroids = X[indices].copy()

    labels = np.zeros(n, dtype=int)
    for _ in range(max_iter):
        # Assign each point to nearest centroid
        # Compute distances: (n, 1, d) - (1, k, d) -> (n, k)
        dists = np.linalg.norm(X[:, np.newaxis, :] - centroids[np.newaxis, :, :], axis=2)
        new_labels = dists.argmin(axis=1)

        if np.array_equal(new_labels, labels):
            break
        labels = new_labels

        # Update centroids
        for c in range(k):
            mask = labels == c
            if mask.any():
                centroids[c] = X[mask].mean(axis=0)

    return labels


def circuit_motifs(connectome: Connectome) -> dict[str, int]:
    """Count common 3-node circuit motifs.

    Motif types:
    - feed_forward: A->B, A->C, B->C (convergent feed-forward)
    - feedback: A->B, B->A (reciprocal pair, counted once per pair)
    - mutual: A->B, B->A, A->C, C->A (mutual with third party)
    - chain: A->B->C with no shortcut A->C (pure chain)

    Returns {motif_name: count}.
    """
    idx = connectome.neuron_id_to_index
    adj = connectome.adjacency_matrix
    n = adj.shape[0]

    # Binary adjacency for motif detection
    conn = (np.abs(adj) > 0).astype(np.int32)

    counts = {
        "feed_forward": 0,
        "feedback": 0,
        "mutual": 0,
        "chain": 0,
    }

    # Feedback (reciprocal connections) — count each pair once
    recip = conn * conn.T
    counts["feedback"] = int(recip.sum()) // 2

    # For 3-node motifs, sample if network is large to keep runtime bounded
    neuron_ids = connectome.neuron_ids
    if n > 500:
        # Sample top neurons by degree for tractable motif counting
        degrees = conn.sum(axis=0) + conn.sum(axis=1)
        top_indices = np.argsort(degrees)[-200:]
        search_set = set(top_indices.tolist())
    else:
        search_set = set(range(n))

    # Count feed-forward and chain motifs among search set
    for a in search_set:
        a_out = set(np.nonzero(conn[a])[0].tolist())
        for b in a_out:
            if b not in search_set:
                continue
            b_out = set(np.nonzero(conn[b])[0].tolist())
            for c in b_out:
                if c == a:
                    continue
                if c in a_out:
                    # A->B, B->C, A->C => feed-forward
                    counts["feed_forward"] += 1
                else:
                    # A->B->C without A->C => chain
                    counts["chain"] += 1

    # Mutual: A<->B with A also connected to C (bidirectional hub)
    for a in search_set:
        a_out = set(np.nonzero(conn[a])[0].tolist())
        a_in = set(np.nonzero(conn[:, a])[0].tolist())
        mutual_partners = a_out & a_in
        for b in mutual_partners:
            if b <= a:
                continue  # count each pair once
            # Count third-party connections from both a and b
            other_out = (a_out | set(np.nonzero(conn[b])[0].tolist())) - {a, b}
            counts["mutual"] += len(other_out)

    return counts


def neuron_profile(connectome: Connectome, neuron_id: str) -> dict:
    """Full profile of a single neuron.

    Returns dict with: id, type, nt, in_degree, out_degree,
    presynaptic_partners, postsynaptic_partners, hub_score.
    """
    if neuron_id not in connectome.neurons:
        raise ValueError(f"Neuron '{neuron_id}' not found in connectome")

    neuron = connectome.neurons[neuron_id]

    pre_partners: list[str] = []  # neurons that synapse onto this one
    post_partners: list[str] = []  # neurons this one synapses onto
    pre_weights: dict[str, float] = {}
    post_weights: dict[str, float] = {}

    for s in connectome.synapses:
        if s.post_id == neuron_id and s.pre_id in connectome.neurons:
            pre_partners.append(s.pre_id)
            pre_weights[s.pre_id] = pre_weights.get(s.pre_id, 0) + s.weight
        if s.pre_id == neuron_id and s.post_id in connectome.neurons:
            post_partners.append(s.post_id)
            post_weights[s.post_id] = post_weights.get(s.post_id, 0) + s.weight

    in_degree = len(set(pre_partners))
    out_degree = len(set(post_partners))

    # Hub score: normalized total degree
    max_possible = 2 * (connectome.n_neurons - 1)
    hub_score = (in_degree + out_degree) / max_possible if max_possible > 0 else 0.0

    return {
        "id": neuron_id,
        "type": neuron.neuron_type.value,
        "nt": neuron.neurotransmitter,
        "in_degree": in_degree,
        "out_degree": out_degree,
        "presynaptic_partners": sorted(set(pre_partners)),
        "postsynaptic_partners": sorted(set(post_partners)),
        "hub_score": round(hub_score, 4),
    }


def layer_analysis(connectome: Connectome) -> dict:
    """Analyze sensory -> inter -> motor layering via BFS from sensory neurons.

    Assigns each neuron a depth based on shortest path from any sensory neuron.
    Sensory neurons are at depth 0.

    Returns {
        layer_depths: {neuron_id: depth},
        layer_counts: {0: N, 1: N, ...},
    }
    """
    from creatures.connectome.types import NeuronType

    outgoing, _ = _build_adjacency_lists(connectome)

    # Start BFS from all sensory neurons
    sensory_ids = [
        nid for nid, n in connectome.neurons.items()
        if n.neuron_type == NeuronType.SENSORY
    ]

    depths: dict[str, int] = {}
    queue: deque[tuple[str, int]] = deque()

    for sid in sensory_ids:
        depths[sid] = 0
        queue.append((sid, 0))

    while queue:
        current, depth = queue.popleft()
        for neighbor in outgoing.get(current, []):
            if neighbor not in depths:
                depths[neighbor] = depth + 1
                queue.append((neighbor, depth + 1))

    # Neurons unreachable from sensory get depth -1
    for nid in connectome.neurons:
        if nid not in depths:
            depths[nid] = -1

    # Count neurons at each depth
    layer_counts: dict[int, int] = {}
    for d in depths.values():
        layer_counts[d] = layer_counts.get(d, 0) + 1

    return {
        "layer_depths": depths,
        "layer_counts": {str(k): v for k, v in sorted(layer_counts.items())},
    }


def information_bottleneck(connectome: Connectome) -> list[str]:
    """Find neurons that are critical information bottlenecks.

    A bottleneck neuron is one whose removal disconnects some sensory neurons
    from some motor neurons. Uses iterative removal to test each candidate.

    Returns list of neuron IDs that are bottlenecks, sorted by impact (most
    critical first).
    """
    from creatures.connectome.types import NeuronType

    outgoing, _ = _build_adjacency_lists(connectome)

    sensory_ids = {
        nid for nid, n in connectome.neurons.items()
        if n.neuron_type == NeuronType.SENSORY
    }
    motor_ids = {
        nid for nid, n in connectome.neurons.items()
        if n.neuron_type == NeuronType.MOTOR
    }

    if not sensory_ids or not motor_ids:
        return []

    def count_reachable_motors(exclude_id: str | None = None) -> int:
        """BFS from all sensory neurons, count how many motor neurons are reachable."""
        visited: set[str] = set()
        queue: deque[str] = deque()

        for sid in sensory_ids:
            if sid != exclude_id:
                visited.add(sid)
                queue.append(sid)

        while queue:
            current = queue.popleft()
            for neighbor in outgoing.get(current, []):
                if neighbor != exclude_id and neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        return len(visited & motor_ids)

    baseline = count_reachable_motors()
    if baseline == 0:
        return []

    # Test interneurons (most likely bottlenecks) and any neuron not sensory/motor
    candidates = [
        nid for nid, n in connectome.neurons.items()
        if n.neuron_type == NeuronType.INTER or n.neuron_type == NeuronType.UNKNOWN
    ]

    bottlenecks: list[tuple[str, int]] = []
    for nid in candidates:
        reachable = count_reachable_motors(exclude_id=nid)
        impact = baseline - reachable
        if impact > 0:
            bottlenecks.append((nid, impact))

    # Sort by impact descending
    bottlenecks.sort(key=lambda x: x[1], reverse=True)
    return [nid for nid, _ in bottlenecks]
