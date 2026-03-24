"""Brian2-based spiking neural network engine.

Converts a Connectome into a Brian2 simulation with leaky integrate-and-fire
neurons and current-based synapses.
"""

from __future__ import annotations

import logging

import numpy as np
from brian2 import (
    Hz,
    Network,
    NeuronGroup,
    SpikeMonitor,
    StateMonitor,
    Synapses,
    TimedArray,
    defaultclock,
    ms,
    mV,
    nA,
    prefs,
)

from creatures.connectome.types import Connectome
from creatures.neural.base import MonitorConfig, NeuralConfig, NeuralEngine, SimulationState

logger = logging.getLogger(__name__)


def _resolve_codegen_target(target: str) -> str:
    """Resolve 'auto' to the best available backend."""
    if target == "auto":
        try:
            import Cython  # noqa: F401
            return "cython"
        except ImportError:
            logger.info("Cython not available, falling back to numpy backend")
            return "numpy"
    return target


class Brian2Engine(NeuralEngine):
    """Spiking neural network engine backed by Brian2.

    Builds a leaky integrate-and-fire (LIF) network from connectome data
    with current-based synapses. Supports external current injection,
    synapse lesioning, and real-time firing rate estimation.
    """

    def __init__(self) -> None:
        self._net: Network | None = None
        self._neurons: NeuronGroup | None = None
        self._synapses: Synapses | None = None
        self._spike_mon: SpikeMonitor | None = None
        self._voltage_mon: StateMonitor | None = None
        self._connectome: Connectome | None = None
        self._config: NeuralConfig | None = None
        self._monitor_config: MonitorConfig | None = None
        self._neuron_ids: list[str] = []
        self._id_to_idx: dict[str, int] = {}
        self._firing_rates: np.ndarray | None = None
        self._input_currents: np.ndarray | None = None

    @property
    def neuron_ids(self) -> list[str]:
        return self._neuron_ids

    @property
    def n_neurons(self) -> int:
        return len(self._neuron_ids)

    def get_neuron_index(self, neuron_id: str) -> int | None:
        return self._id_to_idx.get(neuron_id)

    def build(self, connectome: Connectome, config: NeuralConfig | None = None,
              monitor: MonitorConfig | None = None) -> None:
        """Build the Brian2 network from a connectome.

        Args:
            connectome: The biological connectome to simulate.
            config: Neural simulation parameters. Uses defaults if None.
        """
        self._connectome = connectome
        self._config = config or NeuralConfig()
        self._monitor_config = monitor or MonitorConfig()
        cfg = self._config

        # Set codegen target per-build (not module-level)
        resolved_target = _resolve_codegen_target(cfg.codegen_target)
        prefs.codegen.target = resolved_target
        logger.info(f"Brian2 codegen target: {resolved_target}")

        self._neuron_ids = connectome.neuron_ids
        self._id_to_idx = connectome.neuron_id_to_index
        n = connectome.n_neurons

        defaultclock.dt = cfg.dt * ms

        # LIF neuron model with external input current
        eqs = """
        dv/dt = (v_rest - v + I_syn + I_ext) / tau_m : volt (unless refractory)
        dI_syn/dt = -I_syn / tau_syn : volt
        I_ext : volt
        """

        self._neurons = NeuronGroup(
            n,
            eqs,
            threshold=f"v > {cfg.v_thresh} * mV",
            reset=f"v = {cfg.v_reset} * mV",
            refractory=cfg.tau_ref * ms,
            namespace={
                "v_rest": cfg.v_rest * mV,
                "tau_m": cfg.tau_m * ms,
                "tau_syn": cfg.tau_syn * ms,
            },
            method="euler",
        )
        self._neurons.v = cfg.v_rest * mV
        self._neurons.I_ext = 0 * mV

        # Build synapses from connectome
        b2_params = connectome.to_brian2_params()
        self._synapses = Synapses(
            self._neurons,
            self._neurons,
            "w : volt",
            on_pre="I_syn_post += w",
        )
        self._synapses.connect(i=b2_params["i"], j=b2_params["j"])
        self._synapses.w = b2_params["w"] * cfg.weight_scale * mV

        # Monitors — configurable to save memory on large networks
        mon_cfg = self._monitor_config
        components = [self._neurons, self._synapses]

        if mon_cfg.record_spikes:
            self._spike_mon = SpikeMonitor(self._neurons)
            components.append(self._spike_mon)

        if mon_cfg.record_voltages:
            if mon_cfg.voltage_neuron_ids is not None:
                # Selective voltage recording
                record_indices = [
                    self._id_to_idx[nid] for nid in mon_cfg.voltage_neuron_ids
                    if nid in self._id_to_idx
                ]
                self._voltage_mon = StateMonitor(
                    self._neurons, "v", record=record_indices
                )
            else:
                # Record all voltages
                self._voltage_mon = StateMonitor(self._neurons, "v", record=True)
            components.append(self._voltage_mon)

        # Build network
        self._net = Network(*components)
        self._net.store("initial")

        # Firing rate tracking
        self._firing_rates = np.zeros(n)
        self._input_currents = np.zeros(n)

        logger.info(
            f"Built Brian2 network: {n} neurons, "
            f"{len(b2_params['i'])} synapses"
        )

    def set_input_currents(self, neuron_currents: dict[str, float]) -> None:
        """Set external input currents for specified neurons.

        Args:
            neuron_currents: {neuron_id: current_mV} mapping.
                Current is in mV (voltage-equivalent drive).
        """
        if self._neurons is None:
            raise RuntimeError("Network not built. Call build() first.")

        # Reset all currents
        self._neurons.I_ext = 0 * mV
        self._input_currents[:] = 0

        for nid, current in neuron_currents.items():
            if nid in self._id_to_idx:
                idx = self._id_to_idx[nid]
                self._neurons.I_ext[idx] = current * mV
                self._input_currents[idx] = current

    def step(self, duration_ms: float) -> SimulationState:
        """Advance the simulation by duration_ms.

        Returns:
            SimulationState with current spikes, voltages, and firing rates.
        """
        if self._net is None:
            raise RuntimeError("Network not built. Call build() first.")

        cfg = self._config
        t_before = float(self._net.t / ms)

        self._net.run(duration_ms * ms)

        t_after = float(self._net.t / ms)

        # Get spikes that occurred during this step
        spike_times = np.array(self._spike_mon.t / ms)
        spike_indices = np.array(self._spike_mon.i)
        mask = spike_times >= t_before
        step_spikes = list(set(spike_indices[mask].astype(int)))

        # Get current voltages
        voltages = list(float(v / mV) for v in self._neurons.v)

        # Update firing rates (exponential moving average)
        alpha = duration_ms / cfg.tau_rate
        spike_count = np.zeros(self.n_neurons)
        for idx in spike_indices[mask].astype(int):
            spike_count[idx] += 1
        instant_rate = spike_count / (duration_ms / 1000.0)  # Hz
        self._firing_rates = (1 - alpha) * self._firing_rates + alpha * instant_rate

        return SimulationState(
            t_ms=t_after,
            spikes=step_spikes,
            voltages=voltages,
            firing_rates=list(self._firing_rates),
        )

    def get_spike_history(self) -> tuple[list[int], list[float]]:
        """Return all recorded spikes as (neuron_indices, times_ms)."""
        if self._spike_mon is None:
            return [], []
        indices = list(int(i) for i in self._spike_mon.i)
        times = list(float(t / ms) for t in self._spike_mon.t)
        return indices, times

    def get_voltage_history(
        self, neuron_ids: list[str] | None = None
    ) -> dict[str, tuple[list[float], list[float]]]:
        """Return voltage traces for specified neurons.

        Args:
            neuron_ids: Neuron IDs to return traces for. None = all.

        Returns:
            {neuron_id: (times_ms, voltages_mV)}
        """
        if self._voltage_mon is None:
            return {}

        times = list(float(t / ms) for t in self._voltage_mon.t)
        ids = neuron_ids or self._neuron_ids
        result = {}
        for nid in ids:
            if nid in self._id_to_idx:
                idx = self._id_to_idx[nid]
                voltages = list(float(v / mV) for v in self._voltage_mon.v[idx])
                result[nid] = (times, voltages)
        return result

    def get_firing_rates(self) -> dict[str, float]:
        """Return current estimated firing rate (Hz) for all neurons."""
        return {
            nid: float(self._firing_rates[self._id_to_idx[nid]])
            for nid in self._neuron_ids
        }

    def lesion(self, pre_id: str, post_id: str) -> None:
        """Remove a synapse by setting its weight to zero."""
        if self._synapses is None:
            raise RuntimeError("Network not built. Call build() first.")

        pre_idx = self._id_to_idx.get(pre_id)
        post_idx = self._id_to_idx.get(post_id)
        if pre_idx is None or post_idx is None:
            return

        # Find matching synapses and zero their weights
        pre_arr = np.array(self._synapses.i)
        post_arr = np.array(self._synapses.j)
        mask = (pre_arr == pre_idx) & (post_arr == post_idx)
        if mask.any():
            indices = np.where(mask)[0]
            for idx in indices:
                self._synapses.w[int(idx)] = 0 * mV
            logger.info(f"Lesioned {len(indices)} synapses: {pre_id} → {post_id}")

    def lesion_neuron(self, neuron_id: str) -> None:
        """Remove all synapses to and from a neuron."""
        if self._synapses is None:
            raise RuntimeError("Network not built. Call build() first.")

        idx = self._id_to_idx.get(neuron_id)
        if idx is None:
            return

        pre_arr = np.array(self._synapses.i)
        post_arr = np.array(self._synapses.j)
        mask = (pre_arr == idx) | (post_arr == idx)
        if mask.any():
            indices = np.where(mask)[0]
            for i in indices:
                self._synapses.w[int(i)] = 0 * mV
            logger.info(f"Lesioned neuron {neuron_id}: zeroed {len(indices)} synapses")

    def get_firing_rates_array(self) -> np.ndarray:
        """Return firing rates as a numpy array (ordered by neuron index)."""
        if self._firing_rates is None:
            return np.array([])
        return self._firing_rates.copy()

    def get_synapse_weights(self) -> np.ndarray:
        """Return all synapse weights as a numpy array (in mV)."""
        if self._synapses is None:
            return np.array([])
        return np.array(self._synapses.w / mV)

    def set_synapse_weights(self, weights: np.ndarray) -> None:
        """Set all synapse weights from a numpy array (in mV)."""
        if self._synapses is None:
            raise RuntimeError("Network not built. Call build() first.")
        self._synapses.w[:] = weights * mV

    def get_synapse_pre_indices(self) -> np.ndarray:
        """Return presynaptic neuron indices for all synapses."""
        if self._synapses is None:
            return np.array([], dtype=int)
        return np.array(self._synapses.i)

    def reset(self) -> None:
        """Reset the simulation to initial conditions."""
        if self._net is None:
            raise RuntimeError("Network not built. Call build() first.")
        self._net.restore("initial")
        self._firing_rates = np.zeros(self.n_neurons)
        self._input_currents[:] = 0
