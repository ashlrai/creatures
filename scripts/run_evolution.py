#!/usr/bin/env python3
"""Run headless evolution of neural-network organisms.

This is the core scientific tool for running overnight evolution experiments.
It loads a biological connectome, seeds a population of mutated genomes,
and evolves them over many generations using either a fast topology proxy
or full Brian2+MuJoCo simulation for fitness evaluation.

Usage:
    python scripts/run_evolution.py --fast --generations 5 --population 10
    python scripts/run_evolution.py --fitness medium --generations 50 --population 30
    python scripts/run_evolution.py --fitness full --generations 10 --population 5
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import uuid
from dataclasses import asdict
from pathlib import Path

import numpy as np

# Ensure project root is on sys.path so `creatures` package is importable
_project_root = Path(__file__).resolve().parents[1]
_core_root = _project_root / "creatures-core"
for p in (_project_root, _core_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from creatures.god.narrator import EvolutionNarrator, WorldLog
from creatures.evolution.analytics import analyze_drift, summarize_evolution
from creatures.evolution.config import EvolutionConfig
from creatures.evolution.fitness import (
    FitnessConfig,
    evaluate_genome,
    evaluate_genome_fast,
    evaluate_genome_medium,
)
from creatures.evolution.genome import Genome
from creatures.evolution.mutation import MutationConfig
from creatures.evolution.population import GenerationStats, Population, PopulationConfig
from creatures.evolution.storage import EvolutionStore, GenerationRecord

logger = logging.getLogger("run_evolution")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run headless evolution of neural-network organisms.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--organism",
        default="c_elegans",
        help="Organism template to evolve (default: c_elegans)",
    )
    parser.add_argument(
        "--generations",
        type=int,
        default=50,
        help="Number of generations to run (default: 50)",
    )
    parser.add_argument(
        "--population",
        type=int,
        default=30,
        help="Population size (default: 30)",
    )
    # New --fitness flag replaces --fast
    parser.add_argument(
        "--fitness",
        choices=["fast", "medium", "full"],
        default=None,
        help="Fitness evaluation mode: fast (~0.01s/genome), medium (~5-10s/genome), full (~200s+/genome)",
    )
    # Keep --fast for backward compatibility
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Shortcut for --fitness fast (backward compat)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="evolution_results",
        help="Directory for output files (default: evolution_results/)",
    )
    parser.add_argument(
        "--elitism",
        type=int,
        default=3,
        help="Number of elite genomes preserved each generation (default: 3)",
    )
    parser.add_argument(
        "--crossover-rate",
        type=float,
        default=0.3,
        help="Crossover probability (default: 0.3)",
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Use multiprocessing for parallel genome evaluation",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of worker processes for --parallel (default: 4)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )
    # God Agent flags
    parser.add_argument(
        "--god",
        action="store_true",
        help="Enable the God Agent to observe and intervene during evolution",
    )
    parser.add_argument(
        "--xai-api-key",
        type=str,
        default=None,
        help="xAI API key for God Agent AI mode (or set XAI_API_KEY env var). Falls back to heuristics if not provided.",
    )
    parser.add_argument(
        "--god-interval",
        type=int,
        default=10,
        help="God Agent intervention interval in generations (default: 10)",
    )
    return parser.parse_args(argv)


def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Quiet noisy libraries
    logging.getLogger("h5py").setLevel(logging.WARNING)
    logging.getLogger("numba").setLevel(logging.WARNING)


def resolve_fitness_mode(args: argparse.Namespace) -> str:
    """Resolve the fitness mode from --fitness and --fast flags."""
    if args.fitness is not None:
        return args.fitness
    if args.fast:
        return "fast"
    return "fast"  # default to fast for interactive use


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    setup_logging(args.verbose)

    fitness_mode = resolve_fitness_mode(args)

    run_id = str(uuid.uuid4())[:8]
    output_dir = Path(args.output_dir) / f"run_{run_id}"
    output_dir.mkdir(parents=True, exist_ok=True)

    mode_labels = {
        "fast": "FAST (topology + weight analysis, <0.01s/genome)",
        "medium": "MEDIUM (Brian2 100ms neural sim, ~5-10s/genome)",
        "full": "FULL (Brian2 + MuJoCo coupled sim, ~200s+/genome)",
    }
    mode_str = mode_labels[fitness_mode]

    print(f"\n{'=' * 65}")
    print(f"  Creatures Evolution Pipeline")
    print(f"{'=' * 65}")
    print(f"  Run ID:       {run_id}")
    print(f"  Organism:     {args.organism}")
    print(f"  Generations:  {args.generations}")
    print(f"  Population:   {args.population}")
    print(f"  Fitness mode: {mode_str}")
    print(f"  Seed:         {args.seed}")
    if args.parallel:
        print(f"  Parallel:     {args.workers} workers")
    print(f"  Output:       {output_dir}")
    if args.god:
        print(f"  God Agent:    ENABLED (interval={args.god_interval})")
    print(f"{'=' * 65}\n")

    # --- Load connectome ---
    logger.info("Loading %s connectome...", args.organism)
    t0 = time.time()
    if args.organism == "c_elegans":
        from creatures.connectome.openworm import load as load_connectome
        connectome = load_connectome("edge_list")
    elif args.organism == "drosophila":
        from creatures.connectome.flywire import load as load_fly
        connectome = load_fly("locomotion", max_neurons=500, min_synapse_count=5)
    elif args.organism == "zebrafish":
        from creatures.connectome.zebrafish import load as load_zebrafish
        connectome = load_zebrafish(circuit="mauthner")
    else:
        raise ValueError(f"Unknown organism: {args.organism}")
    t_load = time.time() - t0
    print(f"Connectome loaded: {len(connectome.neurons)} neurons, "
          f"{len(connectome.synapses)} synapses ({t_load:.2f}s)")

    # --- Create seed genome ---
    seed_genome = Genome.from_connectome(connectome)
    template_genome = seed_genome.clone()  # keep pristine copy for drift analysis
    template_genome.fitness = 0.0
    print(f"Seed genome: {seed_genome.n_neurons} neurons, {seed_genome.n_synapses} synapses\n")

    # --- Configure population ---
    pop_config = PopulationConfig(
        size=args.population,
        elitism=min(args.elitism, args.population),
        tournament_size=min(5, args.population),
        crossover_rate=args.crossover_rate,
        seed=args.seed,
    )
    mutation_config = MutationConfig()
    population = Population(pop_config, seed_genome, mutation_config)

    # --- Choose fitness function ---
    if fitness_mode == "fast":
        eval_fn = lambda g: evaluate_genome_fast(g)  # fast is organism-agnostic (topology only)
    elif fitness_mode == "medium":
        eval_fn = lambda g: evaluate_genome_medium(g, FitnessConfig(organism=args.organism))
    else:
        fitness_config = FitnessConfig(organism=args.organism)
        eval_fn = lambda g: evaluate_genome(g, fitness_config)

    # --- Setup storage ---
    db_path = output_dir / "evolution.db"
    store = EvolutionStore(db_path)
    config_dict = {
        "organism": args.organism,
        "generations": args.generations,
        "population": args.population,
        "fitness_mode": fitness_mode,
        "seed": args.seed,
        "elitism": pop_config.elitism,
        "crossover_rate": pop_config.crossover_rate,
        "mutation": asdict(mutation_config),
        "parallel": args.parallel,
        "workers": args.workers if args.parallel else 1,
    }
    store.create_run(run_id, args.organism, config_dict)

    # --- God Agent setup ---
    god_agent = None
    god_config = None
    if args.god:
        from creatures.god.agent import GodAgent, GodConfig
        god_config = GodConfig(
            api_key=args.xai_api_key,
            intervention_interval=args.god_interval,
        )
        god_agent = GodAgent(god_config)
        god_mode_str = "AI (xAI Grok)" if god_config.api_key else "Heuristic fallback"
        print(f"God Agent active: {god_mode_str} mode\n")

    # --- Narrator setup ---
    narrator = EvolutionNarrator()
    world_log = WorldLog()

    # --- Initialize population ---
    logger.info("Initializing population of %d...", args.population)
    population.initialize()

    # --- Evolution loop ---
    fitness_history: list[dict] = []
    best_genomes_per_gen: list[Genome] = []
    total_start = time.time()

    # Print header for generation table
    print(f"{'Gen':>5} {'Best':>8} {'Mean':>8} {'Worst':>8} {'Std':>7} "
          f"{'Species':>7} {'Synapses':>10} {'TopChg':>6} {'Time':>6}")
    print("-" * 78)

    prev_best_synapses = None

    for gen in range(args.generations):
        gen_start = time.time()

        # Evaluate
        if args.parallel:
            population.evaluate(parallel=True, n_workers=args.workers, mode=fitness_mode, organism=args.organism)
        else:
            population.evaluate(eval_fn)

        # Collect stats before advancing
        fitnesses = np.array([g.fitness for g in population.genomes])
        best_fitness = float(np.max(fitnesses))
        mean_fitness = float(np.mean(fitnesses))
        worst_fitness = float(np.min(fitnesses))
        std_fitness = float(np.std(fitnesses))
        best_genome = population.best_genome()

        # Track topology changes
        cur_synapses = int(np.mean([g.n_synapses for g in population.genomes]))
        if prev_best_synapses is not None:
            topo_change = cur_synapses - prev_best_synapses
            topo_str = f"{topo_change:+d}"
        else:
            topo_str = "--"
        prev_best_synapses = cur_synapses

        gen_elapsed = time.time() - gen_start

        # Print progress row
        print(f"{gen + 1:>5} {best_fitness:>8.1f} {mean_fitness:>8.1f} "
              f"{worst_fitness:>8.1f} {std_fitness:>7.2f} "
              f"{len(population.species):>7} {cur_synapses:>10} "
              f"{topo_str:>6} {gen_elapsed:>5.1f}s")

        # Narrate this generation
        prev_gen_stats = fitness_history[-1] if fitness_history else None
        events = narrator.narrate_generation(
            stats={
                "generation": gen,
                "best_fitness": best_fitness,
                "mean_fitness": mean_fitness,
                "std_fitness": std_fitness,
                "n_species": len(population.species),
                "population_size": args.population,
                "prev_best": prev_gen_stats.get("best_fitness", 0) if prev_gen_stats else 0,
                "prev_mean": prev_gen_stats.get("mean_fitness", 0) if prev_gen_stats else 0,
            },
            prev_stats=prev_gen_stats,
            organism=args.organism,
        )
        for event in events:
            world_log.add_event(event)
            print(f"  {event.icon} {event.title}")

        # God Agent: observe every generation, intervene at interval
        if god_agent is not None:
            god_agent.observe(
                generation_stats={
                    "generation": gen,
                    "best_fitness": best_fitness,
                    "mean_fitness": mean_fitness,
                    "std_fitness": std_fitness,
                    "n_species": len(population.species),
                },
                population_summary={
                    "size": args.population,
                    "n_neurons_mean": float(np.mean([g.n_neurons for g in population.genomes])),
                    "n_synapses_mean": float(np.mean([g.n_synapses for g in population.genomes])),
                },
                environment_state={},
            )
            if (gen + 1) % god_config.intervention_interval == 0:
                import asyncio
                try:
                    loop = asyncio.get_running_loop()
                    future = asyncio.run_coroutine_threadsafe(god_agent.analyze_and_intervene(), loop)
                    intervention = future.result(timeout=30)
                except RuntimeError:
                    intervention = asyncio.run(god_agent.analyze_and_intervene())
                applied = god_agent.apply_interventions(
                    intervention,
                    mutation_config=mutation_config,
                    population=population,
                )
                if applied:
                    for desc in applied:
                        print(f"  [GOD] {desc}")
                    # Narrate the intervention
                    intervention_text = narrator.narrate_intervention(intervention, organism=args.organism)
                    # The narrator internally logs a WorldEvent to narrator.world_log;
                    # also add it to our external world_log
                    if narrator.world_log.events:
                        latest_ev = narrator.world_log.events[-1]
                        world_log.add_event(latest_ev)
                        print(f"  {latest_ev.icon} {latest_ev.title}")
                else:
                    analysis = intervention.get("analysis", "No analysis")
                    print(f"  [GOD] {analysis}")

        # Record
        gen_record = GenerationRecord(
            run_id=run_id,
            generation=gen,
            best_fitness=best_fitness,
            mean_fitness=mean_fitness,
            std_fitness=std_fitness,
            n_species=len(population.species),
            n_neurons_mean=float(np.mean([g.n_neurons for g in population.genomes])),
            n_synapses_mean=float(np.mean([g.n_synapses for g in population.genomes])),
            best_genome_id=best_genome.id,
            elapsed_seconds=gen_elapsed,
        )
        store.save_generation(gen_record)

        fitness_history.append({
            "generation": gen,
            "best_fitness": best_fitness,
            "mean_fitness": mean_fitness,
            "worst_fitness": worst_fitness,
            "std_fitness": std_fitness,
            "n_species": len(population.species),
            "elapsed_seconds": gen_elapsed,
        })

        # Save best genome snapshot for analytics
        best_clone = best_genome.clone()
        best_clone.fitness = best_genome.fitness
        best_genomes_per_gen.append(best_clone)

        # Advance to next generation (selection + crossover + mutation)
        if gen < args.generations - 1:
            population.advance_generation()

    total_elapsed = time.time() - total_start

    # --- Post-evolution analysis ---
    print(f"\n{'=' * 78}")
    print(f"Evolution completed in {total_elapsed:.1f}s")
    print("Running analysis...\n")

    # Save best genome as HDF5
    final_best = population.best_genome()
    best_h5_path = output_dir / "best_genome.h5"
    final_best.save(best_h5_path)
    store.save_genome(final_best, run_id, str(output_dir))
    logger.info("Best genome saved to %s", best_h5_path)

    # Evaluate template genome for baseline fitness
    eval_fn(template_genome)

    # Drift analysis
    drift = analyze_drift(template_genome, final_best)

    # Full summary
    summary = summarize_evolution(template_genome, best_genomes_per_gen)

    # Print scientific summary
    initial_fitness = fitness_history[0]["best_fitness"]
    final_fitness = fitness_history[-1]["best_fitness"]
    improvement_pct = ((final_fitness - initial_fitness) / max(abs(initial_fitness), 1e-6)) * 100

    print(f"{'=' * 45}")
    print(f"  Evolution Summary")
    print(f"{'=' * 45}")
    print(f"  Fitness mode:           {fitness_mode}")
    print(f"  Generations:            {args.generations}")
    print(f"  Population:             {args.population}")
    print(f"  Total time:             {total_elapsed:.1f}s")
    print(f"  Avg time/generation:    {total_elapsed / args.generations:.2f}s")
    print(f"  ")
    print(f"  Initial best fitness:   {initial_fitness:.2f}")
    print(f"  Final best fitness:     {final_fitness:.2f}")
    print(f"  Improvement:            {improvement_pct:+.1f}%")
    print(f"  Final mean fitness:     {fitness_history[-1]['mean_fitness']:.2f}")
    print(f"  Final std fitness:      {fitness_history[-1]['std_fitness']:.2f}")
    print(f"  ")
    print(f"  Connections preserved:  {drift.preserved_fraction * 100:.1f}%")
    print(f"  Connections modified:   {drift.modified_weight_fraction * 100:.1f}%")
    print(f"  Novel connections:      {drift.novel_synapses}")
    print(f"  Deleted connections:    {drift.deleted_synapses}")
    print(f"  Novel neurons:          {drift.novel_neurons}")
    print(f"  Template neurons:       {template_genome.n_neurons}")
    print(f"  Evolved neurons:        {final_best.n_neurons}")
    print(f"  Template synapses:      {template_genome.n_synapses}")
    print(f"  Evolved synapses:       {final_best.n_synapses}")
    if god_agent is not None:
        god_mode_label = "AI" if god_config.api_key else "Heuristic"
        print(f"  God Agent mode:         {god_mode_label}")
        print(f"  God observations:       {len(god_agent.observations)}")
        print(f"  God interventions:      {len(god_agent.history)}")
        if god_agent.history:
            last = god_agent.history[-1]
            print(f"  Last analysis:          {last.get('analysis', 'N/A')[:60]}")
    print(f"{'=' * 45}\n")

    # Save fitness history as JSON
    history_path = output_dir / "fitness_history.json"
    with open(history_path, "w") as f:
        json.dump(fitness_history, f, indent=2)
    logger.info("Fitness history saved to %s", history_path)

    # Save full results.json for frontend consumption
    results = {
        "run_id": run_id,
        "organism": args.organism,
        "config": config_dict,
        "total_elapsed_seconds": total_elapsed,
        "summary": summary,
        "drift": {
            "preserved_fraction": drift.preserved_fraction,
            "modified_weight_fraction": drift.modified_weight_fraction,
            "novel_synapses": drift.novel_synapses,
            "deleted_synapses": drift.deleted_synapses,
            "novel_neurons": drift.novel_neurons,
            "total_weight_change": drift.total_weight_change,
        },
        "fitness_history": fitness_history,
        "best_genome": {
            "id": final_best.id,
            "generation": final_best.generation,
            "fitness": final_best.fitness,
            "n_neurons": final_best.n_neurons,
            "n_synapses": final_best.n_synapses,
            "hdf5_path": str(best_h5_path),
        },
        "world_log": world_log.to_dict_list(),
        "god_report": {
            "mode": "ai" if (god_config and god_config.api_key) else "fallback",
            "n_observations": len(god_agent.observations) if god_agent else 0,
            "n_interventions": len(god_agent.history) if god_agent else 0,
            "history": god_agent.history if god_agent else [],
            "report": god_agent.get_report() if god_agent else None,
        } if god_agent is not None else None,
    }
    results_path = output_dir / "results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {results_path}")

    # Finalize
    store.update_run_status(run_id, "completed")
    store.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
