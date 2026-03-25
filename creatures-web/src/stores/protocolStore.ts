import { create } from 'zustand';

export type BlockType = 'stimulus' | 'drug' | 'optogenetic' | 'lesion' | 'wait' | 'measure' | 'baseline';

export interface ProtocolBlock {
  id: string;
  type: BlockType;
  startMs: number;
  durationMs: number;
  lane: number;
  params: Record<string, unknown>;
  label: string;
}

export interface TrialResult {
  trialIndex: number;
  measurements: Record<string, number[]>;  // metric name -> values over time
  baselineRates: number[];
  postRates: number[];
}

interface ProtocolState {
  blocks: ProtocolBlock[];
  totalDurationMs: number;
  nTrials: number;
  interTrialIntervalMs: number;
  isRunning: boolean;
  currentTrialIndex: number;
  currentBlockIndex: number;
  results: TrialResult[];
  isDesigning: boolean;

  addBlock: (block: Omit<ProtocolBlock, 'id'>) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, updates: Partial<ProtocolBlock>) => void;
  moveBlock: (id: string, newStartMs: number) => void;
  setTrials: (n: number) => void;
  setInterTrialInterval: (ms: number) => void;
  setRunning: (running: boolean) => void;
  setCurrentTrial: (index: number) => void;
  setCurrentBlock: (index: number) => void;
  recordResult: (result: TrialResult) => void;
  clearResults: () => void;
  setDesigning: (designing: boolean) => void;
  reset: () => void;
}

let _blockCounter = 0;

function computeTotalDuration(blocks: ProtocolBlock[]): number {
  if (blocks.length === 0) return 0;
  return Math.max(...blocks.map((b) => b.startMs + b.durationMs));
}

export const useProtocolStore = create<ProtocolState>((set, get) => ({
  blocks: [],
  totalDurationMs: 0,
  nTrials: 1,
  interTrialIntervalMs: 1000,
  isRunning: false,
  currentTrialIndex: 0,
  currentBlockIndex: 0,
  results: [],
  isDesigning: true,

  addBlock: (block) => {
    const id = `blk_${_blockCounter++}`;
    const newBlock: ProtocolBlock = { ...block, id };
    const blocks = [...get().blocks, newBlock];
    set({ blocks, totalDurationMs: computeTotalDuration(blocks) });
  },

  removeBlock: (id) => {
    const blocks = get().blocks.filter((b) => b.id !== id);
    set({ blocks, totalDurationMs: computeTotalDuration(blocks) });
  },

  updateBlock: (id, updates) => {
    const blocks = get().blocks.map((b) =>
      b.id === id ? { ...b, ...updates } : b,
    );
    set({ blocks, totalDurationMs: computeTotalDuration(blocks) });
  },

  moveBlock: (id, newStartMs) => {
    const blocks = get().blocks.map((b) =>
      b.id === id ? { ...b, startMs: Math.max(0, newStartMs) } : b,
    );
    set({ blocks, totalDurationMs: computeTotalDuration(blocks) });
  },

  setTrials: (n) => set({ nTrials: Math.max(1, n) }),
  setInterTrialInterval: (ms) => set({ interTrialIntervalMs: Math.max(0, ms) }),
  setRunning: (running) => set({ isRunning: running }),
  setCurrentTrial: (index) => set({ currentTrialIndex: index }),
  setCurrentBlock: (index) => set({ currentBlockIndex: index }),

  recordResult: (result) => set({ results: [...get().results, result] }),

  clearResults: () => set({ results: [] }),

  setDesigning: (designing) => set({ isDesigning: designing }),

  reset: () => {
    set({
      blocks: [],
      totalDurationMs: 0,
      nTrials: 1,
      interTrialIntervalMs: 1000,
      isRunning: false,
      currentTrialIndex: 0,
      currentBlockIndex: 0,
      results: [],
      isDesigning: true,
    });
  },
}));
