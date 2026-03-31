#!/usr/bin/env python
"""Run a long evolution experiment and analyze results.

This script runs the brain-world simulation for thousands of generations,
logging key metrics every N steps. Designed to run overnight on M5 Max.

Produces:
- Console output with progress
- HDF5 trajectory data (if h5py available)
- CSV summary of evolution metrics per generation
- Final report with fitness curves and lineage analysis

Usage:
    python scripts/run_evolution_experiment.py
    python scripts/run_evolution_experiment.py --steps 50000 --organisms 500
    python scripts/run_evolution_experiment.py --output-dir neurevo_data/experiment_001
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import numpy as np

# Ensure creatures-core is importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "creatures-core"))
sys.path.insert(0, str(ROOT / "creatures-api"))

from creatures.environment.brain_world import BrainWorld


def main():
    parser = argparse.ArgumentParser(description="Run Neurevo evolution experiment")
    parser.add_argument("--steps", type=int, default=20000, help="Total simulation steps")
    parser.add_argument("--organisms", type=int, default=300, help="Population size")
    parser.add_argument("--neurons", type=int, default=50, help="Neurons per organism")
    parser.add_argument("--arena-size", type=float, default=25.0, help="Arena size")
    parser.add_argument("--world-type", type=str, default="pond", help="World type")
    parser.add_argument("--log-interval", type=int, default=100, help="Steps between log entries")
    parser.add_argument("--output-dir", type=str, default="neurevo_data/experiments", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    run_id = f"evo_{timestamp}"
    run_dir = output_dir / run_id
    run_dir.mkdir(exist_ok=True)

    print(f"{'=' * 60}")
    print(f"NEUREVO EVOLUTION EXPERIMENT")
    print(f"{'=' * 60}")
    print(f"Run ID:      {run_id}")
    print(f"Steps:       {args.steps:,}")
    print(f"Organisms:   {args.organisms}")
    print(f"Neurons:     {args.neurons}")
    print(f"Arena:       {args.arena_size}")
    print(f"World:       {args.world_type}")
    print(f"Output:      {run_dir}")
    print(f"{'=' * 60}")
    print()

    # Save experiment config
    config = vars(args)
    config["run_id"] = run_id
    with open(run_dir / "config.json", "w") as f:
        json.dump(config, f, indent=2)

    # Create brain-world
    print("Initializing BrainWorld...")
    bw = BrainWorld(
        n_organisms=args.organisms,
        neurons_per_organism=args.neurons,
        arena_size=args.arena_size,
        world_type=args.world_type,
        seed=args.seed,
        enable_stdp=True,
    )
    eco = bw.ecosystem
    print(f"Ready: {bw.engine.n_total} neurons, {bw.engine.n_synapses} synapses, backend={bw.engine._backend}")
    print()

    # Warm up chemotaxis measurement
    bw.get_chemotaxis_index()

    # CSV logger
    csv_path = run_dir / "metrics.csv"
    csv_file = open(csv_path, "w", newline="")
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow([
        "step", "time_s", "population", "c_elegans", "drosophila",
        "max_generation", "mean_generation", "n_lineages",
        "mean_energy", "mean_age", "mean_food",
        "chemotaxis_index", "random_walk_baseline", "relative_chemotaxis",
        "mean_body_length", "mean_limb_count", "mean_speed_mult",
        "steps_per_second",
    ])

    # Run simulation
    t0 = time.time()
    t_last = t0

    print(f"{'Step':>7} | {'Gen':>4} | {'Pop':>5} | {'Ce':>4} {'Dm':>4} | {'Lin':>4} | {'E':>6} | {'relCI':>7} | {'BodyL':>5} {'Limbs':>5} | {'sps':>5}")
    print("-" * 90)

    for step in range(1, args.steps + 1):
        bw.step()

        if step % args.log_interval == 0:
            t_now = time.time()
            elapsed = t_now - t0
            interval_sps = args.log_interval / (t_now - t_last)
            t_last = t_now

            ci = bw.get_chemotaxis_index()
            n_alive = int(eco.alive.sum())

            if n_alive == 0:
                print(f"\nEXTINCTION at step {step}")
                break

            alive_mask = eco.alive
            max_gen = int(eco.generation[alive_mask].max())
            mean_gen = float(eco.generation[alive_mask].mean())
            n_lin = len(np.unique(eco.lineage_id[alive_mask]))
            mean_e = float(eco.energy[alive_mask].mean())
            mean_age = float(eco.age[alive_mask].mean())
            mean_food = float(eco.lifetime_food[alive_mask].mean())
            n_ce = int(((eco.species == 0) & alive_mask).sum())
            n_dm = int(((eco.species == 1) & alive_mask).sum())

            # Morphology stats
            alive_morph = eco.morphology[alive_mask]
            mean_bl = float(alive_morph[:, 0].mean())  # body_length
            mean_lc = float(alive_morph[:, 4].mean())  # limb_count
            mean_sm = float(alive_morph[:, 8].mean())  # speed_multiplier

            rel_ci = ci.get("relative_chemotaxis", 0)

            # Console output
            print(f"{step:7d} | {max_gen:4d} | {n_alive:5d} | {n_ce:4d} {n_dm:4d} | {n_lin:4d} | {mean_e:6.0f} | {rel_ci:+7.3f} | {mean_bl:5.2f} {mean_lc:5.1f} | {interval_sps:5.0f}")

            # CSV output
            csv_writer.writerow([
                step, f"{elapsed:.1f}", n_alive, n_ce, n_dm,
                max_gen, f"{mean_gen:.1f}", n_lin,
                f"{mean_e:.1f}", f"{mean_age:.1f}", f"{mean_food:.1f}",
                f"{ci['chemotaxis_index']:.4f}", f"{ci['random_walk_baseline']:.4f}", f"{rel_ci:.4f}",
                f"{mean_bl:.3f}", f"{mean_lc:.2f}", f"{mean_sm:.3f}",
                f"{interval_sps:.0f}",
            ])
            csv_file.flush()

    csv_file.close()
    total_time = time.time() - t0

    # Flush trajectories to HDF5
    try:
        h5_path = str(run_dir / "trajectories.h5")
        n_written = bw.flush_trajectories(h5_path)
        print(f"\nTrajectories saved: {n_written} samples → {h5_path}")
    except Exception as e:
        print(f"\nTrajectory save failed: {e}")

    # Final summary
    print(f"\n{'=' * 60}")
    print(f"EXPERIMENT COMPLETE")
    print(f"{'=' * 60}")
    print(f"Total steps:  {args.steps:,}")
    print(f"Total time:   {total_time:.0f}s ({total_time/60:.1f} min)")
    print(f"Speed:        {args.steps/total_time:.0f} steps/s")
    print(f"Output:       {run_dir}")
    print(f"  config.json   — experiment parameters")
    print(f"  metrics.csv   — per-step evolution metrics")
    print(f"  trajectories.h5 — organism trajectory data")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
