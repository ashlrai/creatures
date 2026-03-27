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
        self.speed = np.full(n_organisms, 0.5)  # base movement speed

        # Assign ~30 % as drosophila
        drosophila_mask = rng.random(n_organisms) < 0.3
        self.species[drosophila_mask] = 1

        # --- Food source arrays ---
        self.n_food = n_food
        self.food_x = rng.uniform(-half, half, n_food)
        self.food_y = rng.uniform(-half, half, n_food)
        self.food_energy = np.full(n_food, 50.0)
        self.food_alive = np.ones(n_food, dtype=bool)

        # --- Generational tracking arrays ---
        self.generation = np.zeros(n_organisms, dtype=np.int32)  # generation counter per organism
        self.parent_id = np.full(n_organisms, -1, dtype=np.int32)  # parent index (-1 = no parent)
        self.lineage_id = np.arange(n_organisms, dtype=np.int32)  # unique lineage ID
        self._next_lineage_id = n_organisms  # counter for new lineage IDs
        self.lifetime_food = np.zeros(n_organisms, dtype=np.float32)  # food eaten in lifetime

        # Bookkeeping
        self._rng = rng
        self._step_count = 0
        self._total_born = 0
        self._total_died = 0

    # ------------------------------------------------------------------
    # Main simulation step (fully vectorized)
    # ------------------------------------------------------------------

    def step(self, dt: float = 1.0) -> dict[str, Any]:
        """Advance the entire ecosystem by *dt* time units.

        Returns a summary dict suitable for dashboards / logging.
        """
        alive = self.alive
        rng = self._rng

        # 1. Energy decay — metabolic cost
        self.energy[alive] -= 0.01 * dt

        # 2. Movement — steer toward nearest food + noise
        self._move(dt)

        # 3. Food consumption — proximity-based
        n_eaten = self._eat(eat_radius=1.5)

        # 4. Death — energy depletion
        newly_dead = alive & (self.energy <= 0)
        n_died = int(np.sum(newly_dead))
        self.alive[newly_dead] = False
        self._total_died += n_died

        # 5. Reproduction — organisms with high energy can split
        n_born = self._reproduce(energy_threshold=150.0, offspring_cost=60.0)

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
    # Eating (vectorized)
    # ------------------------------------------------------------------

    def _eat(self, eat_radius: float = 1.5) -> int:
        """Organisms within *eat_radius* of a food source consume it."""
        alive = self.alive
        food_alive = self.food_alive

        if not np.any(alive) or not np.any(food_alive):
            return 0

        alive_idx = np.where(alive)[0]
        food_idx = np.where(food_alive)[0]

        # For very large populations, do proximity check in batches
        # to avoid O(n_organisms * n_food) memory explosion.
        n_eaten = 0
        batch_size = 5000
        r2 = eat_radius * eat_radius

        for start in range(0, len(alive_idx), batch_size):
            batch = alive_idx[start : start + batch_size]
            # Remaining live food
            food_idx = np.where(self.food_alive)[0]
            if len(food_idx) == 0:
                break

            dx = self.food_x[food_idx][None, :] - self.x[batch][:, None]
            dy = self.food_y[food_idx][None, :] - self.y[batch][:, None]
            dist2 = dx * dx + dy * dy  # (batch, food)

            # Each organism eats its nearest food if within radius
            nearest_food = np.argmin(dist2, axis=1)
            nearest_dist2 = dist2[np.arange(len(batch)), nearest_food]
            can_eat = nearest_dist2 < r2

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
    # Reproduction (vectorized)
    # ------------------------------------------------------------------

    def _reproduce(
        self, energy_threshold: float = 150.0, offspring_cost: float = 60.0
    ) -> int:
        """Organisms above the energy threshold split into two."""
        can_reproduce = self.alive & (self.energy > energy_threshold)
        parents = np.where(can_reproduce)[0]
        if len(parents) == 0:
            return 0

        # Find dead slots to reuse
        dead_slots = np.where(~self.alive)[0]
        n_births = min(len(parents), len(dead_slots))
        if n_births == 0:
            return 0

        parents = parents[:n_births]
        slots = dead_slots[:n_births]

        # Parent pays energy cost
        self.energy[parents] -= offspring_cost

        # Offspring inherits position + small offset, half parent's remaining energy
        rng = self._rng
        self.x[slots] = self.x[parents] + rng.normal(0, 0.5, n_births)
        self.y[slots] = self.y[parents] + rng.normal(0, 0.5, n_births)
        self.heading[slots] = rng.uniform(0, 2 * np.pi, n_births)
        self.energy[slots] = offspring_cost * 0.8  # offspring starts with some energy
        self.species[slots] = self.species[parents]
        self.age[slots] = 0.0
        self.speed[slots] = self.speed[parents]
        self.alive[slots] = True

        # Track generational lineage
        self.generation[slots] = self.generation[parents] + 1
        self.parent_id[slots] = parents
        self.lifetime_food[slots] = 0.0
        # Each offspring inherits parent's lineage
        for i, (p, s) in enumerate(zip(parents, slots)):
            self.lineage_id[s] = self.lineage_id[p]

        self._total_born += n_births

        # Store parent-offspring mapping for neural weight inheritance
        self._last_births = list(zip(parents.tolist(), slots.tolist()))

        return n_births

    # ------------------------------------------------------------------
    # Food respawn
    # ------------------------------------------------------------------

    def _respawn_food(self, respawn_fraction: float = 0.02) -> None:
        """Respawn a fraction of eaten food sources each step."""
        dead_food = np.where(~self.food_alive)[0]
        if len(dead_food) == 0:
            return
        n_respawn = max(1, int(len(dead_food) * respawn_fraction))
        to_respawn = self._rng.choice(dead_food, min(n_respawn, len(dead_food)), replace=False)
        half = self.arena_size / 2.0
        self.food_x[to_respawn] = self._rng.uniform(-half, half, len(to_respawn))
        self.food_y[to_respawn] = self._rng.uniform(-half, half, len(to_respawn))
        self.food_energy[to_respawn] = 50.0
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
                    "species": int(self.species[i]),
                    "energy": float(self.energy[i]),
                    "age": float(self.age[i]),
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
