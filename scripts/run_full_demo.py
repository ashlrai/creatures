#!/usr/bin/env python3
"""Full Neurevo platform demonstration.

Showcases every major capability on your M5 Max:
  1. Full Drosophila brain (136K neurons, 5.1M synapses) at 800+ FPS
  2. Consciousness metrics on a real fly brain
  3. Learning ecosystem (1K organisms with STDP)
  4. Consciousness evolution (evolving for Φ)
  5. Massive ecosystem (100K organisms, 10M neurons)

Run: python scripts/run_full_demo.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

_project_root = Path(__file__).resolve().parents[1]
_core_root = _project_root / "creatures-core"
for p in (_project_root, _core_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import logging
logging.basicConfig(level=logging.WARNING)


def banner(title: str) -> None:
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


def demo_full_fly_brain():
    """Demo 1: Full fruit fly brain running on your laptop."""
    banner("DEMO 1: FULL DROSOPHILA BRAIN (136K neurons)")

    from creatures.connectome.flywire import load
    from creatures.neural.vectorized_engine import VectorizedEngine, NeuronModel

    t0 = time.perf_counter()
    connectome = load(neuropils=None)
    load_time = time.perf_counter() - t0

    engine = VectorizedEngine(use_gpu=True, neuron_model=NeuronModel.IZHIKEVICH)
    engine.build_single_connectome(connectome)

    # Warm up
    for _ in range(5):
        engine.step()

    # Benchmark
    t0 = time.perf_counter()
    n_steps = 200
    for _ in range(n_steps):
        engine.step()
    step_ms = (time.perf_counter() - t0) / n_steps * 1000

    # Stimulus test
    engine.inject_stimulus([0], list(range(1000)), 20.0)
    for _ in range(50):
        stats = engine.step()
    engine.clear_input()

    mem_mb = (engine.n_total * 4 * 6 + engine.n_synapses * 4 * 3) / 1e6

    print(f"  Neurons:  {engine.n_total:>10,}")
    print(f"  Synapses: {engine.n_synapses:>10,}")
    print(f"  Step:     {step_ms:>10.2f} ms")
    print(f"  FPS:      {1000/step_ms:>10.0f}")
    print(f"  Memory:   {mem_mb:>10.1f} MB")
    print(f"  Load:     {load_time:>10.1f} s")
    print(f"  Backend:  {engine._backend}")
    print(f"  Model:    {engine._neuron_model.value}")


def demo_consciousness():
    """Demo 2: Consciousness metrics on a real fly brain circuit."""
    banner("DEMO 2: CONSCIOUSNESS METRICS (Fly Locomotion Circuit)")

    from creatures.connectome.flywire import load
    from creatures.neural.vectorized_engine import VectorizedEngine, NeuronModel
    from creatures.neural.consciousness import compute_all_consciousness_metrics
    import mlx.core as mx

    connectome = load(neuropils="locomotion_compact")
    engine = VectorizedEngine(use_gpu=True, neuron_model=NeuronModel.IZHIKEVICH)
    engine.build_single_connectome(connectome)

    rng = np.random.default_rng(42)
    for step_i in range(4000):
        noise = np.zeros(engine.n_total, dtype=np.float32)
        noise[rng.choice(engine.n_total, max(1, engine.n_total // 10), replace=False)] = \
            rng.uniform(8, 20, max(1, engine.n_total // 10)).astype(np.float32)
        phase = step_i * 0.5 * 2 * np.pi / 80
        q_size = max(1, engine.n_total // 4)
        for q in range(4):
            s, e = q * q_size, min((q + 1) * q_size, engine.n_total)
            noise[s:e] += 10.0 * (1 + np.sin(phase + q * np.pi / 2))
        engine.I_ext = mx.array(noise)
        engine.step()

    indices, times = engine.get_spike_history()

    t0 = time.perf_counter()
    report = compute_all_consciousness_metrics(
        np.array(indices), np.array(times), engine.n_total, 2000.0,
        bin_ms=5.0, top_k=25,
    )
    elapsed = time.perf_counter() - t0

    print(f"  Neurons:    {engine.n_total:,}")
    print(f"  Spikes:     {len(indices):,}")
    print(f"  Compute:    {elapsed:.2f}s")
    print(f"  Φ (IIT):    {report.phi:.4f}")
    print(f"  CN:         {report.neural_complexity:.4f}")
    print(f"  PCI:        {report.pci:.4f}")
    print(f"  Ignitions:  {len(report.ignition_events)} ({report.ignition_rate:.0f}/s)")


def demo_learning_ecosystem():
    """Demo 3: Organisms learning via STDP in real-time."""
    banner("DEMO 3: LEARNING ECOSYSTEM (STDP + Izhikevich)")

    from creatures.neural.vectorized_engine import NeuronModel
    from creatures.environment.brain_world import BrainWorld

    world = BrainWorld(
        n_organisms=1_000,
        neurons_per_organism=100,
        use_gpu=True,
        neuron_model=NeuronModel.IZHIKEVICH,
        enable_stdp=True,
        enable_consciousness=True,
        consciousness_interval=200,
    )

    w_before = world.engine._to_numpy(world.engine.syn_w).copy()

    t0 = time.perf_counter()
    phi_values = []
    for i in range(500):
        stats = world.step()
        if "consciousness" in stats:
            phi_values.append(stats["consciousness"]["phi"])

    elapsed = time.perf_counter() - t0
    w_after = world.engine._to_numpy(world.engine.syn_w)
    n_changed = int((abs(w_after - w_before) > 0.001).sum())

    print(f"  Organisms:  {world.engine.n_organisms:,}")
    print(f"  Neurons:    {world.engine.n_total:,}")
    print(f"  Synapses:   {world.engine.n_synapses:,}")
    print(f"  FPS:        {500 / elapsed:.0f}")
    print(f"  STDP changes: {n_changed:,}/{len(w_before):,} ({n_changed/len(w_before)*100:.1f}%)")
    if phi_values:
        print(f"  Φ range:    [{min(phi_values):.4f}, {max(phi_values):.4f}]")


def demo_consciousness_evolution():
    """Demo 4: Evolving neural networks for consciousness."""
    banner("DEMO 4: CONSCIOUSNESS EVOLUTION")

    from creatures.connectome.openworm import load
    from creatures.evolution.fitness import FitnessConfig, evaluate_genome_vectorized
    from creatures.evolution.genome import Genome
    from creatures.evolution.mutation import MutationConfig
    from creatures.evolution.population import PopulationConfig, Population

    connectome = load()
    seed_genome = Genome.from_connectome(connectome)

    fitness_config = FitnessConfig(w_consciousness=1.0, lifetime_ms=300)
    mutation_config = MutationConfig(iz_perturb_rate=0.1)
    pop_config = PopulationConfig(size=10, elitism=1, tournament_size=3)

    population = Population(pop_config, seed_genome, mutation_config)
    population.initialize()

    print(f"  Organism:   C. elegans ({connectome.n_neurons} neurons)")
    print(f"  Population: 10 | Generations: 3")
    print(f"  {'Gen':>4} {'Best':>8} {'Φ_best':>8} {'Φ_mean':>8}")
    print(f"  {'-'*32}")

    for gen in range(3):
        t0 = time.perf_counter()
        population.evaluate(
            lambda g: evaluate_genome_vectorized(g, fitness_config, use_gpu=True, neuron_model="izhikevich")
        )
        phis = [g.metadata.get("fitness_breakdown", {}).get("phi", 0) for g in population.genomes]
        best = max(g.fitness for g in population.genomes)
        print(f"  {gen:>4} {best:>8.1f} {max(phis):>8.4f} {np.mean(phis):>8.4f}  "
              f"({time.perf_counter()-t0:.1f}s)")
        population.advance_generation()


def demo_massive_ecosystem():
    """Demo 5: 100K organisms, 10M neurons."""
    banner("DEMO 5: MASSIVE ECOSYSTEM (100K organisms)")

    from creatures.neural.vectorized_engine import NeuronModel
    from creatures.environment.brain_world import BrainWorld

    world = BrainWorld(
        n_organisms=100_000,
        neurons_per_organism=100,
        use_gpu=True,
        neuron_model=NeuronModel.IZHIKEVICH,
    )

    for _ in range(3):
        world.step()

    t0 = time.perf_counter()
    n_test = 10
    for _ in range(n_test):
        stats = world.step()
    elapsed = (time.perf_counter() - t0) / n_test * 1000

    state = world.get_state()
    print(f"  Organisms:  {state['n_total']:,}")
    print(f"  Neurons:    {world.engine.n_total:,}")
    print(f"  Synapses:   {world.engine.n_synapses:,}")
    print(f"  Step:       {elapsed:.0f}ms")
    print(f"  FPS:        {1000/elapsed:.1f}")
    print(f"  Backend:    {world.engine._backend}")
    print(f"  Alive:      {state['n_alive']:,}")


def demo_neural_development():
    """Demo 6: Grow a brain from progenitor cells."""
    banner("DEMO 6: NEURAL DEVELOPMENT (Grow a Brain)")

    from creatures.development.engine import DevelopmentEngine, DevelopmentConfig

    config = DevelopmentConfig(target_neurons=200, initial_progenitors=8)
    dev = DevelopmentEngine(config)

    t0 = time.perf_counter()
    dev.run(n_steps=600, verbose=False)
    elapsed = time.perf_counter() - t0

    state = dev.get_state()
    connectome = dev.to_connectome()

    print(f"  Started:    8 progenitor cells")
    print(f"  Grew to:    {state['n_neurons']} neurons, {state['n_synapses']} synapses")
    print(f"  Stable:     {state['n_stable_synapses']} ({state['n_stable_synapses']*100//max(state['n_synapses'],1)}%)")
    print(f"  Time:       {elapsed:.1f}s")
    print(f"  Connectome: {connectome.n_neurons} neurons, {len(connectome.synapses)} synapses")


def main():
    print("\n" + "=" * 70)
    print("  NEUREVO PLATFORM DEMONSTRATION")
    print("  M5 Max + 128GB RAM + MLX GPU Acceleration")
    print("=" * 70)

    demos = [
        ("Full Fly Brain", demo_full_fly_brain),
        ("Consciousness Metrics", demo_consciousness),
        ("Learning Ecosystem", demo_learning_ecosystem),
        ("Consciousness Evolution", demo_consciousness_evolution),
        ("Massive Ecosystem", demo_massive_ecosystem),
        ("Neural Development", demo_neural_development),
    ]

    total_t0 = time.perf_counter()
    for name, fn in demos:
        try:
            fn()
        except Exception as e:
            print(f"\n  ERROR in {name}: {e}")

    total = time.perf_counter() - total_t0
    banner(f"ALL DEMOS COMPLETE ({total:.0f}s)")


if __name__ == "__main__":
    main()
