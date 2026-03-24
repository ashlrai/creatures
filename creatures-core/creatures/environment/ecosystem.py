"""Multi-organism ecosystem model.

Manages a shared environment where multiple organisms coexist, compete
for food, reproduce, and potentially prey on each other. This operates
independently of the neural simulation as a higher-level ecological model.
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import asdict

import numpy as np

from creatures.environment.eco_types import (  # noqa: F401 — re-exported
    EcosystemConfig,
    FoodSource,
    OrganismInstance,
)
from creatures.environment.interactions import (
    check_food_consumption,
    check_predation,
    check_reproduction,
    compute_food_gradient,
)
from creatures.environment.sensory_world import SensoryWorld

logger = logging.getLogger(__name__)


class Ecosystem:
    """Manages a multi-organism ecosystem with shared environment."""

    def __init__(self, config: EcosystemConfig | None = None) -> None:
        self.config = config or EcosystemConfig()
        self.organisms: dict[str, OrganismInstance] = {}
        self.food_sources: dict[str, FoodSource] = {}
        self.world: SensoryWorld | None = None  # optional rich sensory env
        self.time_ms: float = 0.0
        self.events: list[dict] = []  # log of ecosystem events
        self._rng = np.random.default_rng(42)

    def initialize(self, populations: dict[str, int]) -> None:
        """Initialize ecosystem with given populations.

        Args:
            populations: e.g. {"c_elegans": 20, "drosophila": 5}
        """
        self.organisms.clear()
        self.food_sources.clear()
        self.events.clear()
        self.time_ms = 0.0

        r = self.config.arena_radius

        # Place organisms randomly in arena (within a circle)
        for species, count in populations.items():
            for _ in range(count):
                # Random position in circular arena
                angle = float(self._rng.uniform(0, 2 * math.pi))
                radius = float(self._rng.uniform(0, r * 0.9))  # 90% of arena
                x = radius * math.cos(angle)
                y = radius * math.sin(angle)
                heading = float(self._rng.uniform(0, 2 * math.pi))

                org = OrganismInstance(
                    id=f"{species}_{uuid.uuid4().hex[:8]}",
                    species=species,
                    position=(x, y),
                    heading=heading,
                    energy=100.0,
                )
                self.organisms[org.id] = org

        # Place food sources randomly
        for i in range(self.config.n_food_sources):
            angle = float(self._rng.uniform(0, 2 * math.pi))
            radius = float(self._rng.uniform(0, r * 0.95))
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)

            food = FoodSource(
                id=f"food_{i:03d}",
                position=(x, y),
            )
            self.food_sources[food.id] = food

        self.events.append(
            {
                "type": "initialized",
                "time_ms": 0.0,
                "populations": populations,
                "n_food": self.config.n_food_sources,
            }
        )
        logger.info(
            f"Ecosystem initialized: {populations}, "
            f"{self.config.n_food_sources} food sources"
        )

    def step(self, dt_ms: float = 1.0) -> list[dict]:
        """Advance ecosystem by dt_ms. Returns list of events."""
        events: list[dict] = []
        self.time_ms += dt_ms

        alive_organisms = [o for o in self.organisms.values() if o.alive]

        # 0. Advance sensory world time
        if self.world is not None:
            self.world.step(dt_ms)

        # 1. Move organisms (food-seeking + sensory world + random walk)
        food_list = list(self.food_sources.values())
        for org in alive_organisms:
            self._move_organism(org, food_list, dt_ms)

        # 1b. Apply toxin damage from sensory world
        if self.world is not None:
            for org in alive_organisms:
                toxin = self.world.sense_at(org.position)["toxin_exposure"]
                if toxin > 0:
                    org.energy -= toxin * dt_ms
                    if org.energy <= 0.0:
                        org.energy = 0.0
                        org.alive = False
                        events.append(
                            {
                                "type": "death",
                                "time_ms": self.time_ms,
                                "organism_id": org.id,
                                "species": org.species,
                                "cause": "toxin",
                                "age_ms": org.age_ms,
                            }
                        )

        # 2. Age and decay energy for all organisms
        for org in alive_organisms:
            org.age_ms += dt_ms
            org.energy -= self.config.energy_decay_rate * dt_ms
            if org.energy <= 0.0:
                org.energy = 0.0
                org.alive = False
                events.append(
                    {
                        "type": "death",
                        "time_ms": self.time_ms,
                        "organism_id": org.id,
                        "species": org.species,
                        "cause": "starvation",
                        "age_ms": org.age_ms,
                    }
                )

        # 3. Regrow food sources
        for food in self.food_sources.values():
            if food.energy < food.max_energy:
                food.energy = min(
                    food.max_energy, food.energy + food.regrowth_rate * dt_ms
                )

        # 4. Check food consumption (organism near food)
        alive_organisms = [o for o in self.organisms.values() if o.alive]
        for org in alive_organisms:
            for food in self.food_sources.values():
                consumed = check_food_consumption(org, food, self.config)
                if consumed > 0:
                    events.append(
                        {
                            "type": "food_consumed",
                            "time_ms": self.time_ms,
                            "organism_id": org.id,
                            "species": org.species,
                            "energy_gained": consumed,
                            "food_id": food.id,
                        }
                    )

        # 5. Check organism interactions (predation if enabled)
        if self.config.predation_enabled:
            alive_organisms = [o for o in self.organisms.values() if o.alive]
            for i, org_a in enumerate(alive_organisms):
                for org_b in alive_organisms[i + 1 :]:
                    if not org_a.alive or not org_b.alive:
                        continue
                    # Try both directions
                    if check_predation(org_a, org_b, self.config):
                        events.append(
                            {
                                "type": "predation",
                                "time_ms": self.time_ms,
                                "predator_id": org_a.id,
                                "predator_species": org_a.species,
                                "prey_id": org_b.id,
                                "prey_species": org_b.species,
                            }
                        )
                    elif check_predation(org_b, org_a, self.config):
                        events.append(
                            {
                                "type": "predation",
                                "time_ms": self.time_ms,
                                "predator_id": org_b.id,
                                "predator_species": org_b.species,
                                "prey_id": org_a.id,
                                "prey_species": org_a.species,
                            }
                        )

        # 6. Check reproduction (energy > threshold -> split)
        alive_organisms = [o for o in self.organisms.values() if o.alive]
        new_organisms: list[OrganismInstance] = []
        for org in alive_organisms:
            offspring = check_reproduction(org, self.config)
            if offspring is not None:
                new_organisms.append(offspring)
                events.append(
                    {
                        "type": "reproduction",
                        "time_ms": self.time_ms,
                        "parent_id": org.id,
                        "offspring_id": offspring.id,
                        "species": org.species,
                    }
                )

        # Add new organisms to the ecosystem
        for org in new_organisms:
            self.organisms[org.id] = org

        # 7. Record events
        self.events.extend(events)

        return events

    def _move_organism(
        self,
        org: OrganismInstance,
        food_list: list[FoodSource],
        dt_ms: float,
    ) -> None:
        """Move an organism using food-seeking + sensory world + random walk.

        When a SensoryWorld is attached, chemical gradients from the world
        are blended with the basic food gradient. Organisms also steer away
        from toxins and toward their preferred temperature.
        """
        speed = self.config.move_speed.get(org.species, 0.003)

        # Compute food gradient (chemotaxis from simple food dots)
        grad_x, grad_y = compute_food_gradient(
            org, food_list, self.config.food_detection_radius
        )

        # Layer on sensory world signals if available
        if self.world is not None:
            sensory = self.world.sense_at(org.position)

            # Chemical gradients: attractants pull toward source,
            # repellents push away
            for grad in self.world.chemical_gradients:
                gdir = sensory["gradient_direction"].get(grad.name, (0.0, 0.0))
                conc = sensory["chemicals"].get(grad.name, 0.0)
                if conc > 1e-6:
                    sign = 1.0 if grad.chemical_type == "attractant" else -1.0
                    # Weight by concentration so organisms respond more
                    # strongly when near the source
                    grad_x += sign * gdir[0] * conc * 2.0
                    grad_y += sign * gdir[1] * conc * 2.0

            # Toxin avoidance: steer away from toxin centers
            for zone in self.world.toxic_zones:
                dx = org.position[0] - zone.position[0]
                dy = org.position[1] - zone.position[1]
                dist = math.sqrt(dx * dx + dy * dy)
                if dist < zone.radius * 2.0 and dist > 1e-8:
                    # Repulsive force, stronger when closer
                    repulsion = 3.0 / (dist + 0.01)
                    grad_x += (dx / dist) * repulsion
                    grad_y += (dy / dist) * repulsion

            # Thermotaxis: steer toward preferred temperature
            temp = sensory["temperature"]
            if temp is not None and self.world.temperature_field is not None:
                tf = self.world.temperature_field
                # Direction from cold to hot
                axis_x = tf.hot_position[0] - tf.cold_position[0]
                axis_y = tf.hot_position[1] - tf.cold_position[1]
                axis_len = math.sqrt(axis_x * axis_x + axis_y * axis_y)
                if axis_len > 1e-8:
                    axis_x /= axis_len
                    axis_y /= axis_len
                    # If too hot, move toward cold (negative axis);
                    # if too cold, move toward hot (positive axis)
                    temp_error = temp - tf.preferred_temp
                    thermotaxis_strength = -temp_error * 0.1
                    grad_x += axis_x * thermotaxis_strength
                    grad_y += axis_y * thermotaxis_strength

        # Blend food-seeking with random walk
        has_gradient = abs(grad_x) > 1e-8 or abs(grad_y) > 1e-8
        if has_gradient:
            # Steer toward food: adjust heading toward gradient
            target_heading = math.atan2(grad_y, grad_x)
            # Smoothly turn toward food (weighted blend)
            angle_diff = target_heading - org.heading
            angle_diff = math.atan2(math.sin(angle_diff), math.cos(angle_diff))
            org.heading += angle_diff * 0.3  # partial turn
        else:
            # Random walk: small random heading perturbation
            org.heading += float(
                self._rng.normal(0, self.config.random_turn_std)
            )

        # Move forward
        dx = speed * dt_ms * math.cos(org.heading)
        dy = speed * dt_ms * math.sin(org.heading)
        new_x = org.position[0] + dx
        new_y = org.position[1] + dy

        # Bounce off arena walls (circular boundary)
        r = self.config.arena_radius
        dist_from_center = math.sqrt(new_x * new_x + new_y * new_y)
        if dist_from_center > r:
            # Reflect: reverse heading and push back inside
            org.heading += math.pi + float(
                self._rng.normal(0, 0.5)
            )
            # Clamp to arena edge
            scale = (r * 0.95) / dist_from_center
            new_x *= scale
            new_y *= scale

        org.position = (new_x, new_y)

    def get_state(self) -> dict:
        """Return full ecosystem state for visualization."""
        state = {
            "time_ms": self.time_ms,
            "organisms": [asdict(o) for o in self.organisms.values()],
            "food_sources": [asdict(f) for f in self.food_sources.values()],
            "stats": self.get_stats(),
            "events": self.events[-10:],  # last 10 events
        }
        if self.world is not None:
            state["sensory_world"] = self.world.get_state()
        return state

    def get_stats(self) -> dict:
        """Population statistics by species."""
        species_counts: dict[str, int] = {}
        species_energy: dict[str, list[float]] = {}
        species_fitness: dict[str, list[float]] = {}

        for org in self.organisms.values():
            if not org.alive:
                continue
            species_counts[org.species] = species_counts.get(org.species, 0) + 1
            species_energy.setdefault(org.species, []).append(org.energy)
            species_fitness.setdefault(org.species, []).append(org.fitness)

        by_species = {}
        for species in species_counts:
            energies = species_energy[species]
            fitnesses = species_fitness[species]
            by_species[species] = {
                "count": species_counts[species],
                "avg_energy": sum(energies) / len(energies),
                "avg_fitness": sum(fitnesses) / len(fitnesses),
                "min_energy": min(energies),
                "max_energy": max(energies),
            }

        total_food = sum(f.energy for f in self.food_sources.values())
        total_alive = sum(species_counts.values())
        total_dead = sum(1 for o in self.organisms.values() if not o.alive)

        return {
            "time_ms": self.time_ms,
            "total_alive": total_alive,
            "total_dead": total_dead,
            "total_food_energy": total_food,
            "by_species": by_species,
        }

    def add_organism(
        self,
        species: str,
        position: tuple[float, float] | None = None,
        energy: float = 100.0,
    ) -> OrganismInstance:
        """Add a new organism to the ecosystem.

        Args:
            species: Species identifier (e.g. "c_elegans").
            position: (x, y) or None for random placement.
            energy: Starting energy.

        Returns:
            The newly created OrganismInstance.
        """
        if position is None:
            r = self.config.arena_radius
            angle = float(self._rng.uniform(0, 2 * math.pi))
            radius = float(self._rng.uniform(0, r * 0.9))
            position = (radius * math.cos(angle), radius * math.sin(angle))

        heading = float(self._rng.uniform(0, 2 * math.pi))
        org = OrganismInstance(
            id=f"{species}_{uuid.uuid4().hex[:8]}",
            species=species,
            position=position,
            heading=heading,
            energy=energy,
        )
        self.organisms[org.id] = org
        self.events.append(
            {
                "type": "organism_added",
                "time_ms": self.time_ms,
                "organism_id": org.id,
                "species": species,
            }
        )
        return org
