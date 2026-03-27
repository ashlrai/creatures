"""Deep Evolution Runner — long-running evolution without visualization overhead."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path

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
        (run_dir / "discoveries").mkdir(exist_ok=True)

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
        snapshot_count = 0
        discovery_engine = None

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
                    snapshot_count += 1

                    # Run discovery analysis every other snapshot
                    if snapshot_count % 2 == 0:
                        try:
                            genomes, fitnesses = self._extract_genomes(bw)
                            if genomes:
                                if discovery_engine is None:
                                    from creatures.discovery.evolved_discovery import EvolvedDiscoveryEngine
                                    discovery_engine = EvolvedDiscoveryEngine(genomes[0])
                                new_disc = discovery_engine.analyze_population(
                                    genomes, fitnesses, current_max_gen
                                )
                                if new_disc:
                                    disc_file = run_dir / "discoveries" / f"gen_{current_max_gen:06d}.json"
                                    disc_data = [d.to_dict() for d in new_disc]
                                    with open(disc_file, "w") as f:
                                        json.dump(disc_data, f, indent=2, default=str)
                                    logger.info(
                                        "[%s] Gen %d: %d new discoveries",
                                        run_id, current_max_gen, len(new_disc),
                                    )
                        except Exception as e:
                            logger.warning("Discovery analysis error at gen %d: %s", current_max_gen, e)

                    last_max_gen = current_max_gen

                    logger.info(f"[{run_id}] Generation {current_max_gen}/{target_gen} — {pop_stats.get('alive', 0)} alive, {pop_stats.get('n_lineages', 0)} lineages")

                # Check target reached
                if current_max_gen >= target_gen:
                    run["status"] = "completed"
                    break

                # Yield after every batch to keep server responsive
                await asyncio.sleep(0)

        except Exception as e:
            logger.error(f"Deep evolution {run_id} error: {e}")
            run["status"] = "error"
            run["error"] = str(e)

        # Save final summary
        run["finished_at"] = time.time()
        elapsed = run["finished_at"] - run["started_at"]
        # Collect all discoveries
        all_discoveries = []
        if discovery_engine is not None:
            all_discoveries = [d.to_dict() for d in discovery_engine.discoveries]

        summary = {
            "run_id": run_id,
            "status": run["status"],
            "total_steps": step,
            "max_generation": run["current_generation"],
            "elapsed_seconds": elapsed,
            "snapshots_saved": len(run["snapshots"]),
            "narratives": narratives[-20:],  # last 20
            "discoveries": all_discoveries,
        }
        with open(run_dir / "summary.json", "w") as f:
            json.dump(summary, f, indent=2, default=str)

        logger.info(f"Deep evolution {run_id} finished: {run['status']}, gen={run['current_generation']}, elapsed={elapsed:.1f}s")

    def _extract_genomes(self, bw) -> tuple[list, list[float]]:
        """Build Genome objects from BrainWorld organisms.

        Returns (genomes, fitnesses) for all alive organisms.
        """
        from creatures.evolution.genome import Genome

        eco = bw.ecosystem
        engine = bw.engine
        alive_mask = eco.alive
        alive_idx = alive_mask.nonzero()[0]

        if len(alive_idx) == 0:
            return [], []

        n_per = engine.n_per if hasattr(engine, "n_per") else engine.n_total // max(engine.n_organisms, 1)
        # Build a generic neuron ID list for the per-organism topology
        neuron_ids = [f"n{i}" for i in range(n_per)]
        neuron_types_map: dict = {}
        neuron_nts_map: dict = {}
        from creatures.connectome.types import NeuronType
        for i, nid in enumerate(neuron_ids):
            neuron_types_map[nid] = NeuronType.UNKNOWN
            neuron_nts_map[nid] = None

        # Get the template pre/post indices (same for all organisms)
        synapses_per_org = engine.n_synapses // max(engine.n_organisms, 1)
        # Template indices come from the first organism
        syn_pre_all = np.asarray(engine.syn_pre if not hasattr(engine.syn_pre, 'tolist') else engine.syn_pre)
        syn_post_all = np.asarray(engine.syn_post if not hasattr(engine.syn_post, 'tolist') else engine.syn_post)
        syn_w_all = np.asarray(engine.syn_w if not hasattr(engine.syn_w, 'tolist') else engine.syn_w)

        # Template topology: indices within organism (modulo n_per)
        template_pre = syn_pre_all[:synapses_per_org] % n_per
        template_post = syn_post_all[:synapses_per_org] % n_per

        genomes = []
        fitnesses = []

        for idx in alive_idx:
            idx = int(idx)
            w_start = idx * synapses_per_org
            w_end = w_start + synapses_per_org
            weights = np.array(syn_w_all[w_start:w_end], dtype=np.float64)

            fitness = float(eco.lifetime_food[idx])

            g = Genome(
                id=f"org_{idx}",
                parent_ids=(),
                generation=int(eco.generation[idx]),
                neuron_ids=list(neuron_ids),
                neuron_types=dict(neuron_types_map),
                neuron_nts=dict(neuron_nts_map),
                pre_indices=np.array(template_pre, dtype=np.int32),
                post_indices=np.array(template_post, dtype=np.int32),
                weights=weights,
                synapse_types=np.zeros(len(weights), dtype=np.int8),
                fitness=fitness,
            )
            genomes.append(g)
            fitnesses.append(fitness)

        return genomes, fitnesses

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

    def get_discoveries(self, run_id: str) -> list[dict]:
        """Load all discoveries for a run."""
        run = self._runs.get(run_id)
        if not run:
            return []
        run_dir = run["run_dir"]
        disc_dir = run_dir / "discoveries"
        discoveries = []
        if disc_dir.exists():
            for f in sorted(disc_dir.glob("gen_*.json")):
                with open(f) as fh:
                    data = json.load(fh)
                    if isinstance(data, list):
                        discoveries.extend(data)
                    else:
                        discoveries.append(data)
        return discoveries

    def list_runs(self) -> list[dict]:
        """List all runs with their status."""
        return [self.get_status(rid) for rid in self._runs if self.get_status(rid)]
