"""Vectorized massive-scale ecosystem for 100K+ organisms.

All state is stored as contiguous numpy arrays.  The step function uses
only vectorized numpy operations — no Python for-loops over organisms.
This makes it possible to simulate hundreds of thousands of organisms
on a single core at interactive frame rates.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from creatures.evolution.morphology import (
    random_morphology,
    N_MORPH_GENES,
    mutate_morphology,
    compute_metabolic_cost,
    compute_speed,
    compute_eat_radius,
    GENE_BODY_LENGTH,
    GENE_BODY_WIDTH,
    GENE_BODY_HEIGHT,
)

logger = logging.getLogger(__name__)


class MassiveEcosystem:
    """Vectorized ecosystem for 100K+ organisms.

    Every piece of per-organism state (position, heading, energy, etc.)
    is a contiguous numpy array of length ``n``.  The ``step()`` method
    advances the entire population in one vectorized call.

    Usage::

        eco = MassiveEcosystem(n_organisms=100_000, arena_size=200.0)
        for _ in range(10_000):
            stats = eco.step(dt=1.0)
    """

    def __init__(
        self,
        n_organisms: int = 100_000,
        arena_size: float = 100.0,
        n_food: int = 10_000,
        seed: int = 42,
    ) -> None:
        self.n = n_organisms
        self.arena_size = arena_size
        half = arena_size / 2.0

        rng = np.random.default_rng(seed)

        # --- Organism state arrays ---
        self.x = rng.uniform(-half, half, n_organisms)
        self.y = rng.uniform(-half, half, n_organisms)
        self.heading = rng.uniform(0, 2 * np.pi, n_organisms)
        self.energy = np.full(n_organisms, 100.0)
        self.alive = np.ones(n_organisms, dtype=bool)
        self.species = np.zeros(n_organisms, dtype=np.int8)  # 0=c_elegans
        self.age = np.zeros(n_organisms, dtype=np.float64)
        self.z = np.zeros(n_organisms)  # vertical position (0 = ground)
        self.pitch = np.zeros(n_organisms)  # vertical angle
        self.speed = np.full(n_organisms, 0.5)  # base movement speed
        self.predator_proximity = np.full(n_organisms, np.inf)  # distance to nearest predator (for C. elegans)

        # --- Morphology (evolvable body plan) ---
        self.morphology = random_morphology(n_organisms, rng)

        # Assign ~15% as drosophila (predators) — realistic predator-prey ratio
        drosophila_mask = rng.random(n_organisms) < 0.15
        self.species[drosophila_mask] = 1

        # --- Food source arrays ---
        self.n_food = n_food
        self.food_x = rng.uniform(-half, half, n_food)
        self.food_y = rng.uniform(-half, half, n_food)
        self.food_energy = np.full(n_food, 25.0)
        self.food_alive = np.ones(n_food, dtype=bool)

        # --- Generational tracking arrays ---
        self.generation = np.zeros(n_organisms, dtype=np.int32)  # generation counter per organism
        self.parent_id = np.full(n_organisms, -1, dtype=np.int32)  # parent index (-1 = no parent)
        self.lineage_id = np.arange(n_organisms, dtype=np.int32)  # unique lineage ID
        self._next_lineage_id = n_organisms  # counter for new lineage IDs
        self.lifetime_food = np.zeros(n_organisms, dtype=np.float32)  # food eaten in lifetime

        # Reserve 20% overcapacity for reproduction (initially dead)
        overcapacity = int(n_organisms * 0.2)
        if overcapacity > 0:
            total_slots = n_organisms + overcapacity
            for attr in ['x', 'y', 'z', 'heading', 'pitch', 'energy', 'alive', 'species', 'age',
                         'speed', 'predator_proximity', 'generation', 'parent_id', 'lineage_id', 'lifetime_food']:
                old = getattr(self, attr)
                new = np.zeros(total_slots, dtype=old.dtype)
                new[:n_organisms] = old
                setattr(self, attr, new)
            # Morphology is 2-D (n, N_MORPH_GENES) — expand along axis 0
            old_morph = self.morphology
            new_morph = np.zeros((total_slots, N_MORPH_GENES), dtype=old_morph.dtype)
            new_morph[:n_organisms] = old_morph
            self.morphology = new_morph
            self.alive[n_organisms:] = False  # extra slots start dead
            self.n = total_slots  # update total slot count

        # Bookkeeping
        self._rng = rng
        self._step_count = 0
        self._total_born = 0
        self._total_died = 0
        self._total_predation = 0
        self._predation_events: list[dict] = []  # ring buffer, max 100

    # ------------------------------------------------------------------
    # Main simulation step (fully vectorized)
    # ------------------------------------------------------------------

    def step(self, dt: float = 1.0) -> dict[str, Any]:
        """Advance the entire ecosystem by *dt* time units.

        Returns a summary dict suitable for dashboards / logging.
        """
        alive = self.alive

        # 1. Energy decay — morphology-driven metabolic cost
        alive_indices = np.where(alive)[0]
        if getattr(self, '_neural_control', False):
            # Per-organism cost from body morphology (creates selection pressure)
            metabolic_costs = compute_metabolic_cost(self.morphology[alive_indices])
            self.energy[alive] -= metabolic_costs * dt
        else:
            self.energy[alive] -= 0.01 * dt

        # 2. Movement — steer toward nearest food + noise
        # When neural_control is enabled (via BrainWorld), skip hardcoded movement
        # so the neural network is the ONLY driver of behavior.
        if not getattr(self, '_neural_control', False):
            self._move(dt)

        # 2b. 3D physics — gravity, repulsion, arena boundaries
        self._physics_3d(dt)

        # 3. Food consumption — morphology-based eat radius
        n_eaten = self._eat()

        # 3b. Predation — disabled for now to let evolution work on food-seeking first.
        # Re-enable once base chemotaxis is evolved and prey can survive.
        # n_predation = self._predation() if max_gen >= 10 else 0
        n_predation = 0

        # 4. Death — energy depletion + aging
        newly_dead = alive & (self.energy <= 0)
        # Age-based death: probability increases with age (max lifespan ~1000 steps)
        # Faster turnover = more generations = faster evolution
        if getattr(self, '_neural_control', False):
            age_death_prob = np.clip((self.age - 500) / 500, 0, 0.02)  # 2% chance/step after age 500
            age_death = alive & (self._rng.random(len(alive)) < age_death_prob)
            newly_dead = newly_dead | age_death
        n_died = int(np.sum(newly_dead))
        self.alive[newly_dead] = False
        self._total_died += n_died

        # 5. Reproduction — prey reproduce faster (lower threshold) to offset predation
        # This mirrors biology: prey species (r-strategists) reproduce faster than predators
        n_born = self._reproduce(
            prey_threshold=90.0,    # C. elegans: reproduce quickly (r-strategy)
            pred_threshold=130.0,   # Drosophila: reproduce slower (K-strategy)
            offspring_cost=35.0,
        )

        # 6. Respawn depleted food (keep the ecosystem running)
        self._respawn_food()

        # 7. Age
        self.age[self.alive] += dt

        self._step_count += 1
        n_alive = int(np.sum(self.alive))

        return {
            "step": self._step_count,
            "alive": n_alive,
            "dead": int(np.sum(~self.alive)),
            "born_this_step": n_born,
            "died_this_step": n_died,
            "eaten_this_step": n_eaten,
            "predation_this_step": n_predation,
            "mean_energy": float(np.mean(self.energy[self.alive]))
            if n_alive > 0
            else 0.0,
        }

    # ------------------------------------------------------------------
    # Movement (vectorized)
    # ------------------------------------------------------------------

    def _move(self, dt: float) -> None:
        """Move all alive organisms toward nearest food + random noise."""
        alive = self.alive
        food_alive = self.food_alive
        rng = self._rng

        if not np.any(alive) or not np.any(food_alive):
            return

        # Indices
        alive_idx = np.where(alive)[0]
        food_idx = np.where(food_alive)[0]
        n_alive = len(alive_idx)

        # Subsample food for distance computation if too many
        max_food = min(len(food_idx), 500)
        if len(food_idx) > max_food:
            food_sample = rng.choice(food_idx, max_food, replace=False)
        else:
            food_sample = food_idx

        # Distance from each alive organism to each sampled food
        # Shape: (n_alive, n_food_sample)
        ox = self.x[alive_idx]
        oy = self.y[alive_idx]
        fx = self.food_x[food_sample]
        fy = self.food_y[food_sample]

        dx = fx[None, :] - ox[:, None]  # (n_alive, n_food)
        dy = fy[None, :] - oy[:, None]
        dist2 = dx * dx + dy * dy

        # Nearest food per organism
        nearest = np.argmin(dist2, axis=1)  # index into food_sample
        best_dx = dx[np.arange(n_alive), nearest]
        best_dy = dy[np.arange(n_alive), nearest]
        best_dist = np.sqrt(dist2[np.arange(n_alive), nearest]) + 1e-8

        # Unit direction toward nearest food
        dir_x = best_dx / best_dist
        dir_y = best_dy / best_dist

        # Add noise to heading
        noise = rng.normal(0, 0.3, n_alive)
        angle = np.arctan2(dir_y, dir_x) + noise

        # Update position
        speed = self.speed[alive_idx] * dt
        self.x[alive_idx] += np.cos(angle) * speed
        self.y[alive_idx] += np.sin(angle) * speed
        self.heading[alive_idx] = angle

        # Wrap around arena
        half = self.arena_size / 2.0
        self.x[alive_idx] = ((self.x[alive_idx] + half) % self.arena_size) - half
        self.y[alive_idx] = ((self.y[alive_idx] + half) % self.arena_size) - half

    # ------------------------------------------------------------------
    # 3D Physics (vectorized)
    # ------------------------------------------------------------------

    def _physics_3d(self, dt: float) -> None:
        """Apply gravity, organism-organism repulsion, and arena boundaries.

        All operations are vectorized over alive organisms.
        """
        alive_idx = np.where(self.alive)[0]
        if len(alive_idx) == 0:
            return

        # --- Gravity: pull organisms toward ground ---
        self.z[alive_idx] -= 0.05 * dt
        self.z = np.maximum(self.z, 0.0)

        # --- Organism-organism repulsion (nearest-5 batch approach) ---
        n_alive = len(alive_idx)
        if n_alive > 1:
            mean_body_length = float(np.mean(
                self.morphology[alive_idx, GENE_BODY_LENGTH]
            ))
            repulsion_radius = mean_body_length * 0.5
            r2 = repulsion_radius * repulsion_radius

            # Process in batches to control memory: O(batch * n_sample)
            batch_size = 4000
            # Subsample neighbors for distance calc if population is large
            max_sample = min(n_alive, 2000)
            if n_alive > max_sample:
                sample_idx = self._rng.choice(alive_idx, max_sample, replace=False)
            else:
                sample_idx = alive_idx

            sx = self.x[sample_idx]
            sy = self.y[sample_idx]
            sz = self.z[sample_idx]

            for start in range(0, n_alive, batch_size):
                batch = alive_idx[start:start + batch_size]
                bx = self.x[batch]
                by = self.y[batch]
                bz = self.z[batch]

                # Distance to all sampled organisms: (batch, sample)
                dx = sx[None, :] - bx[:, None]
                dy = sy[None, :] - by[:, None]
                dz = sz[None, :] - bz[:, None]
                dist2 = dx * dx + dy * dy + dz * dz

                # Avoid self-repulsion by setting self-distances to inf
                # (when batch organism is in sample, mask it out)
                # This is approximate but fast — set very small distances to inf
                dist2 = np.where(dist2 < 1e-12, np.inf, dist2)

                # Find nearest 5 neighbors
                k = min(5, dist2.shape[1])
                # argpartition is O(n) — much faster than full sort
                nearest_k = np.argpartition(dist2, k, axis=1)[:, :k]
                rows = np.arange(len(batch))[:, None]
                nearest_dist2 = dist2[rows, nearest_k]
                nearest_dx = dx[rows, nearest_k]
                nearest_dy = dy[rows, nearest_k]
                nearest_dz = dz[rows, nearest_k]

                # Only repel if within repulsion radius
                in_range = nearest_dist2 < r2
                nearest_dist = np.sqrt(nearest_dist2 + 1e-12)
                # Repulsion force: stronger when closer (inverse-linear)
                force_mag = np.where(
                    in_range,
                    (repulsion_radius - nearest_dist) / (nearest_dist + 1e-8) * 0.1 * dt,
                    0.0,
                )
                # Direction: push AWAY from neighbor (negate the dx/dy/dz)
                fx = np.sum(-nearest_dx / (nearest_dist + 1e-8) * force_mag, axis=1)
                fy = np.sum(-nearest_dy / (nearest_dist + 1e-8) * force_mag, axis=1)
                fz = np.sum(-nearest_dz / (nearest_dist + 1e-8) * force_mag, axis=1)

                self.x[batch] += fx
                self.y[batch] += fy
                self.z[batch] += fz

            # Ground clamp after repulsion
            self.z = np.maximum(self.z, 0.0)

        # --- Arena soft walls: spring force pushing back ---
        half = self.arena_size / 2.0
        spring_k = 0.2 * dt
        # X boundaries
        over_x_pos = self.x[alive_idx] - half
        over_x_neg = -half - self.x[alive_idx]
        self.x[alive_idx] -= np.where(over_x_pos > 0, over_x_pos * spring_k, 0.0)
        self.x[alive_idx] += np.where(over_x_neg > 0, over_x_neg * spring_k, 0.0)
        # Y boundaries
        over_y_pos = self.y[alive_idx] - half
        over_y_neg = -half - self.y[alive_idx]
        self.y[alive_idx] -= np.where(over_y_pos > 0, over_y_pos * spring_k, 0.0)
        self.y[alive_idx] += np.where(over_y_neg > 0, over_y_neg * spring_k, 0.0)

    # ------------------------------------------------------------------
    # Eating (vectorized)
    # ------------------------------------------------------------------

    def _eat(self) -> int:
        """Organisms within morphology-based eat radius consume food."""
        alive = self.alive
        food_alive = self.food_alive

        if not np.any(alive) or not np.any(food_alive):
            return 0

        alive_idx = np.where(alive)[0]
        food_idx = np.where(food_alive)[0]

        # Per-organism eat radii from morphology
        all_eat_radii = compute_eat_radius(self.morphology[alive_idx])
        # Use mean radius for the broad-phase distance check (perf optimization)
        mean_r = float(np.mean(all_eat_radii))
        mean_r2 = mean_r * mean_r

        # For very large populations, do proximity check in batches
        # to avoid O(n_organisms * n_food) memory explosion.
        n_eaten = 0
        batch_size = 5000

        for start in range(0, len(alive_idx), batch_size):
            batch = alive_idx[start : start + batch_size]
            batch_radii = all_eat_radii[start : start + batch_size]
            batch_r2 = batch_radii * batch_radii
            # Remaining live food
            food_idx = np.where(self.food_alive)[0]
            if len(food_idx) == 0:
                break

            dx = self.food_x[food_idx][None, :] - self.x[batch][:, None]
            dy = self.food_y[food_idx][None, :] - self.y[batch][:, None]
            dist2 = dx * dx + dy * dy  # (batch, food)

            # Each organism eats its nearest food if within its individual radius
            nearest_food = np.argmin(dist2, axis=1)
            nearest_dist2 = dist2[np.arange(len(batch)), nearest_food]
            # Verify against per-organism radius (not the mean)
            can_eat = nearest_dist2 < batch_r2

            if not np.any(can_eat):
                continue

            eaters = batch[can_eat]
            food_eaten_local = nearest_food[can_eat]
            food_eaten_global = food_idx[food_eaten_local]

            # Transfer energy (each food source eaten at most once)
            unique_food, first_eater = np.unique(
                food_eaten_global, return_index=True
            )
            food_energy_consumed = self.food_energy[unique_food]
            self.energy[eaters[first_eater]] += food_energy_consumed
            # Track lifetime food consumption
            self.lifetime_food[eaters[first_eater]] += food_energy_consumed
            self.food_alive[unique_food] = False
            n_eaten += len(unique_food)

        return n_eaten

    # ------------------------------------------------------------------
    # Predation (vectorized)
    # ------------------------------------------------------------------

    def _predation(self, kill_radius: float = 1.2) -> int:
        """Drosophila (species=1) prey on C. elegans (species=0).

        Fully vectorized using batched spatial distance matrices.
        Each predator has a 30% chance per step to kill the closest prey
        within *kill_radius*. Predator gains 40% of prey energy.
        Probabilistic predation creates selection pressure without
        causing instant extinction.

        Also updates ``self.predator_proximity`` for danger-signal injection.

        Returns the number of predation events this step.
        """
        alive = self.alive

        # Identify predators and prey
        predator_mask = alive & (self.species == 1) & (self.energy > 30.0)
        prey_mask = alive & (self.species == 0)

        predator_idx = np.where(predator_mask)[0]
        prey_idx = np.where(prey_mask)[0]

        # Reset predator_proximity for all alive C. elegans
        self.predator_proximity[prey_mask] = np.inf

        if len(predator_idx) == 0 or len(prey_idx) == 0:
            return 0

        # --- Update predator_proximity for ALL alive C. elegans ---
        # (needed for danger signal even when no kills happen)
        # Batch to control memory: O(n_prey_batch * n_predator)
        all_predator_idx = np.where(alive & (self.species == 1))[0]
        if len(all_predator_idx) > 0:
            px = self.x[all_predator_idx]
            py = self.y[all_predator_idx]
            batch_size = 5000
            for start in range(0, len(prey_idx), batch_size):
                batch = prey_idx[start:start + batch_size]
                dx = px[None, :] - self.x[batch][:, None]
                dy = py[None, :] - self.y[batch][:, None]
                dist = np.sqrt(dx * dx + dy * dy)
                self.predator_proximity[batch] = np.min(dist, axis=1)

        # --- Predation kills (batched) ---
        n_killed = 0
        r2 = kill_radius * kill_radius
        batch_size = 3000

        for start in range(0, len(predator_idx), batch_size):
            pred_batch = predator_idx[start:start + batch_size]
            # Recompute live prey each batch (some may have been eaten)
            current_prey = np.where(self.alive & (self.species == 0))[0]
            if len(current_prey) == 0:
                break

            # Distance matrix: (n_pred_batch, n_prey)
            dx = self.x[current_prey][None, :] - self.x[pred_batch][:, None]
            dy = self.y[current_prey][None, :] - self.y[pred_batch][:, None]
            dist2 = dx * dx + dy * dy

            # Each predator targets its nearest prey
            nearest_prey_local = np.argmin(dist2, axis=1)
            nearest_dist2 = dist2[np.arange(len(pred_batch)), nearest_prey_local]

            in_range = nearest_dist2 < r2
            if not np.any(in_range):
                continue

            # Probabilistic predation (30% chance per step) — creates selection
            # pressure without instant extinction
            kill_roll = self._rng.random(len(pred_batch)) < 0.05
            can_kill = in_range & kill_roll
            if not np.any(can_kill):
                continue

            killers = pred_batch[can_kill]
            victim_local = nearest_prey_local[can_kill]
            victim_global = current_prey[victim_local]

            # Each prey can only be killed once per batch — first predator wins
            unique_victims, first_killer_idx = np.unique(victim_global, return_index=True)
            first_killers = killers[first_killer_idx]

            # Energy transfer: predator gains 40% of prey energy
            energy_gained = self.energy[unique_victims] * 0.4
            self.energy[first_killers] += energy_gained

            # Prey dies
            self.alive[unique_victims] = False

            # Log predation events (ring buffer, max 100)
            for k, v, eg in zip(
                first_killers.tolist(),
                unique_victims.tolist(),
                energy_gained.tolist(),
            ):
                event = {
                    "step": self._step_count,
                    "predator_idx": k,
                    "prey_idx": v,
                    "energy_gained": eg,
                }
                if len(self._predation_events) >= 100:
                    self._predation_events.pop(0)
                self._predation_events.append(event)

            n_killed += len(unique_victims)

        self._total_predation += n_killed
        self._total_died += n_killed
        return n_killed

    # ------------------------------------------------------------------
    # Reproduction (vectorized)
    # ------------------------------------------------------------------

    def _reproduce(
        self,
        prey_threshold: float = 90.0,
        pred_threshold: float = 130.0,
        offspring_cost: float = 35.0,
    ) -> int:
        """Tournament selection with species-specific thresholds.

        Prey (C. elegans, species=0) reproduce at lower energy threshold
        (r-strategy: many offspring, fast reproduction) to offset predation.
        Predators (Drosophila, species=1) reproduce at higher threshold
        (K-strategy: fewer, better-provisioned offspring).
        """
        # Species-specific reproduction thresholds
        thresholds = np.where(self.species == 0, prey_threshold, pred_threshold)
        can_reproduce = self.alive & (self.energy > thresholds)
        candidates = np.where(can_reproduce)[0]
        if len(candidates) == 0:
            return 0

        dead_slots = np.where(~self.alive)[0]
        if len(dead_slots) == 0:
            return 0

        rng = self._rng

        # Tournament selection: for each dead slot, find the highest-energy
        # candidate within a local radius (tournament_radius). This selects
        # for organisms that are BETTER at gathering energy, not just above threshold.
        tournament_radius = self.arena_size * 0.15  # 15% of arena
        parents_list = []
        slots_list = []

        for slot in dead_slots:
            if len(candidates) == 0:
                break

            # Pick a random candidate as the "center" of the tournament
            center_idx = rng.integers(0, len(candidates))
            center = candidates[center_idx]
            cx, cy = self.x[center], self.y[center]

            # Find all candidates within tournament radius
            dx = self.x[candidates] - cx
            dy = self.y[candidates] - cy
            dists = dx * dx + dy * dy
            in_range = dists < tournament_radius * tournament_radius
            local_candidates = candidates[in_range]

            if len(local_candidates) == 0:
                local_candidates = np.array([center])

            # Winner = highest energy in the local neighborhood
            winner = local_candidates[np.argmax(self.energy[local_candidates])]
            parents_list.append(winner)
            slots_list.append(slot)

            # Stop when all dead slots are filled
            if len(parents_list) >= len(dead_slots):
                break

        if not parents_list:
            return 0

        parents = np.array(parents_list)
        slots = np.array(slots_list)
        n_births = len(parents)

        # Parent pays energy cost
        self.energy[parents] -= offspring_cost

        # Offspring inherits position + small offset
        self.x[slots] = self.x[parents] + rng.normal(0, 0.5, n_births)
        self.y[slots] = self.y[parents] + rng.normal(0, 0.5, n_births)
        self.z[slots] = 0.0  # offspring start on ground
        self.heading[slots] = rng.uniform(0, 2 * np.pi, n_births)
        self.pitch[slots] = 0.0
        self.energy[slots] = offspring_cost * 0.8
        self.species[slots] = self.species[parents]
        self.age[slots] = 0.0
        self.speed[slots] = self.speed[parents]
        self.alive[slots] = True

        # Inherit and mutate morphology
        self.morphology[slots] = self.morphology[parents]
        for i, s in enumerate(slots):
            self.morphology[s] = mutate_morphology(
                self.morphology[s], sigma=0.1, rng=self._rng
            )

        # Track generational lineage
        self.generation[slots] = self.generation[parents] + 1
        self.parent_id[slots] = parents
        self.lifetime_food[slots] = 0.0
        for p, s in zip(parents, slots):
            self.lineage_id[s] = self.lineage_id[p]

        self._total_born += n_births

        # Store parent-offspring mapping for neural weight inheritance
        self._last_births = list(zip(parents.tolist(), slots.tolist()))

        return n_births

    # ------------------------------------------------------------------
    # Food respawn
    # ------------------------------------------------------------------

    def _respawn_food(self, respawn_fraction: float = 0.15) -> None:
        """Respawn a fraction of eaten food sources each step."""
        dead_food = np.where(~self.food_alive)[0]
        if len(dead_food) == 0:
            return
        n_respawn = max(1, int(len(dead_food) * respawn_fraction))
        to_respawn = self._rng.choice(dead_food, min(n_respawn, len(dead_food)), replace=False)
        half = self.arena_size / 2.0
        self.food_x[to_respawn] = self._rng.uniform(-half, half, len(to_respawn))
        self.food_y[to_respawn] = self._rng.uniform(-half, half, len(to_respawn))
        self.food_energy[to_respawn] = 25.0
        self.food_alive[to_respawn] = True

    # ------------------------------------------------------------------
    # Visualization helpers
    # ------------------------------------------------------------------

    def get_state_summary(self, max_display: int = 1000) -> dict[str, Any]:
        """Get state for visualization (subsampled for large populations).

        Parameters
        ----------
        max_display:
            Maximum number of organisms to include in the ``organisms``
            list.  Larger populations are randomly subsampled.
        """
        alive = self.alive
        n_alive = int(np.sum(alive))

        if n_alive > max_display:
            indices = self._rng.choice(
                np.where(alive)[0], max_display, replace=False
            )
        else:
            indices = np.where(alive)[0]

        return {
            "total_alive": n_alive,
            "total_dead": int(np.sum(~alive)),
            "total_born": self._total_born,
            "total_died": self._total_died,
            "step": self._step_count,
            "organisms": [
                {
                    "x": float(self.x[i]),
                    "y": float(self.y[i]),
                    "z": float(self.z[i]),
                    "pitch": float(self.pitch[i]),
                    "species": int(self.species[i]),
                    "energy": float(self.energy[i]),
                    "age": float(self.age[i]),
                    "generation": int(self.generation[i]),
                    "lineage_id": int(self.lineage_id[i]),
                    "body_length": float(self.morphology[i, GENE_BODY_LENGTH]),
                    "body_width": float(self.morphology[i, GENE_BODY_WIDTH]),
                    "body_height": float(self.morphology[i, GENE_BODY_HEIGHT]),
                    "n_segments": int(round(self.morphology[i, 3])),
                    "limb_count": int(round(self.morphology[i, 4])),
                    "color_hue": float(self.morphology[i, 6]),
                }
                for i in indices
            ],
            "stats": {
                "c_elegans": int(np.sum(self.species[alive] == 0)),
                "drosophila": int(np.sum(self.species[alive] == 1)),
                "mean_energy": float(np.mean(self.energy[alive]))
                if n_alive > 0
                else 0.0,
                "mean_age": float(np.mean(self.age[alive]))
                if n_alive > 0
                else 0.0,
                "total_predation_events": self._total_predation,
                "recent_predation": self._predation_events[-10:],
            },
        }


# ======================================================================
# Benchmark
# ======================================================================

if __name__ == "__main__":
    import time

    print("MassiveEcosystem Benchmark")
    print("=" * 60)
    print(f"  {'Organisms':>12}  {'Init (s)':>10}  {'Step (ms)':>10}")
    print("-" * 60)

    for n in [1_000, 10_000, 100_000]:
        t0 = time.perf_counter()
        eco = MassiveEcosystem(n_organisms=n, arena_size=200.0)
        init_time = time.perf_counter() - t0

        # Warm-up
        eco.step()

        t0 = time.perf_counter()
        n_steps = 100
        for _ in range(n_steps):
            eco.step()
        step_time = (time.perf_counter() - t0) / n_steps * 1000

        stats = eco.get_state_summary()
        print(
            f"  {n:>12,}  {init_time:>10.3f}  {step_time:>10.1f}  "
            f"(alive={stats['total_alive']:,})"
        )

    print("=" * 60)
