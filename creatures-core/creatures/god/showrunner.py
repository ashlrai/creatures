"""Autonomous ecosystem showrunner — the God Agent as 24/7 curator.

Analyzes the ecosystem at regular intervals, generates genuine narrative
insights about evolution, decides on environmental interventions to prevent
stagnation, and streams everything to connected viewers.

Works with or without an LLM:
- With LLM: deep analysis via Anthropic/Ollama/xAI
- Without LLM: rule-based analysis with rich template narratives

Design: the showrunner is the ONLY entry point for God Agent intelligence
in the simulation loop. Call `tick()` every step — it decides internally
when to analyze, narrate, and intervene.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from creatures.evolution.morphology import compute_speed, GENE_SENSOR_RANGE

logger = logging.getLogger(__name__)


@dataclass
class ShowrunnerConfig:
    """Configuration for the autonomous showrunner."""
    # Analysis interval (in simulation steps)
    analysis_interval: int = 500
    # Minimum steps between interventions (cooldown)
    intervention_cooldown: int = 1000
    # Enable LLM-powered analysis (falls back to rules if unavailable)
    use_llm: bool = True
    # Log directory for JSONL records
    log_dir: str = "neurevo_data/god_agent_logs"


@dataclass
class EcosystemSnapshot:
    """Point-in-time snapshot of ecosystem state for trend analysis."""
    step: int
    prey_count: int
    pred_count: int
    total_alive: int
    max_generation: int
    mean_energy: float
    prey_speed: float
    pred_speed: float
    prey_sensor_range: float
    total_kills: int
    n_lineages: int
    prey_clustering: float = 0.0  # 0 = random, 1 = highly clustered
    pred_clustering: float = 0.0
    heading_alignment: float = 0.0  # 0 = random, 1 = perfectly aligned (flocking)
    timestamp: float = field(default_factory=time.time)


class EcosystemShowrunner:
    """Autonomous God Agent that curates the living world.

    Call ``tick(bw)`` every simulation step. The showrunner internally
    decides when to analyze, narrate, and intervene based on ecosystem
    state and configured intervals.

    Produces a stream of narratives and intervention events that can
    be sent to the frontend via WebSocket.
    """

    def __init__(self, config: ShowrunnerConfig | None = None) -> None:
        self.config = config or ShowrunnerConfig()
        self._snapshots: list[EcosystemSnapshot] = []
        self._last_analysis_step = 0
        self._last_intervention_step = 0
        self._pending_narratives: list[dict] = []
        self._pending_interventions: list[dict] = []
        self._active_effects: list[dict] = []  # ongoing environmental effects

        # JSONL log
        log_dir = Path(self.config.log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)
        run_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        self._log_path = log_dir / f"showrunner_{run_id}.jsonl"

        # LLM agent (lazy init)
        self._god_agent = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def tick(self, bw: Any) -> dict[str, Any]:
        """Called every simulation step. Returns narratives/interventions if any.

        Parameters
        ----------
        bw : BrainWorld
            The brain-world instance to analyze and potentially modify.

        Returns
        -------
        dict with keys:
            narratives: list[dict] — new narrative messages for the frontend
            interventions: list[dict] — interventions applied this step
        """
        eco = bw.ecosystem
        step = eco._step_count

        result: dict[str, Any] = {"narratives": [], "interventions": []}

        # Apply ongoing environmental effects (e.g., drought duration)
        self._apply_active_effects(eco, step)

        # Periodic analysis
        if step - self._last_analysis_step >= self.config.analysis_interval and step > 0:
            self._last_analysis_step = step
            snapshot = self._take_snapshot(bw)
            self._snapshots.append(snapshot)
            # Keep last 50 snapshots
            if len(self._snapshots) > 50:
                self._snapshots = self._snapshots[-50:]

            analysis = self._analyze(snapshot)
            if analysis["narratives"]:
                self._pending_narratives.extend(analysis["narratives"])
            if analysis["intervention"] and step - self._last_intervention_step >= self.config.intervention_cooldown:
                intervention = analysis["intervention"]
                self._apply_intervention(eco, intervention, step)
                self._last_intervention_step = step
                self._pending_interventions.append(intervention)

        # Flush pending messages
        if self._pending_narratives:
            result["narratives"] = self._pending_narratives.copy()
            self._pending_narratives.clear()
        if self._pending_interventions:
            result["interventions"] = self._pending_interventions.copy()
            self._pending_interventions.clear()

        return result

    def get_recent_narratives(self, n: int = 10) -> list[dict]:
        """Get the most recent narratives (for new viewer connections)."""
        return self._pending_narratives[-n:]

    # ------------------------------------------------------------------
    # Snapshot
    # ------------------------------------------------------------------

    def _take_snapshot(self, bw: Any) -> EcosystemSnapshot:
        """Capture current ecosystem state for trend analysis."""
        eco = bw.ecosystem
        alive = eco.alive
        prey_mask = alive & (eco.species == 0)
        pred_mask = alive & (eco.species == 1)

        prey_speed = float(compute_speed(eco.morphology[prey_mask]).mean()) if prey_mask.any() else 0.0
        pred_speed = float(compute_speed(eco.morphology[pred_mask]).mean()) if pred_mask.any() else 0.0
        prey_sensor = float(eco.morphology[prey_mask, GENE_SENSOR_RANGE].mean()) if prey_mask.any() else 0.0

        pop = bw.get_population_stats()

        # Compute clustering and heading alignment for social behavior detection
        prey_clustering = 0.0
        pred_clustering = 0.0
        heading_alignment = 0.0

        prey_idx = np.where(prey_mask)[0]
        pred_idx = np.where(pred_mask)[0]

        def _clustering_index(indices: np.ndarray, radius: float = 3.0) -> float:
            """Fraction of organisms with 3+ neighbors within radius (vs random)."""
            if len(indices) < 10:
                return 0.0
            sample = indices[:min(200, len(indices))]
            sx = eco.x[sample]
            sy = eco.y[sample]
            ddx = sx[:, None] - sx[None, :]
            ddy = sy[:, None] - sy[None, :]
            dist = np.sqrt(ddx * ddx + ddy * ddy + 1e-12)
            np.fill_diagonal(dist, np.inf)
            has_group = np.sum(dist < radius, axis=1) >= 3
            return float(np.mean(has_group))

        def _alignment_index(indices: np.ndarray, radius: float = 3.0) -> float:
            """Mean heading alignment among nearby organisms (0=random, 1=aligned)."""
            if len(indices) < 10:
                return 0.0
            sample = indices[:min(200, len(indices))]
            sx, sy = eco.x[sample], eco.y[sample]
            sh = eco.heading[sample]
            ddx = sx[:, None] - sx[None, :]
            ddy = sy[:, None] - sy[None, :]
            dist = np.sqrt(ddx * ddx + ddy * ddy + 1e-12)
            np.fill_diagonal(dist, np.inf)
            nearby = dist < radius
            h_diff = sh[:, None] - sh[None, :]
            cos_sim = np.cos(h_diff)
            # Mean alignment with nearby neighbors
            n_nearby = np.sum(nearby, axis=1).astype(np.float32)
            sum_align = np.sum(cos_sim * nearby, axis=1)
            valid = n_nearby > 0
            if not np.any(valid):
                return 0.0
            mean_align = np.mean(sum_align[valid] / n_nearby[valid])
            return float(np.clip(mean_align, 0.0, 1.0))

        if len(prey_idx) >= 10:
            prey_clustering = _clustering_index(prey_idx)
        if len(pred_idx) >= 10:
            pred_clustering = _clustering_index(pred_idx)
        if len(prey_idx) >= 10:
            heading_alignment = _alignment_index(prey_idx)

        return EcosystemSnapshot(
            step=eco._step_count,
            prey_count=int(prey_mask.sum()),
            pred_count=int(pred_mask.sum()),
            total_alive=int(alive.sum()),
            max_generation=pop.get("max_generation", 0),
            mean_energy=pop.get("mean_energy", 0.0),
            prey_speed=prey_speed,
            pred_speed=pred_speed,
            prey_sensor_range=prey_sensor,
            total_kills=eco._total_predation,
            n_lineages=pop.get("n_lineages", 0),
            prey_clustering=prey_clustering,
            pred_clustering=pred_clustering,
            heading_alignment=heading_alignment,
        )

    # ------------------------------------------------------------------
    # Analysis (rule-based — always works, no LLM needed)
    # ------------------------------------------------------------------

    def _analyze(self, current: EcosystemSnapshot) -> dict:
        """Analyze ecosystem trends and generate narratives + intervention decisions."""
        narratives: list[dict] = []
        intervention: dict | None = None

        gen = current.max_generation

        # --- Arms race commentary ---
        if len(self._snapshots) >= 2:
            prev = self._snapshots[-2]

            # Speed evolution
            prey_delta = current.prey_speed - prev.prey_speed
            pred_delta = current.pred_speed - prev.pred_speed
            if abs(prey_delta) > 0.1 or abs(pred_delta) > 0.1:
                if prey_delta > 0.1 and pred_delta > 0.1:
                    narratives.append(self._narrate(
                        "arms_race",
                        f"The arms race intensifies. Prey speed climbed to {current.prey_speed:.2f} "
                        f"while predator speed rose to {current.pred_speed:.2f}. "
                        f"Both species are locked in an evolutionary sprint.",
                        gen,
                    ))
                elif prey_delta > 0.2:
                    narratives.append(self._narrate(
                        "prey_adaptation",
                        f"Prey are pulling ahead — speed jumped to {current.prey_speed:.2f}, "
                        f"outpacing predators at {current.pred_speed:.2f}. "
                        f"Selection favors the fast.",
                        gen,
                    ))
                elif pred_delta > 0.2:
                    narratives.append(self._narrate(
                        "predator_adaptation",
                        f"Predators are evolving faster. Speed reached {current.pred_speed:.2f}, "
                        f"closing the gap on prey at {current.prey_speed:.2f}. "
                        f"The hunt grows more efficient.",
                        gen,
                    ))

            # Kill rate changes
            kills_delta = current.total_kills - prev.total_kills
            if kills_delta > 50:
                narratives.append(self._narrate(
                    "predation_surge",
                    f"A predation surge: {kills_delta} kills since last analysis. "
                    f"Predators are thriving — prey population at {current.prey_count}.",
                    gen,
                ))
            elif kills_delta == 0 and current.pred_count > 10:
                narratives.append(self._narrate(
                    "predation_lull",
                    f"Hunting has stalled. Zero kills since last analysis despite "
                    f"{current.pred_count} active predators. Prey may have evolved "
                    f"effective evasion.",
                    gen,
                ))

            # Lineage changes
            if current.n_lineages < prev.n_lineages * 0.5 and prev.n_lineages > 5:
                narratives.append(self._narrate(
                    "lineage_collapse",
                    f"A mass extinction of lineages. Only {current.n_lineages} lineages survive, "
                    f"down from {prev.n_lineages}. A dominant strategy is sweeping through.",
                    gen,
                ))

            # Generation milestones
            if gen > 0 and gen % 25 == 0 and gen != prev.max_generation:
                narratives.append(self._narrate(
                    "milestone",
                    f"Generation {gen} reached. {current.total_alive} organisms compete "
                    f"across {current.n_lineages} lineages. "
                    f"Prey speed: {current.prey_speed:.2f}, Predator speed: {current.pred_speed:.2f}.",
                    gen,
                ))

        # --- Social behavior detection ---
        # Clustering: prey forming groups (dilution effect driving herding)
        if current.prey_clustering > 0.4:
            if len(self._snapshots) >= 2 and self._snapshots[-2].prey_clustering < 0.3:
                narratives.append(self._narrate(
                    "social_behavior",
                    f"HERDING EMERGES. {current.prey_clustering:.0%} of prey are in groups of 3+. "
                    f"Safety in numbers — clustered prey survive predation better. "
                    f"Natural selection is building social instincts.",
                    gen,
                ))
            elif current.prey_clustering > 0.6:
                narratives.append(self._narrate(
                    "social_behavior",
                    f"Dense prey herds: {current.prey_clustering:.0%} in tight groups. "
                    f"The dilution effect is a powerful evolutionary force.",
                    gen,
                ))

        # Heading alignment: coordinated movement (flocking)
        if current.heading_alignment > 0.3:
            if len(self._snapshots) >= 2 and self._snapshots[-2].heading_alignment < 0.2:
                narratives.append(self._narrate(
                    "flocking",
                    f"FLOCKING DETECTED. Prey heading alignment reached {current.heading_alignment:.0%}. "
                    f"Organisms are moving in the same direction as their neighbors — "
                    f"coordinated movement has evolved from scratch.",
                    gen,
                ))

        # Predator clustering: pack hunting
        if current.pred_clustering > 0.3:
            if len(self._snapshots) >= 2 and self._snapshots[-2].pred_clustering < 0.2:
                narratives.append(self._narrate(
                    "pack_hunting",
                    f"PACK HUNTING. {current.pred_clustering:.0%} of predators are clustering together. "
                    f"Coordinated hunting groups are forming — the pack bonus rewards cooperation.",
                    gen,
                ))

        # --- Status report (always, if no other narrative) ---
        if not narratives:
            narratives.append(self._narrate(
                "status",
                f"Gen {gen}: {current.prey_count} prey, {current.pred_count} predators. "
                f"Prey speed {current.prey_speed:.2f}, predator speed {current.pred_speed:.2f}. "
                f"{current.total_kills} total hunts. "
                f"Clustering: prey {current.prey_clustering:.0%}, alignment {current.heading_alignment:.0%}.",
                gen,
            ))

        # --- Intervention decisions ---
        intervention = self._decide_intervention(current)

        return {"narratives": narratives, "intervention": intervention}

    def _decide_intervention(self, current: EcosystemSnapshot) -> dict | None:
        """Decide if an environmental intervention is needed."""

        # Stagnation: generation hasn't advanced in 3 analysis cycles
        if len(self._snapshots) >= 3:
            recent_gens = [s.max_generation for s in self._snapshots[-3:]]
            if max(recent_gens) - min(recent_gens) <= 1:
                return {
                    "type": "catastrophe",
                    "action": "mass_extinction",
                    "params": {"kill_fraction": 0.3, "spare_top_energy": True},
                    "reason": "Generational stagnation — culling to create selection pressure",
                }

        # Population imbalance: one species dominating too heavily
        if current.prey_count > 0 and current.pred_count > 0:
            ratio = current.prey_count / max(current.pred_count, 1)
            if ratio > 8:
                return {
                    "type": "food_scarcity",
                    "action": "drought",
                    "params": {"duration": 300, "food_kill_fraction": 0.5},
                    "reason": f"Prey dominating ({ratio:.0f}:1) — drought to increase predator pressure",
                }
            elif ratio < 0.5:
                return {
                    "type": "food_abundance",
                    "action": "food_bloom",
                    "params": {"food_boost_fraction": 0.5},
                    "reason": f"Predators dominating (ratio {ratio:.1f}:1) — food bloom to help prey recover",
                }

        # Low diversity: too few lineages
        if current.n_lineages < 5 and current.total_alive > 100:
            return {
                "type": "environmental_shift",
                "action": "food_redistribution",
                "params": {},
                "reason": f"Only {current.n_lineages} lineages — redistributing food to break monoculture",
            }

        # Speed stagnation: neither species evolving speed
        if len(self._snapshots) >= 5:
            recent_prey_speeds = [s.prey_speed for s in self._snapshots[-5:]]
            speed_range = max(recent_prey_speeds) - min(recent_prey_speeds)
            if speed_range < 0.1 and current.max_generation > 20:
                return {
                    "type": "environmental_shift",
                    "action": "food_redistribution",
                    "params": {},
                    "reason": "Speed evolution stagnating — reshuffling food to create new selection pressure",
                }

        return None

    # ------------------------------------------------------------------
    # Interventions
    # ------------------------------------------------------------------

    def _apply_intervention(self, eco: Any, intervention: dict, step: int) -> None:
        """Apply an environmental intervention to the ecosystem."""
        action = intervention["action"]
        params = intervention.get("params", {})
        reason = intervention.get("reason", "")
        gen = int(eco.generation[eco.alive].max()) if eco.alive.any() else 0

        if action == "drought":
            # Kill a fraction of food, reduce respawn for N steps
            kill_frac = params.get("food_kill_fraction", 0.5)
            duration = params.get("duration", 300)
            alive_food = np.where(eco.food_alive)[0]
            n_kill = int(len(alive_food) * kill_frac)
            if n_kill > 0:
                to_kill = eco._rng.choice(alive_food, n_kill, replace=False)
                eco.food_alive[to_kill] = False
            self._active_effects.append({
                "type": "drought",
                "end_step": step + duration,
                "original_respawn": 0.15,  # store original respawn rate
            })
            self._pending_narratives.append(self._narrate(
                "intervention",
                f"DROUGHT. The God Agent reduces food by {kill_frac:.0%} for {duration} steps. "
                f"Reason: {reason}. Only the most efficient foragers will survive.",
                gen,
            ))

        elif action == "food_bloom":
            # Respawn all dead food with bonus energy
            dead_food = np.where(~eco.food_alive)[0]
            boost_frac = params.get("food_boost_fraction", 0.5)
            n_respawn = int(len(dead_food) * boost_frac)
            if n_respawn > 0:
                to_respawn = dead_food[:n_respawn]
                half = eco.arena_size / 2.0
                eco.food_x[to_respawn] = eco._rng.uniform(-half, half, n_respawn)
                eco.food_y[to_respawn] = eco._rng.uniform(-half, half, n_respawn)
                eco.food_energy[to_respawn] = 40.0  # extra rich food
                eco.food_alive[to_respawn] = True
            self._pending_narratives.append(self._narrate(
                "intervention",
                f"FOOD BLOOM. The God Agent spawns {n_respawn} rich food sources. "
                f"Reason: {reason}. Prey have a chance to recover.",
                gen,
            ))

        elif action == "mass_extinction":
            # Kill a fraction of organisms, sparing the most energetic
            kill_frac = params.get("kill_fraction", 0.3)
            spare_top = params.get("spare_top_energy", True)
            alive_idx = np.where(eco.alive)[0]
            if spare_top:
                # Sort by energy, kill the bottom fraction
                energies = eco.energy[alive_idx]
                sorted_idx = alive_idx[energies.argsort()]
                n_kill = int(len(sorted_idx) * kill_frac)
                to_kill = sorted_idx[:n_kill]
            else:
                n_kill = int(len(alive_idx) * kill_frac)
                to_kill = eco._rng.choice(alive_idx, n_kill, replace=False)
            eco.alive[to_kill] = False
            eco.energy[to_kill] = 0
            self._pending_narratives.append(self._narrate(
                "intervention",
                f"MASS EXTINCTION. The God Agent culls {n_kill} organisms ({kill_frac:.0%} of population). "
                f"Reason: {reason}. The survivors must repopulate — new lineages will emerge.",
                gen,
            ))

        elif action == "food_redistribution":
            # Move all food to new random positions
            alive_food = np.where(eco.food_alive)[0]
            half = eco.arena_size / 2.0
            eco.food_x[alive_food] = eco._rng.uniform(-half, half, len(alive_food))
            eco.food_y[alive_food] = eco._rng.uniform(-half, half, len(alive_food))
            self._pending_narratives.append(self._narrate(
                "intervention",
                f"ENVIRONMENTAL SHIFT. The God Agent redistributes all food sources. "
                f"Reason: {reason}. Organisms must adapt to the new landscape.",
                gen,
            ))

        # Log intervention
        self._log({
            "type": "intervention",
            "step": step,
            "generation": gen,
            "action": action,
            "params": params,
            "reason": reason,
        })

    def _apply_active_effects(self, eco: Any, step: int) -> None:
        """Apply ongoing environmental effects (e.g., drought reduces food respawn)."""
        expired = []
        for i, effect in enumerate(self._active_effects):
            if step >= effect["end_step"]:
                expired.append(i)
                continue

            if effect["type"] == "drought":
                # During drought: reduce food respawn to 5% (from 15%)
                # We'll patch the respawn fraction temporarily
                eco._drought_active = True

        # Remove expired effects
        for i in reversed(expired):
            effect = self._active_effects.pop(i)
            if effect["type"] == "drought":
                eco._drought_active = False
                gen = int(eco.generation[eco.alive].max()) if eco.alive.any() else 0
                self._pending_narratives.append(self._narrate(
                    "event",
                    "The drought ends. Food begins to recover across the landscape.",
                    gen,
                ))

    # ------------------------------------------------------------------
    # Narrative helpers
    # ------------------------------------------------------------------

    def _narrate(self, event_type: str, text: str, generation: int) -> dict:
        """Create a narrative message dict for the frontend."""
        msg = {
            "type": event_type,
            "text": text,
            "generation": generation,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._log(msg)
        return msg

    def _log(self, record: dict) -> None:
        """Append a record to the JSONL log."""
        try:
            with open(self._log_path, "a") as f:
                f.write(json.dumps(record, default=str) + "\n")
        except Exception:
            pass
