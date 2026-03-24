export interface GodReport {
  analysis: string;
  fitness_trend?: string;
  interventions: Array<{ type?: string; action: string; parameters?: Record<string, any>; reasoning: string; description?: string }>;
  hypothesis?: string;
  report?: string;
  generation?: number;
  n_observations?: number;
  mode?: string;
}

export interface EvolutionRun {
  id: string;
  status: 'idle' | 'running' | 'paused' | 'completed';
  generation: number;
  n_generations: number;
  best_fitness: number;
  mean_fitness: number;
  population_size: number;
  organism: string;
  god_reports?: GodReport[];
}

export interface GenerationStats {
  generation: number;
  best_fitness: number;
  mean_fitness: number;
  std_fitness: number;
  n_species: number;
  best_genome_id?: string;
  elapsed_seconds?: number;
}

export interface EvolutionWsMessage {
  type: 'generation_complete' | 'run_complete' | 'error' | 'god_intervention' | 'god_final_report';
  generation: number;
  best_fitness: number;
  mean_fitness: number;
  std_fitness: number;
  n_species: number;
  elapsed_seconds?: number;
  best_genome_id?: string;
  message?: string;
  god_report?: GodReport;
  god_intervention?: {
    analysis?: string;
    interventions?: GodReport['interventions'];
    applied?: string[];
  };
  narrative_events?: Array<{
    icon: string;
    event_type: string;
    title: string;
    description: string;
    generation: number;
  }>;
  // God intervention direct fields (when type === 'god_intervention')
  analysis?: string;
  interventions?: GodReport['interventions'];
}

export interface FitnessHistory {
  generations: number[];
  best: number[];
  mean: number[];
}
