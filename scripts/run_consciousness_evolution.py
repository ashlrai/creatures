#!/usr/bin/env python3
"""Evolve neural networks for consciousness (Φ).

The world's first platform that evolves spiking neural networks using
Integrated Information (Φ) as a fitness signal. Uses:
  - MLX GPU acceleration (Apple Silicon)
  - Izhikevich neuron model with evolvable per-neuron (a,b,c,d) parameters
  - Real biological connectome topology (C. elegans or Drosophila)
  - Consciousness metrics: Φ (IIT), Neural Complexity, PCI

Usage:
    python scripts/run_consciousness_evolution.py
    python scripts/run_consciousness_evolution.py --organism drosophila --neuropils locomotion_compact
    python scripts/run_consciousness_evolution.py --generations 100 --population 30 --w-consciousness 2.0
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np

# Ensure project root is on sys.path
_project_root = Path(__file__).resolve().parents[1]
_core_root = _project_root / "creatures-core"
for p in (_project_root, _core_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from creatures.evolution.fitness import FitnessConfig, evaluate_genome_vectorized
from creatures.evolution.genome import Genome
from creatures.evolution.mutation import MutationConfig, mutate
from creatures.evolution.population import PopulationConfig, Population
from creatures.neural.consciousness import compute_all_consciousness_metrics

logger = logging.getLogger("consciousness_evolution")


def load_connectome(organism: str, neuropils: str | None = None):
    """Load the appropriate connectome."""
    if organism == "drosophila":
        from creatures.connectome.flywire import load
        return load(neuropils=neuropils)
    else:
        from creatures.connectome.openworm import load
        return load()


def run_evolution(args: argparse.Namespace) -> None:
    """Run consciousness-optimizing evolution."""
    # Setup
    connectome = load_connectome(args.organism, args.neuropils)
    logger.info(
        f"Connectome: {connectome.n_neurons} neurons, "
        f"{len(connectome.synapses)} synapses ({args.organism})"
    )

    fitness_config = FitnessConfig(
        organism=args.organism,
        lifetime_ms=args.lifetime_ms,
        w_consciousness=args.w_consciousness,
        w_efficiency=0.5,
        w_distance=0.0,  # No body — pure neural evolution
    )

    mutation_config = MutationConfig(
        iz_perturb_rate=args.iz_mutation_rate,
        weight_perturb_sigma=0.3,
    )

    pop_config = PopulationConfig(
        size=args.population,
        elitism=max(1, args.population // 10),
        tournament_size=3,
    )

    # Initialize population from connectome
    seed_genome = Genome.from_connectome(connectome)
    population = Population(pop_config, seed_genome, mutation_config)
    population.initialize()

    logger.info(
        f"Population: {args.population} organisms, "
        f"evolving for {args.generations} generations"
    )
    logger.info(
        f"Fitness weights: consciousness={args.w_consciousness}, "
        f"efficiency={fitness_config.w_efficiency}"
    )

    # Evolution loop
    results_dir = _project_root / "evolution_results" / f"consciousness_{int(time.time())}"
    results_dir.mkdir(parents=True, exist_ok=True)

    best_phi_ever = 0.0
    history = []

    print("\n" + "=" * 70)
    print("CONSCIOUSNESS EVOLUTION")
    print(f"Organism: {args.organism} ({connectome.n_neurons} neurons)")
    print(f"Population: {args.population} | Generations: {args.generations}")
    print(f"Φ weight: {args.w_consciousness} | Iz mutation: {args.iz_mutation_rate}")
    print("=" * 70)
    print(f"\n{'Gen':>4} {'Best':>8} {'Mean':>8} {'Φ_best':>8} {'Φ_mean':>8} "
          f"{'Diversity':>8} {'Time':>6}")
    print("-" * 60)

    for gen in range(args.generations):
        t0 = time.perf_counter()

        # Evaluate all genomes
        def eval_fn(genome: Genome) -> float:
            return evaluate_genome_vectorized(
                genome, fitness_config,
                use_gpu=True, neuron_model="izhikevich",
            )

        population.evaluate(eval_fn)

        # Collect stats
        fitnesses = [g.fitness for g in population.genomes]
        phis = [g.metadata.get("fitness_breakdown", {}).get("phi", 0.0)
                for g in population.genomes]

        best_fitness = max(fitnesses)
        mean_fitness = np.mean(fitnesses)
        best_phi = max(phis)
        mean_phi = np.mean(phis)
        best_phi_ever = max(best_phi_ever, best_phi)

        # Compute Izhikevich parameter diversity (use fixed-length genomes only)
        try:
            base_len = len(population.genomes[0].iz_a) if population.genomes[0].iz_a is not None else 0
            same_len = [g for g in population.genomes if g.iz_a is not None and len(g.iz_a) == base_len]
            if len(same_len) > 1:
                all_a = np.array([g.iz_a for g in same_len])
                param_diversity = float(np.mean(np.std(all_a, axis=0)))
            else:
                param_diversity = 0.0
        except Exception:
            param_diversity = 0.0

        elapsed = time.perf_counter() - t0

        print(f"{gen:>4} {best_fitness:>8.1f} {mean_fitness:>8.1f} "
              f"{best_phi:>8.4f} {mean_phi:>8.4f} {param_diversity:>8.4f} "
              f"{elapsed:>5.1f}s")

        history.append({
            "generation": gen,
            "best_fitness": float(best_fitness),
            "mean_fitness": float(mean_fitness),
            "best_phi": float(best_phi),
            "mean_phi": float(mean_phi),
            "param_diversity": float(param_diversity),
            "elapsed_s": float(elapsed),
        })

        # Advance generation
        population.advance_generation()

    # Final report
    best_genome = max(population.genomes, key=lambda g: g.fitness)

    print("\n" + "=" * 70)
    print("EVOLUTION COMPLETE")
    print(f"Best fitness: {best_genome.fitness:.1f}")
    print(f"Best Φ ever: {best_phi_ever:.4f}")

    # Run full consciousness analysis on best genome
    print("\n--- Full consciousness analysis of best genome ---")
    from creatures.neural.vectorized_engine import NeuronModel, VectorizedEngine
    engine = VectorizedEngine(use_gpu=True, neuron_model=NeuronModel.IZHIKEVICH)
    best_connectome = best_genome.to_connectome()
    engine.build_single_connectome(best_connectome)

    if best_genome.iz_a is not None:
        xp = engine.xp
        np_dtype = np.float32 if engine._backend == "mlx" else np.float64
        engine.iz_a = xp.array(best_genome.iz_a.astype(np_dtype))
        engine.iz_b = xp.array(best_genome.iz_b.astype(np_dtype))
        engine.iz_c = xp.array(best_genome.iz_c.astype(np_dtype))
        engine.iz_d = xp.array(best_genome.iz_d.astype(np_dtype))
        engine._eval(engine.iz_a, engine.iz_b, engine.iz_c, engine.iz_d)

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
        engine.I_ext = engine.xp.array(noise)
        engine.step()

    indices, times = engine.get_spike_history()
    report = compute_all_consciousness_metrics(
        np.array(indices), np.array(times), engine.n_total, 2000.0,
        bin_ms=5.0, top_k=25,
    )
    print(report.summary())

    # Save results
    with open(results_dir / "history.json", "w") as f:
        json.dump(history, f, indent=2)

    best_dict = best_genome.to_dict()
    with open(results_dir / "best_genome.json", "w") as f:
        json.dump(best_dict, f, indent=2, default=str)

    with open(results_dir / "consciousness_report.json", "w") as f:
        json.dump({
            "phi": report.phi,
            "neural_complexity": report.neural_complexity,
            "pci": report.pci,
            "ignition_rate": report.ignition_rate,
            "n_ignitions": len(report.ignition_events),
            "summary": report.summary(),
        }, f, indent=2)

    print(f"\nResults saved to {results_dir}")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description="Evolve neural networks for consciousness (Φ)"
    )
    parser.add_argument("--organism", default="c_elegans",
                        choices=["c_elegans", "drosophila"])
    parser.add_argument("--neuropils", default=None,
                        help="Drosophila neuropil preset (e.g., locomotion_compact)")
    parser.add_argument("--generations", type=int, default=20)
    parser.add_argument("--population", type=int, default=20)
    parser.add_argument("--lifetime-ms", type=float, default=500.0)
    parser.add_argument("--w-consciousness", type=float, default=1.0,
                        help="Weight for Φ in fitness function (0=disable)")
    parser.add_argument("--iz-mutation-rate", type=float, default=0.1,
                        help="Fraction of neurons to mutate Izhikevich params per generation")
    parser.add_argument("--verbose", "-v", action="store_true")

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    run_evolution(args)


if __name__ == "__main__":
    main()
