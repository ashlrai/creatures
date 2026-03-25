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
from creatures.neural.base import MonitorConfig, NeuralConfig, NeuralEngine, PlasticityConfig, SimulationState

logger = logging.getLogger(__name__)


def _resolve_codegen_target(target: str) -> str:
    """Resolve 'auto' to the best available backend.

    Checks BRIAN2_CODEGEN_TARGET env var first, allowing tests to force
    numpy backend without modifying NeuralConfig at every call site.
    """
    import os
    env_target = os.environ.get("BRIAN2_CODEGEN_TARGET")
    if env_target:
        return env_target
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
        self._plasticity: PlasticityConfig | None = None
        self._original_build_weights: np.ndarray | None = None

    @property
    def neuron_ids(self) -> list[str]:
        return self._neuron_ids

    @property
    def n_neurons(self) -> int:
        return len(self._neuron_ids)

    def get_neuron_index(self, neuron_id: str) -> int | None:
        return self._id_to_idx.get(neuron_id)

    def build(self, connectome: Connectome, config: NeuralConfig | None = None,
              monitor: MonitorConfig | None = None,
              plasticity: PlasticityConfig | None = None) -> None:
        """Build the Brian2 network from a connectome.

        Args:
            connectome: The biological connectome to simulate.
            config: Neural simulation parameters. Uses defaults if None.
            monitor: Monitor configuration. Uses defaults if None.
            plasticity: STDP plasticity configuration. None or disabled = static synapses.
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
        self._plasticity = plasticity

        if plasticity is not None and plasticity.enabled:
            # STDP synapse model: traces track recent pre/post spike activity.
            # When pre fires before post, the synapse strengthens (potentiation).
            # When post fires before pre, the synapse weakens (depression).
            stdp_model = """
            w : volt
            dapre/dt = -apre / tau_pre : 1 (event-driven)
            dapost/dt = -apost / tau_post : 1 (event-driven)
            """
            stdp_on_pre = """
            I_syn_post += w
            apre += A_plus
            w = clip(w - apost * mV, w_min * mV, w_max * mV)
            """
            stdp_on_post = """
            apost += A_minus
            w = clip(w + apre * mV, w_min * mV, w_max * mV)
            """
            self._synapses = Synapses(
                self._neurons,
                self._neurons,
                stdp_model,
                on_pre=stdp_on_pre,
                on_post=stdp_on_post,
                namespace={
                    "tau_pre": plasticity.tau_pre * ms,
                    "tau_post": plasticity.tau_post * ms,
                    "A_plus": plasticity.a_plus,
                    "A_minus": plasticity.a_minus,
                    "w_max": plasticity.w_max,
                    "w_min": plasticity.w_min,
                },
            )
            logger.info(
                "STDP enabled: tau_pre=%.1fms, tau_post=%.1fms, "
                "A+=%.4f, A-=%.4f, w_range=[%.1f, %.1f] mV",
                plasticity.tau_pre, plasticity.tau_post,
                plasticity.a_plus, plasticity.a_minus,
                plasticity.w_min, plasticity.w_max,
            )
        else:
            # Static synapses (default, backward compatible)
            self._synapses = Synapses(
                self._neurons,
                self._neurons,
                "w : volt",
                on_pre="I_syn_post += w",
            )

        self._synapses.connect(i=b2_params["i"], j=b2_params["j"])
        raw_weights = b2_params["w"] * cfg.weight_scale

        # When plasticity is enabled, clip initial weights to the STDP bounds
        # so that all weights start within the learnable range.
        if self._plasticity is not None and self._plasticity.enabled:
            raw_weights = np.clip(raw_weights, self._plasticity.w_min, self._plasticity.w_max)

        self._synapses.w = raw_weights * mV

        # Store original weights for learning rate tracking
        self._original_build_weights = np.array(self._synapses.w / mV).copy()

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
        if self._spike_mon is not None:
            spike_times = np.array(self._spike_mon.t / ms)
            spike_indices = np.array(self._spike_mon.i)
            mask = spike_times >= t_before
            masked_indices = spike_indices[mask].astype(int)
            step_spikes = np.unique(masked_indices).tolist()
        else:
            masked_indices = np.array([], dtype=int)
            step_spikes = []

        # Get current voltages (vectorized)
        voltages = (np.array(self._neurons.v) / mV).tolist()

        # Update firing rates (exponential moving average, vectorized)
        alpha = min(1.0, duration_ms / cfg.tau_rate)
        if len(masked_indices) > 0:
            spike_count = np.bincount(masked_indices, minlength=self.n_neurons).astype(float)
        else:
            spike_count = np.zeros(self.n_neurons)
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
        indices = np.array(self._spike_mon.i).astype(int).tolist()
        times = (np.array(self._spike_mon.t) / ms).tolist()
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

        times = (np.array(self._voltage_mon.t) / ms).tolist()
        ids = neuron_ids or self._neuron_ids
        result = {}
        for nid in ids:
            if nid in self._id_to_idx:
                idx = self._id_to_idx[nid]
                voltages = (np.array(self._voltage_mon.v[idx]) / mV).tolist()
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

    def get_weight_changes(self) -> dict:
        """Return statistics about synaptic weight changes since build.

        Compares current weights to the weights at build time to measure
        how much the network has learned via STDP or other plasticity.
        """
        if self._original_build_weights is None:
            return {}
        current = self.get_synapse_weights()
        original = self._original_build_weights
        if len(current) == 0 or len(original) == 0:
            return {}
        delta = current - original
        return {
            "mean_change": float(np.mean(delta)),
            "std_change": float(np.std(delta)),
            "max_potentiation": float(np.max(delta)),
            "max_depression": float(np.min(delta)),
            "n_potentiated": int(np.sum(delta > 0.01)),
            "n_depressed": int(np.sum(delta < -0.01)),
            "n_unchanged": int(np.sum(np.abs(delta) <= 0.01)),
        }

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
        if self._input_currents is not None:
            self._input_currents[:] = 0
