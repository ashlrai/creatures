import { create } from 'zustand';

const STORAGE_KEY = 'neurevo:uiPrefs';

interface UIPreferencesState {
  researchMode: boolean;
  expandedPanels: Record<string, boolean>;

  toggleResearchMode: () => void;
  setPanelExpanded: (id: string, expanded: boolean) => void;
}

function loadFromStorage(): Pick<UIPreferencesState, 'researchMode' | 'expandedPanels'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        researchMode: typeof parsed.researchMode === 'boolean' ? parsed.researchMode : false,
        expandedPanels: parsed.expandedPanels && typeof parsed.expandedPanels === 'object'
          ? parsed.expandedPanels
          : {},
      };
    }
  } catch {
    // Ignore corrupt localStorage
  }
  return { researchMode: false, expandedPanels: {} };
}

function persist(state: Pick<UIPreferencesState, 'researchMode' | 'expandedPanels'>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      researchMode: state.researchMode,
      expandedPanels: state.expandedPanels,
    }));
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

const initial = loadFromStorage();

export const useUIPreferencesStore = create<UIPreferencesState>((set) => ({
  researchMode: initial.researchMode,
  expandedPanels: initial.expandedPanels,

  toggleResearchMode: () =>
    set((s) => {
      const next = { ...s, researchMode: !s.researchMode };
      persist(next);
      return next;
    }),

  setPanelExpanded: (id: string, expanded: boolean) =>
    set((s) => {
      const next = { ...s, expandedPanels: { ...s.expandedPanels, [id]: expanded } };
      persist(next);
      return next;
    }),
}));
