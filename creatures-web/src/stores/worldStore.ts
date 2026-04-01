import { create } from 'zustand';
import { API_BASE } from '../config';
import type {
  MassiveOrganism,
  MassiveNeuralStats,
  EmergentEvent,
} from '../components/ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ZoomBand = 'population' | 'colony' | 'organism';

export type ColorMode = 'energy' | 'lineage';

export interface FoodPosition {
  x: number;
  y: number;
}

/** Active predator-prey chase pair from backend */
export interface ChaseEvent {
  px: number; py: number;  // predator position
  vx: number; vy: number;  // prey (victim) position
}

/** Kill event for death particle effects */
export interface KillEvent {
  x: number; y: number;
  time: number;  // client timestamp for aging
}

/** Per-organism neural detail from backend */
export interface OrganismDetail {
  org_idx: number;
  neural: {
    firing_rates: number[];
    active_neurons: number;
    mean_firing_rate: number;
    sensory_rates: number[];
    inter_rates: number[];
    motor_rates: number[];
    stdp?: {
      n_synapses: number;
      mean_weight: number;
      std_weight: number;
      min_weight: number;
      max_weight: number;
      mean_apre: number;
      mean_apost: number;
    };
  };
  ecosystem: {
    alive: boolean;
    position: { x: number; y: number };
    heading: number;
    energy: number;
    species: string;
    age: number;
    generation: number;
    lineage_id: number;
    parent_id: number;
    lifetime_food: number;
  };
  behavior: {
    speed: number;
    forward_rate: number;
    backward_rate: number;
    turn_rate: number;
    displacement: number;
    linearity: number;
  };
}

interface WorldState {
  // --- Zoom ---
  /** Continuous zoom level: 0 = far (population), 1 = close (organism) */
  zoomLevel: number;
  /** Discrete zoom band derived from zoomLevel */
  zoomBand: ZoomBand;

  // --- Selection ---
  selectedOrganismIndex: number | null;
  selectedOrganism: MassiveOrganism | null;
  /** Per-organism neural detail fetched from backend */
  organismDetail: OrganismDetail | null;
  organismDetailLoading: boolean;

  // --- AI Highlights ---
  highlightedOrganismIndices: Set<number>;

  // --- Visual settings ---
  colorMode: ColorMode;
  speed: number;

  // --- Brain-world identity ---
  massiveId: string | null;
  worldType: string;

  // --- Connection mode (cloud vs local WebSocket) ---
  connectionMode: 'cloud' | 'local';
  localWsUrl: string;

  // --- Ecosystem data (streamed via WebSocket) ---
  organisms: MassiveOrganism[];
  neuralStats: MassiveNeuralStats | null;
  emergentEvents: EmergentEvent[];
  population: number;
  narratives: any[];
  populationStats: any;
  food: FoodPosition[];
  /** Active predator-prey chases for visualization */
  chases: ChaseEvent[];
  /** Recent kill events for death particle effects */
  kills: KillEvent[];
  step: number;

  // --- Chemotaxis tracking ---
  chemotaxisIndex: number;
  meanFoodDistance: number;
  approachingFraction: number;
  relativeChemotaxis: number;

  // --- Lifecycle ---
  isCreating: boolean;
  isTransitioning: boolean;

  // --- Actions ---
  setZoom: (level: number) => void;
  selectOrganism: (index: number | null, org?: MassiveOrganism | null) => void;
  setColorMode: (mode: ColorMode) => void;
  setSpeed: (speed: number) => void;
  setMassiveId: (id: string | null) => void;
  setWorldType: (type: string) => void;
  setConnectionMode: (mode: 'cloud' | 'local') => void;
  setLocalWsUrl: (url: string) => void;
  setIsCreating: (v: boolean) => void;
  setTransitioning: (v: boolean) => void;
  toggleColorMode: () => void;
  fetchOrganismDetail: (orgIdx: number) => Promise<void>;

  /** Bulk update from WebSocket message */
  updateFromWs: (msg: any) => void;

