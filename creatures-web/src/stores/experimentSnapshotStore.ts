import { create } from 'zustand';
import { useSimulationStore } from './simulationStore';
import { useCircuitModificationStore } from './circuitModificationStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExperimentSnapshot {
  id: string;
  name: string;
  timestamp: number;
  organism: string;
  condition: string;
  color: string;
  firingRates: number[];
  populationRate: number;
  activeNeuronFraction: number;
  synchronyIndex: number;
  spikeCount: number;
  modifications: string[];
  metadata: Record<string, unknown>;
}

interface SnapshotState {
  snapshots: ExperimentSnapshot[];
  selectedIds: string[];

  captureSnapshot: (name: string, condition: string) => void;
  removeSnapshot: (id: string) => void;
  renameSnapshot: (id: string, name: string) => void;
  setCondition: (id: string, condition: string) => void;
  setColor: (id: string, color: string) => void;
  toggleSelection: (id: string) => void;
  clearSnapshots: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PALETTE = ['#00d4ff', '#ff6b4a', '#4aff8b', '#ffaa00', '#cc44ff', '#ff4488'];
const STORAGE_KEY = 'neurevo:snapshots';

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadPersistedSnapshots(): ExperimentSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExperimentSnapshot[];
  } catch {
    return [];
  }
}

function persistSnapshots(snapshots: ExperimentSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // localStorage may be full — silently ignore
  }
}

// ── Synchrony estimation ──────────────────────────────────────────────────────
// Simple pairwise correlation-based synchrony index: mean(abs(r_ij)) for random
// pairs sampled from the firing rate vector. Returns [0, 1].

function estimateSynchrony(rates: number[]): number {
  if (rates.length < 2) return 0;
  const n = rates.length;
  const mu = rates.reduce((s, v) => s + v, 0) / n;
  const sigma = Math.sqrt(rates.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
  if (sigma < 1e-12) return 1; // all identical → perfectly synchronous

  // Coefficient of variation as a proxy: low CV → high synchrony
  const cv = sigma / (Math.abs(mu) + 1e-12);
  // Map CV to [0,1] — CV of 0 → synchrony 1, CV of 2+ → synchrony ~0
  return Math.max(0, Math.min(1, 1 - cv / 2));
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useExperimentSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: loadPersistedSnapshots(),
  selectedIds: [],

  captureSnapshot: (name, condition) => {
    const simState = useSimulationStore.getState();
    const modState = useCircuitModificationStore.getState();
    const frame = simState.frame;
    const experiment = simState.experiment;

    if (!frame) return;

    const firingRates = [...frame.firing_rates];
    const nNeurons = firingRates.length || 1;
    const populationRate =
      firingRates.length > 0
        ? firingRates.reduce((s, v) => s + v, 0) / nNeurons
        : 0;
    const activeNeuronFraction = firingRates.filter((r) => r > 0.1).length / nNeurons;
    const synchronyIndex = estimateSynchrony(firingRates);
    const spikeCount = frame.spikes.length;

    const modifications = modState.modifications.map(
      (m) => `${m.type}(${m.neuronIds.length} neurons)`,
    );

    const existing = get().snapshots;
    const colorIndex = existing.length % PALETTE.length;

    const snapshot: ExperimentSnapshot = {
      id: `snap_${Date.now()}`,
      name,
      timestamp: Date.now(),
      organism: experiment?.organism ?? 'unknown',
      condition,
      color: PALETTE[colorIndex],
      firingRates,
      populationRate,
      activeNeuronFraction,
      synchronyIndex,
      spikeCount,
      modifications,
      metadata: {
        t_ms: frame.t_ms,
        n_neurons: experiment?.n_neurons ?? nNeurons,
        n_synapses: experiment?.n_synapses ?? 0,
        experimentName: experiment?.name ?? '',
      },
    };

    const next = [...existing, snapshot];
    persistSnapshots(next);
    set({ snapshots: next });
  },

  removeSnapshot: (id) => {
    const next = get().snapshots.filter((s) => s.id !== id);
    const nextSelected = get().selectedIds.filter((sid) => sid !== id);
    persistSnapshots(next);
    set({ snapshots: next, selectedIds: nextSelected });
  },

  renameSnapshot: (id, name) => {
    const next = get().snapshots.map((s) => (s.id === id ? { ...s, name } : s));
    persistSnapshots(next);
    set({ snapshots: next });
  },

  setCondition: (id, condition) => {
    const next = get().snapshots.map((s) => (s.id === id ? { ...s, condition } : s));
    persistSnapshots(next);
    set({ snapshots: next });
  },

  setColor: (id, color) => {
    const next = get().snapshots.map((s) => (s.id === id ? { ...s, color } : s));
    persistSnapshots(next);
    set({ snapshots: next });
  },

  toggleSelection: (id) => {
    const sel = get().selectedIds;
    const idx = sel.indexOf(id);
    if (idx >= 0) {
      set({ selectedIds: sel.filter((_, i) => i !== idx) });
    } else {
      set({ selectedIds: [...sel, id] });
    }
  },

  clearSnapshots: () => {
    persistSnapshots([]);
    set({ snapshots: [], selectedIds: [] });
  },
}));
