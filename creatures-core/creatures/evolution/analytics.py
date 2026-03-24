"""Analytics for evolutionary trajectories.

Extracts scientific insights from evolution runs:
- Which biological connections are preserved vs modified
- How connectome structure drifts from template over generations
- Behavior classification of evolved organisms
- Identification of evolutionarily robust features
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from creatures.connectome.types import Connectome
from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


@dataclass
class ConnectomeDrift:
    """Measures how an evolved genome differs from the biological template."""

    preserved_fraction: float  # fraction of original synapses kept
    modified_weight_fraction: float  # fraction with weight change > threshold
    novel_synapses: int  # new connections not in template
    deleted_synapses: int  # template connections removed
    novel_neurons: int  # added interneurons
    total_weight_change: float  # L2 distance of weight vectors


def analyze_drift(template: Genome, evolved: Genome) -> ConnectomeDrift:
    """Compare an evolved genome to its biological template."""
    # Build edge sets
    template_edges = set(zip(template.pre_indices.tolist(), template.post_indices.tolist()))
    evolved_edges = set(zip(evolved.pre_indices.tolist(), evolved.post_indices.tolist()))

    preserved = template_edges & evolved_edges
    novel = evolved_edges - template_edges
    deleted = template_edges - evolved_edges

    # Weight change on preserved connections
    weight_threshold = 0.5
    n_modified = 0
    weight_diffs = []

    for pre, post in preserved:
        t_idx = np.where((template.pre_indices == pre) & (template.post_indices == post))[0]
        e_idx = np.where((evolved.pre_indices == pre) & (evolved.post_indices == post))[0]
        if len(t_idx) > 0 and len(e_idx) > 0:
            diff = abs(template.weights[t_idx[0]] - evolved.weights[e_idx[0]])
            weight_diffs.append(diff)
            if diff > weight_threshold:
                n_modified += 1

    # Novel neurons (EVO_ prefix)
    novel_neurons = sum(1 for nid in evolved.neuron_ids if nid.startswith("EVO_"))

    n_template = len(template_edges)
    return ConnectomeDrift(
        preserved_fraction=len(preserved) / max(n_template, 1),
        modified_weight_fraction=n_modified / max(len(preserved), 1),
        novel_synapses=len(novel),
        deleted_synapses=len(deleted),
        novel_neurons=novel_neurons,
        total_weight_change=float(np.sqrt(sum(d**2 for d in weight_diffs))) if weight_diffs else 0.0,
    )


def identify_robust_connections(
    template: Genome,
    evolved_genomes: list[Genome],
    preservation_threshold: float = 0.8,
) -> list[tuple[str, str, float]]:
    """Find connections that are preserved across most evolved genomes.

    These represent evolutionarily robust features of the biological
    connectome — connections that natural selection consistently maintains.

    Returns list of (pre_id, post_id, preservation_rate) sorted by rate.
    """
    template_edges = list(zip(template.pre_indices.tolist(), template.post_indices.tolist()))
    n_genomes = len(evolved_genomes)

    if n_genomes == 0:
        return []

    # Count how many evolved genomes preserve each template edge
    preservation_counts: dict[tuple[int, int], int] = {}
    for pre, post in template_edges:
        preservation_counts[(pre, post)] = 0

    for genome in evolved_genomes:
        evolved_edges = set(zip(genome.pre_indices.tolist(), genome.post_indices.tolist()))
        for edge in template_edges:
            if edge in evolved_edges:
                preservation_counts[edge] = preservation_counts.get(edge, 0) + 1

    # Convert to named connections with rates
    robust = []
    for (pre, post), count in preservation_counts.items():
        rate = count / n_genomes
        if rate >= preservation_threshold:
            pre_id = template.neuron_ids[pre]
            post_id = template.neuron_ids[post]
            robust.append((pre_id, post_id, rate))

    return sorted(robust, key=lambda x: -x[2])


def classify_behavior(
    trajectory: list[tuple[float, float, float]],
    firing_rates_history: list[list[float]] | None = None,
) -> dict[str, float]:
    """Classify the behavior strategy of an organism from its trajectory.

    Returns a dict of behavior feature scores (0-1 each).
    """
    if len(trajectory) < 10:
        return {"idle": 1.0}

    positions = np.array(trajectory)
    deltas = np.diff(positions, axis=0)
    distances = np.linalg.norm(deltas, axis=1)

    total_distance = float(np.sum(distances))
    net_displacement = float(np.linalg.norm(positions[-1] - positions[0]))
    max_distance = float(np.max(np.linalg.norm(positions - positions[0], axis=1)))

    # Linearity: net displacement / total distance (1 = straight line)
    linearity = net_displacement / max(total_distance, 1e-6)

    # Speed: average distance per step
    speed = total_distance / len(distances)

    # Heading persistence: autocorrelation of movement direction
    if len(deltas) > 1:
        headings = deltas / (np.linalg.norm(deltas, axis=1, keepdims=True) + 1e-8)
        persistence = float(np.mean([np.dot(headings[i], headings[i + 1]) for i in range(len(headings) - 1)]))
    else:
        persistence = 0.0

    # Exploration: convex hull area relative to max distance
    exploration = max_distance / max(total_distance, 1e-6)

    # Activity level from firing rates
    activity = 0.5
    if firing_rates_history and len(firing_rates_history) > 0:
        mean_rates = [np.mean(rates) for rates in firing_rates_history if rates]
        activity = float(np.mean(mean_rates) / 100.0) if mean_rates else 0.5

    return {
        "linearity": float(np.clip(linearity, 0, 1)),
        "speed": float(np.clip(speed * 100, 0, 1)),
        "persistence": float(np.clip((persistence + 1) / 2, 0, 1)),
        "exploration": float(np.clip(exploration, 0, 1)),
        "activity": float(np.clip(activity, 0, 1)),
    }


def summarize_evolution(
    template: Genome,
    best_genomes_per_gen: list[Genome],
) -> dict:
    """Generate a summary of an evolutionary run for scientific reporting."""
    if not best_genomes_per_gen:
        return {"error": "No genomes to analyze"}

    fitnesses = [g.fitness for g in best_genomes_per_gen]
    final = best_genomes_per_gen[-1]
    drift = analyze_drift(template, final)

    return {
        "n_generations": len(best_genomes_per_gen),
        "initial_fitness": fitnesses[0],
        "final_fitness": fitnesses[-1],
        "fitness_improvement": fitnesses[-1] - fitnesses[0],
        "fitness_improvement_pct": (fitnesses[-1] - fitnesses[0]) / max(abs(fitnesses[0]), 1e-6) * 100,
        "connections_preserved": drift.preserved_fraction,
        "connections_modified": drift.modified_weight_fraction,
        "novel_connections": drift.novel_synapses,
        "deleted_connections": drift.deleted_synapses,
        "novel_neurons": drift.novel_neurons,
        "weight_drift": drift.total_weight_change,
        "template_neurons": template.n_neurons,
        "evolved_neurons": final.n_neurons,
        "template_synapses": template.n_synapses,
        "evolved_synapses": final.n_synapses,
    }
