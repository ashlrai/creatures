"""MuJoCo arena environment with food sources and obstacles.

Works as a LOGICAL overlay on top of the existing WormBody MJCF.
Food sources and obstacles are tracked as Python objects (not MuJoCo bodies),
with proximity/gradient computations based on organism center of mass.

This feeds sensory data into the neural engine to drive chemotaxis behavior.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ArenaConfig:
    """Configuration for the arena environment."""

    size: tuple[float, float] = (2.0, 2.0)  # arena half-extents (meters)
    n_food: int = 5
    food_radius: float = 0.1  # detection/consumption radius
    food_gradient_range: float = 0.5  # max range for gradient sensing
    n_obstacles: int = 3
    obstacle_radius: float = 0.15  # collision radius
    seed: int = 42


@dataclass
class ArenaState:
    """State returned each step."""

    food_consumed: int = 0  # food consumed this step
    total_food_consumed: int = 0  # cumulative food consumed
    nearest_food_distance: float = float("inf")
    food_gradient: tuple[float, float] = (0.0, 0.0)  # (left_signal, right_signal)
    collisions: int = 0  # collisions this step
    total_collisions: int = 0  # cumulative collisions


class Arena:
    """Logical arena overlay for food and obstacle tracking.

    Tracks food/obstacle positions as Python objects and computes
    proximity, gradients, consumption, and collisions based on the
    organism's center of mass.
    """

    def __init__(self, config: ArenaConfig | None = None) -> None:
        self._config = config or ArenaConfig()
        self._rng = np.random.default_rng(self._config.seed)

        # Food positions: list of (x, y); None means consumed
        self._food_positions: list[tuple[float, float] | None] = []
        # Obstacle positions: list of (x, y)
        self._obstacle_positions: list[tuple[float, float]] = []

        # Cumulative counters
        self._total_food_consumed: int = 0
        self._total_collisions: int = 0

        # Organism heading (radians, 0 = +X direction)
        # Used to determine left/right for gradient splitting.
        self._heading: float = 0.0
        self._prev_pos: tuple[float, float] | None = None

        self.reset()

    def reset(self, rng: np.random.Generator | None = None) -> None:
        """Randomize food and obstacle positions within the arena."""
        if rng is not None:
            self._rng = rng

        cfg = self._config
        half_x, half_y = cfg.size

        # Place food at random positions within arena bounds (with margin)
        margin = 0.1
        self._food_positions = []
        for _ in range(cfg.n_food):
            x = float(self._rng.uniform(-half_x + margin, half_x - margin))
            y = float(self._rng.uniform(-half_y + margin, half_y - margin))
            self._food_positions.append((x, y))

        # Place obstacles (avoid center region where worm starts)
        self._obstacle_positions = []
        for _ in range(cfg.n_obstacles):
            while True:
                x = float(self._rng.uniform(-half_x + margin, half_x - margin))
                y = float(self._rng.uniform(-half_y + margin, half_y - margin))
                # Keep obstacles away from origin (worm start position)
                if math.sqrt(x * x + y * y) > 0.3:
                    break
            self._obstacle_positions.append((x, y))

        self._total_food_consumed = 0
        self._total_collisions = 0
        self._heading = 0.0
        self._prev_pos = None

        logger.info(
            f"Arena reset: {len(self._food_positions)} food, "
            f"{len(self._obstacle_positions)} obstacles"
        )

    def step(self, center_of_mass: tuple[float, float, float]) -> ArenaState:
        """Update arena state based on organism position.

        Args:
            center_of_mass: (x, y, z) position of organism.

        Returns:
            ArenaState with current step results.
        """
        pos_2d = (center_of_mass[0], center_of_mass[1])

        # Update heading from movement direction
        self._update_heading(pos_2d)

        # Compute food gradient
        gradient = self.get_food_gradient(pos_2d)

        # Check food consumption
        food_consumed = self.check_food_consumption(pos_2d)

        # Check obstacle collisions
        collisions = self.check_collisions(pos_2d)

        # Nearest food distance
        nearest_dist = self._nearest_food_distance(pos_2d)

        return ArenaState(
            food_consumed=food_consumed,
            total_food_consumed=self._total_food_consumed,
            nearest_food_distance=nearest_dist,
            food_gradient=gradient,
            collisions=collisions,
            total_collisions=self._total_collisions,
        )

    def get_food_gradient(self, pos: tuple[float, float]) -> tuple[float, float]:
        """Compute left/right food gradient signals.

        For each active food source within gradient range, compute a signal
        weighted by 1/distance^2, then split into left/right components
        based on the angle relative to the organism's heading.

        Returns:
            (left_signal, right_signal) -- non-negative floats.
        """
        cfg = self._config
        left_signal = 0.0
        right_signal = 0.0

        for food_pos in self._food_positions:
            if food_pos is None:
                continue

            dx = food_pos[0] - pos[0]
            dy = food_pos[1] - pos[1]
            dist = math.sqrt(dx * dx + dy * dy)

            if dist < 1e-8 or dist > cfg.food_gradient_range:
                continue

            # Signal strength: inverse square falloff
            strength = 1.0 / (dist * dist)

            # Angle from organism to food (world frame)
            food_angle = math.atan2(dy, dx)

            # Relative angle: food direction minus heading
            rel_angle = food_angle - self._heading
            # Normalize to [-pi, pi]
            rel_angle = math.atan2(math.sin(rel_angle), math.cos(rel_angle))

            # Split into left/right:
            # Positive rel_angle = food is to the LEFT
            # Negative rel_angle = food is to the RIGHT
            # Use cosine weighting so directly ahead contributes to both sides
            forward_component = max(0.0, math.cos(rel_angle)) * strength

            if rel_angle > 0:
                # Food is to the left
                left_signal += strength
                right_signal += forward_component * 0.3  # weak cross-signal
            elif rel_angle < 0:
                # Food is to the right
                right_signal += strength
                left_signal += forward_component * 0.3
            else:
                # Directly ahead: equal to both
                left_signal += strength * 0.5
                right_signal += strength * 0.5

        return (left_signal, right_signal)

    def check_food_consumption(self, pos: tuple[float, float]) -> int:
        """Check and consume food items within food_radius.

        Returns:
            Number of food items consumed this call.
        """
        consumed = 0
        cfg = self._config

        for i, food_pos in enumerate(self._food_positions):
            if food_pos is None:
                continue

            dx = food_pos[0] - pos[0]
            dy = food_pos[1] - pos[1]
            dist = math.sqrt(dx * dx + dy * dy)

            if dist <= cfg.food_radius:
                self._food_positions[i] = None
                consumed += 1
                logger.debug(
                    f"Food consumed at ({food_pos[0]:.2f}, {food_pos[1]:.2f})"
                )

        self._total_food_consumed += consumed
        return consumed

    def check_collisions(self, pos: tuple[float, float]) -> int:
        """Check collisions with obstacles.

        Returns:
            Number of obstacles currently in collision.
        """
        collisions = 0
        cfg = self._config

        for obs_pos in self._obstacle_positions:
            dx = obs_pos[0] - pos[0]
            dy = obs_pos[1] - pos[1]
            dist = math.sqrt(dx * dx + dy * dy)

            if dist <= cfg.obstacle_radius:
                collisions += 1

        self._total_collisions += collisions
        return collisions

    def _nearest_food_distance(self, pos: tuple[float, float]) -> float:
        """Return distance to nearest active food source."""
        min_dist = float("inf")

        for food_pos in self._food_positions:
            if food_pos is None:
                continue

            dx = food_pos[0] - pos[0]
            dy = food_pos[1] - pos[1]
            dist = math.sqrt(dx * dx + dy * dy)
            min_dist = min(min_dist, dist)

        return min_dist

    def _update_heading(self, pos: tuple[float, float]) -> None:
        """Update organism heading from movement direction."""
        if self._prev_pos is not None:
            dx = pos[0] - self._prev_pos[0]
            dy = pos[1] - self._prev_pos[1]
            if dx * dx + dy * dy > 1e-10:
                self._heading = math.atan2(dy, dx)
        self._prev_pos = pos

    @property
    def food_positions(self) -> list[tuple[float, float] | None]:
        """Active food positions (None = consumed)."""
        return list(self._food_positions)

    @property
    def obstacle_positions(self) -> list[tuple[float, float]]:
        """Obstacle positions."""
        return list(self._obstacle_positions)

    @property
    def active_food_count(self) -> int:
        """Number of unconsumed food sources."""
        return sum(1 for f in self._food_positions if f is not None)

    @property
    def heading(self) -> float:
        """Current organism heading in radians."""
        return self._heading

    @heading.setter
    def heading(self, value: float) -> None:
        """Set organism heading (useful for initialization)."""
        self._heading = value
