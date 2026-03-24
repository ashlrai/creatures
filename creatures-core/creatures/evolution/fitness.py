"""Fitness evaluation: run a genome through Brian2 + MuJoCo simulation.

Measures how well a genome-encoded neural network drives the worm body.
Fitness = weighted combination of distance traveled, neural activity,
and efficiency.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


@dataclass
class FitnessConfig:
    """Weights and parameters for fitness evaluation."""

    lifetime_ms: float = 10000.0  # 10 seconds sim time
    w_distance: float = 1.0  # reward for distance traveled
    w_food: float = 2.0  # placeholder for future food reward
    w_efficiency: float = 0.5  # reward for neural efficiency (penalize silence)

    # Poke stimulus to get things moving
    poke_at_ms: float = 100.0
    poke_segment: str = "seg_8"
    poke_force: tuple[float, float, float] = (0, 0.1, 0)


@dataclass
class FitnessResult:
    """Detailed breakdown of a fitness evaluation."""

    total: float
    distance: float
    energy: float  # neural activity score
    n_spikes: int


def evaluate_genome(genome: Genome, config: FitnessConfig | None = None) -> float:
    """Evaluate a genome's fitness by running it through the full simulation.

    Builds a Brian2 spiking network from the genome's connectome,
    couples it to a MuJoCo worm body, runs for ``config.lifetime_ms``,
    and scores based on distance traveled and neural activity.

    Args:
        genome: The genome to evaluate.
        config: Fitness evaluation parameters.

    Returns:
        Scalar fitness value (higher is better).
    """
    from creatures.body.worm_body import WormBody
    from creatures.experiment.runner import CouplingConfig, SimulationRunner
    from creatures.neural.brian2_engine import Brian2Engine

    config = config or FitnessConfig()

    # Convert genome to connectome
    connectome = genome.to_connectome()

    # Build neural engine
    engine = Brian2Engine()
    engine.build(connectome)

    # Build body
    body = WormBody()

    # Build runner with default coupling
    runner = SimulationRunner(engine, body, CouplingConfig())

    # Run simulation with a poke stimulus to provoke movement
    frames = runner.run(
        duration_ms=config.lifetime_ms,
        poke_at_ms=config.poke_at_ms,
        poke_segment=config.poke_segment,
        poke_force=config.poke_force,
    )

    if not frames:
        genome.fitness = 0.0
        return 0.0

    # Measure distance traveled (from first to last center of mass)
    start_com = np.array(frames[0].body_state.center_of_mass)
    end_com = np.array(frames[-1].body_state.center_of_mass)
    distance = float(np.linalg.norm(end_com[:2] - start_com[:2]))

    # Count total spikes across all frames
    total_spikes = sum(len(f.active_neurons) for f in frames)

    # Neural activity score: reward active networks, penalize silent ones.
    # A completely silent network gets 0; moderate activity is best.
    n_steps = len(frames)
    spikes_per_step = total_spikes / max(n_steps, 1)
    n_neurons = genome.n_neurons
    # Ideal: ~5-20% of neurons active per step
    ideal_rate = n_neurons * 0.1
    if spikes_per_step < 0.1:
        # Nearly silent: heavy penalty
        activity_score = 0.0
    else:
        # Gaussian-shaped reward centered on ideal rate
        activity_score = float(np.exp(-0.5 * ((spikes_per_step - ideal_rate) / max(ideal_rate, 1)) ** 2))

    # Compute total fitness
    fitness = (
        config.w_distance * distance * 1000  # scale distance (meters) up
        + config.w_efficiency * activity_score
    )

    # Ensure non-negative
    fitness = max(fitness, 0.0)

    genome.fitness = fitness
    logger.debug(
        f"Genome {genome.id}: distance={distance:.4f}m, "
        f"spikes={total_spikes}, activity_score={activity_score:.3f}, "
        f"fitness={fitness:.3f}"
    )

    return fitness


def evaluate_genome_fast(genome: Genome, config: FitnessConfig | None = None) -> float:
    """Fast fitness proxy that avoids Brian2/MuJoCo for rapid evolution testing.

    Scores based on connectome topology:
    - Reward for connected motor neurons (can drive movement)
    - Reward for sensory→motor paths (can respond to stimuli)
    - Penalize disconnected or overly sparse networks
    - Reward weight diversity (avoids degenerate all-same-weight solutions)

    This is useful for testing evolution mechanics without slow simulation.
    """
    from creatures.connectome.types import NeuronType

    config = config or FitnessConfig()

    n_neurons = genome.n_neurons
    n_synapses = genome.n_synapses

    if n_neurons == 0 or n_synapses == 0:
        genome.fitness = 0.0
        return 0.0

    # 1. Connectivity score: reward density up to a point
    density = n_synapses / (n_neurons * n_neurons)
    connectivity_score = min(density * 10, 1.0)  # cap at 1.0

    # 2. Motor neuron connectivity: count motor neurons with inputs
    motor_ids = {
        nid for nid, nt in genome.neuron_types.items()
        if nt == NeuronType.MOTOR
    }
    motor_indices = {
        i for i, nid in enumerate(genome.neuron_ids) if nid in motor_ids
    }
    # Count motor neurons that receive at least one synapse
    post_set = set(genome.post_indices.tolist())
    connected_motors = len(motor_indices & post_set)
    motor_score = connected_motors / max(len(motor_indices), 1)

    # 3. Weight diversity: std of absolute weights
    if n_synapses > 1:
        weight_std = float(np.std(np.abs(genome.weights)))
        diversity_score = min(weight_std, 2.0) / 2.0
    else:
        diversity_score = 0.0

    # 4. Sensory neuron connectivity: sensory neurons with outputs
    sensory_ids = {
        nid for nid, nt in genome.neuron_types.items()
        if nt == NeuronType.SENSORY
    }
    sensory_indices = {
        i for i, nid in enumerate(genome.neuron_ids) if nid in sensory_ids
    }
    pre_set = set(genome.pre_indices.tolist())
    connected_sensory = len(sensory_indices & pre_set)
    sensory_score = connected_sensory / max(len(sensory_indices), 1)

    # 5. Path existence bonus: check if any sensory can reach motor
    # (Simple 2-hop check via adjacency)
    edges = set(zip(genome.pre_indices.tolist(), genome.post_indices.tolist()))
    # Find intermediates reachable from sensory neurons
    reachable_from_sensory = set()
    for pre, post in edges:
        if pre in sensory_indices:
            reachable_from_sensory.add(post)
    # Check if any of those can reach motor neurons
    path_exists = False
    for pre, post in edges:
        if pre in reachable_from_sensory and post in motor_indices:
            path_exists = True
            break
    # Direct sensory→motor also counts
    for pre, post in edges:
        if pre in sensory_indices and post in motor_indices:
            path_exists = True
            break
    path_score = 1.0 if path_exists else 0.0

    # Weighted combination
    fitness = (
        connectivity_score * 0.15
        + motor_score * 0.30
        + diversity_score * 0.10
        + sensory_score * 0.15
        + path_score * 0.30
    )

    # Scale to make numbers more readable
    fitness *= 100.0

    genome.fitness = fitness
    return fitness
