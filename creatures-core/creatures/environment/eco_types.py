"""Data types for the ecosystem model.

Separated from ecosystem.py to avoid circular imports with interactions.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class OrganismInstance:
    """A single organism in the ecosystem."""

    id: str
    species: str  # "c_elegans", "drosophila"
    position: tuple[float, float]  # (x, y) in arena
    heading: float  # radians
    energy: float = 100.0
    age_ms: float = 0.0
    fitness: float = 0.0
    genome_id: str | None = None
    alive: bool = True


@dataclass
class FoodSource:
    """A food source in the ecosystem."""

    id: str
    position: tuple[float, float]
    energy: float = 50.0
    regrowth_rate: float = 0.1  # energy per ms
    max_energy: float = 50.0


@dataclass
class EcosystemConfig:
    """Configuration for the ecosystem."""

    arena_radius: float = 2.0
    n_food_sources: int = 10
    food_detection_radius: float = 0.3
    organism_interaction_radius: float = 0.15
    energy_decay_rate: float = 0.01  # energy lost per ms
    reproduction_threshold: float = 150.0  # energy needed to reproduce
    predation_enabled: bool = True  # larger organisms can eat smaller ones
    species_sizes: dict[str, float] = field(
        default_factory=lambda: {
            "c_elegans": 0.05,  # 1mm worm
            "drosophila": 0.15,  # 3mm fly
            "zebrafish": 0.5,  # 10mm fish (future)
        }
    )
    # Movement parameters
    move_speed: dict[str, float] = field(
        default_factory=lambda: {
            "c_elegans": 0.002,  # slow crawl
            "drosophila": 0.005,  # faster flight
            "zebrafish": 0.008,  # swimming
        }
    )
    random_turn_std: float = 0.3  # radians, std of random heading perturbation