  /** Reset all state */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Zoom band thresholds
// ---------------------------------------------------------------------------

function zoomBandFromLevel(level: number): ZoomBand {
  if (level < 0.3) return 'population';
  if (level < 0.7) return 'colony';
  return 'organism';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorldStore = create<WorldState>((set, get) => ({
  // Zoom
  zoomLevel: 0,
  zoomBand: 'population',

  // Selection
  selectedOrganismIndex: null,
  selectedOrganism: null,
  organismDetail: null,
  organismDetailLoading: false,

  // AI
  highlightedOrganismIndices: new Set(),

  // Visual
  colorMode: 'energy',
  speed: 1.0,

  // Identity
  massiveId: null,
  worldType: 'soil',

  // Connection mode
  connectionMode: 'cloud',
  localWsUrl: 'ws://localhost:8765',

  // Data
  organisms: [],
  neuralStats: null,
  emergentEvents: [],
  population: 0,
  narratives: [],
  populationStats: null,
  food: [],
  chases: [],
  kills: [],
  step: 0,

  // Chemotaxis
  chemotaxisIndex: 0,
  meanFoodDistance: 0,
  approachingFraction: 0,
  relativeChemotaxis: 0,

  // Lifecycle
  isCreating: false,
  isTransitioning: false,

  // Actions
  setZoom: (level) => {
    const clamped = Math.max(0, Math.min(1, level));
    set({ zoomLevel: clamped, zoomBand: zoomBandFromLevel(clamped) });
  },

  selectOrganism: (index, org) => {
    set({
      selectedOrganismIndex: index,
      selectedOrganism: org ?? null,
      organismDetail: null,
      isTransitioning: index !== null,
    });
    if (index !== null) {
      setTimeout(() => set({ isTransitioning: false }), 600);
      // Auto-fetch detail when selecting
      get().fetchOrganismDetail(index);
    }
  },

  setColorMode: (mode) => set({ colorMode: mode }),
  setSpeed: (speed) => set({ speed }),
  setMassiveId: (id) => set({ massiveId: id }),
  setWorldType: (type) => set({ worldType: type }),
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setLocalWsUrl: (url) => set({ localWsUrl: url }),
  setIsCreating: (v) => set({ isCreating: v }),
  setTransitioning: (v) => set({ isTransitioning: v }),

  toggleColorMode: () =>
    set((s) => ({ colorMode: s.colorMode === 'energy' ? 'lineage' : 'energy' })),

  fetchOrganismDetail: async (orgIdx) => {
    const { massiveId } = get();
    if (!massiveId) return;

    set({ organismDetailLoading: true });
    try {
      const res = await fetch(
        `${API_BASE}/api/ecosystem/massive/${massiveId}/organism/${orgIdx}`,
      );
      if (res.ok) {
        const data = await res.json();
        set({ organismDetail: data });
      }
    } catch {
      // Network error — silently ignore, detail panel will show stale data
    } finally {
      set({ organismDetailLoading: false });
    }
  },

  updateFromWs: (msg) => {
    const updates: Partial<WorldState> = {};
    if (msg.organisms) updates.organisms = msg.organisms;
    if (msg.stats?.neural_stats) updates.neuralStats = msg.stats.neural_stats;
    if (msg.stats?.total_alive !== undefined) updates.population = msg.stats.total_alive;
    if (msg.events) updates.emergentEvents = msg.events;
    if (msg.narratives && msg.narratives.length > 0) {
      // Accumulate narratives (don't replace — ticker tracks by index)
      const prev = get().narratives;
      updates.narratives = [...prev, ...msg.narratives].slice(-50);
    }
    if (msg.population_stats) updates.populationStats = msg.population_stats;
    if (msg.food) updates.food = msg.food;
    if (msg.chases) updates.chases = msg.chases;
    else if (msg.stats?.active_chases) updates.chases = msg.stats.active_chases;
    if (msg.kills && msg.kills.length > 0) {
      // Accumulate kills with client timestamps, keep last 30
      const now = Date.now();
      const newKills: KillEvent[] = msg.kills.map((k: any) => ({ x: k.x, y: k.y, time: now }));
      const prev = get().kills.filter((k) => now - k.time < 2000); // remove old (>2s)
      updates.kills = [...prev, ...newKills].slice(-30);
    }
    if (msg.step !== undefined) updates.step = msg.step;
    if (msg.chemotaxis?.chemotaxis_index !== undefined) {
      updates.chemotaxisIndex = msg.chemotaxis.chemotaxis_index;
      updates.meanFoodDistance = msg.chemotaxis.mean_food_distance ?? 0;
      updates.approachingFraction = msg.chemotaxis.approaching_fraction ?? 0;
      updates.relativeChemotaxis = msg.chemotaxis.relative_chemotaxis ?? 0;
    }
    set(updates);

    // Dispatch for EvolutionTimeline compatibility
    window.dispatchEvent(
      new CustomEvent('neurevo-evo-data', {
        detail: {
          population: msg.stats?.total_alive ?? 0,
          generation: msg.population_stats?.max_generation ?? 0,
          lineages: msg.population_stats?.n_lineages ?? 0,
          step: msg.step ?? 0,
        },
      }),
    );
  },

  reset: () =>
    set({
      zoomLevel: 0,
      zoomBand: 'population',
      selectedOrganismIndex: null,
      selectedOrganism: null,
      organismDetail: null,
      organismDetailLoading: false,
      highlightedOrganismIndices: new Set(),
      colorMode: 'energy',
      speed: 1.0,
      massiveId: null,
      worldType: 'soil',
      connectionMode: 'cloud',
      localWsUrl: 'ws://localhost:8765',
      organisms: [],
      neuralStats: null,
      emergentEvents: [],
      population: 0,
      narratives: [],
      populationStats: null,
      food: [],
      chases: [],
      kills: [],
      step: 0,
      chemotaxisIndex: 0,
      meanFoodDistance: 0,
      approachingFraction: 0,
      relativeChemotaxis: 0,
      isCreating: false,
      isTransitioning: false,
    }),
}));
