"""CMA-ES optimizer for synaptic weight optimization.

Uses Covariance Matrix Adaptation Evolution Strategy to optimize the
continuous weight vector of a genome. Much more sample-efficient than
random mutation for continuous optimization.

This is the ML acceleration layer — periodically applied to the best
genome to rapidly improve weights while the genetic algorithm handles
topology search.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

import numpy as np

from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


@dataclass
class ESConfig:
    """Configuration for CMA-ES optimization."""

    sigma0: float = 0.3  # initial step size
    population_size: int = 20  # CMA-ES internal population
    max_evaluations: int = 100  # budget per optimization round
    weight_decay: float = 0.001  # L2 regularization


class ESOptimizer:
    """CMA-ES optimizer for genome weight vectors.

    Takes a genome and a fitness function, optimizes the weight vector
    using CMA-ES, and returns the improved genome.
    """

    def __init__(self, config: ESConfig | None = None) -> None:
        self._config = config or ESConfig()

    def optimize(
        self,
        genome: Genome,
        eval_fn: Callable[[Genome], float],
        verbose: bool = False,
    ) -> Genome:
        """Optimize genome weights using CMA-ES.

        Args:
            genome: The genome to optimize (only weights are modified).
            eval_fn: Function that evaluates a genome and returns fitness.
            verbose: Print progress.

        Returns:
            A new genome with optimized weights.
        """
        try:
            import cma
        except ImportError:
            logger.warning("cma package not installed, skipping ES optimization")
            return genome

        cfg = self._config
        x0 = genome.weights.copy()
        n_evals = 0

        def objective(weights: np.ndarray) -> float:
            nonlocal n_evals
            # Create a temporary genome with these weights
            test = genome.clone()
            test.weights = np.array(weights, dtype=np.float64)
            fitness = eval_fn(test)
            n_evals += 1
            # CMA-ES minimizes, but we want to maximize fitness
            # Add L2 regularization
            reg = cfg.weight_decay * np.sum(weights ** 2)
            return -(fitness - reg)

        # Run CMA-ES
        opts = {
            "maxfevals": cfg.max_evaluations,
            "popsize": cfg.population_size,
            "verbose": -9 if not verbose else 0,
            "seed": hash(genome.id) % (2**31),
        }

        es = cma.CMAEvolutionStrategy(x0, cfg.sigma0, opts)

        while not es.stop() and n_evals < cfg.max_evaluations:
            solutions = es.ask()
            fitnesses = [objective(s) for s in solutions]
            es.tell(solutions, fitnesses)

        # Get best solution
        best_weights = es.result.xbest
        best_fitness = -es.result.fbest

        # Create optimized genome
        result = genome.clone()
        result.weights = np.array(best_weights, dtype=np.float64)
        result.fitness = best_fitness

        if verbose:
            logger.info(
                f"ES optimization: {n_evals} evals, "
                f"fitness {genome.fitness:.3f} → {best_fitness:.3f}"
            )

        return result

    def optimize_population(
        self,
        genomes: list[Genome],
        eval_fn: Callable[[Genome], float],
        top_k: int = 3,
    ) -> list[Genome]:
        """Optimize the top-k genomes in a population.

        Returns the optimized genomes (does not modify originals).
        """
        sorted_genomes = sorted(genomes, key=lambda g: g.fitness, reverse=True)
        optimized = []

        for genome in sorted_genomes[:top_k]:
            improved = self.optimize(genome, eval_fn)
            optimized.append(improved)
            logger.info(
                f"ES improved genome {genome.id}: "
                f"{genome.fitness:.3f} → {improved.fitness:.3f}"
            )

        return optimized
