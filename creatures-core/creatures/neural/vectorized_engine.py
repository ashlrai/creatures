"""Massively parallel vectorized LIF neural engine.

Replaces Brian2 for large-scale simulations (millions of neurons).
All neurons across all organisms are stored in contiguous arrays and
simulated with a single vectorized call per timestep.

On CPU (numpy):  ~100K neurons comfortably, ~1M feasible
On GPU (CuPy):   ~10M neurons feasible

This engine does NOT implement the NeuralEngine ABC — it uses a
different interface optimised for massive parallelism where organisms
are identified by integer index rather than named neuron IDs.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class VectorizedEngine:
    """Massively parallel LIF neural engine using numpy/CuPy.

    Simulates N organisms x M neurons per organism as a single
    (N*M)-length vector operation.  All organisms step simultaneously
    in one vectorized call — no Python loops over organisms at runtime.

    Usage::

        engine = VectorizedEngine(use_gpu=False)
        engine.build(n_organisms=1000, neurons_per_organism=100)
        for _ in range(1000):
            stats = engine.step()
    """

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def __init__(self, use_gpu: bool = False) -> None:
        self.xp: Any = None  # numpy or cupy module
        self._use_gpu = use_gpu
        self._setup_backend(use_gpu)

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

        # Synapse COO storage
        self.syn_pre: Any = None
        self.syn_post: Any = None
        self.syn_w: Any = None

        # LIF parameters (defaults from NeuralConfig in base.py)
        self.v_rest: float = -52.0
        self.v_thresh: float = -45.0
        self.v_reset: float = -52.0
        self.tau_m: float = 15.0
        self.dt: float = 0.5  # larger timestep for throughput

    # ------------------------------------------------------------------
    # Backend setup
    # ------------------------------------------------------------------

    def _setup_backend(self, use_gpu: bool) -> None:
        if use_gpu:
            try:
                import cupy as cp  # type: ignore[import-untyped]

                self.xp = cp
                logger.info("VectorizedEngine: using CuPy (GPU)")
            except ImportError:
                logger.warning(
                    "CuPy not available — falling back to numpy (CPU)"
                )
                self.xp = np
                self._use_gpu = False
        else:
            self.xp = np

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
    ) -> None:
        """Build the massive neural network.

        Total neurons = *n_organisms* x *neurons_per_organism*.
        Each organism has internal connections only (block-diagonal
        weight structure — no cross-organism synapses).

        Parameters
        ----------
        n_organisms:
            Number of independent organisms.
        neurons_per_organism:
            Neurons per organism.
        connectivity_density:
            Fraction of possible intra-organism connections to create.
        excitatory_ratio:
            Fraction of synapses that are excitatory (positive weight).
        seed:
            Random seed for reproducibility.
        """
        xp = self.xp
        self.n_organisms = n_organisms
        self.n_per = neurons_per_organism
        self.n_total = n_organisms * neurons_per_organism

        # --- State arrays (all organisms, all neurons) ---
        self.v = xp.full(self.n_total, self.v_rest, dtype=xp.float64)
        self.fired = xp.zeros(self.n_total, dtype=bool)
        self.firing_rate = xp.zeros(self.n_total, dtype=xp.float64)
        self.I_ext = xp.zeros(self.n_total, dtype=xp.float64)

        # --- Build block-diagonal synapse lists (COO format) ---
        rng = xp.random.default_rng(seed)

        n_syn_per_org = int(
            neurons_per_organism * neurons_per_organism * connectivity_density
        )
        # Total synapse budget (upper bound before self-connection removal)
        total_syn_budget = n_syn_per_org * n_organisms

        # Pre-allocate and fill in one shot per organism.
        # We batch-generate all random numbers up-front, then apply offsets.
        all_pre = rng.integers(
            0, neurons_per_organism, size=total_syn_budget, dtype=xp.int64
        )
        all_post = rng.integers(
            0, neurons_per_organism, size=total_syn_budget, dtype=xp.int64
        )

        # Tile organism offsets
        org_offsets = xp.repeat(
            xp.arange(n_organisms, dtype=xp.int64) * neurons_per_organism,
            n_syn_per_org,
        )
        all_pre += org_offsets
        all_post += org_offsets

        # Remove self-connections (pre == post within each organism)
        # We compare local indices (before offset) to avoid modular arithmetic
        local_pre = all_pre - org_offsets
        local_post = all_post - org_offsets
        mask = local_pre != local_post
        all_pre = all_pre[mask]
        all_post = all_post[mask]

        # Excitatory / inhibitory weights
        n_syn = len(all_pre)
        exc_mask = rng.random(n_syn) < excitatory_ratio
        weights_exc = rng.uniform(0.5, 3.0, size=n_syn)
        weights_inh = rng.uniform(-2.0, -0.5, size=n_syn)
        all_weights = xp.where(exc_mask, weights_exc, weights_inh)

        self.syn_pre = all_pre
        self.syn_post = all_post
        self.syn_w = all_weights
        self.n_synapses = int(n_syn)

        logger.info(
            "VectorizedEngine built: %d organisms x %d neurons = %d total, "
            "%d synapses",
            n_organisms,
            neurons_per_organism,
            self.n_total,
            self.n_synapses,
        )

    # ------------------------------------------------------------------
    # Simulation step
    # ------------------------------------------------------------------

    def step(self) -> dict[str, Any]:
        """Advance ALL organisms by one timestep.

        Returns a summary dict with aggregate statistics.
        """
        xp = self.xp

        # 1. Synaptic current via scatter-add
        I_syn = xp.zeros(self.n_total, dtype=xp.float64)
        fired_pre = self.fired[self.syn_pre].astype(xp.float64)
        contributions = self.syn_w * fired_pre
        xp.add.at(I_syn, self.syn_post, contributions)

        # 2. LIF membrane integration (vectorised over ALL neurons)
        dv = (self.v_rest - self.v + I_syn + self.I_ext) / self.tau_m * self.dt
        self.v += dv

        # 3. Spike detection
        self.fired = self.v >= self.v_thresh
        self.v = xp.where(self.fired, self.v_reset, self.v)

        # 4. Firing-rate EMA
        alpha = min(1.0, self.dt / 50.0)
        instant = self.fired.astype(xp.float64) / (self.dt / 1000.0)
        self.firing_rate = (1.0 - alpha) * self.firing_rate + alpha * instant

        # 5. Summary
        fired_count = int(xp.sum(self.fired))

        return {
            "total_fired": fired_count,
            "fire_rate_percent": fired_count / max(self.n_total, 1) * 100,
        }

    # ------------------------------------------------------------------
    # Per-organism queries
    # ------------------------------------------------------------------

    def get_organism_state(self, organism_idx: int) -> dict[str, list]:
        """Get detailed state for a single organism."""
        start = organism_idx * self.n_per
        end = start + self.n_per
        xp = self.xp
        # Convert to Python lists (handles both numpy and cupy)
        def _to_list(arr):
            if hasattr(arr, "get"):  # CuPy → numpy first
                arr = arr.get()
            return arr.tolist()

        return {
            "voltages": _to_list(self.v[start:end]),
            "fired": _to_list(self.fired[start:end]),
            "firing_rates": _to_list(self.firing_rate[start:end]),
        }

    def set_organism_input(
        self, organism_idx: int, neuron_idx: int, current: float
    ) -> None:
        """Set external input current for one neuron in one organism."""
        idx = organism_idx * self.n_per + neuron_idx
        self.I_ext[idx] = current

    def inject_stimulus(
        self,
        organism_indices: list[int],
        neuron_indices: list[int],
        current: float,
    ) -> None:
        """Inject stimulus to specific neurons across multiple organisms.

        Sets ``I_ext`` for every (organism, neuron) pair in the
        Cartesian product of *organism_indices* x *neuron_indices*.
        """
        xp = self.xp
        orgs = xp.asarray(organism_indices, dtype=xp.int64)
        neurs = xp.asarray(neuron_indices, dtype=xp.int64)
        # Build flat index array via broadcasting
        flat = (orgs[:, None] * self.n_per + neurs[None, :]).ravel()
        # Bounds check (vectorised)
        valid = (flat >= 0) & (flat < self.n_total)
        self.I_ext[flat[valid]] = current

    def clear_input(self) -> None:
        """Zero out all external currents."""
        self.I_ext[:] = 0.0

    # ------------------------------------------------------------------
    # Connectome-based build (placeholder for real data integration)
    # ------------------------------------------------------------------

    @property
    def n_neurons(self) -> int:
        """Total neuron count across all organisms (matches Brian2Engine interface)."""
        return self.n_total

    def get_synapse_weights(self) -> Any:
        """Return all synapse weights (matches Brian2Engine interface)."""
        if self.syn_w is None:
            return self.xp.array([])
        return self.syn_w

    def build_from_connectome(
        self,
        connectome: Any,
        n_organisms: int,
        noise_std: float = 0.1,
        seed: int = 42,
    ) -> None:
        """Build using a real connectome template replicated across N organisms.

        Each organism gets the connectome's topology with slight random noise
        on weights (to create variation for evolution).  Uses
        ``connectome.to_brian2_params()`` for the template synapse arrays and
        numpy tiling/broadcasting — no Python loops over organisms.

        Parameters
        ----------
        connectome:
            A ``Connectome`` instance (from ``creatures.connectome.types``).
        n_organisms:
            Number of organisms, each receiving a copy of the connectome.
        noise_std:
            Standard deviation of multiplicative Gaussian noise on weights.
        seed:
            Random seed.
        """
        from creatures.connectome.types import Connectome as _Connectome  # noqa: F811

        xp = self.xp
        rng = xp.random.default_rng(seed)

        n_per = connectome.n_neurons
        self.n_organisms = n_organisms
        self.n_per = n_per
        self.n_total = n_organisms * n_per

        # State arrays
        self.v = xp.full(self.n_total, self.v_rest, dtype=xp.float64)
        self.fired = xp.zeros(self.n_total, dtype=bool)
        self.firing_rate = xp.zeros(self.n_total, dtype=xp.float64)
        self.I_ext = xp.zeros(self.n_total, dtype=xp.float64)

        # Get connectome synapses via the standard Brian2-params interface
        b2_params = connectome.to_brian2_params()
        t_pre = xp.asarray(b2_params["i"], dtype=xp.int64)
        t_post = xp.asarray(b2_params["j"], dtype=xp.int64)
        t_w = xp.asarray(b2_params["w"], dtype=xp.float64)
        n_template = len(t_pre)

        # Tile across organisms using broadcasting — no Python loop
        offsets = xp.repeat(
            xp.arange(n_organisms, dtype=xp.int64) * n_per, n_template
        )
        self.syn_pre = xp.tile(t_pre, n_organisms) + offsets
        self.syn_post = xp.tile(t_post, n_organisms) + offsets

        # Add per-organism multiplicative noise to weights for diversity
        base_w = xp.tile(t_w, n_organisms)
        noise = rng.normal(1.0, noise_std, size=len(base_w))
        self.syn_w = base_w * noise

        self.n_synapses = len(self.syn_pre)

        logger.info(
            "VectorizedEngine built from connectome: %d organisms x %d "
            "neurons = %d total, %d synapses",
            n_organisms,
            n_per,
            self.n_total,
            self.n_synapses,
        )


# ======================================================================
# Benchmark
# ======================================================================

if __name__ == "__main__":
    import time

    print("VectorizedEngine Benchmark")
    print("=" * 60)
    print(f"  {'Neurons':>12}  {'Build (s)':>10}  {'Step (ms)':>10}  {'Synapses':>12}")
    print("-" * 60)

    for n in [1_000, 10_000, 100_000, 1_000_000]:
        n_org = max(n // 100, 1)
        n_per = 100

        engine = VectorizedEngine(use_gpu=False)

        t0 = time.perf_counter()
        engine.build(n_organisms=n_org, neurons_per_organism=n_per)
        build_time = time.perf_counter() - t0

        # Warm-up step
        engine.step()

        t0 = time.perf_counter()
        n_steps = 100
        for _ in range(n_steps):
            engine.step()
        step_time = (time.perf_counter() - t0) / n_steps * 1000  # ms

        print(
            f"  {n:>12,}  {build_time:>10.2f}  {step_time:>10.1f}  "
            f"{engine.n_synapses:>12,}"
        )

    print("=" * 60)
