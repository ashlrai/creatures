"""Massively parallel vectorized neural engine.

Replaces Brian2 for large-scale simulations (millions of neurons).
All neurons across all organisms are stored in contiguous arrays and
simulated with a single vectorized call per timestep.

Supports three backends (auto-detected in priority order):
  MLX (Apple Silicon GPU):  ~10M neurons feasible, 19x faster than numpy
  CuPy (NVIDIA GPU):        ~10M neurons feasible
  numpy (CPU):               ~100K comfortably, ~1M feasible

Supports two neuron models:
  LIF (Leaky Integrate-and-Fire): 3 state vars, fastest
  Izhikevich: 4 state vars, reproduces 20+ firing patterns, ~2x LIF cost

This engine does NOT implement the NeuralEngine ABC — it uses a
different interface optimised for massive parallelism where organisms
are identified by integer index rather than named neuron IDs.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class NeuronModel(Enum):
    LIF = "lif"
    IZHIKEVICH = "izhikevich"


# Izhikevich parameter presets mapping neuron types to (a, b, c, d).
# From Izhikevich (2003) "Simple Model of Spiking Neurons".
IZHIKEVICH_PRESETS: dict[str, tuple[float, float, float, float]] = {
    "regular_spiking": (0.02, 0.2, -65.0, 8.0),
    "intrinsically_bursting": (0.02, 0.2, -55.0, 4.0),
    "chattering": (0.02, 0.2, -50.0, 2.0),
    "fast_spiking": (0.1, 0.2, -65.0, 2.0),
    "thalamo_cortical": (0.02, 0.25, -65.0, 0.05),
    "resonator": (0.1, 0.26, -65.0, 2.0),
    "low_threshold_spiking": (0.02, 0.25, -65.0, 2.0),
}


class VectorizedEngine:
    """Massively parallel neural engine using numpy/CuPy/MLX.

    Simulates N organisms x M neurons per organism as a single
    (N*M)-length vector operation.  All organisms step simultaneously
    in one vectorized call — no Python loops over organisms at runtime.

    Usage::

        engine = VectorizedEngine(use_gpu=True)
        engine.build(n_organisms=1000, neurons_per_organism=100)
        for _ in range(1000):
            stats = engine.step()
    """

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def __init__(
        self,
        use_gpu: bool = False,
        neuron_model: NeuronModel | str = NeuronModel.LIF,
    ) -> None:
        self.xp: Any = None  # numpy, cupy, or mlx.core module
        self._use_gpu = use_gpu
        self._backend: str = "numpy"  # "numpy", "cupy", or "mlx"
        self._setup_backend(use_gpu)

        if isinstance(neuron_model, str):
            neuron_model = NeuronModel(neuron_model)
        self._neuron_model = neuron_model

        # Populated by build()
        self.n_organisms: int = 0
        self.n_per: int = 0
        self.n_total: int = 0
        self.n_synapses: int = 0

        # State arrays (initialised in build)
        self.v: Any = None
        self.fired: Any = None
        self.firing_rate: Any = None
        self.I_ext: Any = None

        # Izhikevich recovery variable
        self.u: Any = None
        # Per-neuron Izhikevich parameters (evolvable)
        self.iz_a: Any = None
        self.iz_b: Any = None
        self.iz_c: Any = None
        self.iz_d: Any = None

        # Synapse COO storage
        self.syn_pre: Any = None
        self.syn_post: Any = None
        self.syn_w: Any = None

        # Spike history recording (rolling buffer)
        self._spike_indices: list[int] = []
        self._spike_times_ms: list[float] = []
        self._spike_buffer_max: int = 500_000  # max spikes to keep
        self._time_ms: float = 0.0
        self._record_spikes: bool = True

        # STDP state (None = disabled)
        self.enable_stdp: bool = False
        self.apre: Any = None   # pre-synaptic trace, shape (n_synapses,)
        self.apost: Any = None  # post-synaptic trace, shape (n_synapses,)
        self.stdp_tau_pre: float = 20.0   # ms
        self.stdp_tau_post: float = 20.0  # ms
        self.stdp_a_plus: float = 0.01
        self.stdp_a_minus: float = 0.012
        self.stdp_w_min: float = -10.0
        self.stdp_w_max: float = 10.0

        # LIF parameters (defaults from NeuralConfig in base.py)
        self.v_rest: float = -52.0
        self.v_thresh: float = -45.0
        self.v_reset: float = -52.0
        self.tau_m: float = 15.0
        self.dt: float = 0.5  # larger timestep for throughput

        # Izhikevich parameters (overridden per-neuron during build)
        self.iz_v_peak: float = 30.0  # spike peak (mV)

    # ------------------------------------------------------------------
    # Backend setup
    # ------------------------------------------------------------------

    def _setup_backend(self, use_gpu: bool) -> None:
        """Select the fastest available backend.

        Priority: MLX (Apple Silicon) > CuPy (NVIDIA) > numpy (CPU).
        """
        if use_gpu:
            # Try MLX first (Apple Silicon)
            try:
                import mlx.core as mx  # type: ignore[import-untyped]

                self.xp = mx
                self._backend = "mlx"
                logger.info("VectorizedEngine: using MLX (Apple Silicon GPU)")
                return
            except ImportError:
                pass

            # Try CuPy (NVIDIA)
            try:
                import cupy as cp  # type: ignore[import-untyped]

                self.xp = cp
                self._backend = "cupy"
                logger.info("VectorizedEngine: using CuPy (NVIDIA GPU)")
                return
            except ImportError:
                logger.warning(
                    "No GPU backend available (MLX/CuPy) — falling back to numpy"
                )
                self._use_gpu = False

        self.xp = np
        self._backend = "numpy"

    @property
    def _float_dtype(self) -> Any:
        """Default float dtype for the backend."""
        if self._backend == "mlx":
            return self.xp.float32  # MLX is fastest with float32
        return self.xp.float64

    @property
    def _int_dtype(self) -> Any:
        if self._backend == "mlx":
            return self.xp.int32
        return self.xp.int64

    # ------------------------------------------------------------------
    # Array helpers (abstract numpy vs MLX differences)
    # ------------------------------------------------------------------

    def _scatter_add(self, out: Any, indices: Any, values: Any) -> Any:
        """Scatter-add: out[indices] += values, handling duplicates."""
        if self._backend == "mlx":
            return out.at[indices].add(values)
        else:
            # np.add.at modifies in-place — no copy needed
            self.xp.add.at(out, indices, values)
            return out

    def _make_rng(self, seed: int) -> Any:
        """Create a random number generator."""
        if self._backend == "mlx":
            return seed  # MLX uses key-based RNG; we pass seed through
        return self.xp.random.default_rng(seed)

    def _randint(self, rng: Any, low: int, high: int, size: int) -> Any:
        if self._backend == "mlx":
            return self.xp.random.randint(
                low, high, shape=(size,), key=self.xp.random.key(rng)
            )
        return rng.integers(low, high, size=size, dtype=self._int_dtype)

    def _rand_uniform(self, rng: Any, low: float, high: float, size: int) -> Any:
        if self._backend == "mlx":
            return self.xp.random.uniform(
                low, high, shape=(size,), key=self.xp.random.key(rng + 1)
            )
        return rng.uniform(low, high, size=size)

    def _rand_normal(self, rng: Any, mean: float, std: float, size: int) -> Any:
        if self._backend == "mlx":
            return mean + std * self.xp.random.normal(
                shape=(size,), key=self.xp.random.key(rng + 2)
            )
        return rng.normal(mean, std, size=size)

    def _rand_random(self, rng: Any, size: int) -> Any:
        if self._backend == "mlx":
            return self.xp.random.uniform(
                shape=(size,), key=self.xp.random.key(rng + 3)
            )
        return rng.random(size)

    def _eval(self, *arrays: Any) -> None:
        """Force evaluation of lazy arrays (MLX only)."""
        if self._backend == "mlx":
            self.xp.eval(*[a for a in arrays if a is not None])

    def _to_numpy(self, arr: Any) -> np.ndarray:
        """Convert any backend array to numpy."""
        if self._backend == "mlx":
            return np.asarray(arr, copy=False)
        if self._backend == "cupy":
            return arr.get()
        return arr

    def _to_list(self, arr: Any) -> list:
        """Convert any backend array to Python list."""
        if self._backend == "cupy" and hasattr(arr, "get"):
            arr = arr.get()
        return arr.tolist()

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def build(
        self,
        n_organisms: int,
        neurons_per_organism: int,
        connectivity_density: float = 0.1,
        excitatory_ratio: float = 0.8,
        seed: int = 42,
        neuron_type: str = "regular_spiking",
    ) -> None:
        """Build the massive neural network.

        Total neurons = *n_organisms* x *neurons_per_organism*.
        Each organism has internal connections only (block-diagonal
        weight structure — no cross-organism synapses).
        """
        xp = self.xp
        fdtype = self._float_dtype
        idtype = self._int_dtype

        self.n_organisms = n_organisms
        self.n_per = neurons_per_organism
        self.n_total = n_organisms * neurons_per_organism

        # --- State arrays ---
        if self._neuron_model == NeuronModel.LIF:
            self.v = xp.full(self.n_total, self.v_rest, dtype=fdtype)
        else:
            # Izhikevich: v starts at -65 mV
            self.v = xp.full(self.n_total, -65.0, dtype=fdtype)
            self.u = xp.full(self.n_total, -65.0 * 0.2, dtype=fdtype)
            self._init_izhikevich_params(neuron_type)

        self.fired = xp.zeros(self.n_total, dtype=xp.bool_)
        self.firing_rate = xp.zeros(self.n_total, dtype=fdtype)
        self.I_ext = xp.zeros(self.n_total, dtype=fdtype)

        # --- Build block-diagonal synapse lists (COO format) ---
        self._build_random_synapses(
            n_organisms, neurons_per_organism, connectivity_density,
            excitatory_ratio, seed,
        )

        self._eval(
            self.v, self.fired, self.firing_rate, self.I_ext,
            self.u, self.iz_a, self.iz_b, self.iz_c, self.iz_d,
            self.syn_pre, self.syn_post, self.syn_w,
        )

        logger.info(
            "VectorizedEngine built (%s/%s): %d organisms x %d neurons = %d total, "
            "%d synapses",
            self._backend,
            self._neuron_model.value,
            n_organisms,
            neurons_per_organism,
            self.n_total,
            self.n_synapses,
        )

    def _init_izhikevich_params(self, neuron_type: str) -> None:
        """Initialise per-neuron Izhikevich (a,b,c,d) from a preset."""
        xp = self.xp
        fdtype = self._float_dtype
        a, b, c, d = IZHIKEVICH_PRESETS.get(
            neuron_type, IZHIKEVICH_PRESETS["regular_spiking"]
        )
        self.iz_a = xp.full(self.n_total, a, dtype=fdtype)
        self.iz_b = xp.full(self.n_total, b, dtype=fdtype)
        self.iz_c = xp.full(self.n_total, c, dtype=fdtype)
        self.iz_d = xp.full(self.n_total, d, dtype=fdtype)

    def _build_random_synapses(
        self,
        n_organisms: int,
        neurons_per_organism: int,
        connectivity_density: float,
        excitatory_ratio: float,
        seed: int,
    ) -> None:
        """Build random block-diagonal synapses using numpy then convert."""
        # Always build with numpy for consistent RNG, then convert
        rng = np.random.default_rng(seed)
        n_syn_per_org = int(
            neurons_per_organism * neurons_per_organism * connectivity_density
        )
        total_syn_budget = n_syn_per_org * n_organisms

        all_pre = rng.integers(
            0, neurons_per_organism, size=total_syn_budget, dtype=np.int64
        )
        all_post = rng.integers(
            0, neurons_per_organism, size=total_syn_budget, dtype=np.int64
        )

        org_offsets = np.repeat(
            np.arange(n_organisms, dtype=np.int64) * neurons_per_organism,
            n_syn_per_org,
        )
        all_pre += org_offsets
        all_post += org_offsets

        # Remove self-connections
        local_pre = all_pre - org_offsets
        local_post = all_post - org_offsets
        mask = local_pre != local_post
        all_pre = all_pre[mask]
        all_post = all_post[mask]

        n_syn = len(all_pre)
        exc_mask = rng.random(n_syn) < excitatory_ratio
        weights_exc = rng.uniform(0.5, 3.0, size=n_syn)
        weights_inh = rng.uniform(-2.0, -0.5, size=n_syn)
        all_weights = np.where(exc_mask, weights_exc, weights_inh)

        # Convert to backend arrays
        xp = self.xp
        self.syn_pre = xp.array(all_pre.astype(np.int32 if self._backend == "mlx" else np.int64))
        self.syn_post = xp.array(all_post.astype(np.int32 if self._backend == "mlx" else np.int64))
        self.syn_w = xp.array(all_weights.astype(np.float32 if self._backend == "mlx" else np.float64))
        self.n_synapses = int(n_syn)

    # ------------------------------------------------------------------
    # Simulation step
    # ------------------------------------------------------------------

    def step(self) -> dict[str, Any]:
        """Advance ALL organisms by one timestep."""
        if self._neuron_model == NeuronModel.IZHIKEVICH:
            self._step_izhikevich()
        else:
            self._step_lif()

        # Post-step: STDP, spike recording, stats
        return self._post_step()

    def _step_lif(self) -> None:
        """LIF neuron model step."""
        xp = self.xp
        fdtype = self._float_dtype

        # 1. Synaptic current via scatter-add
        I_syn = xp.zeros(self.n_total, dtype=fdtype)
        fired_pre = self.fired[self.syn_pre].astype(fdtype)
        contributions = self.syn_w * fired_pre
        I_syn = self._scatter_add(I_syn, self.syn_post, contributions)

        # 2. LIF membrane integration
        dv = (self.v_rest - self.v + I_syn + self.I_ext) / self.tau_m * self.dt
        self.v = self.v + dv

        # 3. Spike detection
        self.fired = self.v >= self.v_thresh
        self.v = xp.where(self.fired, self.v_reset, self.v)

        # 4. Firing-rate EMA
        alpha = min(1.0, self.dt / 50.0)
        instant = self.fired.astype(fdtype) / (self.dt / 1000.0)
        self.firing_rate = (1.0 - alpha) * self.firing_rate + alpha * instant

    def _step_izhikevich(self) -> None:
        """Izhikevich neuron model step.

        Equations (Izhikevich 2003):
            dv/dt = 0.04v² + 5v + 140 - u + I
            du/dt = a(bv - u)
            if v >= 30 mV: v = c, u = u + d
        """
        xp = self.xp
        fdtype = self._float_dtype

        # 1. Synaptic current via scatter-add
        I_syn = xp.zeros(self.n_total, dtype=fdtype)
        fired_pre = self.fired[self.syn_pre].astype(fdtype)
        contributions = self.syn_w * fired_pre
        I_syn = self._scatter_add(I_syn, self.syn_post, contributions)

        I_total = I_syn + self.I_ext

        # 2. Izhikevich integration (two 0.5ms half-steps for numerical stability)
        half_dt = self.dt * 0.5
        for _ in range(2):
            dv = (0.04 * self.v * self.v + 5.0 * self.v + 140.0 - self.u + I_total) * half_dt
            self.v = self.v + dv
            du = self.iz_a * (self.iz_b * self.v - self.u) * half_dt
            self.u = self.u + du

        # 3. Spike detection (peak at 30 mV)
        self.fired = self.v >= self.iz_v_peak
        self.v = xp.where(self.fired, self.iz_c, self.v)
        self.u = xp.where(self.fired, self.u + self.iz_d, self.u)

        # 4. Firing-rate EMA
        alpha = min(1.0, self.dt / 50.0)
        instant = self.fired.astype(fdtype) / (self.dt / 1000.0)
        self.firing_rate = (1.0 - alpha) * self.firing_rate + alpha * instant

    def _post_step(self) -> dict[str, Any]:
        """Post-step processing: STDP, spike recording, statistics."""
        xp = self.xp

        # Force evaluation before reading results (MLX lazy eval)
        self._eval(self.v, self.u, self.fired, self.firing_rate)

        # STDP weight update
        if self.enable_stdp and self.apre is not None:
            self._step_stdp()

        # Record spikes
        fired_count = int(xp.sum(self.fired).item() if self._backend == "mlx"
                          else xp.sum(self.fired))

        if self._record_spikes and fired_count > 0:
            fired_np = self._to_numpy(self.fired)
            spike_neurons = np.where(fired_np)[0]
            self._spike_indices.extend(spike_neurons.tolist())
            self._spike_times_ms.extend([self._time_ms] * len(spike_neurons))

            # Trim rolling buffer
            if len(self._spike_indices) > self._spike_buffer_max:
                excess = len(self._spike_indices) - self._spike_buffer_max
                self._spike_indices = self._spike_indices[excess:]
                self._spike_times_ms = self._spike_times_ms[excess:]

        self._time_ms += self.dt

        return {
            "total_fired": fired_count,
            "fire_rate_percent": fired_count / max(self.n_total, 1) * 100,
        }

    # ------------------------------------------------------------------
    # STDP (Spike-Timing-Dependent Plasticity)
    # ------------------------------------------------------------------

    def init_stdp(self) -> None:
        """Initialize STDP trace arrays. Call after build()."""
        xp = self.xp
        fdtype = self._float_dtype
        self.enable_stdp = True
        self.apre = xp.zeros(self.n_synapses, dtype=fdtype)
        self.apost = xp.zeros(self.n_synapses, dtype=fdtype)
        self._eval(self.apre, self.apost)
        logger.info("STDP enabled: %d synapses with online learning", self.n_synapses)

    def _step_stdp(self) -> None:
        """Update synaptic weights via STDP.

        Pre-before-post → potentiation (strengthen)
        Post-before-pre → depression (weaken)
        """
        xp = self.xp
        fdtype = self._float_dtype

        # Decay traces (exponential, biologically accurate)
        decay_pre = xp.exp(xp.array(-self.dt / self.stdp_tau_pre))
        decay_post = xp.exp(xp.array(-self.dt / self.stdp_tau_post))
        self.apre = self.apre * decay_pre
        self.apost = self.apost * decay_post

        # Get pre/post firing states for each synapse
        pre_fired = self.fired[self.syn_pre].astype(fdtype)
        post_fired = self.fired[self.syn_post].astype(fdtype)

        # Update traces on spike
        self.apre = self.apre + pre_fired * self.stdp_a_plus    # positive trace
        self.apost = self.apost + post_fired * self.stdp_a_minus  # positive trace

        # Weight updates (canonical STDP):
        # Post spike → LTP: post fires after pre → strengthen (add apre)
        # Pre spike → LTD: pre fires after post → weaken (subtract apost)
        dw = post_fired * self.apre - pre_fired * self.apost
        self.syn_w = self.syn_w + dw

        # Clip weights
        self.syn_w = xp.clip(self.syn_w, self.stdp_w_min, self.stdp_w_max)

        self._eval(self.apre, self.apost, self.syn_w)

    # ------------------------------------------------------------------
    # Spike history
    # ------------------------------------------------------------------

    def get_spike_history(self) -> tuple[list[int], list[float]]:
        """Return recorded spike indices and times (ms)."""
        return (self._spike_indices, self._spike_times_ms)

    def clear_spike_history(self) -> None:
        """Clear the spike recording buffer."""
        self._spike_indices = []
        self._spike_times_ms = []

    # ------------------------------------------------------------------
    # Per-organism queries
    # ------------------------------------------------------------------

    def get_organism_state(self, organism_idx: int) -> dict[str, list]:
        """Get detailed state for a single organism."""
        start = organism_idx * self.n_per
        end = start + self.n_per
        return {
            "voltages": self._to_list(self.v[start:end]),
            "fired": self._to_list(self.fired[start:end]),
            "firing_rates": self._to_list(self.firing_rate[start:end]),
        }

    def set_organism_input(
        self, organism_idx: int, neuron_idx: int, current: float
    ) -> None:
        """Set external input current for one neuron in one organism."""
        idx = organism_idx * self.n_per + neuron_idx
        if self._backend == "mlx":
            # MLX has no .set(); subtract old value then add new
            old_val = float(self.I_ext[idx].item())
            self.I_ext = self.I_ext.at[idx].add(current - old_val)
        else:
            self.I_ext[idx] = current

    def inject_stimulus(
        self,
        organism_indices: list[int],
        neuron_indices: list[int],
        current: float,
    ) -> None:
        """Inject stimulus to specific neurons across multiple organisms."""
        orgs = np.asarray(organism_indices, dtype=np.int64)
        neurs = np.asarray(neuron_indices, dtype=np.int64)
        flat = (orgs[:, None] * self.n_per + neurs[None, :]).ravel()
        valid = (flat >= 0) & (flat < self.n_total)
        flat = flat[valid]

        if self._backend == "mlx":
            # Build I_ext in numpy, convert once (MLX lacks .set())
            I_np = self._to_numpy(self.I_ext).copy()
            I_np[flat] = current
            self.I_ext = self.xp.array(I_np)
        else:
            self.I_ext[flat] = current

    def clear_input(self) -> None:
        """Zero out all external currents."""
        xp = self.xp
        self.I_ext = xp.zeros(self.n_total, dtype=self._float_dtype)

    # ------------------------------------------------------------------
    # Connectome-based build
    # ------------------------------------------------------------------

    @property
    def n_neurons(self) -> int:
        """Total neuron count across all organisms."""
        return self.n_total

    def get_synapse_weights(self) -> Any:
        """Return all synapse weights."""
        if self.syn_w is None:
            return self.xp.array([])
        return self.syn_w

    def build_from_connectome(
        self,
        connectome: Any,
        n_organisms: int,
        noise_std: float = 0.1,
        seed: int = 42,
        neuron_type: str = "regular_spiking",
    ) -> None:
        """Build using a real connectome template replicated across N organisms.

        Each organism gets the connectome's topology with slight random noise
        on weights (to create variation for evolution).  Uses
        ``connectome.to_brian2_params()`` for the template synapse arrays.
        """
        xp = self.xp
        fdtype = self._float_dtype
        idtype = self._int_dtype
        np_fdtype = np.float32 if self._backend == "mlx" else np.float64
        np_idtype = np.int32 if self._backend == "mlx" else np.int64

        n_per = connectome.n_neurons
        self.n_organisms = n_organisms
        self.n_per = n_per
        self.n_total = n_organisms * n_per

        # State arrays
        if self._neuron_model == NeuronModel.LIF:
            self.v = xp.full(self.n_total, self.v_rest, dtype=fdtype)
        else:
            self.v = xp.full(self.n_total, -65.0, dtype=fdtype)
            self.u = xp.full(self.n_total, -65.0 * 0.2, dtype=fdtype)
            self._init_izhikevich_params(neuron_type)

        self.fired = xp.zeros(self.n_total, dtype=xp.bool_)
        self.firing_rate = xp.zeros(self.n_total, dtype=fdtype)
        self.I_ext = xp.zeros(self.n_total, dtype=fdtype)

        # Get connectome synapses
        b2_params = connectome.to_brian2_params()
        t_pre = np.asarray(b2_params["i"], dtype=np_idtype)
        t_post = np.asarray(b2_params["j"], dtype=np_idtype)
        t_w = np.asarray(b2_params["w"], dtype=np_fdtype)
        n_template = len(t_pre)

        # Tile across organisms
        rng = np.random.default_rng(seed)
        offsets = np.repeat(
            np.arange(n_organisms, dtype=np_idtype) * n_per, n_template
        )
        all_pre = np.tile(t_pre, n_organisms) + offsets
        all_post = np.tile(t_post, n_organisms) + offsets

        base_w = np.tile(t_w, n_organisms)
        noise = rng.normal(1.0, noise_std, size=len(base_w)).astype(np_fdtype)
        all_w = base_w * noise

        # Convert to backend
        self.syn_pre = xp.array(all_pre)
        self.syn_post = xp.array(all_post)
        self.syn_w = xp.array(all_w)
        self.n_synapses = len(all_pre)

        self._eval(
            self.v, self.fired, self.firing_rate, self.I_ext,
            self.u, self.iz_a, self.iz_b, self.iz_c, self.iz_d,
            self.syn_pre, self.syn_post, self.syn_w,
        )

        logger.info(
            "VectorizedEngine built from connectome (%s/%s): %d organisms x %d "
            "neurons = %d total, %d synapses",
            self._backend,
            self._neuron_model.value,
            n_organisms,
            n_per,
            self.n_total,
            self.n_synapses,
        )

    def build_single_connectome(
        self,
        connectome: Any,
        neuron_type: str = "regular_spiking",
    ) -> None:
        """Build a single-organism simulation from a full connectome.

        Optimised for large connectomes (e.g. full Drosophila brain,
        139K neurons). No tiling or noise — uses the connectome directly.
        """
        xp = self.xp
        fdtype = self._float_dtype
        np_fdtype = np.float32 if self._backend == "mlx" else np.float64
        np_idtype = np.int32 if self._backend == "mlx" else np.int64

        self.n_organisms = 1
        self.n_per = connectome.n_neurons
        self.n_total = self.n_per

        # State arrays
        if self._neuron_model == NeuronModel.LIF:
            self.v = xp.full(self.n_total, self.v_rest, dtype=fdtype)
        else:
            self.v = xp.full(self.n_total, -65.0, dtype=fdtype)
            self.u = xp.full(self.n_total, -65.0 * 0.2, dtype=fdtype)
            self._init_izhikevich_params(neuron_type)

        self.fired = xp.zeros(self.n_total, dtype=xp.bool_)
        self.firing_rate = xp.zeros(self.n_total, dtype=fdtype)
        self.I_ext = xp.zeros(self.n_total, dtype=fdtype)

        # Load synapses directly
        b2_params = connectome.to_brian2_params()
        self.syn_pre = xp.array(np.asarray(b2_params["i"], dtype=np_idtype))
        self.syn_post = xp.array(np.asarray(b2_params["j"], dtype=np_idtype))
        self.syn_w = xp.array(np.asarray(b2_params["w"], dtype=np_fdtype))
        self.n_synapses = len(b2_params["i"])

        self._eval(
            self.v, self.fired, self.firing_rate, self.I_ext,
            self.u, self.iz_a, self.iz_b, self.iz_c, self.iz_d,
            self.syn_pre, self.syn_post, self.syn_w,
        )

        logger.info(
            "VectorizedEngine built single connectome (%s/%s): %d neurons, "
            "%d synapses",
            self._backend,
            self._neuron_model.value,
            self.n_total,
            self.n_synapses,
        )


# ======================================================================
# Benchmark
# ======================================================================

if __name__ == "__main__":
    import time

    print("VectorizedEngine Benchmark")
    print("=" * 80)

    for model in [NeuronModel.LIF, NeuronModel.IZHIKEVICH]:
        for backend_gpu in [False, True]:
            backend_label = "GPU" if backend_gpu else "CPU"
            engine = VectorizedEngine(use_gpu=backend_gpu, neuron_model=model)
            actual_backend = engine._backend

            print(f"\n  Backend: {actual_backend} | Model: {model.value}")
            print(f"  {'Neurons':>12}  {'Build (s)':>10}  {'Step (ms)':>10}  {'Synapses':>12}")
            print("  " + "-" * 56)

            for n in [1_000, 10_000, 100_000, 1_000_000]:
                n_org = max(n // 100, 1)
                n_per = 100

                eng = VectorizedEngine(use_gpu=backend_gpu, neuron_model=model)

                t0 = time.perf_counter()
                eng.build(n_organisms=n_org, neurons_per_organism=n_per)
                build_time = time.perf_counter() - t0

                # Warm-up
                for _ in range(3):
                    eng.step()

                t0 = time.perf_counter()
                n_steps = 100
                for _ in range(n_steps):
                    eng.step()
                step_time = (time.perf_counter() - t0) / n_steps * 1000

                print(
                    f"  {n:>12,}  {build_time:>10.2f}  {step_time:>10.2f}  "
                    f"{eng.n_synapses:>12,}"
                )

    print("=" * 80)
