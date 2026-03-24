export interface SimulationFrame {
  t_ms: number;
  n_active: number;
  spikes: number[];
  firing_rates: number[];
  body_positions: number[][];
  joint_angles: number[];
  center_of_mass: number[];
  muscle_activations: Record<string, number>;
}

export interface ExperimentInfo {
  id: string;
  name: string;
  organism: string;
  n_neurons: number;
  n_synapses: number;
  status: string;
  t_ms: number;
}
