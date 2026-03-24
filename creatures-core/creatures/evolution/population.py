"""Population management with NEAT-style speciation.

Manages a population of genomes through generations of selection,
crossover, and mutation. Supports tournament selection, elitism,
and optional speciation by genome compatibility distance.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from creatures.evolution.crossover import crossover
from creatures.evolution.genome import Genome
from creatures.evolution.mutation import MutationConfig, mutate

logger = logging.getLogger(__name__)


@dataclass
class PopulationConfig:
    """Configuration for the evolutionary population."""

    size: int = 100
    elitism: int = 5  # top N survive unchanged
    tournament_size: int = 5
    crossover_rate: float = 0.3  # probability of crossover vs asexual mutation
    enable_speciation: bool = True
    compatibility_threshold: float = 3.0

    # Seed for reproducibility (None = random)
    seed: int | None = None


@dataclass
class Species:
    """A group of genetically similar genomes."""

    id: str
    representative: Genome  # the genome that defines this species
    members: list[Genome] = field(default_factory=list)
    best_fitness: float = 0.0
    stagnation: int = 0  # generations without improvement

    @property
    def size(self) -> int:
        return len(self.members)


@dataclass
class GenerationStats:
    """Statistics for a single generation."""

    generation: int
    best_fitness: float
    mean_fitness: float
    std_fitness: float
    n_species: int
    best_genome_id: str
    elapsed_seconds: float


class Population:
    """Manages a population of evolving genomes.

    Supports NEAT-style speciation where genomes are grouped by
    structural similarity. Selection, crossover, and mutation
    operate within and across species.
    """

    def __init__(
        self,
        config: PopulationConfig,
        seed_genome: Genome,
        mutation_config: MutationConfig | None = None,
    ) -> None:
        self._config = config
        self._seed = seed_genome
        self._mutation_config = mutation_config or MutationConfig()
        self._rng = np.random.default_rng(config.seed)
        self._genomes: list[Genome] = []
        self._species: list[Species] = []
        self._generation: int = 0
        self._best_ever: Genome | None = None

    @property
    def genomes(self) -> list[Genome]:
        return self._genomes

    @property
    def generation(self) -> int:
        return self._generation

    @property
    def species(self) -> list[Species]:
        return self._species

    def initialize(self) -> None:
        """Create the initial population by cloning and mutating the seed genome."""
        self._genomes = []
        for _ in range(self._config.size):
            child = mutate(self._seed, self._mutation_config, self._rng)
            child.generation = 0
            self._genomes.append(child)
        self._generation = 0

        if self._config.enable_speciation:
            self._speciate()

        logger.info(
            f"Initialized population: {len(self._genomes)} genomes, "
            f"{len(self._species)} species"
        )

    def evaluate(
        self,
        eval_fn: Callable[[Genome], float] | None = None,
        parallel: bool = False,
        n_workers: int = 4,
        mode: str = "fast",
    ) -> None:
        """Evaluate fitness for all genomes in the population.

        Args:
            eval_fn: Function that takes a Genome and returns a float fitness.
                     Used when *parallel* is False.  Should also set
                     ``genome.fitness`` as a side effect.
            parallel: If True, use multiprocessing to evaluate genomes
                      concurrently (ignores *eval_fn*; uses *mode* instead).
            n_workers: Number of worker processes for parallel evaluation.
            mode: Fitness tier for parallel evaluation -- ``'fast'``,
                  ``'medium'``, or ``'full'``.
        """
        if parallel:
            from creatures.evolution.parallel import evaluate_parallel

            results = evaluate_parallel(self._genomes, n_workers=n_workers, mode=mode)
            for genome in self._genomes:
                genome.fitness = results.get(genome.id, 0.0)
        else:
            from creatures.evolution.fitness import evaluate_genome_fast

            fn = eval_fn if eval_fn is not None else evaluate_genome_fast
            for genome in self._genomes:
                fn(genome)

    def advance_generation(self) -> GenerationStats:
        """Select, reproduce, and mutate to create the next generation.

        Returns:
            GenerationStats for the completed generation.
        """
        t_start = time.time()

        # Compute stats for current generation
        fitnesses = np.array([g.fitness for g in self._genomes])
        best_idx = int(np.argmax(fitnesses))
        best_genome = self._genomes[best_idx]

        stats = GenerationStats(
            generation=self._generation,
            best_fitness=float(fitnesses[best_idx]),
            mean_fitness=float(np.mean(fitnesses)),
            std_fitness=float(np.std(fitnesses)),
            n_species=len(self._species) if self._config.enable_speciation else 1,
            best_genome_id=best_genome.id,
            elapsed_seconds=0.0,  # will be updated at the end
        )

        # Track best ever
        if self._best_ever is None or best_genome.fitness > self._best_ever.fitness:
            self._best_ever = best_genome.clone()
            self._best_ever.fitness = best_genome.fitness

        # Sort by fitness (descending)
        sorted_genomes = sorted(self._genomes, key=lambda g: g.fitness, reverse=True)

        # Elitism: keep top N unchanged
        elites = []
        for g in sorted_genomes[: self._config.elitism]:
            elite = g.clone()
            elite.fitness = g.fitness  # preserve fitness for speciation
            elites.append(elite)

        # Build next generation
        next_gen: list[Genome] = list(elites)
        n_remaining = self._config.size - len(next_gen)

        if self._config.enable_speciation and self._species:
            # Reproduce within species, allocating offspring proportional to mean fitness
            next_gen.extend(self._reproduce_with_speciation(n_remaining, sorted_genomes))
        else:
            # Simple reproduction without speciation
            next_gen.extend(self._reproduce_simple(n_remaining, sorted_genomes))

        self._genomes = next_gen
        self._generation += 1

        # Update generation number on all genomes
        for g in self._genomes:
            g.generation = self._generation

        # Re-speciate
        if self._config.enable_speciation:
            self._speciate()

        stats.elapsed_seconds = time.time() - t_start
        logger.info(
            f"Gen {stats.generation}: best={stats.best_fitness:.3f}, "
            f"mean={stats.mean_fitness:.3f}, std={stats.std_fitness:.3f}, "
            f"species={stats.n_species}, time={stats.elapsed_seconds:.2f}s"
        )

        return stats

    def best_genome(self) -> Genome:
        """Return the best genome in the current population."""
        if not self._genomes:
            raise RuntimeError("Population not initialized.")
        return max(self._genomes, key=lambda g: g.fitness)

    # --- Private methods ---

    def _tournament_select(self, candidates: list[Genome]) -> Genome:
        """Select a genome via tournament selection."""
        k = min(self._config.tournament_size, len(candidates))
        indices = self._rng.choice(len(candidates), size=k, replace=False)
        tournament = [candidates[i] for i in indices]
        return max(tournament, key=lambda g: g.fitness)

    def _reproduce_simple(
        self, n_offspring: int, sorted_genomes: list[Genome]
    ) -> list[Genome]:
        """Produce offspring without speciation."""
        offspring = []
        for _ in range(n_offspring):
            if self._rng.random() < self._config.crossover_rate and len(sorted_genomes) >= 2:
                parent_a = self._tournament_select(sorted_genomes)
                parent_b = self._tournament_select(sorted_genomes)
                child = crossover(parent_a, parent_b, self._rng)
                child = mutate(child, self._mutation_config, self._rng)
            else:
                parent = self._tournament_select(sorted_genomes)
                child = mutate(parent, self._mutation_config, self._rng)
            offspring.append(child)
        return offspring

    def _reproduce_with_speciation(
        self, n_offspring: int, sorted_genomes: list[Genome]
    ) -> list[Genome]:
        """Produce offspring with species-proportional allocation."""
        if not self._species:
            return self._reproduce_simple(n_offspring, sorted_genomes)

        # Compute mean fitness per species (with minimum to avoid zero allocation)
        species_mean = []
        for sp in self._species:
            if sp.members:
                mean_f = np.mean([g.fitness for g in sp.members])
                species_mean.append(max(mean_f, 0.001))
            else:
                species_mean.append(0.001)

        total_mean = sum(species_mean)
        # Allocate offspring proportional to species fitness
        allocations = [
            max(1, int(round(n_offspring * m / total_mean)))
            for m in species_mean
        ]
        # Adjust to match exact count
        diff = n_offspring - sum(allocations)
        if diff > 0:
            # Give extra to best species
            best_sp_idx = int(np.argmax(species_mean))
            allocations[best_sp_idx] += diff
        elif diff < 0:
            # Remove from worst species
            worst_sp_idx = int(np.argmin(species_mean))
            allocations[worst_sp_idx] = max(0, allocations[worst_sp_idx] + diff)

        offspring = []
        for sp, n_alloc in zip(self._species, allocations):
            if not sp.members or n_alloc <= 0:
                continue
            for _ in range(n_alloc):
                if (
                    self._rng.random() < self._config.crossover_rate
                    and len(sp.members) >= 2
                ):
                    parent_a = self._tournament_select(sp.members)
                    parent_b = self._tournament_select(sp.members)
                    child = crossover(parent_a, parent_b, self._rng)
                    child = mutate(child, self._mutation_config, self._rng)
                else:
                    parent = self._tournament_select(sp.members)
                    child = mutate(parent, self._mutation_config, self._rng)
                offspring.append(child)

        # If rounding errors left us short, fill with simple reproduction
        while len(offspring) < n_offspring:
            parent = self._tournament_select(sorted_genomes)
            child = mutate(parent, self._mutation_config, self._rng)
            offspring.append(child)

        return offspring[:n_offspring]

    def _speciate(self) -> None:
        """Assign all genomes to species based on compatibility distance."""
        threshold = self._config.compatibility_threshold

        # Keep existing species representatives if possible
        old_reps = {sp.id: sp.representative for sp in self._species}
        new_species: list[Species] = []

        # Create species from old representatives
        for sp_id, rep in old_reps.items():
            new_species.append(Species(
                id=sp_id,
                representative=rep,
                members=[],
                best_fitness=0.0,
            ))

        # Assign each genome to the first compatible species
        for genome in self._genomes:
            placed = False
            for sp in new_species:
                dist = genome.distance(sp.representative)
                if dist < threshold:
                    sp.members.append(genome)
                    placed = True
                    break

            if not placed:
                # Create a new species with this genome as representative
                new_sp = Species(
                    id=str(uuid.uuid4())[:8],
                    representative=genome,
                    members=[genome],
                )
                new_species.append(new_sp)

        # Remove empty species and update representatives
        self._species = []
        for sp in new_species:
            if sp.members:
                # Update representative to a random member
                sp.representative = sp.members[self._rng.integers(0, len(sp.members))]
                sp.best_fitness = max(g.fitness for g in sp.members)
                self._species.append(sp)
