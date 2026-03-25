import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType =
  | 'food'
  | 'chemical_gradient'
  | 'obstacle'
  | 'light_zone'
  | 'toxic_zone'
  | 'pheromone_source';

export interface EnvironmentEntity {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  radius: number;
  intensity: number; // 0-1
  color: string;
  params: Record<string, unknown>; // type-specific params
}

export interface EnvironmentPreset {
  name: string;
  description: string;
  entities: Omit<EnvironmentEntity, 'id'>[];
}

// ---------------------------------------------------------------------------
// Defaults per entity type
// ---------------------------------------------------------------------------

const ENTITY_DEFAULTS: Record<
  EntityType,
  { radius: number; intensity: number; color: string; params: Record<string, unknown> }
> = {
  food: { radius: 0.08, intensity: 0.8, color: '#00ff88', params: { nutritional_value: 5 } },
  chemical_gradient: {
    radius: 0.18,
    intensity: 0.6,
    color: '#2288ff',
    params: { diffusion_rate: 0.5, chemical_type: 'attractant' },
  },
  obstacle: {
    radius: 0.1,
    intensity: 1,
    color: '#667788',
    params: { width: 0.12, height: 0.12 },
  },
  light_zone: {
    radius: 0.2,
    intensity: 0.7,
    color: '#ffdd44',
    params: { wavelength: 'blue' },
  },
  toxic_zone: {
    radius: 0.15,
    intensity: 0.5,
    color: '#ff3344',
    params: { damage_rate: 0.3 },
  },
  pheromone_source: {
    radius: 0.12,
    intensity: 0.6,
    color: '#bb44ff',
    params: { signal_type: 'food' },
  },
};

