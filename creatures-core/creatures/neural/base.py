"""Abstract base class for neural simulation engines."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from creatures.connectome.types import Connectome


@dataclass
class NeuralConfig:
    """Configuration for a spiking neural network simulation."""

    # LIF neuron parameters
    tau_m: float = 10.0  # membrane time constant (ms)
    v_rest: float = -65.0  # resting potential (mV)
    v_reset: float = -65.0  # reset potential after spike (mV)
    v_thresh: float = -50.0  # spike threshold (mV)
    tau_ref: float = 2.0  # refractory period (ms)

    # Synapse parameters
    tau_syn: float = 5.0  # synaptic current decay (ms)
    weight_scale: float = 0.275  # mV per unit synapse weight (from Eon/Shiu)

    # Simulation parameters
    dt: float = 0.1  # timestep (ms)

    # Firing rate estimation
    tau_rate: float = 50.0  # time constant for firing rate EMA (ms)


@dataclass
class SimulationState:
    """Snapshot of neural simulation state at a point in time."""

    t_ms: float  # current simulation time
    spikes: list[int]  # indices of neurons that spiked this step
    voltages: list[float]  # membrane potentials for all neurons
    firing_rates: list[float]  # exponential moving average rates (Hz)


class NeuralEngine(ABC):
    """Abstract interface for neural simulation backends."""

    @abstractmethod
    def build(self, connectome: Connectome, config: NeuralConfig) -> None:
        """Build the neural network from connectome data."""
        ...

    @abstractmethod
    def set_input_currents(self, neuron_currents: dict[str, float]) -> None:
        """Set external input currents (nA) for specified neurons."""
        ...

    @abstractmethod
    def step(self, duration_ms: float) -> SimulationState:
        """Advance simulation by duration_ms and return the state."""
        ...

    @abstractmethod
    def get_spike_history(self) -> tuple[list[int], list[float]]:
        """Return (neuron_indices, spike_times_ms) for all recorded spikes."""
        ...

    @abstractmethod
    def get_voltage_history(self, neuron_ids: list[str]) -> dict[str, tuple[list[float], list[float]]]:
        """Return {neuron_id: (times_ms, voltages_mV)} for specified neurons."""
        ...

    @abstractmethod
    def get_firing_rates(self) -> dict[str, float]:
        """Return current firing rate (Hz) for all neurons."""
        ...

    @abstractmethod
    def lesion(self, pre_id: str, post_id: str) -> None:
        """Remove a synapse between two neurons."""
        ...

    @abstractmethod
    def reset(self) -> None:
        """Reset the simulation to initial conditions."""
        ...
