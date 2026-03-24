"""Benchmark script for Creatures neural simulation engine.

Profiles Brian2Engine build time, step time, and memory usage across
varying connectome scales and codegen backends.

Usage:
    python -m creatures.neural.benchmark
"""

from __future__ import annotations

import json
import random
import resource
import sys
import time

import numpy as np

from creatures.connectome.types import Connectome, Neuron, NeuronType, Synapse, SynapseType
from creatures.neural.base import MonitorConfig, NeuralConfig
from creatures.neural.brian2_engine import Brian2Engine

NEURON_COUNTS = [100, 300, 1000, 3000, 10000]
BACKENDS = ["numpy", "cython"]
DENSITY = 0.04
EXCITATORY_RATIO = 0.8
N_STEPS = 50
STEP_DURATION_MS = 1.0


def generate_connectome(n_neurons: int, seed: int = 42) -> Connectome:
    """Generate a random LIF-compatible connectome with ~4% density."""
    rng = random.Random(seed)
    np_rng = np.random.RandomState(seed)

    neuron_types = [NeuronType.SENSORY, NeuronType.INTER, NeuronType.MOTOR]
    neurons: dict[str, Neuron] = {}
    for i in range(n_neurons):
        is_excitatory = rng.random() < EXCITATORY_RATIO
        neurons[f"n{i}"] = Neuron(
            id=f"n{i}",
            neuron_type=rng.choice(neuron_types),
            neurotransmitter="ACh" if is_excitatory else "GABA",
        )

    # Generate sparse random connections at ~4% density
    n_possible = n_neurons * (n_neurons - 1)
    n_synapses = int(n_possible * DENSITY)
    synapses: list[Synapse] = []
    ids = list(neurons.keys())

    # Sample unique (pre, post) pairs
    pairs = set()
    while len(pairs) < n_synapses:
        pre = rng.randint(0, n_neurons - 1)
        post = rng.randint(0, n_neurons - 1)
        if pre != post and (pre, post) not in pairs:
            pairs.add((pre, post))

    weights = np_rng.lognormal(mean=0.0, sigma=0.5, size=len(pairs))
    for (pre, post), w in zip(pairs, weights):
        synapses.append(Synapse(
            pre_id=ids[pre],
            post_id=ids[post],
            weight=float(w),
            synapse_type=SynapseType.CHEMICAL,
        ))

    return Connectome(
        name=f"synthetic_{n_neurons}",
        neurons=neurons,
        synapses=synapses,
        metadata={"generated": True, "density": DENSITY},
    )


def benchmark_one(n_neurons: int, backend: str) -> dict | None:
    """Run a single benchmark and return results, or None on failure."""
    print(f"  n={n_neurons}, backend={backend} ... ", end="", flush=True)

    connectome = generate_connectome(n_neurons)
    config = NeuralConfig(codegen_target=backend)
    monitor = MonitorConfig(record_voltages=False)
    engine = Brian2Engine()

    # Build
    try:
        t0 = time.perf_counter()
        engine.build(connectome, config=config, monitor=monitor)
        build_s = time.perf_counter() - t0
    except Exception as e:
        print(f"SKIP (build failed: {e})")
        return None

    # Memory after build
    usage = resource.getrusage(resource.RUSAGE_SELF)
    memory_mb = usage.ru_maxrss / (1024 * 1024)  # bytes -> MB on macOS
    if sys.platform == "linux":
        memory_mb = usage.ru_maxrss / 1024  # KB -> MB on Linux

    # Step timing
    step_times = []
    try:
        for _ in range(N_STEPS):
            t0 = time.perf_counter()
            engine.step(STEP_DURATION_MS)
            step_times.append((time.perf_counter() - t0) * 1000)  # to ms
    except Exception as e:
        print(f"SKIP (step failed: {e})")
        return None

    step_ms = float(np.mean(step_times))
    print(f"build={build_s:.2f}s, step={step_ms:.2f}ms, mem={memory_mb:.1f}MB")

    return {
        "n_neurons": n_neurons,
        "backend": backend,
        "build_s": round(build_s, 4),
        "step_ms": round(step_ms, 4),
        "memory_mb": round(memory_mb, 1),
    }


def plot_results(results: list[dict]) -> None:
    """Save a comparison plot if matplotlib is available."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not available, skipping plot.")
        return

    fig, axes = plt.subplots(1, 3, figsize=(15, 5))

    for backend in BACKENDS:
        data = [r for r in results if r["backend"] == backend]
        if not data:
            continue
        ns = [r["n_neurons"] for r in data]
        axes[0].plot(ns, [r["build_s"] for r in data], "o-", label=backend)
        axes[1].plot(ns, [r["step_ms"] for r in data], "o-", label=backend)
        axes[2].plot(ns, [r["memory_mb"] for r in data], "o-", label=backend)

    for ax, title, ylabel in zip(
        axes,
        ["Build Time", "Mean Step Time (50 steps)", "Peak Memory RSS"],
        ["seconds", "milliseconds", "MB"],
    ):
        ax.set_xlabel("Neuron count")
        ax.set_ylabel(ylabel)
        ax.set_title(title)
        ax.set_xscale("log")
        ax.legend()
        ax.grid(True, alpha=0.3)

    fig.suptitle("Creatures Neural Engine Benchmark", fontsize=14)
    fig.tight_layout()
    fig.savefig("benchmark_results.png", dpi=150)
    print("Plot saved to benchmark_results.png")


def main() -> None:
    print("Creatures Neural Engine Benchmark")
    print("=" * 40)

    results: list[dict] = []
    for backend in BACKENDS:
        print(f"\nBackend: {backend}")
        for n in NEURON_COUNTS:
            result = benchmark_one(n, backend)
            if result is not None:
                results.append(result)

    # Output JSON to stdout
    output = json.dumps({"results": results}, indent=2)
    print(f"\n{output}")

    # Optional plot
    if results:
        plot_results(results)


if __name__ == "__main__":
    main()
