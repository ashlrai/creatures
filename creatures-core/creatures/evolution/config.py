"""Configuration for the full evolutionary system."""

from __future__ import annotations

from dataclasses import dataclass, field

from creatures.evolution.mutation import MutationConfig


@dataclass
class EvolutionConfig:
    """Master configuration for an evolutionary run."""

    # Population
    population_size: int = 50
    elitism: int = 3
    tournament_size: int = 5
    crossover_rate: float = 0.3

    # Mutation
    mutation: MutationConfig = field(default_factory=MutationConfig)

    # Fitness evaluation
    lifetime_ms: float = 5000.0  # 5 seconds sim time per organism
    fitness_w_distance: float = 1.0
    fitness_w_activity: float = 0.3
    fitness_w_efficiency: float = 0.5

    # Evolution
    n_generations: int = 100
    n_workers: int = 4  # parallel evaluation processes

    # Organism
    organism: str = "c_elegans"
    connectome_source: str = "edge_list"
    neural_weight_scale: float = 3.0

    # Checkpoints
    checkpoint_interval: int = 10
    checkpoint_dir: str = "evolution_checkpoints"

    # Reproducibility
    seed: int = 42
