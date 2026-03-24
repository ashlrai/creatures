"""Interaction rules between organisms in the ecosystem.

Handles predation, food consumption, reproduction, and chemotaxis-like
food gradient computation for simple autonomous movement.
"""

from __future__ import annotations

import math
import uuid
from creatures.environment.eco_types import EcosystemConfig, FoodSource, OrganismInstance


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Euclidean distance between two 2D points."""
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return math.sqrt(dx * dx + dy * dy)


def check_predation(
    predator: OrganismInstance,
    prey: OrganismInstance,
    config: EcosystemConfig,
) -> bool:
    """Can predator eat prey? Based on relative size and distance.

    Rules:
    - Predator must be alive and prey must be alive.
    - Predator species must be larger than prey species.
    - They must be within organism_interaction_radius.
    - Predation transfers a portion of prey energy to predator.

    Returns True if predation occurs.
    """
    if not predator.alive or not prey.alive:
        return False
    if predator.species == prey.species:
        return False

    predator_size = config.species_sizes.get(predator.species, 0.1)
    prey_size = config.species_sizes.get(prey.species, 0.1)

    # Must be significantly larger (at least 1.5x)
    if predator_size < prey_size * 1.5:
        return False

    dist = distance(predator.position, prey.position)
    if dist > config.organism_interaction_radius:
        return False

    # Predation succeeds: transfer energy, kill prey
    energy_gained = prey.energy * 0.5  # 50% energy transfer efficiency
    predator.energy += energy_gained
    predator.fitness += 10.0  # bonus fitness for successful predation
    prey.energy = 0.0
    prey.alive = False

    return True


def check_food_consumption(
    organism: OrganismInstance,
    food: FoodSource,
    config: EcosystemConfig,
) -> float:
    """How much energy does organism get from this food source?

    Returns energy consumed (0.0 if too far or food is empty).
    """
    if not organism.alive:
        return 0.0

    dist = distance(organism.position, food.position)
    if dist > config.food_detection_radius:
        return 0.0

    if food.energy <= 0.0:
        return 0.0

    # Consume up to 10 energy per interaction, limited by available food
    max_bite = 10.0
    consumed = min(max_bite, food.energy)
    food.energy -= consumed
    organism.energy += consumed
    organism.fitness += consumed * 0.1  # fitness reward for eating

    return consumed


def check_reproduction(
    organism: OrganismInstance,
    config: EcosystemConfig,
) -> OrganismInstance | None:
    """If energy is high enough, create offspring with slight mutation.

    The parent loses half its energy to the offspring.
    Offspring is placed nearby with a slightly perturbed heading.

    Returns the new OrganismInstance or None if reproduction doesn't occur.
    """
    if not organism.alive:
        return None

    if organism.energy < config.reproduction_threshold:
        return None

    # Split energy
    offspring_energy = organism.energy * 0.5
    organism.energy *= 0.5

    # Place offspring nearby (offset by species size)
    species_size = config.species_sizes.get(organism.species, 0.1)
    offset_dist = species_size * 2.0
    offset_angle = organism.heading + math.pi  # behind parent

    offspring_x = organism.position[0] + offset_dist * math.cos(offset_angle)
    offspring_y = organism.position[1] + offset_dist * math.sin(offset_angle)

    # Clamp to arena bounds
    r = config.arena_radius
    offspring_x = max(-r, min(r, offspring_x))
    offspring_y = max(-r, min(r, offspring_y))

    # Slight heading mutation
    heading_mutation = (hash(organism.id) % 100 - 50) / 50.0 * 0.5  # +/- 0.5 rad

    offspring = OrganismInstance(
        id=f"{organism.species}_{uuid.uuid4().hex[:8]}",
        species=organism.species,
        position=(offspring_x, offspring_y),
        heading=organism.heading + heading_mutation,
        energy=offspring_energy,
        age_ms=0.0,
        fitness=0.0,
        genome_id=organism.genome_id,
        alive=True,
    )

    return offspring


def compute_food_gradient(
    organism: OrganismInstance,
    food_sources: list[FoodSource],
    detection_radius: float,
) -> tuple[float, float]:
    """Compute direction toward nearest food (chemotaxis-like).

    Returns a (dx, dy) unit vector pointing toward the strongest
    food signal, weighted by inverse distance. Returns (0, 0) if
    no food is within detection range.
    """
    if not organism.alive:
        return (0.0, 0.0)

    grad_x = 0.0
    grad_y = 0.0

    for food in food_sources:
        if food.energy <= 0.0:
            continue

        dx = food.position[0] - organism.position[0]
        dy = food.position[1] - organism.position[1]
        dist = math.sqrt(dx * dx + dy * dy)

        if dist < 1e-8 or dist > detection_radius:
            continue

        # Weight by inverse distance and food energy
        weight = (food.energy / food.max_energy) / (dist * dist)
        grad_x += dx / dist * weight
        grad_y += dy / dist * weight

    # Normalize to unit vector
    magnitude = math.sqrt(grad_x * grad_x + grad_y * grad_y)
    if magnitude > 1e-8:
        grad_x /= magnitude
        grad_y /= magnitude

    return (grad_x, grad_y)
