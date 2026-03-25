import { create } from 'zustand';

export interface WeightSnapshot {
  t_ms: number;
  weights: number[];
  changes: {
    n_potentiated: number;
    n_depressed: number;
    mean_change: number;
    total_abs_change: number;
  };
}

interface STDPState {
  enabled: boolean;
  weightSnapshots: WeightSnapshot[];
  initialWeights: number[] | null;
  maxSnapshots: number;

  setEnabled: (enabled: boolean) => void;
  addSnapshot: (snapshot: WeightSnapshot) => void;
  reset: () => void;
  connectToEvents: () => () => void;
}

const MAX_SNAPSHOTS = 200;

export const useSTDPStore = create<STDPState>((set, get) => ({
  enabled: false,
  weightSnapshots: [],
  initialWeights: null,
  maxSnapshots: MAX_SNAPSHOTS,

  setEnabled: (enabled) => set({ enabled }),

  addSnapshot: (snapshot) => {
    const state = get();
    const initialWeights = state.initialWeights ?? snapshot.weights;
    const next = [...state.weightSnapshots, snapshot];
    if (next.length > MAX_SNAPSHOTS) {
      next.splice(0, next.length - MAX_SNAPSHOTS);
    }
    set({ weightSnapshots: next, initialWeights });
  },

  reset: () => set({ weightSnapshots: [], initialWeights: null }),

  connectToEvents: () => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as WeightSnapshot | undefined;
      if (detail && detail.weights) {
        get().addSnapshot(detail);
      }
    };
    window.addEventListener('neurevo-weight-snapshot', handler);
    return () => window.removeEventListener('neurevo-weight-snapshot', handler);
  },
}));
