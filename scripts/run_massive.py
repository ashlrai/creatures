"""Run a massive-scale brain-world simulation.

Every organism has a spiking neural network brain. Sensory input from the
environment drives neural activity, and motor neuron output drives movement.

Usage:
    python scripts/run_massive.py --organisms 10000 --neurons 100 --steps 10000
    python scripts/run_massive.py --organisms 100000 --neurons 50 --steps 1000 --world soil
    python scripts/run_massive.py --organisms 1000 --neurons 100 --steps 500 --output results.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np

from creatures.environment.brain_world import BrainWorld
from creatures.environment.emergent_detector import EmergentBehaviorDetector


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a massive-scale brain-world simulation."
    )
    parser.add_argument(
        "--organisms", type=int, default=10_000,
        help="Number of organisms (default: 10000)",
    )
    parser.add_argument(
        "--neurons", type=int, default=100,
        help="Neurons per organism (default: 100)",
    )
    parser.add_argument(
        "--steps", type=int, default=1000,
        help="Number of simulation steps (default: 1000)",
    )
    parser.add_argument(
        "--world", type=str, default="soil",
        choices=["soil", "pond", "lab_plate"],
        help="World type (default: soil)",
    )
    parser.add_argument(
        "--arena", type=float, default=50.0,
        help="Arena size (default: 50.0)",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed (default: 42)",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Path to save results JSON (optional)",
    )
    args = parser.parse_args()

    total_neurons = args.organisms * args.neurons
    print("=" * 70)
    print("BrainWorld Massive Simulation")
    print("=" * 70)
    print(f"  Organisms:      {args.organisms:>12,}")
    print(f"  Neurons/org:    {args.neurons:>12,}")
    print(f"  Total neurons:  {total_neurons:>12,}")
    print(f"  Steps:          {args.steps:>12,}")
    print(f"  World:          {args.world:>12}")
    print(f"  Arena size:     {args.arena:>12.1f}")
    print(f"  Seed:           {args.seed:>12}")
    print("-" * 70)

    # Build the brain-world
    print("Building brain-world...", end=" ", flush=True)
    t0 = time.perf_counter()
    bw = BrainWorld(
        n_organisms=args.organisms,
        neurons_per_organism=args.neurons,
        arena_size=args.arena,
        world_type=args.world,
        seed=args.seed,
    )
    build_time = time.perf_counter() - t0
    print(f"done in {build_time:.2f}s")
    print(f"  Synapses: {bw.engine.n_synapses:,}")
    print("-" * 70)

    # Set up emergent behavior detection
    arena_area = args.arena * args.arena
    detector = EmergentBehaviorDetector(
        history_window=500, arena_area=arena_area
    )
    all_emergent: list[dict] = []

    # Run simulation
    print(f"Running {args.steps} steps...")
    step_times: list[float] = []
    population_history: list[dict] = []
    neural_history: list[dict] = []

    sim_start = time.perf_counter()

    for step_i in range(1, args.steps + 1):
        t_step = time.perf_counter()
        stats = bw.step(dt=1.0)
        step_ms = (time.perf_counter() - t_step) * 1000.0
        step_times.append(step_ms)

        # Record population dynamics
        population_history.append({
            "step": step_i,
            "alive": stats.get("alive", 0),
            "born": stats.get("born_this_step", 0),
            "died": stats.get("died_this_step", 0),
            "eaten": stats.get("eaten_this_step", 0),
            "mean_energy": stats.get("mean_energy", 0.0),
            "total_fired": stats.get("total_fired", 0),
            "fire_rate_pct": stats.get("fire_rate_percent", 0.0),
        })

        # Run emergent behavior detection every 100 steps
        if step_i % 100 == 0:
            emergent_state = bw.get_emergent_state()
            events = detector.observe(emergent_state)
            if events:
                all_emergent.extend(events)
                for ev in events:
                    b_type = ev.get("behavior_type", "unknown")
                    conf = ev.get("confidence", 0.0)
                    print(f"  [Step {step_i}] EMERGENT: {b_type} (confidence={conf:.2f})")

        # Progress report every 100 steps
        if step_i % 100 == 0:
            elapsed = time.perf_counter() - sim_start
            sps = step_i / elapsed
            recent_ms = np.mean(step_times[-100:])
            pop = stats.get("alive", 0)
            fired = stats.get("total_fired", 0)
            fire_pct = stats.get("fire_rate_percent", 0.0)
            print(
                f"  Step {step_i:>6}/{args.steps}  |  "
                f"pop={pop:>6,}  fired={fired:>6,} ({fire_pct:.1f}%)  |  "
                f"{recent_ms:.1f} ms/step  {sps:.1f} steps/s"
            )

    total_time = time.perf_counter() - sim_start

    # Final summary
    print("-" * 70)
    print("RESULTS")
    print("-" * 70)

    final_state = bw.get_state()
    mean_step = np.mean(step_times)
    fps = 1000.0 / mean_step if mean_step > 0 else 0.0

    print(f"  Total time:       {total_time:.2f}s")
    print(f"  Mean step time:   {mean_step:.2f} ms")
    print(f"  Effective FPS:    {fps:.1f}")
    print(f"  Steps/second:     {args.steps / total_time:.1f}")
    print(f"  Final population: {final_state['total_alive']:,}")
    print(f"  Total born:       {final_state['total_born']:,}")
    print(f"  Total died:       {final_state['total_died']:,}")

    neural = final_state.get("neural_stats", {})
    print(f"  Total neurons:    {neural.get('total_neurons', 0):,}")
    print(f"  Total synapses:   {neural.get('total_synapses', 0):,}")
    print(f"  Mean firing rate: {neural.get('mean_firing_rate', 0.0):.2f} Hz")

    if all_emergent:
        print(f"\n  Emergent behaviors detected: {len(all_emergent)}")
        # Summarize by type
        by_type: dict[str, int] = {}
        for ev in all_emergent:
            bt = ev.get("behavior_type", "unknown")
            by_type[bt] = by_type.get(bt, 0) + 1
        for bt, count in sorted(by_type.items()):
            print(f"    {bt}: {count} events")
    else:
        print("\n  No emergent behaviors detected (may need more steps)")

    print("=" * 70)

    # Save results to JSON
    if args.output:
        results = {
            "config": {
                "organisms": args.organisms,
                "neurons_per_organism": args.neurons,
                "total_neurons": total_neurons,
                "steps": args.steps,
                "world": args.world,
                "arena_size": args.arena,
                "seed": args.seed,
            },
            "performance": {
                "build_time_s": build_time,
                "total_time_s": total_time,
                "mean_step_ms": mean_step,
                "effective_fps": fps,
                "steps_per_second": args.steps / total_time,
            },
            "final_state": {
                "alive": final_state["total_alive"],
                "dead": final_state["total_dead"],
                "total_born": final_state["total_born"],
                "total_died": final_state["total_died"],
            },
            "neural_stats": neural,
            "emergent_behaviors": all_emergent,
            "population_history": population_history[::10],  # every 10th step
        }
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2, default=str)
        print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
