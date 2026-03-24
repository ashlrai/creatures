"""Parallel genome evaluation using multiprocessing.

Spawns a pool of worker processes to evaluate genomes concurrently.
Each worker deserialises a genome from a plain dict, runs the chosen
fitness function, and returns (genome_id, fitness).

Usage:
    from creatures.evolution.parallel import evaluate_parallel
    results = evaluate_parallel(genomes, n_workers=4, mode='fast')
    # results: dict[str, float]  mapping genome_id -> fitness
"""

from __future__ import annotations

import logging
import time
from multiprocessing import Pool
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


# ── Worker functions (module-level so they are picklable) ──────────────


def _eval_worker_fast(genome_data: dict) -> tuple[str, float]:
    """Worker: reconstruct genome from dict and run fast fitness."""
    from creatures.evolution.genome import Genome
    from creatures.evolution.fitness import evaluate_genome_fast

    genome = Genome.from_dict(genome_data)
    fitness = evaluate_genome_fast(genome)
    return genome.id, fitness


def _eval_worker_medium(genome_data: dict) -> tuple[str, float]:
    """Worker: reconstruct genome and run medium (Brian2) fitness.

    Each worker process gets its own Brian2 runtime, so there are no
    shared-state issues.
    """
    from creatures.evolution.genome import Genome
    from creatures.evolution.fitness import FitnessConfig, evaluate_genome_medium

    genome = Genome.from_dict(genome_data)
    fitness = evaluate_genome_medium(genome, FitnessConfig())
    return genome.id, fitness


def _eval_worker_full(genome_data: dict) -> tuple[str, float]:
    """Worker: reconstruct genome and run full (Brian2 + MuJoCo) fitness."""
    from creatures.evolution.genome import Genome
    from creatures.evolution.fitness import FitnessConfig, evaluate_genome

    genome = Genome.from_dict(genome_data)
    fitness = evaluate_genome(genome, FitnessConfig())
    return genome.id, fitness


# ── Public API ─────────────────────────────────────────────────────────


_WORKERS = {
    "fast": _eval_worker_fast,
    "medium": _eval_worker_medium,
    "full": _eval_worker_full,
}


def evaluate_parallel(
    genomes: list[Genome],
    n_workers: int = 4,
    mode: str = "fast",
) -> dict[str, float]:
    """Evaluate a list of genomes in parallel using multiprocessing.Pool.

    Args:
        genomes: The genomes to evaluate.
        n_workers: Number of worker processes (default 4).
        mode: Fitness tier -- ``'fast'``, ``'medium'``, or ``'full'``.

    Returns:
        Dict mapping genome id to fitness score.
    """
    if mode not in _WORKERS:
        raise ValueError(f"Unknown fitness mode {mode!r}; expected one of {list(_WORKERS)}")

    worker_fn = _WORKERS[mode]

    # Serialise genomes to dicts for safe cross-process pickling
    genome_datas = [g.to_dict() for g in genomes]

    t0 = time.time()
    logger.info(
        "Parallel evaluation: %d genomes, %d workers, mode=%s",
        len(genomes), n_workers, mode,
    )

    with Pool(processes=n_workers) as pool:
        results = pool.map(worker_fn, genome_datas)

    elapsed = time.time() - t0
    logger.info("Parallel evaluation completed in %.2fs", elapsed)

    return {genome_id: fitness for genome_id, fitness in results}
