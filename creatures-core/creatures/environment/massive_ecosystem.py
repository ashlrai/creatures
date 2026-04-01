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
    GENE_SENSOR_RANGE,
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
        self.predator_direction = np.zeros(n_organisms)  # angle to nearest predator relative to heading
        self.prey_proximity = np.full(n_organisms, np.inf)  # distance to nearest prey (for predators)
        self.prey_direction = np.zeros(n_organisms)  # angle to nearest prey relative to heading

        # --- Morphology (evolvable body plan) ---
        self.morphology = random_morphology(n_organisms, rng)

        # Assign ~15% as drosophila (predators) — typical predator-prey ratio
        drosophila_mask = rng.random(n_organisms) < 0.15
        # Predators start with higher energy (adapted to survive early game)
        self.energy[drosophila_mask] = 150.0
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

        # Reserve 100% overcapacity for reproduction (initially dead) —
        # generous headroom ensures continuous generational turnover
        overcapacity = int(n_organisms * 1.0)
        if overcapacity > 0:
            total_slots = n_organisms + overcapacity
            for attr in ['x', 'y', 'z', 'heading', 'pitch', 'energy', 'alive', 'species', 'age',
                         'speed', 'predator_proximity', 'predator_direction',
                         'prey_proximity', 'prey_direction',
                         'generation', 'parent_id', 'lineage_id', 'lifetime_food']:
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
        self._active_chases: list[tuple[int, int]] = []  # (predator_idx, prey_idx) pairs for visualization

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

        # 3b. Predation activates after generation 3 — arms race starts early
        max_gen = int(self.generation[self.alive].max()) if self.alive.any() else 0
        n_predation = self._predation() if max_gen >= 3 else 0

        # 4. Death — energy depletion + aging
        newly_dead = alive & (self.energy <= 0)
        # Age-based death: probability increases with age (max lifespan ~350 steps)
        # Fast turnover = more generations = faster evolution of arms race
        if getattr(self, '_neural_control', False):
            age_death_prob = np.clip((self.age - 150) / 200, 0, 0.05)  # 5% chance/step after age 150
            age_death = alive & (self._rng.random(len(alive)) < age_death_prob)
            newly_dead = newly_dead | age_death
        n_died = int(np.sum(newly_dead))
        self.alive[newly_dead] = False
        self._total_died += n_died

        # 5. Reproduction — prey reproduce faster (lower threshold) to offset predation
        # This mirrors biology: prey species (r-strategists) reproduce faster than predators
        n_born = self._reproduce(
            prey_threshold=50.0,    # C. elegans: reproduce very quickly (r-strategy, high fecundity)
            pred_threshold=100.0,   # Drosophila: must accumulate energy to reproduce (K-strategy)
            prey_cost=20.0,         # Low cost per offspring — many small offspring
            pred_cost=35.0,         # Higher cost — fewer, better-provisioned offspring
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
            # Predators get 60% energy from plant food — they can scavenge but
            # depend on hunting for optimal nutrition
            actual_eaters = eaters[first_eater]
            species_efficiency = np.where(
                self.species[actual_eaters] == 0, 1.0, 0.6
            )
            self.energy[actual_eaters] += food_energy_consumed * species_efficiency
            # Track lifetime food consumption
            self.lifetime_food[eaters[first_eater]] += food_energy_consumed
            self.food_alive[unique_food] = False
            n_eaten += len(unique_food)

        return n_eaten

    # ------------------------------------------------------------------
    # Predation (vectorized)
    # ------------------------------------------------------------------

    def _predation(self) -> int:
        """Drosophila (species=1) prey on C. elegans (species=0).

        Fully vectorized using batched spatial distance matrices.
        Strong predation pressure drives an evolutionary arms race:
        - Kill probability ~35% per step when in range (strong selector)
        - Kill range scales with predator body_length
        - Size-based predation: predator must be > 0.7x prey body_length
        - Speed-based escape: faster prey have lower kill probability
        - Hunting cost: failed hunts cost predator energy
        - Pack bonus: multiple predators near same prey increase kill chance

        Also updates ``self.predator_proximity`` and ``self.predator_direction``
        for danger-signal injection into neural networks.

        Returns the number of predation events this step.
        """
        alive = self.alive

        # Identify predators and prey
        predator_mask = alive & (self.species == 1) & (self.energy > 30.0)
        prey_mask = alive & (self.species == 0)

        predator_idx = np.where(predator_mask)[0]
        prey_idx = np.where(prey_mask)[0]

        # Reset proximity/direction for all alive C. elegans
        self.predator_proximity[prey_mask] = np.inf
        self.predator_direction[prey_mask] = 0.0
        # Reset prey direction for predators
        self.prey_direction[predator_mask] = 0.0
        self.prey_proximity[predator_mask] = np.inf

        # Clear active chases from last step
        self._active_chases = []

        if len(predator_idx) == 0 or len(prey_idx) == 0:
            return 0

        # --- Update predator_proximity AND predator_direction for ALL prey ---
        all_predator_idx = np.where(alive & (self.species == 1))[0]
        if len(all_predator_idx) > 0:
            px = self.x[all_predator_idx]
            py = self.y[all_predator_idx]
            batch_size = 5000
            for start in range(0, len(prey_idx), batch_size):
                batch = prey_idx[start:start + batch_size]
                dx = px[None, :] - self.x[batch][:, None]
                dy = py[None, :] - self.y[batch][:, None]
                dist = np.sqrt(dx * dx + dy * dy + 1e-12)
                nearest = np.argmin(dist, axis=1)
                self.predator_proximity[batch] = dist[np.arange(len(batch)), nearest]
                # Direction: angle from prey to nearest predator relative to prey heading
                pred_dx = dx[np.arange(len(batch)), nearest]
                pred_dy = dy[np.arange(len(batch)), nearest]
                abs_angle = np.arctan2(pred_dy, pred_dx)
                rel_angle = abs_angle - self.heading[batch]
                # Normalize to [-pi, pi]
                rel_angle = (rel_angle + np.pi) % (2 * np.pi) - np.pi
                self.predator_direction[batch] = rel_angle

        # --- Update prey_proximity AND prey_direction for ALL predators ---
        if len(prey_idx) > 0:
            prey_x = self.x[prey_idx]
            prey_y = self.y[prey_idx]
            batch_size = 5000
            for start in range(0, len(predator_idx), batch_size):
                batch = predator_idx[start:start + batch_size]
                dx = prey_x[None, :] - self.x[batch][:, None]
                dy = prey_y[None, :] - self.y[batch][:, None]
                dist = np.sqrt(dx * dx + dy * dy + 1e-12)
                nearest = np.argmin(dist, axis=1)
                self.prey_proximity[batch] = dist[np.arange(len(batch)), nearest]
                prey_dx = dx[np.arange(len(batch)), nearest]
                prey_dy = dy[np.arange(len(batch)), nearest]
                abs_angle = np.arctan2(prey_dy, prey_dx)
                rel_angle = abs_angle - self.heading[batch]
                rel_angle = (rel_angle + np.pi) % (2 * np.pi) - np.pi
                self.prey_direction[batch] = rel_angle

        # --- Predation kills (batched) ---
        n_killed = 0
        batch_size = 3000

        for start in range(0, len(predator_idx), batch_size):
            pred_batch = predator_idx[start:start + batch_size]
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
            nearest_dist = np.sqrt(nearest_dist2 + 1e-12)

            # Kill range scales with predator body_length (bigger predators reach further)
            pred_body_length = self.morphology[pred_batch, GENE_BODY_LENGTH]
            kill_range = 0.8 + 0.4 * pred_body_length  # range 1.2 - 2.0

            in_range = nearest_dist < kill_range
            if not np.any(in_range):
                # Hunting cost: predators that are actively chasing burn extra energy
                self.energy[pred_batch] -= 0.3
                continue

            # Track active chases (predator-prey pairs where predator is close)
            chase_range = kill_range * 3.0  # show chase lines at 3x kill range
            chasing = nearest_dist < chase_range
            for i in np.where(chasing)[0]:
                pred_i = pred_batch[i]
                prey_i = current_prey[nearest_prey_local[i]]
                self._active_chases.append((int(pred_i), int(prey_i)))

            # --- Size check: predator must be > 0.7x prey body_length ---
            prey_body_length = self.morphology[
                current_prey[nearest_prey_local], GENE_BODY_LENGTH
            ]
            size_ok = pred_body_length >= (prey_body_length * 0.7)

            # --- Ratio-dependent kill probability (Lotka-Volterra inspired) ---
            # Kill probability scales with prey:predator ratio — when prey are
            # abundant, hunting is easy; when prey are scarce, hunting is hard.
            # This naturally prevents extinction cascades.
            max_gen = int(self.generation[self.alive].max()) if self.alive.any() else 0
            n_prey_now = int((self.alive & (self.species == 0)).sum())
            n_pred_now = int((self.alive & (self.species == 1)).sum())
            prey_pred_ratio = n_prey_now / max(n_pred_now, 1)
            # Ratio factor: full effect at 5:1, zero at 1:1 or below
            ratio_factor = np.clip((prey_pred_ratio - 1.0) / 4.0, 0.0, 1.0)
            # Generation ramp: 3% at gen 3, up to 20% at gen 20+
            gen_base = min(0.20, 0.03 + 0.01 * max(0, max_gen - 3))
            base_kill_p = gen_base * ratio_factor
            kill_prob = np.full(len(pred_batch), base_kill_p)

            # --- Speed modulation: faster prey are harder to catch ---
            prey_speed = compute_speed(
                self.morphology[current_prey[nearest_prey_local]]
            )
            pred_speed = compute_speed(self.morphology[pred_batch])
            speed_ratio = pred_speed / (prey_speed + 1e-8)
            # If predator is slower than prey, kill chance drops dramatically
            # speed_ratio < 0.8 → kill_prob * 0.1, speed_ratio > 1.2 → kill_prob * 1.5
            speed_factor = np.clip(speed_ratio * 0.8, 0.05, 1.5)
            kill_prob *= speed_factor

            # --- Dilution effect: prey in groups are harder to kill ---
            # Safety in numbers — creates selection pressure for flocking/herding.
            # Each nearby prey dilutes the predator's targeting accuracy.
            prey_targets = current_prey[nearest_prey_local]
            all_prey_x = self.x[current_prey]
            all_prey_y = self.y[current_prey]
            for i in range(len(pred_batch)):
                if not in_range[i]:
                    continue
                target_x = self.x[prey_targets[i]]
                target_y = self.y[prey_targets[i]]
                # Count prey within 2.0 of the targeted prey
                pdx = all_prey_x - target_x
                pdy = all_prey_y - target_y
                nearby_prey = int(np.sum((pdx * pdx + pdy * pdy) < 4.0)) - 1  # exclude self
                if nearby_prey >= 2:
                    # Each nearby prey reduces kill chance by 15% (confusion effect)
                    dilution = max(0.15, 1.0 - 0.15 * nearby_prey)
                    kill_prob[i] *= dilution

            # --- Pack bonus: count nearby predators within 3.0 of each prey ---
            # More predators near the same prey → higher kill chance (emergent pack hunting)
            for i in range(len(pred_batch)):
                if in_range[i]:
                    prey_pos_x = self.x[prey_targets[i]]
                    prey_pos_y = self.y[prey_targets[i]]
                    ddx = self.x[pred_batch] - prey_pos_x
                    ddy = self.y[pred_batch] - prey_pos_y
                    nearby_preds = np.sum((ddx * ddx + ddy * ddy) < 9.0)
                    if nearby_preds >= 2:
                        kill_prob[i] *= 1.0 + 0.3 * (nearby_preds - 1)  # +30% per extra predator

            # --- Roll for kill ---
            kill_roll = self._rng.random(len(pred_batch)) < kill_prob
            can_kill = in_range & kill_roll & size_ok
            if not np.any(can_kill):
                # Hunting cost for failed hunts (prevents spam attacks)
                failed = in_range & ~can_kill
                self.energy[pred_batch[failed]] -= 1.0
                continue

            killers = pred_batch[can_kill]
            victim_local = nearest_prey_local[can_kill]
            victim_global = current_prey[victim_local]

            # Each prey can only be killed once per batch — first predator wins
            unique_victims, first_killer_idx = np.unique(victim_global, return_index=True)
            first_killers = killers[first_killer_idx]

            # Energy transfer: predator gains 50% of prey energy (rewarding successful hunts)
            energy_gained = self.energy[unique_victims] * 0.5
            self.energy[first_killers] += energy_gained

            # Hunting cost for failed hunters (in range but didn't get the kill)
            failed_hunters = np.setdiff1d(pred_batch[in_range], first_killers)
            if len(failed_hunters) > 0:
                self.energy[failed_hunters] -= 1.0

            # Prey dies
            self.alive[unique_victims] = False

            # Log predation events with positions for frontend kill effects
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
                    "x": float(self.x[v]),
                    "y": float(self.y[v]),
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
        prey_threshold: float = 50.0,
        pred_threshold: float = 150.0,
        prey_cost: float = 20.0,
        pred_cost: float = 40.0,
    ) -> int:
        """Tournament selection with species-specific thresholds and costs.

        Prey (C. elegans, species=0) reproduce at lower energy threshold
        with lower offspring cost (r-strategy: many small offspring).
        Predators (Drosophila, species=1) reproduce at higher threshold
        (K-strategy: fewer, better-provisioned offspring).
        """
        # Species-specific reproduction thresholds
        thresholds = np.where(self.species == 0, prey_threshold, pred_threshold)
        can_reproduce = self.alive & (self.energy > thresholds)

        # Split candidates by species — ensures both species get reproduction slots
        prey_candidates = np.where(can_reproduce & (self.species == 0))[0]
        pred_candidates = np.where(can_reproduce & (self.species == 1))[0]

        if len(prey_candidates) == 0 and len(pred_candidates) == 0:
            return 0

        dead_slots = np.where(~self.alive)[0]
        if len(dead_slots) == 0:
            return 0

        rng = self._rng

        # Allocate dead slots between species proportionally to their current
        # population, with a minimum floor of 20% for the minority species.
        # This prevents competitive exclusion while maintaining ecological pressure.
        n_prey_alive = int((self.alive & (self.species == 0)).sum())
        n_pred_alive = int((self.alive & (self.species == 1)).sum())
        total_alive = n_prey_alive + n_pred_alive
        if total_alive > 0:
            pred_frac = max(0.20, n_pred_alive / total_alive)
        else:
            pred_frac = 0.15
        n_pred_slots = max(1, int(len(dead_slots) * pred_frac))
        n_prey_slots = len(dead_slots) - n_pred_slots

        # Tournament selection within each species pool
        tournament_radius = self.arena_size * 0.15

        def _select_parents(candidates, slots, max_births):
            parents_list = []
            slots_list = []
            for slot in slots[:max_births]:
                if len(candidates) == 0:
                    break
                center_idx = rng.integers(0, len(candidates))
                center = candidates[center_idx]
                cx, cy = self.x[center], self.y[center]
                dx = self.x[candidates] - cx
                dy = self.y[candidates] - cy
                dists = dx * dx + dy * dy
                in_range = dists < tournament_radius * tournament_radius
                local = candidates[in_range]
                if len(local) == 0:
                    local = np.array([center])
                winner = local[np.argmax(self.energy[local])]
                parents_list.append(winner)
                slots_list.append(slot)
            return parents_list, slots_list

        # Shuffle dead slots and split between species
        rng.shuffle(dead_slots)
        prey_slots = dead_slots[:n_prey_slots]
        pred_slots = dead_slots[n_prey_slots:]

        parents_list, slots_list = [], []
        if len(prey_candidates) > 0 and len(prey_slots) > 0:
            p, s = _select_parents(prey_candidates, prey_slots, n_prey_slots)
            parents_list.extend(p)
            slots_list.extend(s)
        if len(pred_candidates) > 0 and len(pred_slots) > 0:
            p, s = _select_parents(pred_candidates, pred_slots, n_pred_slots)
            parents_list.extend(p)
            slots_list.extend(s)

        # If one species had no candidates, give their unused slots to the other
        used_slots = len(slots_list)
        remaining_slots = dead_slots[used_slots:]
        if len(remaining_slots) > 0:
            all_candidates = np.concatenate([c for c in [prey_candidates, pred_candidates] if len(c) > 0])
            if len(all_candidates) > 0:
                p, s = _select_parents(all_candidates, remaining_slots, len(remaining_slots))
                parents_list.extend(p)
                slots_list.extend(s)

        if not parents_list:
            return 0

        parents = np.array(parents_list)
        slots = np.array(slots_list)
        n_births = len(parents)

        # Species-specific offspring costs
        parent_species = self.species[parents]
        costs = np.where(parent_species == 0, prey_cost, pred_cost)
        self.energy[parents] -= costs

        # Offspring inherits position + small offset
        self.x[slots] = self.x[parents] + rng.normal(0, 0.5, n_births)
        self.y[slots] = self.y[parents] + rng.normal(0, 0.5, n_births)
        self.z[slots] = 0.0  # offspring start on ground
        self.heading[slots] = rng.uniform(0, 2 * np.pi, n_births)
        self.pitch[slots] = 0.0
        self.energy[slots] = costs * 0.8
        self.species[slots] = self.species[parents]
        self.age[slots] = 0.0
        self.speed[slots] = self.speed[parents]
        self.alive[slots] = True

        # Inherit and mutate morphology
        self.morphology[slots] = self.morphology[parents]
        for i, s in enumerate(slots):
            self.morphology[s] = mutate_morphology(
                self.morphology[s], sigma=0.15, rng=self._rng
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
        # During drought (set by God Agent), food respawns at 1/3 rate
        if getattr(self, '_drought_active', False):
            respawn_fraction *= 0.33
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
                "recent_kills": [
                    {"x": e["x"], "y": e["y"], "step": e["step"]}
                    for e in self._predation_events[-20:]
                    if "x" in e and self._step_count - e["step"] < 15
                ],
                "active_chases": [
                    {"predator": p, "prey": v,
                     "px": float(self.x[p]), "py": float(self.y[p]),
                     "vx": float(self.x[v]), "vy": float(self.y[v])}
                    for p, v in self._active_chases[:50]  # cap at 50 for bandwidth
                    if self.alive[p] and self.alive[v]
                ],
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
