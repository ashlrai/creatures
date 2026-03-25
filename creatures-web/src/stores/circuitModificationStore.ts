import { create } from 'zustand';

export type ModificationType = 'lesion' | 'stimulate' | 'silence' | 'record';

export interface CircuitModification {
  id: string;
  type: ModificationType;
  neuronIds: string[];
  params: Record<string, unknown>;
  timestamp: number;
}

interface CircuitModificationState {
  modifications: CircuitModification[];
  undoStack: CircuitModification[];
  redoStack: CircuitModification[];

  selectedNeurons: string[];
  lesionedNeurons: Set<string>;
  stimulatedNeurons: Set<string>;
  silencedNeurons: Set<string>;
  recordedNeurons: Set<string>;

  addModification: (mod: Omit<CircuitModification, 'id' | 'timestamp'>) => void;
  undo: () => void;
  redo: () => void;

  toggleNeuronSelection: (id: string, shift: boolean) => void;
  setSelectedNeurons: (ids: string[]) => void;
  clearSelection: () => void;
  selectNeuronsByFilter: (filter: { type?: string; nt?: string; region?: string }, allNeurons: Array<{ id: string; type?: string; nt?: string; region?: string }>) => void;
}

let nextId = 1;

function applyModification(state: CircuitModificationState, mod: CircuitModification): Partial<CircuitModificationState> {
  const setFor = (key: 'lesionedNeurons' | 'stimulatedNeurons' | 'silencedNeurons' | 'recordedNeurons') => {
    const next = new Set(state[key]);
    for (const nid of mod.neuronIds) next.add(nid);
    return next;
  };

  switch (mod.type) {
    case 'lesion': return { lesionedNeurons: setFor('lesionedNeurons') };
    case 'stimulate': return { stimulatedNeurons: setFor('stimulatedNeurons') };
    case 'silence': return { silencedNeurons: setFor('silencedNeurons') };
    case 'record': return { recordedNeurons: setFor('recordedNeurons') };
  }
}

function revertModification(state: CircuitModificationState, mod: CircuitModification): Partial<CircuitModificationState> {
  const removeFrom = (key: 'lesionedNeurons' | 'stimulatedNeurons' | 'silencedNeurons' | 'recordedNeurons') => {
    const next = new Set(state[key]);
    for (const nid of mod.neuronIds) next.delete(nid);
    return next;
  };

  switch (mod.type) {
    case 'lesion': return { lesionedNeurons: removeFrom('lesionedNeurons') };
    case 'stimulate': return { stimulatedNeurons: removeFrom('stimulatedNeurons') };
    case 'silence': return { silencedNeurons: removeFrom('silencedNeurons') };
    case 'record': return { recordedNeurons: removeFrom('recordedNeurons') };
  }
}

export const useCircuitModificationStore = create<CircuitModificationState>((set, get) => ({
  modifications: [],
  undoStack: [],
  redoStack: [],

  selectedNeurons: [],
  lesionedNeurons: new Set<string>(),
  stimulatedNeurons: new Set<string>(),
  silencedNeurons: new Set<string>(),
  recordedNeurons: new Set<string>(),

  addModification: (partial) => {
    const mod: CircuitModification = {
      ...partial,
      id: `mod_${nextId++}`,
      timestamp: Date.now(),
    };
    const state = get();
    const applied = applyModification(state, mod);
    set({
      modifications: [...state.modifications, mod],
      undoStack: [...state.undoStack, mod],
      redoStack: [],
      ...applied,
    });
  },

  undo: () => {
    const state = get();
    const stack = state.undoStack;
    if (stack.length === 0) return;
    const mod = stack[stack.length - 1];
    const reverted = revertModification(state, mod);
    set({
      undoStack: stack.slice(0, -1),
      redoStack: [...state.redoStack, mod],
      ...reverted,
    });
  },

  redo: () => {
    const state = get();
    const stack = state.redoStack;
    if (stack.length === 0) return;
    const mod = stack[stack.length - 1];
    const applied = applyModification(state, mod);
    set({
      redoStack: stack.slice(0, -1),
      undoStack: [...state.undoStack, mod],
      ...applied,
    });
  },

  toggleNeuronSelection: (id, shift) => {
    const state = get();
    if (shift) {
      const idx = state.selectedNeurons.indexOf(id);
      if (idx >= 0) {
        set({ selectedNeurons: state.selectedNeurons.filter((_, i) => i !== idx) });
      } else {
        set({ selectedNeurons: [...state.selectedNeurons, id] });
      }
    } else {
      set({ selectedNeurons: [id] });
    }
  },

  setSelectedNeurons: (ids) => set({ selectedNeurons: ids }),

  clearSelection: () => set({ selectedNeurons: [] }),

  selectNeuronsByFilter: (filter, allNeurons) => {
    const matching = allNeurons.filter((n) => {
      if (filter.type && n.type !== filter.type) return false;
      if (filter.nt && n.nt !== filter.nt) return false;
      if (filter.region && n.region !== filter.region) return false;
      return true;
    });
    set({ selectedNeurons: matching.map((n) => n.id) });
  },
}));
