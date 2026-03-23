"""Abstract base class for physics body models."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class BodyState:
    """Snapshot of body simulation state."""

    positions: list[tuple[float, float, float]]  # segment center positions
    orientations: list[tuple[float, float, float, float]]  # quaternions
    joint_angles: list[float]  # all joint angles
    contacts: list[float]  # contact force per sensor
    center_of_mass: tuple[float, float, float] = (0.0, 0.0, 0.0)


@dataclass
class BodyConfig:
    """Configuration for a body simulation."""

    dt: float = 1.0  # physics timestep (ms)
    # Motor mapping
    motor_gain: float = 1.0  # firing rate → torque scaling
    sensor_gain: float = 1.0  # contact force → current scaling


class BodyModel(ABC):
    """Abstract interface for physics body models."""

    @abstractmethod
    def reset(self) -> BodyState:
        """Reset body to initial position and return state."""
        ...

    @abstractmethod
    def get_sensory_input(self) -> dict[str, float]:
        """Return sensor_name → current_value mapping for neural input."""
        ...

    @abstractmethod
    def step(self, muscle_activations: dict[str, float]) -> BodyState:
        """Step physics with given muscle activations. Return new state."""
        ...

    @abstractmethod
    def apply_external_force(
        self, segment: str, force: tuple[float, float, float]
    ) -> None:
        """Apply external force to a body segment (for 'poking')."""
        ...

    @abstractmethod
    def get_state(self) -> BodyState:
        """Return current body state."""
        ...

    @property
    @abstractmethod
    def sensor_neuron_map(self) -> dict[str, str]:
        """Map from sensor name → neuron ID for neural input."""
        ...

    @property
    @abstractmethod
    def motor_neuron_map(self) -> dict[str, list[str]]:
        """Map from neuron ID → list of muscle/actuator names."""
        ...
