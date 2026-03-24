import { create } from 'zustand';
import type { EvolutionRun, FitnessHistory, GenerationStats } from '../types/evolution';

interface EvolutionState {
  currentRun: EvolutionRun | null;
  fitnessHistory: FitnessHistory;
  isEvolutionMode: boolean;
  latestStats: GenerationStats | null;

  setRun: (run: EvolutionRun) => void;
  addGeneration: (stats: GenerationStats) => void;
  toggleEvolutionMode: () => void;
  reset: () => void;
}

const emptyHistory: FitnessHistory = { generations: [], best: [], mean: [] };

export const useEvolutionStore = create<EvolutionState>((set, get) => ({
  currentRun: null,
  fitnessHistory: emptyHistory,
  isEvolutionMode: false,
  latestStats: null,

  setRun: (run) => set({ currentRun: run }),

  addGeneration: (stats) => {
    const state = get();
    const history = state.fitnessHistory;
    set({
      fitnessHistory: {
        generations: [...history.generations, stats.generation],
        best: [...history.best, stats.best_fitness],
        mean: [...history.mean, stats.mean_fitness],
      },
      latestStats: stats,
      currentRun: state.currentRun
        ? {
            ...state.currentRun,
            generation: stats.generation,
            best_fitness: stats.best_fitness,
            mean_fitness: stats.mean_fitness,
          }
        : null,
    });
  },

  toggleEvolutionMode: () => set((s) => ({ isEvolutionMode: !s.isEvolutionMode })),

  reset: () => set({
    currentRun: null,
    fitnessHistory: emptyHistory,
    isEvolutionMode: false,
    latestStats: null,
  }),
}));
