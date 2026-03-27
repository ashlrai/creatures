"""Apply God Agent interventions to a running BrainWorld ecosystem."""

from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)


def apply_intervention(ecosystem, intervention: dict) -> str:
    """Apply a single intervention. Returns description of what was done."""
    action = intervention.get('action', '')
    params = intervention.get('parameters', {})

    if action == 'food_scarcity':
        # Kill fraction of food sources
        factor = params.get('factor', 0.5)
        n_alive = int(ecosystem.food_alive.sum())
        n_kill = int(n_alive * (1 - factor))
        if n_kill > 0:
            alive_idx = ecosystem.food_alive.nonzero()[0]
            kill_idx = alive_idx[:n_kill]  # kill from start
            ecosystem.food_alive[kill_idx] = False
        return f"Reduced food by {int((1-factor)*100)}% ({n_kill} sources removed)"

    elif action == 'add_food':
        n = params.get('n_food', 10)
        # Respawn dead food or add to empty slots
        dead_idx = (~ecosystem.food_alive).nonzero()[0][:n]
        for idx in dead_idx:
            ecosystem.food_x[idx] = np.random.uniform(-ecosystem.arena_size/2, ecosystem.arena_size/2)
            ecosystem.food_y[idx] = np.random.uniform(-ecosystem.arena_size/2, ecosystem.arena_size/2)
            ecosystem.food_energy[idx] = 50.0
            ecosystem.food_alive[idx] = True
        return f"Added {len(dead_idx)} food sources"

    elif action == 'predator_surge' or action == 'cull_weakest':
        fraction = params.get('fraction', 0.2)
        alive_idx = ecosystem.alive.nonzero()[0]
        n_kill = int(len(alive_idx) * fraction)
        if n_kill > 0:
            # Sort by energy, kill lowest
            energies = ecosystem.energy[alive_idx]
            weakest = alive_idx[energies.argsort()[:n_kill]]
            ecosystem.alive[weakest] = False
            ecosystem.energy[weakest] = 0
        return f"Culled {n_kill} weakest organisms"

    elif action == 'environmental_shift':
        # Randomize all food positions
        alive_food = ecosystem.food_alive.nonzero()[0]
        for idx in alive_food:
            ecosystem.food_x[idx] = np.random.uniform(-ecosystem.arena_size/2, ecosystem.arena_size/2)
            ecosystem.food_y[idx] = np.random.uniform(-ecosystem.arena_size/2, ecosystem.arena_size/2)
        return f"Shifted {len(alive_food)} food sources to new positions"

    elif action == 'increase_mutation_rate':
        # Store on the ecosystem for newborns to inherit
        ecosystem._mutation_rate = params.get('weight_perturb_sigma', 0.3)
        return f"Mutation rate set to {ecosystem._mutation_rate}"

    else:
        return f"Unknown intervention: {action}"


def apply_all_interventions(ecosystem, report: dict) -> list[str]:
    """Apply all interventions from a God Agent report. Returns descriptions."""
    results = []
    for intervention in report.get('interventions', []):
        desc = apply_intervention(ecosystem, intervention)
        results.append(desc)
    return results
