"""Deep Evolution Runner — long-running evolution without visualization overhead."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


class DeepEvolutionRunner:
    """Run long evolution experiments with periodic snapshots to disk."""

    def __init__(self):
        self._runs: dict[str, dict] = {}  # run_id -> run state
        self._tasks: dict[str, asyncio.Task] = {}
        self._data_dir = Path(os.environ.get("NEUREVO_DATA_DIR", "neurevo_data")) / "deep_runs"
        self._data_dir.mkdir(parents=True, exist_ok=True)

    async def start_run(
        self,
        n_organisms: int = 5000,
        neurons_per: int = 100,
        world_type: str = "pond",
        target_generations: int = 1000,
        snapshot_interval: int = 50,
        enable_stdp: bool = True,
        mutation_sigma: float = 0.02,
    ) -> str:
        """Start a deep evolution run. Returns run_id."""
        run_id = str(uuid.uuid4())[:12]

        # Create BrainWorld
        from creatures.environment.brain_world import BrainWorld
        bw = BrainWorld(
            n_organisms=n_organisms,
            neurons_per_organism=neurons_per,
            world_type=world_type,
            enable_stdp=enable_stdp,
            enable_consciousness=False,  # Disabled for speed; computed at snapshots
            mutation_sigma=mutation_sigma,
        )

        config = {
            "run_id": run_id,
            "n_organisms": n_organisms,
            "neurons_per": neurons_per,
            "world_type": world_type,
            "target_generations": target_generations,
            "snapshot_interval": snapshot_interval,
            "enable_stdp": enable_stdp,
            "mutation_sigma": mutation_sigma,
            "started_at": time.time(),
        }

        # Create run directory
        run_dir = self._data_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "snapshots").mkdir(exist_ok=True)
        (run_dir / "narratives").mkdir(exist_ok=True)

        with open(run_dir / "config.json", "w") as f:
            json.dump(config, f, indent=2)

        self._runs[run_id] = {
            "config": config,
            "bw": bw,
            "status": "running",
            "current_step": 0,
            "current_generation": 0,
            "snapshots": [],
            "started_at": time.time(),
            "run_dir": run_dir,
        }

        # Start background task
        self._tasks[run_id] = asyncio.create_task(self._run_loop(run_id))
        logger.info(f"Deep evolution run {run_id} started: {n_organisms} organisms, target {target_generations} generations")
        return run_id

    async def _run_loop(self, run_id: str):
        """Main evolution loop — pure compute, periodic snapshots."""
        run = self._runs[run_id]
        bw = run["bw"]
        config = run["config"]
        target_gen = config["target_generations"]
        snapshot_interval = config["snapshot_interval"]
        run_dir = run["run_dir"]

        # God Agent for analysis at snapshots
        from creatures.god.agent import GodAgent, GodConfig
        from creatures.god.ecosystem_integration import apply_all_interventions
        god = GodAgent(GodConfig(provider="fallback"), run_id=run_id)

        step = 0
        last_max_gen = 0
        narratives = []

        try:
            # Take initial snapshot
            self._save_snapshot(run, bw, step, 0, [], god, run_dir)

            while run["status"] == "running":
                # Batch step for maximum speed (100 steps per batch)
                for _ in range(100):
                    bw.step()
                    step += 1

                # Check current max generation
                eco = bw.ecosystem
                alive_mask = eco.alive
                if alive_mask.any():
                    current_max_gen = int(eco.generation[alive_mask].max())
                else:
                    current_max_gen = last_max_gen
                    run["status"] = "extinct"
                    break

                run["current_step"] = step
                run["current_generation"] = current_max_gen

                # Snapshot at generation milestones
                if current_max_gen >= last_max_gen + snapshot_interval:
                    # Run emergent detection
                    from creatures.environment.emergent_detector import EmergentBehaviorDetector
                    try:
                        detector = EmergentBehaviorDetector()
                        # Build state dict matching detector.observe() API:
                        # expects {"organisms": [{"id", "x", "y", "species", "alive"}, ...]}
                        emergent_state = bw.get_emergent_state()
                        events_raw = detector.observe(emergent_state)
                        event_names = [
                            e.get("behavior_type", "") if isinstance(e, dict) else getattr(e, "behavior_type", "")
                            for e in (events_raw or [])
                        ]
                    except Exception:
                        event_names = []

                    # God Agent analysis
                    pop_stats = bw.get_population_stats()
                    god.observe(
                        {"generation": current_max_gen, "best_fitness": pop_stats.get("mean_lifetime_food", 0), "mean_fitness": pop_stats.get("mean_energy", 0), "std_fitness": 0},
                        {"n_organisms": pop_stats.get("alive", 0), "n_lineages": pop_stats.get("n_lineages", 0)},
                        {"world_type": config["world_type"]},
                    )
                    try:
                        report = await god.analyze_and_intervene()
                        interventions = apply_all_interventions(eco, report)
                        narrative = {
                            "generation": current_max_gen,
                            "step": step,
                            "analysis": report.get("analysis", ""),
                            "interventions": interventions,
                            "hypothesis": report.get("hypothesis", ""),
                        }
                        narratives.append(narrative)
                    except Exception as e:
                        logger.warning(f"God Agent error: {e}")
                        narrative = None

                    self._save_snapshot(run, bw, step, current_max_gen, event_names, god, run_dir)
                    last_max_gen = current_max_gen

                    logger.info(f"[{run_id}] Generation {current_max_gen}/{target_gen} — {pop_stats.get('alive', 0)} alive, {pop_stats.get('n_lineages', 0)} lineages")

                # Check target reached
                if current_max_gen >= target_gen:
                    run["status"] = "completed"
                    break

                # Yield to event loop periodically
                if step % 1000 == 0:
                    await asyncio.sleep(0)

        except Exception as e:
            logger.error(f"Deep evolution {run_id} error: {e}")
            run["status"] = "error"
            run["error"] = str(e)

        # Save final summary
        run["finished_at"] = time.time()
        elapsed = run["finished_at"] - run["started_at"]
        summary = {
            "run_id": run_id,
            "status": run["status"],
            "total_steps": step,
            "max_generation": run["current_generation"],
            "elapsed_seconds": elapsed,
            "snapshots_saved": len(run["snapshots"]),
            "narratives": narratives[-20:],  # last 20
        }
        with open(run_dir / "summary.json", "w") as f:
            json.dump(summary, f, indent=2, default=str)

        logger.info(f"Deep evolution {run_id} finished: {run['status']}, gen={run['current_generation']}, elapsed={elapsed:.1f}s")

    def _save_snapshot(self, run: dict, bw, step: int, generation: int, events: list, god, run_dir: Path):
        """Save a generation snapshot to disk."""
        eco = bw.ecosystem
        alive = eco.alive
        alive_idx = alive.nonzero()[0]

        pop_stats = bw.get_population_stats() if hasattr(bw, "get_population_stats") else {}

        # Find top organisms by energy
        if len(alive_idx) > 0:
            top_n = min(5, len(alive_idx))
            top_idx = alive_idx[np.argsort(-eco.energy[alive_idx])[:top_n]]
            top_organisms = [
                {
                    "idx": int(i),
                    "generation": int(eco.generation[i]),
                    "lineage_id": int(eco.lineage_id[i]),
                    "energy": float(eco.energy[i]),
                    "lifetime_food": float(eco.lifetime_food[i]),
                    "age": float(eco.age[i]),
                    "species": int(eco.species[i]),
                }
                for i in top_idx
            ]
        else:
            top_organisms = []

        snapshot = {
            "generation": generation,
            "step": step,
            "timestamp": time.time(),
            "population": pop_stats,
            "top_organisms": top_organisms,
            "emergent_behaviors": events,
        }

        # Save to disk
        filename = f"gen_{generation:06d}.json"
        with open(run_dir / "snapshots" / filename, "w") as f:
            json.dump(snapshot, f, indent=2, default=str)

        run["snapshots"].append({"generation": generation, "file": filename})

    def get_status(self, run_id: str) -> dict | None:
        """Get current status of a run."""
        run = self._runs.get(run_id)
        if not run:
            return None
        elapsed = time.time() - run["started_at"]
        config = run["config"]
        progress = run["current_generation"] / max(config["target_generations"], 1)
        eta_seconds = (elapsed / max(progress, 0.001)) * (1 - progress) if progress > 0.01 else -1

        return {
            "run_id": run_id,
            "status": run["status"],
            "current_step": run["current_step"],
            "current_generation": run["current_generation"],
            "target_generations": config["target_generations"],
            "progress": min(progress, 1.0),
            "elapsed_seconds": elapsed,
            "eta_seconds": eta_seconds if eta_seconds > 0 else None,
            "snapshots_saved": len(run["snapshots"]),
            "config": config,
        }

    def get_snapshots(self, run_id: str) -> list[dict]:
        """Load all snapshots for a completed run."""
        run = self._runs.get(run_id)
        if not run:
            return []
        run_dir = run["run_dir"]
        snapshots = []
        snap_dir = run_dir / "snapshots"
        if snap_dir.exists():
            for f in sorted(snap_dir.glob("gen_*.json")):
                with open(f) as fh:
                    snapshots.append(json.load(fh))
        return snapshots

    async def stop_run(self, run_id: str) -> bool:
        """Stop a running experiment."""
        run = self._runs.get(run_id)
        if not run or run["status"] != "running":
            return False
        run["status"] = "stopped"
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        return True

    def list_runs(self) -> list[dict]:
        """List all runs with their status."""
        return [self.get_status(rid) for rid in self._runs if self.get_status(rid)]
