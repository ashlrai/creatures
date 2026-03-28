"""Environment configurations for evolution challenges.

Mirrors the frontend challenge presets — each environment defines entities
(food, obstacles, toxic zones, etc.) and fitness weight overrides that
determine what evolutionary pressures organisms face.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class EnvironmentEntity:
    """A single entity in the arena."""
    type: str  # 'food', 'obstacle', 'toxic_zone', 'light_zone', 'chemical_gradient', 'pheromone_source'
    x: float  # normalized [-0.5, 0.5]
    y: float
    radius: float
    intensity: float
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class FitnessWeights:
    """Challenge-specific fitness weight overrides."""
    w_distance: float = 1.0
    w_food: float = 2.0
    w_efficiency: float = 0.5
    w_collision_penalty: float = 0.3
    w_toxin_penalty: float = 0.0
    w_survival: float = 0.2


@dataclass
class EnvironmentConfig:
    """Full environment specification for an evolution challenge."""
    preset_id: str = "open-field"
    entities: list[EnvironmentEntity] = field(default_factory=list)
    fitness_weights: FitnessWeights = field(default_factory=FitnessWeights)
    arena_radius: float = 1.0  # meters

    @classmethod
    def from_preset(cls, preset_id: str) -> EnvironmentConfig:
        """Load a named preset environment."""
        if preset_id in _PRESET_REGISTRY:
            return _PRESET_REGISTRY[preset_id]()
        return cls()  # default open field

    def get_food_positions(self) -> list[tuple[float, float]]:
        """Return (x, y) positions of food entities in arena meters."""
        return [
            (e.x * self.arena_radius * 2, e.y * self.arena_radius * 2)
            for e in self.entities if e.type == 'food'
        ]

    def get_toxic_positions(self) -> list[tuple[float, float, float]]:
        """Return (x, y, radius) of toxic zones in arena meters."""
        return [
            (e.x * self.arena_radius * 2, e.y * self.arena_radius * 2,
             e.radius * self.arena_radius * 2)
            for e in self.entities if e.type == 'toxic_zone'
        ]

    def compute_stimulus_for_position(
        self, x: float, y: float, n_sensory: int
    ) -> np.ndarray:
        """Compute sensory stimulus currents for an organism at position (x, y).

        Returns an array of shape (n_sensory,) with current values to inject
        into sensory neurons based on proximity to food, toxic zones, etc.
        """
        stim = np.zeros(n_sensory, dtype=np.float32)

        for entity in self.entities:
            ex = entity.x * self.arena_radius * 2
            ey = entity.y * self.arena_radius * 2
            dist = np.sqrt((x - ex) ** 2 + (y - ey) ** 2)
            entity_r = entity.radius * self.arena_radius * 2

            if entity.type == 'food':
                # Positive stimulus that decays with distance
                if dist < entity_r * 5:
                    strength = entity.intensity * 25.0 * np.exp(-dist / (entity_r * 3))
                    # Spread across first third of sensory neurons
                    n_affected = max(1, n_sensory // 3)
                    stim[:n_affected] += strength

            elif entity.type == 'toxic_zone':
                # Negative / aversive stimulus
                if dist < entity_r * 3:
                    strength = entity.intensity * 20.0 * np.exp(-dist / (entity_r * 2))
                    # Spread across middle third of sensory neurons
                    n_start = n_sensory // 3
                    n_end = min(n_sensory, 2 * n_sensory // 3)
                    stim[n_start:n_end] -= strength

            elif entity.type == 'chemical_gradient':
                # Graded stimulus based on distance
                gradient_range = entity_r
                if dist < gradient_range:
                    strength = entity.intensity * 15.0 * (1 - dist / gradient_range)
                    n_affected = max(1, n_sensory // 4)
                    stim[:n_affected] += strength

            elif entity.type == 'light_zone':
                # Light stimulus on a different set of sensory neurons
                if dist < entity_r:
                    strength = entity.intensity * 10.0
                    n_start = 2 * n_sensory // 3
                    stim[n_start:] += strength

        return stim


# ─── Preset registry ─────────────────────────────────────────────────────

def _open_field() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="open-field",
        entities=[
            EnvironmentEntity("food", 0.25, -0.15, 0.04, 0.8),
            EnvironmentEntity("food", -0.3, 0.2, 0.04, 0.8),
            EnvironmentEntity("food", 0.1, 0.35, 0.04, 0.8),
            EnvironmentEntity("food", -0.15, -0.3, 0.04, 0.8),
            EnvironmentEntity("food", 0.35, 0.15, 0.04, 0.8),
            EnvironmentEntity("obstacle", 0.0, 0.0, 0.08, 1.0),
            EnvironmentEntity("obstacle", -0.2, -0.1, 0.06, 1.0),
            EnvironmentEntity("obstacle", 0.15, 0.2, 0.07, 1.0),
        ],
        fitness_weights=FitnessWeights(w_distance=1.0, w_food=2.0, w_efficiency=0.5,
                                        w_collision_penalty=0.3, w_toxin_penalty=0, w_survival=0.2),
    )

def _gauntlet() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="gauntlet",
        entities=[
            EnvironmentEntity("obstacle", -0.25, -0.15, 0.07, 1.0),
            EnvironmentEntity("obstacle", -0.1, 0.12, 0.07, 1.0),
            EnvironmentEntity("obstacle", 0.05, -0.18, 0.07, 1.0),
            EnvironmentEntity("obstacle", 0.2, 0.1, 0.07, 1.0),
            EnvironmentEntity("obstacle", 0.32, -0.12, 0.06, 1.0),
            EnvironmentEntity("obstacle", -0.35, 0.08, 0.06, 1.0),
            EnvironmentEntity("obstacle", -0.15, -0.32, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.12, 0.28, 0.06, 1.0),
            EnvironmentEntity("food", 0.4, 0.0, 0.06, 1.0),
            EnvironmentEntity("chemical_gradient", 0.4, 0.0, 0.35, 0.6, {"chemical_type": "attractant"}),
        ],
        fitness_weights=FitnessWeights(w_distance=3.0, w_food=3.0, w_efficiency=0.3,
                                        w_collision_penalty=2.0, w_toxin_penalty=0, w_survival=0.5),
    )

def _toxic_minefield() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="toxic-minefield",
        entities=[
            EnvironmentEntity("toxic_zone", -0.2, -0.2, 0.1, 0.9),
            EnvironmentEntity("toxic_zone", 0.15, -0.1, 0.12, 1.0),
            EnvironmentEntity("toxic_zone", -0.05, 0.25, 0.08, 0.8),
            EnvironmentEntity("toxic_zone", 0.3, 0.2, 0.09, 0.85),
            EnvironmentEntity("toxic_zone", -0.35, 0.1, 0.07, 0.7),
            EnvironmentEntity("toxic_zone", 0.05, -0.35, 0.1, 0.9),
            EnvironmentEntity("food", -0.35, -0.35, 0.05, 1.0),
            EnvironmentEntity("food", 0.35, -0.3, 0.05, 1.0),
            EnvironmentEntity("food", 0.0, 0.0, 0.04, 0.8),
        ],
        fitness_weights=FitnessWeights(w_distance=0.5, w_food=2.0, w_efficiency=0.3,
                                        w_collision_penalty=0.5, w_toxin_penalty=5.0, w_survival=3.0),
    )

def _scattered_feast() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="scattered-feast",
        entities=[
            EnvironmentEntity("food", x, y, 0.03, 0.7)
            for x in [-0.35, -0.12, 0.12, 0.35]
            for y in [-0.35, 0.0, 0.35]
        ],
        fitness_weights=FitnessWeights(w_distance=0.5, w_food=4.0, w_efficiency=2.0,
                                        w_collision_penalty=0.1, w_toxin_penalty=0, w_survival=0.3),
    )

def _maze_runner() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="maze-runner",
        entities=[
            EnvironmentEntity("obstacle", -0.3, -0.3, 0.05, 1.0),
            EnvironmentEntity("obstacle", -0.15, -0.3, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.0, -0.3, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.3, -0.3, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.3, -0.15, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.3, 0.0, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.3, 0.3, 0.05, 1.0),
            EnvironmentEntity("obstacle", -0.1, -0.1, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.05, -0.1, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.05, 0.05, 0.05, 1.0),
            EnvironmentEntity("obstacle", 0.05, 0.2, 0.05, 1.0),
            EnvironmentEntity("obstacle", -0.15, 0.15, 0.05, 1.0),
            EnvironmentEntity("food", -0.35, 0.35, 0.06, 1.0),
            EnvironmentEntity("light_zone", -0.35, 0.35, 0.15, 0.4),
        ],
        fitness_weights=FitnessWeights(w_distance=3.0, w_food=4.0, w_efficiency=0.2,
                                        w_collision_penalty=1.5, w_toxin_penalty=0, w_survival=0.5),
    )

def _oasis() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="oasis",
        entities=[
            EnvironmentEntity("food", 0.38, 0.0, 0.08, 1.0),
            EnvironmentEntity("chemical_gradient", 0.38, 0.0, 0.45, 0.8, {"chemical_type": "attractant"}),
            EnvironmentEntity("obstacle", 0.0, -0.2, 0.08, 1.0),
            EnvironmentEntity("obstacle", 0.0, 0.05, 0.09, 1.0),
            EnvironmentEntity("obstacle", 0.0, 0.25, 0.07, 1.0),
            EnvironmentEntity("obstacle", -0.15, -0.05, 0.06, 1.0),
            EnvironmentEntity("food", -0.35, -0.25, 0.03, 0.3),
            EnvironmentEntity("food", -0.35, 0.25, 0.03, 0.3),
        ],
        fitness_weights=FitnessWeights(w_distance=2.0, w_food=4.0, w_efficiency=0.5,
                                        w_collision_penalty=1.0, w_toxin_penalty=0, w_survival=0.3),
    )

def _predator_arena() -> EnvironmentConfig:
    return EnvironmentConfig(
        preset_id="predator-arena",
        entities=[
            EnvironmentEntity("toxic_zone", -0.1, -0.1, 0.12, 1.0, {"predator": True}),
            EnvironmentEntity("toxic_zone", 0.1, 0.1, 0.12, 1.0, {"predator": True}),
            EnvironmentEntity("food", -0.4, 0.0, 0.05, 0.9),
            EnvironmentEntity("food", 0.4, 0.0, 0.05, 0.9),
            EnvironmentEntity("food", 0.0, -0.4, 0.05, 0.9),
            EnvironmentEntity("food", 0.0, 0.4, 0.05, 0.9),
            EnvironmentEntity("pheromone_source", 0.0, 0.0, 0.06, 0.5),
        ],
        fitness_weights=FitnessWeights(w_distance=0.5, w_food=2.0, w_efficiency=0.3,
                                        w_collision_penalty=0.5, w_toxin_penalty=4.0, w_survival=5.0),
    )


_PRESET_REGISTRY: dict[str, Any] = {
    "open-field": _open_field,
    "gauntlet": _gauntlet,
    "toxic-minefield": _toxic_minefield,
    "scattered-feast": _scattered_feast,
    "maze-runner": _maze_runner,
    "oasis": _oasis,
    "predator-arena": _predator_arena,
}

PRESET_LIST = [
    {"id": k, "name": k.replace("-", " ").title()}
    for k in _PRESET_REGISTRY
]
