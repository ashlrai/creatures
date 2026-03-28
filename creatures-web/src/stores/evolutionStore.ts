import { create } from 'zustand';
import type { EvolutionRun, FitnessHistory, GenerationStats, GodReport, EvolutionEvent } from '../types/evolution';

interface EvolutionState {
  currentRun: EvolutionRun | null;
  fitnessHistory: FitnessHistory;
  isEvolutionMode: boolean;
  latestStats: GenerationStats | null;
  godReports: GodReport[];

  // Species tracking
  speciesHistory: number[];

  // Event feed
  eventLog: EvolutionEvent[];

  // Timing / progress
  generationTimestamps: number[];
  runStartTime: number | null;

  // Challenge selection
  selectedChallenge: string | null;

  // Actions
  setRun: (run: EvolutionRun) => void;
  addGeneration: (stats: GenerationStats) => void;
  addGodReport: (report: GodReport) => void;
  addEvent: (event: EvolutionEvent) => void;
  setRunStartTime: (t: number) => void;
  setSelectedChallenge: (id: string | null) => void;
  toggleEvolutionMode: () => void;
  reset: () => void;
}

const emptyHistory: FitnessHistory = { generations: [], best: [], mean: [] };

export const useEvolutionStore = create<EvolutionState>((set, get) => ({
  currentRun: null,
  fitnessHistory: emptyHistory,
  isEvolutionMode: false,
  latestStats: null,
  godReports: [],
  speciesHistory: [],
  eventLog: [],
  generationTimestamps: [],
  runStartTime: null,
  selectedChallenge: null,

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
      speciesHistory: [...state.speciesHistory, stats.n_species],
      generationTimestamps: [...state.generationTimestamps, Date.now()],
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

  addGodReport: (report) => set((s) => ({ godReports: [...s.godReports, report] })),

  addEvent: (event) => set((s) => {
    // Deduplicate by id
    if (s.eventLog.some((e) => e.id === event.id)) return s;
    return { eventLog: [...s.eventLog, event] };
  }),

  setRunStartTime: (t) => set({ runStartTime: t }),

  setSelectedChallenge: (id) => set({ selectedChallenge: id }),

  toggleEvolutionMode: () => set((s) => ({ isEvolutionMode: !s.isEvolutionMode })),

  reset: () => set({
    currentRun: null,
    fitnessHistory: emptyHistory,
    isEvolutionMode: false,
    latestStats: null,
    godReports: [],
    speciesHistory: [],
    eventLog: [],
    generationTimestamps: [],
    runStartTime: null,
  }),
}));
