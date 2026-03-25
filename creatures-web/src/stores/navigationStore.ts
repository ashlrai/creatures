import { create } from 'zustand';

export type ZoomLevel = 'ecosystem' | 'organism' | 'circuit' | 'neuron';

export interface Breadcrumb {
  level: ZoomLevel;
  label: string;
  entityId?: string;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface NavigationState {
  currentLevel: ZoomLevel;
  breadcrumbs: Breadcrumb[];
  selectedOrganismId: string | null;
  selectedCircuitRegion: string | null;
  selectedNeuronId: string | null;
  cameraStates: Partial<Record<ZoomLevel, CameraState>>;
  isTransitioning: boolean;

  zoomTo: (level: ZoomLevel, entityId?: string, label?: string) => void;
  goBack: () => void;
  goToLevel: (index: number) => void;
  saveCameraState: (level: ZoomLevel, state: CameraState) => void;
  setTransitioning: (v: boolean) => void;
  reset: () => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentLevel: 'organism',
  breadcrumbs: [{ level: 'organism', label: 'Organism' }],
  selectedOrganismId: null,
  selectedCircuitRegion: null,
  selectedNeuronId: null,
  cameraStates: {},
  isTransitioning: false,

  zoomTo: (level, entityId, label) => {
    const state = get();
    const newBreadcrumb: Breadcrumb = {
      level,
      label: label ?? level.charAt(0).toUpperCase() + level.slice(1),
      entityId,
    };

    // Find if we're going back to an existing level
    const existingIdx = state.breadcrumbs.findIndex((b) => b.level === level);
    const breadcrumbs = existingIdx >= 0
      ? [...state.breadcrumbs.slice(0, existingIdx), newBreadcrumb]
      : [...state.breadcrumbs, newBreadcrumb];

    const updates: Partial<NavigationState> = {
      currentLevel: level,
      breadcrumbs,
      isTransitioning: true,
    };

    if (level === 'ecosystem') {
      updates.selectedOrganismId = null;
      updates.selectedCircuitRegion = null;
      updates.selectedNeuronId = null;
    } else if (level === 'organism') {
      updates.selectedOrganismId = entityId ?? state.selectedOrganismId;
      updates.selectedCircuitRegion = null;
      updates.selectedNeuronId = null;
    } else if (level === 'circuit') {
      updates.selectedCircuitRegion = entityId ?? null;
      updates.selectedNeuronId = null;
    } else if (level === 'neuron') {
      updates.selectedNeuronId = entityId ?? null;
    }

    set(updates);
    // Auto-clear transition flag after animation
    setTimeout(() => set({ isTransitioning: false }), 600);
  },

  goBack: () => {
    const state = get();
    if (state.breadcrumbs.length <= 1) return;
    const prev = state.breadcrumbs[state.breadcrumbs.length - 2];
    get().zoomTo(prev.level, prev.entityId, prev.label);
  },

  goToLevel: (index) => {
    const state = get();
    if (index < 0 || index >= state.breadcrumbs.length) return;
    const target = state.breadcrumbs[index];
    get().zoomTo(target.level, target.entityId, target.label);
  },

  saveCameraState: (level, camera) => {
    set((s) => ({
      cameraStates: { ...s.cameraStates, [level]: camera },
    }));
  },

  setTransitioning: (v) => set({ isTransitioning: v }),

  reset: () => set({
    currentLevel: 'organism',
    breadcrumbs: [{ level: 'organism', label: 'Organism' }],
    selectedOrganismId: null,
    selectedCircuitRegion: null,
    selectedNeuronId: null,
    isTransitioning: false,
  }),
}));
