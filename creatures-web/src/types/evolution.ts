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
  // Rich data from backend
  species?: SpeciesInfo[];
  best_genome?: GenomeInfo;
  behavioral_metrics?: BehavioralMetrics;
  population_stats?: PopulationStats;
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

// ---------------------------------------------------------------------------
// Rich generation data (from backend vectorized pipeline)
// ---------------------------------------------------------------------------

export interface SpeciesInfo {
  id: string;
  size: number;
  best_fitness: number;
  mean_fitness: number;
  stagnation: number;
}

export interface GenomeInfo {
  n_neurons: number;
  n_synapses: number;
  mean_weight: number;
  fitness_breakdown?: Record<string, number>;
}

export interface BehavioralMetrics {
  mean_spike_rate: number;
  motor_activation_pct: number;
  sensory_motor_latency_ms: number;
  pattern_diversity: number;
  phi?: number;
}

export interface PopulationStats {
  min_fitness: number;
  median_fitness: number;
  mean_n_synapses: number;
  mean_n_neurons: number;
}

// ---------------------------------------------------------------------------
// Evolution events (client-side detected milestones)
// ---------------------------------------------------------------------------

export type EvolutionEventType =
  | 'breakthrough'
  | 'species_emerged'
  | 'species_extinct'
  | 'convergence'
  | 'stagnation'
  | 'god_intervention'
  | 'divergence'
  | 'run_start'
  | 'run_complete';

export type EventSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface EvolutionEvent {
  id: string;
  generation: number;
  timestamp: number;
  type: EvolutionEventType;
  severity: EventSeverity;
  title: string;
  description: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Challenge presets
// ---------------------------------------------------------------------------

export interface ChallengePreset {
  id: string;
  name: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  icon: string;
  evolutionaryPressure: string;
  entities: Array<{
    type: 'food' | 'obstacle' | 'toxic_zone' | 'light_zone' | 'chemical_gradient' | 'pheromone_source';
    x: number; // normalized [-0.5, 0.5]
    y: number;
    radius: number;
    intensity: number;
    color: string;
    params?: Record<string, unknown>;
  }>;
  fitnessWeights: {
    w_distance: number;
    w_food: number;
    w_efficiency: number;
    w_collision_penalty: number;
    w_toxin_penalty: number;
    w_survival: number;
  };
  dynamics?: {
    type: 'static' | 'rotating' | 'predator';
    speed?: number;
  };
  recommendedGenerations: number;
  recommendedPopulation: number;
}
