export interface EvolutionRun {
  id: string;
  status: 'idle' | 'running' | 'paused' | 'completed';
  generation: number;
  n_generations: number;
  best_fitness: number;
  mean_fitness: number;
  population_size: number;
  organism: string;
}

export interface GenerationStats {
  generation: number;
  best_fitness: number;
  mean_fitness: number;
  std_fitness: number;
  n_species: number;
  best_genome_id: string;
}

export interface FitnessHistory {
  generations: number[];
  best: number[];
  mean: number[];
}
