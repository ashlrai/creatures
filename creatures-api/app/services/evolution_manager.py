"""Manages evolutionary runs with background threads."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from dataclasses import asdict
from typing import Any

from creatures.connectome.openworm import load as load_celegans
from creatures.connectome.flywire import load as load_drosophila
from creatures.evolution.fitness import FitnessConfig, evaluate_genome_fast
from creatures.evolution.genome import Genome
from creatures.evolution.population import GenerationStats, Population, PopulationConfig
from creatures.god.narrator import EvolutionNarrator, WorldLog

logger = logging.getLogger(__name__)


class EvolutionRun:
    """State for a single evolutionary run."""

    def __init__(self, run_id: str, config: dict) -> None:
        self.id = run_id
        self.config = config
        self.status: str = "created"  # created, ready, running, paused, completed, failed
        self.generation: int = 0
        self.n_generations: int = config.get("n_generations", 100)
        self.population_size: int = config.get("population_size", 50)
        self.best_fitness: float = 0.0
        self.mean_fitness: float = 0.0
        self.elapsed_seconds: float = 0.0
        self.history: list[dict] = []
        self.population: Population | None = None
        self.error: str | None = None
        self.god_reports: list[dict] = []
        self.world_log: WorldLog = WorldLog()
        self.narrator: EvolutionNarrator = EvolutionNarrator()
        self.god_agent: Any | None = None

    def to_info(self) -> dict:
        return {
            "id": self.id,
            "organism": self.config.get("organism", "c_elegans"),
            "status": self.status,
            "generation": self.generation,
            "n_generations": self.n_generations,
            "population_size": self.population_size,
            "best_fitness": self.best_fitness,
            "mean_fitness": self.mean_fitness,
            "elapsed_seconds": self.elapsed_seconds,
            "god_reports": self.god_reports,
        }


class EvolutionManager:
    """Manages creation and lifecycle of evolutionary runs.

    Evolution runs in background threads. Progress is pushed to subscriber
    queues for WebSocket streaming.
    """

    def __init__(self) -> None:
        self._runs: dict[str, EvolutionRun] = {}
        self._threads: dict[str, threading.Thread] = {}
        self._stop_events: dict[str, threading.Event] = {}
        self._queues: dict[str, list[asyncio.Queue]] = {}
        # Event loop reference for thread-safe queue puts
        self._loop: asyncio.AbstractEventLoop | None = None
        # Persistence store — injected from main.py lifespan
        self.store: Any | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Store the main event loop for cross-thread communication."""
        self._loop = loop

    def create_run(self, config: dict) -> EvolutionRun:
        """Create a new evolution run: load connectome, seed genome, initialize population."""
        run_id = str(uuid.uuid4())[:8]
        run = EvolutionRun(run_id, config)

        try:
            organism = config.get("organism", "c_elegans")
            if organism == "c_elegans":
                connectome = load_celegans(config.get("connectome_source", "edge_list"))
            elif organism == "drosophila":
                connectome = load_drosophila("locomotion", max_neurons=500, min_synapse_count=5)
            else:
                raise ValueError(f"Organism '{organism}' not yet supported for evolution")

            seed_genome = Genome.from_connectome(connectome)

            pop_config = PopulationConfig(
                size=config.get("population_size", 50),
                elitism=max(1, config.get("population_size", 50) // 10),
                tournament_size=min(5, config.get("population_size", 50)),
                seed=config.get("seed", 42),
            )
            population = Population(pop_config, seed_genome)
            population.initialize()

            run.population = population
            run.status = "ready"
            logger.info(
                f"Evolution run {run_id}: {connectome.n_neurons} neurons, "
                f"pop_size={pop_config.size}, n_gen={run.n_generations}"
            )

        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            logger.error(f"Failed to create evolution run {run_id}: {e}")

        self._runs[run_id] = run
        self._queues[run_id] = []
        self._stop_events[run_id] = threading.Event()
        if not hasattr(self, "_god_agents"):
            self._god_agents: dict[str, Any] = {}

        # Always create God Agent — it provides narratives and interventions
        try:
            from creatures.god.agent import GodAgent, GodConfig
            god_config = GodConfig(
                api_key=config.get("xai_api_key"),
                intervention_interval=config.get("god_interval", 10),
            )
            god = GodAgent(god_config)
            self._god_agents[run_id] = god
            run.god_agent = god  # Store on run for API access
            god_mode = "AI" if god_config.api_key else "fallback"
            logger.info(f"God Agent created for run {run_id} in {god_mode} mode")
        except Exception as e:
            logger.warning(f"Failed to initialize God Agent for run {run_id}: {e}")

        return run

    def start_run(self, run_id: str) -> EvolutionRun:
        """Start or resume evolution in a background thread."""
        run = self._runs.get(run_id)
        if run is None:
            raise KeyError(f"Run {run_id} not found")
        if run.status not in ("ready", "paused"):
            raise ValueError(f"Cannot start run in status '{run.status}'")
        if run.population is None:
            raise ValueError("Population not initialized")

        # Clear the stop event in case we're resuming
        self._stop_events[run_id].clear()
        run.status = "running"

        thread = threading.Thread(
            target=self._evolution_loop,
            args=(run_id,),
            daemon=True,
            name=f"evo-{run_id}",
        )
        self._threads[run_id] = thread
        thread.start()
        return run

    def pause_run(self, run_id: str) -> EvolutionRun:
        """Signal the evolution loop to pause after the current generation."""
        run = self._runs.get(run_id)
        if run is None:
            raise KeyError(f"Run {run_id} not found")
        self._stop_events[run_id].set()
        return run

    def get_run(self, run_id: str) -> EvolutionRun | None:
        return self._runs.get(run_id)

    def get_history(self, run_id: str) -> list[dict]:
        run = self._runs.get(run_id)
        if run is None:
            raise KeyError(f"Run {run_id} not found")
        return run.history

    def list_runs(self) -> list[EvolutionRun]:
        return list(self._runs.values())

    def subscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        """Register an asyncio.Queue to receive generation updates."""
        self._queues.setdefault(run_id, []).append(queue)

    def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        """Remove a subscriber queue."""
        if run_id in self._queues:
            self._queues[run_id] = [q for q in self._queues[run_id] if q is not queue]

    # --- Private ---

    def _evolution_loop(self, run_id: str) -> None:
        """Run evolution generations in a background thread."""
        run = self._runs[run_id]
        stop_event = self._stop_events[run_id]
        population = run.population
        assert population is not None

        fitness_config = FitnessConfig(
            lifetime_ms=run.config.get("lifetime_ms", 5000.0),
        )
        t_start = time.time()

        try:
            remaining = run.n_generations - run.generation
            for _ in range(remaining):
                if stop_event.is_set():
                    run.status = "paused"
                    logger.info(f"Evolution run {run_id} paused at gen {run.generation}")
                    return

                # Evaluate all genomes with the fast proxy
                population.evaluate(lambda g: evaluate_genome_fast(g, fitness_config))

                # Advance to the next generation (selection + reproduction)
                stats: GenerationStats = population.advance_generation()

                # Update run state
                run.generation = stats.generation
                run.best_fitness = stats.best_fitness
                run.mean_fitness = stats.mean_fitness
                run.elapsed_seconds = time.time() - t_start

                stats_dict: dict[str, Any] = {
                    "type": "generation_complete",
                    "generation": stats.generation,
                    "best_fitness": stats.best_fitness,
                    "mean_fitness": stats.mean_fitness,
                    "std_fitness": stats.std_fitness,
                    "n_species": stats.n_species,
                    "best_genome_id": stats.best_genome_id,
                    "elapsed_seconds": run.elapsed_seconds,
                }

                # Narrate this generation
                organism = run.config.get("organism", "c_elegans")
                prev_gen_stats = run.history[-1] if run.history else None
                narrative_events = run.narrator.narrate_generation(
                    stats={
                        "generation": stats.generation,
                        "best_fitness": stats.best_fitness,
                        "mean_fitness": stats.mean_fitness,
                        "std_fitness": stats.std_fitness,
                        "n_species": stats.n_species,
                        "population_size": run.population_size,
                    },
                    prev_stats=prev_gen_stats,
                    organism=organism,
                )
                for ev in narrative_events:
                    run.world_log.add_event(ev)
                if narrative_events:
                    stats_dict["narrative_events"] = [e.to_dict() for e in narrative_events]

                # God Agent: observe and potentially intervene
                god_agents = getattr(self, "_god_agents", {})
                god = god_agents.get(run_id)
                if god is not None:
                    god.observe(
                        generation_stats={
                            "generation": stats.generation,
                            "best_fitness": stats.best_fitness,
                            "mean_fitness": stats.mean_fitness,
                            "std_fitness": stats.std_fitness,
                            "n_species": stats.n_species,
                        },
                        population_summary={"size": run.population_size},
                        environment_state={},
                    )
                    if stats.generation > 0 and stats.generation % god.config.intervention_interval == 0:
                        import asyncio as _asyncio
                        # Run async analyze in a new event loop (we're in a thread)
                        loop = _asyncio.new_event_loop()
                        try:
                            intervention = loop.run_until_complete(god.analyze_and_intervene())
                        finally:
                            loop.close()
                        applied = god.apply_interventions(
                            intervention,
                            mutation_config=getattr(population, "_mutation_config", None),
                            fitness_config=fitness_config,
                            population=population,
                        )
                        god_event: dict[str, Any] = {
                            "type": "god_intervention",
                            "generation": stats.generation,
                            "analysis": intervention.get("analysis", ""),
                            "interventions": intervention.get("interventions", []),
                            "applied": applied,
                        }
                        run.god_reports.append(god_event)
                        stats_dict["god_intervention"] = god_event
                        self._notify_subscribers(run_id, god_event)

                        # Narrate the intervention
                        if applied:
                            run.narrator.narrate_intervention(intervention, organism=organism)
                            # The narrator logs to its own world_log; copy latest event to run's world_log
                            if run.narrator.world_log.events:
                                intervention_ev = run.narrator.world_log.events[-1]
                                run.world_log.add_event(intervention_ev)

                run.history.append(stats_dict)

                # Push to subscriber queues (thread-safe via call_soon_threadsafe)
                self._notify_subscribers(run_id, stats_dict)

            run.status = "completed"
            self._notify_subscribers(run_id, {"type": "run_complete"})

            # Attach final God Agent report
            god_agents = getattr(self, "_god_agents", {})
            god = god_agents.get(run_id)
            final_report_text = None
            if god is not None:
                final_report = {
                    "type": "god_final_report",
                    "n_observations": len(god.observations),
                    "n_interventions": len(god.history),
                    "report": god.get_report(),
                    "mode": "ai" if god.config.api_key else "fallback",
                }
                run.god_reports.append(final_report)
                self._notify_subscribers(run_id, final_report)
                final_report_text = god.get_report()

            # Persist completed run to storage
            self._persist_run(run, final_report_text)

            logger.info(
                f"Evolution run {run_id} completed: {run.generation} generations, "
                f"best_fitness={run.best_fitness:.3f}"
            )

        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            logger.error(f"Evolution run {run_id} failed: {e}", exc_info=True)

    def _persist_run(self, run: EvolutionRun, final_report: str | None = None) -> None:
        """Save a completed/failed evolution run and its best genome to the store."""
        if self.store is None:
            return
        try:
            # Serialize world_log events
            world_log_data = [e.to_dict() for e in run.world_log.events] if run.world_log.events else None

            self.store.save_evolution_run(
                run_id=run.id,
                organism=run.config.get("organism", "c_elegans"),
                config=run.config,
                status=run.status,
                generations=run.generation,
                best_fitness=run.best_fitness,
                world_log=world_log_data,
                report=final_report,
            )

            # Save the best genome from the final population
            if run.population is not None and run.population.genomes:
                best = max(run.population.genomes, key=lambda g: g.fitness)
                genome_data = {
                    "neurons": [
                        {"id": n.id, "bias": n.bias, "tau": n.tau, "type": n.type}
                        for n in best.neurons
                    ],
                    "synapses": [
                        {"pre": s.pre, "post": s.post, "weight": s.weight, "delay": s.delay}
                        for s in best.synapses
                    ],
                }
                self.store.save_genome(
                    genome_id=f"{run.id}-best",
                    run_id=run.id,
                    generation=run.generation,
                    fitness=best.fitness,
                    n_neurons=len(best.neurons),
                    n_synapses=len(best.synapses),
                    data=genome_data,
                )
            logger.info(f"Persisted evolution run {run.id} to store")
        except Exception as e:
            logger.error(f"Failed to persist evolution run {run.id}: {e}")

    def _notify_subscribers(self, run_id: str, data: dict) -> None:
        """Push data to all subscriber queues from the background thread."""
        queues = self._queues.get(run_id, [])
        if not queues or self._loop is None:
            return

        dead: list[int] = []
        for i, queue in enumerate(queues):
            try:
                self._loop.call_soon_threadsafe(queue.put_nowait, data)
            except asyncio.QueueFull:
                pass  # Drop updates for slow consumers
            except Exception:
                dead.append(i)

        # Remove dead queues
        for i in reversed(dead):
            queues.pop(i)
