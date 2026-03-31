"""Evolvable body morphology for organisms.

Each organism has a set of continuous genes that define body shape,
size, and physical capabilities. These genes are inherited with
mutation and create fitness tradeoffs that drive morphological evolution.
"""

import numpy as np
from dataclasses import dataclass

# Gene indices in the morphology array
GENE_BODY_LENGTH = 0       # 0.5 - 3.0 (elongation)
GENE_BODY_WIDTH = 1        # 0.3 - 1.5 (girth)
GENE_BODY_HEIGHT = 2       # 0.3 - 1.0 (vertical extent)
GENE_N_SEGMENTS = 3        # 3.0 - 12.0 (body complexity, rounded to int for rendering)
GENE_LIMB_COUNT = 4        # 0.0 - 6.0 (appendages, rounded to int for rendering)
GENE_LIMB_LENGTH = 5       # 0.2 - 1.5
GENE_COLOR_HUE = 6         # 0.0 - 360.0 (for visualization)
GENE_METABOLIC_EFF = 7     # 0.5 - 2.0 (energy efficiency multiplier)
GENE_SPEED_MULT = 8        # 0.5 - 2.0 (max speed multiplier)
GENE_SENSOR_RANGE = 9      # 1.0 - 10.0 (sensory radius)

N_MORPH_GENES = 10

# Min/max for each gene
GENE_BOUNDS = np.array([
    [0.5, 3.0],    # body_length
    [0.3, 1.5],    # body_width
    [0.3, 1.0],    # body_height
    [3.0, 12.0],   # n_segments
    [0.0, 6.0],    # limb_count
    [0.2, 1.5],    # limb_length
    [0.0, 360.0],  # color_hue
    [0.5, 2.0],    # metabolic_efficiency
    [0.5, 2.0],    # speed_multiplier
    [1.0, 10.0],   # sensor_range
])


def random_morphology(n: int, rng=None) -> np.ndarray:
    """Generate random morphology vectors for *n* organisms.

    Returns shape (n, N_MORPH_GENES) with each gene uniformly sampled
    within its GENE_BOUNDS range.
    """
    if rng is None:
        rng = np.random.default_rng()
    lo = GENE_BOUNDS[:, 0]
    hi = GENE_BOUNDS[:, 1]
    # uniform in [0, 1) scaled to each gene's range
    return rng.uniform(lo, hi, size=(n, N_MORPH_GENES))


def mutate_morphology(parent: np.ndarray, sigma: float = 0.1, rng=None) -> np.ndarray:
    """Mutate a single morphology vector with Gaussian noise.

    Parameters
    ----------
    parent : ndarray of shape (N_MORPH_GENES,)
        The parent morphology to mutate.
    sigma : float
        Noise scale relative to each gene's range.
    rng : numpy Generator, optional

    Returns
    -------
    ndarray of shape (N_MORPH_GENES,)
        Mutated morphology clipped to GENE_BOUNDS.
    """
    if rng is None:
        rng = np.random.default_rng()
    gene_range = GENE_BOUNDS[:, 1] - GENE_BOUNDS[:, 0]
    noise = rng.normal(0.0, sigma * gene_range, size=(N_MORPH_GENES,))
    offspring = parent + noise
    return np.clip(offspring, GENE_BOUNDS[:, 0], GENE_BOUNDS[:, 1])


def compute_metabolic_cost(morphology: np.ndarray) -> np.ndarray:
    """Compute per-step metabolic cost for a population.

    Parameters
    ----------
    morphology : ndarray of shape (n, N_MORPH_GENES)

    Returns
    -------
    ndarray of shape (n,)
        Metabolic cost per simulation step.

    Notes
    -----
    cost = base_cost * body_volume * metabolic_efficiency
    body_volume = body_length * body_width * body_height
    More limbs add 10% cost each; larger sensor range adds 5% cost per unit.
    """
    base_cost = 1.0
    body_volume = (
        morphology[:, GENE_BODY_LENGTH]
        * morphology[:, GENE_BODY_WIDTH]
        * morphology[:, GENE_BODY_HEIGHT]
    )
    cost = base_cost * body_volume * morphology[:, GENE_METABOLIC_EFF]
    # Limb surcharge: +10% per limb
    cost *= 1.0 + 0.1 * morphology[:, GENE_LIMB_COUNT]
    # Sensor surcharge: +5% per unit of sensor range
    cost *= 1.0 + 0.05 * morphology[:, GENE_SENSOR_RANGE]
    return cost


def compute_speed(morphology: np.ndarray) -> np.ndarray:
    """Compute max speed for a population.

    Parameters
    ----------
    morphology : ndarray of shape (n, N_MORPH_GENES)

    Returns
    -------
    ndarray of shape (n,)
        Maximum movement speed.

    Notes
    -----
    speed = base_speed * speed_multiplier * limb_factor / sqrt(body_volume)
    limb_factor = 1.0 + 0.1 * limb_count
    """
    base_speed = 1.0
    body_volume = (
        morphology[:, GENE_BODY_LENGTH]
        * morphology[:, GENE_BODY_WIDTH]
        * morphology[:, GENE_BODY_HEIGHT]
    )
    limb_factor = 1.0 + 0.1 * morphology[:, GENE_LIMB_COUNT]
    speed = base_speed * morphology[:, GENE_SPEED_MULT] * limb_factor
    speed /= np.sqrt(body_volume)
    return speed


def compute_eat_radius(morphology: np.ndarray) -> np.ndarray:
    """Compute eat radius for a population.

    Parameters
    ----------
    morphology : ndarray of shape (n, N_MORPH_GENES)

    Returns
    -------
    ndarray of shape (n,)
        Eat radius — larger organisms can reach more food.
    """
    return 1.0 + 0.3 * morphology[:, GENE_BODY_LENGTH]