export { ENTITY_DEFAULTS };

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    name: 'Chemotaxis Assay',
    description: '1 food source at right, 1 repellent at left',
    entities: [
      { type: 'food', x: 0.35, y: 0, radius: 0.1, intensity: 0.9, color: '#00ff88', params: { nutritional_value: 8 } },
      {
        type: 'chemical_gradient', x: -0.35, y: 0, radius: 0.2, intensity: 0.7,
        color: '#2288ff', params: { diffusion_rate: 0.6, chemical_type: 'repellent' },
      },
    ],
  },
  {
    name: 'Escape Response Arena',
    description: '1 toxic zone in center, food at edges',
    entities: [
      { type: 'toxic_zone', x: 0, y: 0, radius: 0.2, intensity: 0.8, color: '#ff3344', params: { damage_rate: 0.6 } },
      { type: 'food', x: 0.38, y: 0.2, radius: 0.06, intensity: 0.9, color: '#00ff88', params: { nutritional_value: 7 } },
      { type: 'food', x: -0.38, y: -0.15, radius: 0.06, intensity: 0.9, color: '#00ff88', params: { nutritional_value: 7 } },
      { type: 'food', x: 0.1, y: -0.38, radius: 0.06, intensity: 0.9, color: '#00ff88', params: { nutritional_value: 7 } },
      { type: 'food', x: -0.2, y: 0.35, radius: 0.06, intensity: 0.9, color: '#00ff88', params: { nutritional_value: 7 } },
    ],
  },
  {
    name: 'Foraging Task',
    description: '5 randomly placed food sources',
    entities: [
      { type: 'food', x: 0.25, y: 0.15, radius: 0.07, intensity: 0.8, color: '#00ff88', params: { nutritional_value: 5 } },
      { type: 'food', x: -0.3, y: 0.25, radius: 0.06, intensity: 0.7, color: '#00ff88', params: { nutritional_value: 4 } },
      { type: 'food', x: 0.1, y: -0.3, radius: 0.08, intensity: 0.9, color: '#00ff88', params: { nutritional_value: 6 } },
      { type: 'food', x: -0.2, y: -0.1, radius: 0.05, intensity: 0.6, color: '#00ff88', params: { nutritional_value: 3 } },
      { type: 'food', x: 0.35, y: -0.2, radius: 0.07, intensity: 0.85, color: '#00ff88', params: { nutritional_value: 5 } },
    ],
  },
  {
    name: 'Light-Dark Choice',
    description: 'Left half light zone, right half dark',
    entities: [
      { type: 'light_zone', x: -0.22, y: 0, radius: 0.35, intensity: 0.9, color: '#ffdd44', params: { wavelength: 'blue' } },
    ],
  },
  {
    name: 'Predator Avoidance',
    description: '1 fast-moving toxic zone (predator)',
    entities: [
      { type: 'toxic_zone', x: 0.15, y: 0.1, radius: 0.1, intensity: 0.9, color: '#ff3344', params: { damage_rate: 0.8 } },
      { type: 'food', x: -0.3, y: -0.2, radius: 0.08, intensity: 0.7, color: '#00ff88', params: { nutritional_value: 6 } },
      { type: 'food', x: 0.3, y: -0.3, radius: 0.08, intensity: 0.7, color: '#00ff88', params: { nutritional_value: 6 } },
    ],
  },
];

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let _envIdCounter = 0;
function nextId(): string {
  return `env_${_envIdCounter++}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'neurevo:environment';

interface PersistedState {
  entities: EnvironmentEntity[];
  arenaRadius: number;
  gridSnap: boolean;
}

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (Array.isArray(parsed.entities)) {
      // Restore counter past any existing IDs
      for (const e of parsed.entities) {
        const num = parseInt(e.id.replace('env_', ''), 10);
        if (!isNaN(num) && num >= _envIdCounter) _envIdCounter = num + 1;
      }
      return parsed;
    }
  } catch {
    // Corrupt data — ignore
  }
  return null;
}

function persist(state: PersistedState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entities: state.entities,
        arenaRadius: state.arenaRadius,
        gridSnap: state.gridSnap,
      }),
    );
  } catch {
    // Quota exceeded — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface EnvironmentState {
  entities: EnvironmentEntity[];
  selectedEntityId: string | null;
  isEditing: boolean;
  gridSnap: boolean;
  arenaRadius: number;

  addEntity: (entity: Omit<EnvironmentEntity, 'id'>) => void;
  removeEntity: (id: string) => void;
  updateEntity: (id: string, updates: Partial<EnvironmentEntity>) => void;
  moveEntity: (id: string, x: number, y: number) => void;
  selectEntity: (id: string | null) => void;
  setEditing: (editing: boolean) => void;
  toggleGridSnap: () => void;
  loadPreset: (preset: EnvironmentPreset) => void;
  clearAll: () => void;
  exportConfig: () => string;
  importConfig: (json: string) => void;
}

const initial = loadPersisted();

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  entities: initial?.entities ?? [],
  selectedEntityId: null,
  isEditing: true,
  gridSnap: initial?.gridSnap ?? false,
  arenaRadius: initial?.arenaRadius ?? 1,

  addEntity: (entity) => {
    const id = nextId();
    set((s) => {
      const next = [...s.entities, { ...entity, id }];
      persist({ entities: next, arenaRadius: s.arenaRadius, gridSnap: s.gridSnap });
      return { entities: next, selectedEntityId: id };
    });
  },

  removeEntity: (id) =>
    set((s) => {
      const next = s.entities.filter((e) => e.id !== id);
      persist({ entities: next, arenaRadius: s.arenaRadius, gridSnap: s.gridSnap });
      return {
        entities: next,
        selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
      };
    }),

  updateEntity: (id, updates) =>
    set((s) => {
      const next = s.entities.map((e) => (e.id === id ? { ...e, ...updates } : e));
      persist({ entities: next, arenaRadius: s.arenaRadius, gridSnap: s.gridSnap });
      return { entities: next };
    }),

  moveEntity: (id, x, y) => {
    const { gridSnap } = get();
    const snap = gridSnap ? 0.05 : 0;
    const sx = snap ? Math.round(x / snap) * snap : x;
    const sy = snap ? Math.round(y / snap) * snap : y;
    set((s) => {
      const next = s.entities.map((e) => (e.id === id ? { ...e, x: sx, y: sy } : e));
      persist({ entities: next, arenaRadius: s.arenaRadius, gridSnap: s.gridSnap });
      return { entities: next };
    });
  },

  selectEntity: (id) => set({ selectedEntityId: id }),

  setEditing: (editing) => set({ isEditing: editing }),

  toggleGridSnap: () =>
    set((s) => {
      const next = !s.gridSnap;
      persist({ entities: s.entities, arenaRadius: s.arenaRadius, gridSnap: next });
      return { gridSnap: next };
    }),

  loadPreset: (preset) =>
    set((s) => {
      const entities = preset.entities.map((e) => ({ ...e, id: nextId() }));
      persist({ entities, arenaRadius: s.arenaRadius, gridSnap: s.gridSnap });
      return { entities, selectedEntityId: null };
    }),

  clearAll: () =>
    set((s) => {
      persist({ entities: [], arenaRadius: s.arenaRadius, gridSnap: s.gridSnap });
      return { entities: [], selectedEntityId: null };
    }),

  exportConfig: () => {
    const { entities, arenaRadius } = get();
    return JSON.stringify({ version: 1, arenaRadius, entities }, null, 2);
  },

  importConfig: (json) => {
    try {
      const data = JSON.parse(json);
      if (!Array.isArray(data.entities)) throw new Error('Invalid config');
      const entities: EnvironmentEntity[] = data.entities.map(
        (e: Omit<EnvironmentEntity, 'id'>) => ({ ...e, id: nextId() }),
      );
      set((s) => {
        persist({ entities, arenaRadius: data.arenaRadius ?? s.arenaRadius, gridSnap: s.gridSnap });
        return { entities, arenaRadius: data.arenaRadius ?? s.arenaRadius, selectedEntityId: null };
      });
    } catch (err) {
      console.warn('[EnvironmentStore] Failed to import config:', err);
    }
  },
}));
