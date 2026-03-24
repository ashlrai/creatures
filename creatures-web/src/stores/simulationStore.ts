import { create } from 'zustand';
import type { SimulationFrame, ExperimentInfo } from '../types/simulation';

export interface HoveredNeuron {
  id: string;
  type: string;
  nt: string | null;
  firingRate: number;
  mouseX: number;
  mouseY: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

interface SimulationState {
  experiment: ExperimentInfo | null;
  frame: SimulationFrame | null;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempts: number;
  loading: boolean;
  error: string | null;
  frameHistory: { t: number; n_active: number; displacement: number }[];
  initialCom: number[] | null;
  lastPoke: { segment: string; time: number } | null;
  hoveredNeuron: HoveredNeuron | null;

  setExperiment: (exp: ExperimentInfo) => void;
  setFrame: (frame: SimulationFrame) => void;
  setConnected: (c: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setReconnectAttempts: (n: number) => void;
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;
  setPoke: (segment: string) => void;
  setHoveredNeuron: (neuron: HoveredNeuron | null) => void;
  reset: () => void;
}

const MAX_HISTORY = 500;

export const useSimulationStore = create<SimulationState>((set, get) => ({
  experiment: null,
  frame: null,
  connected: false,
  connectionStatus: 'disconnected' as ConnectionStatus,
  reconnectAttempts: 0,
  loading: false,
  error: null,
  frameHistory: [],
  initialCom: null,
  lastPoke: null,
  hoveredNeuron: null,

  setExperiment: (exp) => set({ experiment: exp }),

  setFrame: (frame) => {
    const state = get();
    const initialCom = state.initialCom ?? frame.center_of_mass;
    const dx = frame.center_of_mass[0] - initialCom[0];
    const dy = frame.center_of_mass[1] - initialCom[1];
    const dz = frame.center_of_mass[2] - initialCom[2];
    const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const entry = { t: frame.t_ms, n_active: frame.n_active, displacement };
    const history = [...state.frameHistory, entry].slice(-MAX_HISTORY);

    set({ frame, frameHistory: history, initialCom });
  },

  setConnected: (c) => set({ connected: c }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setReconnectAttempts: (n) => set({ reconnectAttempts: n }),
  setLoading: (l) => set({ loading: l }),
  setError: (e) => set({ error: e }),
  setPoke: (segment) => set({ lastPoke: { segment, time: Date.now() } }),
  setHoveredNeuron: (neuron) => set({ hoveredNeuron: neuron }),

  reset: () => set({
    experiment: null, frame: null, connected: false, connectionStatus: 'disconnected' as ConnectionStatus,
    reconnectAttempts: 0, loading: false, error: null, frameHistory: [], initialCom: null,
    lastPoke: null, hoveredNeuron: null,
  }),
}));
