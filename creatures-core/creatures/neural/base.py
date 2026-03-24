"""Abstract base class for neural simulation engines."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np

from creatures.connectome.types import Connectome


@dataclass
class MonitorConfig:
    """Controls what data is recorded during simulation.

    For large networks (10K+ neurons), disable voltage recording
    to avoid memory exhaustion.
    """

    record_spikes: bool = True
    record_voltages: bool = False  # OFF by default for large networks
    voltage_neuron_ids: list[str] | None = None  # None = none; list = selective
    record_firing_rates: bool = True


@dataclass
class PlasticityConfig:
    """Configuration for spike-timing-dependent plasticity (STDP).

    STDP is the biological mechanism for learning: synapses strengthen when
    the presynaptic neuron fires just BEFORE the postsynaptic neuron (Hebbian
    potentiation), and weaken when the order is reversed (anti-Hebbian
    depression). This lets organisms learn from experience within a lifetime.
    """

    enabled: bool = False
    tau_pre: float = 20.0    # ms - pre-before-post trace decay window
    tau_post: float = 20.0   # ms - post-before-pre trace decay window
    a_plus: float = 0.01     # potentiation amplitude (pre-before-post)
    a_minus: float = 0.012   # depression amplitude (slightly larger for stability)
    w_max: float = 10.0      # maximum weight (mV)
    w_min: float = 0.0       # minimum weight (mV)


@dataclass
class NeuralConfig:
    """Configuration for a spiking neural network simulation."""

    # LIF neuron parameters — calibrated from Shiu et al. 2024
    # (Eon Systems fruit fly brain emulation, applicable to LIF on real connectomes)
    tau_m: float = 15.0  # membrane time constant (ms) — Shiu et al. used 10-20ms
    v_rest: float = -52.0  # resting potential (mV) — C. elegans rests at -52mV
    v_reset: float = -52.0  # reset to resting potential after spike (mV)
    v_thresh: float = -45.0  # spike threshold (mV) — typical for C. elegans
    tau_ref: float = 2.2  # refractory period (ms) — Shiu et al.

    # Synapse parameters
    tau_syn: float = 5.0  # synaptic current decay (ms)
    weight_scale: float = 0.275  # mV per unit synapse weight (from Shiu et al.)

    # Simulation parameters
    dt: float = 0.1  # timestep (ms)

    # Firing rate estimation
    tau_rate: float = 50.0  # time constant for firing rate EMA (ms)

    # Code generation target: "numpy", "cython", or "auto"
    # "auto" tries cython first, falls back to numpy
    codegen_target: str = "auto"


@dataclass
class SimulationState:
    """Snapshot of neural simulation state at a point in time."""

    t_ms: float  # current simulation time
    spikes: list[int]  # indices of neurons that spiked this step
    voltages: list[float]  # membrane potentials for all neurons
    firing_rates: list[float]  # exponential moving average rates (Hz)


class NeuralEngine(ABC):
    """Abstract interface for neural simulation backends."""

    @property
    @abstractmethod
    def neuron_ids(self) -> list[str]:
        """Ordered list of neuron IDs in the network."""
        ...

    @property
    @abstractmethod
    def n_neurons(self) -> int:
        """Number of neurons in the network."""
        ...

    @abstractmethod
    def get_neuron_index(self, neuron_id: str) -> int | None:
        """Return the index of a neuron by ID, or None if not found."""
        ...

    @abstractmethod
    def build(self, connectome: Connectome, config: NeuralConfig | None = None,
              monitor: MonitorConfig | None = None) -> None:
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
    def get_voltage_history(self, neuron_ids: list[str] | None = None) -> dict[str, tuple[list[float], list[float]]]:
        """Return {neuron_id: (times_ms, voltages_mV)} for specified neurons."""
        ...

    @abstractmethod
    def get_firing_rates(self) -> dict[str, float]:
        """Return current firing rate (Hz) for all neurons."""
        ...

    @abstractmethod
    def get_firing_rates_array(self) -> np.ndarray:
        """Return firing rates as a numpy array (ordered by neuron index)."""
        ...

    @abstractmethod
    def get_synapse_weights(self) -> np.ndarray:
        """Return all synapse weights as a numpy array (in engine units)."""
        ...

    @abstractmethod
    def set_synapse_weights(self, weights: np.ndarray) -> None:
        """Set all synapse weights from a numpy array."""
        ...

    @abstractmethod
    def get_synapse_pre_indices(self) -> np.ndarray:
        """Return presynaptic neuron indices for all synapses."""
        ...

    @abstractmethod
    def lesion(self, pre_id: str, post_id: str) -> None:
        """Remove a synapse between two neurons."""
        ...

    @abstractmethod
    def lesion_neuron(self, neuron_id: str) -> None:
        """Remove all synapses to and from a neuron."""
        ...

    @abstractmethod
    def reset(self) -> None:
        """Reset the simulation to initial conditions."""
        ...
