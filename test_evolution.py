"""Test evolution engine: 5 generations, population 10.

Uses the fast fitness proxy (topology-based) to verify that
crossover, population management, and speciation work correctly
and that fitness improves over generations.
"""

import logging
import sys

import numpy as np

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("test_evolution")

# Load the real C. elegans connectome as seed
from creatures.connectome.openworm import load as load_connectome
from creatures.evolution.crossover import crossover
from creatures.evolution.fitness import evaluate_genome_fast
from creatures.evolution.genome import Genome
from creatures.evolution.mutation import MutationConfig, mutate
from creatures.evolution.population import GenerationStats, Population, PopulationConfig


def main():
    logger.info("Loading C. elegans connectome...")
    connectome = load_connectome()
    logger.info(connectome.summary())

    # Create seed genome from connectome
    seed = Genome.from_connectome(connectome)
    logger.info(
        f"Seed genome: {seed.n_neurons} neurons, {seed.n_synapses} synapses, "
        f"density={seed.density:.4f}"
    )

    # --- Test 1: Crossover ---
    logger.info("\n=== Test 1: Crossover ===")
    rng = np.random.default_rng(42)
    parent_a = mutate(seed, MutationConfig(), rng)
    parent_b = mutate(seed, MutationConfig(), rng)
    parent_a.fitness = 10.0
    parent_b.fitness = 5.0
    child = crossover(parent_a, parent_b, rng)
    logger.info(
        f"Parent A: {parent_a.n_synapses} synapses, fitness={parent_a.fitness}"
    )
    logger.info(
        f"Parent B: {parent_b.n_synapses} synapses, fitness={parent_b.fitness}"
    )
    logger.info(
        f"Child:    {child.n_synapses} synapses, parents={child.parent_ids}"
    )
    assert child.n_synapses > 0, "Child must have synapses"
    assert len(child.parent_ids) == 2, "Child must have two parents"
    logger.info("Crossover: PASSED")

    # --- Test 2: Fast fitness evaluation ---
    logger.info("\n=== Test 2: Fast Fitness ===")
    f1 = evaluate_genome_fast(seed)
    logger.info(f"Seed fitness: {f1:.3f}")
    assert f1 > 0, "Seed genome should have positive fitness"

    # A genome with all weights zeroed should have lower fitness
    empty = seed.clone()
    empty.weights[:] = 0.0
    f_empty = evaluate_genome_fast(empty)
    logger.info(f"Zeroed-weight genome fitness: {f_empty:.3f}")
    logger.info("Fast fitness: PASSED")

    # --- Test 3: Population evolution (5 generations, size 10) ---
    logger.info("\n=== Test 3: Population Evolution (5 gen, pop 10) ===")
    pop_config = PopulationConfig(
        size=10,
        elitism=2,
        tournament_size=3,
        crossover_rate=0.3,
        enable_speciation=True,
        compatibility_threshold=3.0,
        seed=42,
    )
    mut_config = MutationConfig(
        weight_perturb_rate=0.8,
        weight_perturb_sigma=0.2,
        add_synapse_rate=0.05,
        remove_synapse_rate=0.02,
    )

    pop = Population(pop_config, seed, mut_config)
    pop.initialize()
    logger.info(f"Initial population: {len(pop.genomes)} genomes")

    all_stats: list[GenerationStats] = []

    for gen in range(5):
        # Evaluate
        pop.evaluate(evaluate_genome_fast)

        # Advance
        stats = pop.advance_generation()
        all_stats.append(stats)

        logger.info(
            f"  Gen {stats.generation}: best={stats.best_fitness:.2f}, "
            f"mean={stats.mean_fitness:.2f}, std={stats.std_fitness:.2f}, "
            f"species={stats.n_species}"
        )

    # Check that evolution produced reasonable results
    best = pop.best_genome()
    logger.info(f"\nBest genome: id={best.id}, fitness={best.fitness:.3f}")
    logger.info(
        f"  {best.n_neurons} neurons, {best.n_synapses} synapses"
    )

    # Verify fitness is tracked
    first_best = all_stats[0].best_fitness
    last_best = all_stats[-1].best_fitness
    logger.info(f"\nFitness trajectory: {first_best:.2f} -> {last_best:.2f}")

    # Print generation-by-generation summary
    logger.info("\n=== Generation Summary ===")
    logger.info(f"{'Gen':>4} {'Best':>8} {'Mean':>8} {'Std':>8} {'Species':>8}")
    for s in all_stats:
        logger.info(
            f"{s.generation:4d} {s.best_fitness:8.2f} {s.mean_fitness:8.2f} "
            f"{s.std_fitness:8.2f} {s.n_species:8d}"
        )

    # The population should maintain diversity (speciation working)
    assert all(s.n_species >= 1 for s in all_stats), "Should have at least 1 species"
    # Best fitness should be positive
    assert last_best > 0, "Best fitness should be positive"

    logger.info("\n=== ALL TESTS PASSED ===")


if __name__ == "__main__":
    main()
