import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Era, HistoricalEvent, HistoricalPerson, Artifact, Concept,
  Quest, QuestObjective, Epoch, AlchemyElement,
} from '../data/knowledge-graph';
import { MASTERY_LEVELS } from '../data/knowledge-graph';
import { checkObjectiveCompletion } from '../lib/questTracker';

// ============================================================================
// Museum Store — all state for the experiential encyclopedia
// ============================================================================

export type MuseumView =
  | 'timeline'          // 3D timeline river — the main navigation
  | 'era'               // viewing a specific era
  | 'event'             // viewing a specific event
  | 'person'            // viewing a historical figure
  | 'artifact'          // viewing an artifact
  | 'alchemy'           // the alchemy workbench
  | 'quests'            // quest/curriculum dashboard
  | 'quest-active'      // actively completing a quest
  | 'explore'           // force graph knowledge visualization
  | 'trivia'            // daily trivia
  | 'battle'            // daily battles
  | 'paths'             // exploration paths
  | 'concept'          // viewing a concept
  | 'hall-of-life';     // original Neurevo organism simulation

export interface CharacterConversation {
  characterId: string;
  lifeStageId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

interface MuseumState {
  // -- Navigation --
  view: MuseumView;
  selectedEraId: string | null;
  selectedEventId: string | null;
  selectedPersonId: string | null;
  selectedArtifactId: string | null;
  selectedConceptId: string | null;
  activeQuestId: string | null;
  breadcrumbs: { view: MuseumView; id: string | null; label: string }[];

  // -- Progression --
  xp: number;
  level: number;
  title: string;
  completedQuestIds: Set<string>;
  completedEpochIds: Set<string>;
  completedObjectiveIds: Set<string>;
  visitedEntityIds: Set<string>;
  achievementIds: Set<string>;

  // -- Alchemy --
  discoveredAlchemyIds: Set<string>;

  // -- Characters --
  activeConversation: CharacterConversation | null;
  conversationHistory: CharacterConversation[];

  // -- Actions --
  navigate: (view: MuseumView, entityId?: string | null) => void;
  goBack: () => void;
  addXp: (amount: number) => void;
  completeObjective: (objectiveId: string, xpReward: number) => void;
  completeQuest: (questId: string) => void;
  completeEpoch: (epochId: string) => void;
  visitEntity: (entityId: string) => void;
  discoverAlchemy: (elementId: string) => void;
  startConversation: (characterId: string, lifeStageId: string) => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  endConversation: () => void;
  unlockAchievement: (achievementId: string) => void;
}

function calculateLevel(totalXp: number): { level: number; title: string } {
  let current = MASTERY_LEVELS[0];
  for (const ml of MASTERY_LEVELS) {
    if (totalXp >= ml.xpRequired) current = ml;
    else break;
  }
  return { level: current.level, title: current.title };
}

export const useMuseumStore = create<MuseumState>()(persist((set, get) => ({
  // -- Initial State --
  view: 'timeline',
  selectedEraId: null,
  selectedEventId: null,
  selectedPersonId: null,
  selectedArtifactId: null,
  selectedConceptId: null,
  activeQuestId: null,
  breadcrumbs: [{ view: 'timeline', id: null, label: 'Timeline' }],

  xp: 0,
  level: 1,
  title: 'Curious Visitor',
  completedQuestIds: new Set(),
  completedEpochIds: new Set(),
  completedObjectiveIds: new Set(),
  visitedEntityIds: new Set(),
  achievementIds: new Set(),

  discoveredAlchemyIds: new Set(['earth', 'water', 'fire', 'air']), // start with 4 base elements

  activeConversation: null,
  conversationHistory: [],

  // -- Actions --

  navigate: (view, entityId = null) => {
    set(state => {
      const updates: Partial<MuseumState> = { view };
      const label = entityId ?? view;
      const newCrumb = { view, id: entityId, label };

      // Set the appropriate selected ID
      if (view === 'era') updates.selectedEraId = entityId;
      if (view === 'event') updates.selectedEventId = entityId;
      if (view === 'person') updates.selectedPersonId = entityId;
      if (view === 'artifact') updates.selectedArtifactId = entityId;
      if (view === 'concept') updates.selectedConceptId = entityId;

      // Track visited entities
      if (entityId) {
        const visited = new Set(state.visitedEntityIds);
        visited.add(entityId);
        updates.visitedEntityIds = visited;
      }

      // Manage breadcrumbs — push new crumb
      updates.breadcrumbs = [...state.breadcrumbs, newCrumb];

      return updates as any;
    });
    // Check quest objectives after navigation state is committed
    const s = get();
    checkObjectiveCompletion(s, s);
  },

  goBack: () => set(state => {
    if (state.breadcrumbs.length <= 1) return { view: 'timeline' as MuseumView, breadcrumbs: [{ view: 'timeline' as MuseumView, id: null, label: 'Timeline' }] };
    const newCrumbs = state.breadcrumbs.slice(0, -1);
    const prev = newCrumbs[newCrumbs.length - 1];
    return {
      view: prev.view,
      selectedEraId: prev.view === 'era' ? prev.id : state.selectedEraId,
      selectedEventId: prev.view === 'event' ? prev.id : state.selectedEventId,
      selectedPersonId: prev.view === 'person' ? prev.id : state.selectedPersonId,
      selectedArtifactId: prev.view === 'artifact' ? prev.id : state.selectedArtifactId,
      selectedConceptId: prev.view === 'concept' ? prev.id : state.selectedConceptId,
      breadcrumbs: newCrumbs,
    };
  }),

  addXp: (amount) => set(state => {
    const newXp = state.xp + amount;
    const { level, title } = calculateLevel(newXp);
    return { xp: newXp, level, title };
  }),

  completeObjective: (objectiveId, xpReward) => set(state => {
    const objectives = new Set(state.completedObjectiveIds);
    if (objectives.has(objectiveId)) return {};
    objectives.add(objectiveId);
    const newXp = state.xp + xpReward;
    const { level, title } = calculateLevel(newXp);
    return { completedObjectiveIds: objectives, xp: newXp, level, title };
  }),

  completeQuest: (questId) => set(state => {
    const quests = new Set(state.completedQuestIds);
    quests.add(questId);
    return { completedQuestIds: quests };
  }),

  completeEpoch: (epochId) => set(state => {
    const epochs = new Set(state.completedEpochIds);
    epochs.add(epochId);
    return { completedEpochIds: epochs };
  }),

  visitEntity: (entityId) => set(state => {
    const visited = new Set(state.visitedEntityIds);
    visited.add(entityId);
    return { visitedEntityIds: visited };
  }),

  discoverAlchemy: (elementId) => {
    set(state => {
      const discovered = new Set(state.discoveredAlchemyIds);
      if (discovered.has(elementId)) return {};
      discovered.add(elementId);
      return { discoveredAlchemyIds: discovered };
    });
    const s = get();
    checkObjectiveCompletion(s, s);
  },

  startConversation: (characterId, lifeStageId) => {
    set({
      activeConversation: { characterId, lifeStageId, messages: [] },
    });
    const s = get();
    checkObjectiveCompletion(s, s);
  },

  addMessage: (role, content) => set(state => {
    if (!state.activeConversation) return {};
    return {
      activeConversation: {
        ...state.activeConversation,
        messages: [...state.activeConversation.messages, { role, content }],
      },
    };
  }),

  endConversation: () => set(state => {
    if (!state.activeConversation) return {};
    return {
      conversationHistory: [...state.conversationHistory, state.activeConversation],
      activeConversation: null,
    };
  }),

  unlockAchievement: (achievementId) => set(state => {
    const achievements = new Set(state.achievementIds);
    achievements.add(achievementId);
    return { achievementIds: achievements };
  }),
}), {
  name: 'neurevo-museum',
  // Only persist progression data, not volatile UI state
  partialize: (state) => ({
    xp: state.xp,
    level: state.level,
    title: state.title,
    completedQuestIds: state.completedQuestIds,
    completedEpochIds: state.completedEpochIds,
    completedObjectiveIds: state.completedObjectiveIds,
    visitedEntityIds: state.visitedEntityIds,
    achievementIds: state.achievementIds,
    discoveredAlchemyIds: state.discoveredAlchemyIds,
    conversationHistory: state.conversationHistory,
  }),
  // Convert Sets to/from arrays for JSON serialization
  storage: {
    getItem: (name) => {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.state) {
        const s = parsed.state;
        if (Array.isArray(s.completedQuestIds)) s.completedQuestIds = new Set(s.completedQuestIds);
        if (Array.isArray(s.completedEpochIds)) s.completedEpochIds = new Set(s.completedEpochIds);
        if (Array.isArray(s.completedObjectiveIds)) s.completedObjectiveIds = new Set(s.completedObjectiveIds);
        if (Array.isArray(s.visitedEntityIds)) s.visitedEntityIds = new Set(s.visitedEntityIds);
        if (Array.isArray(s.achievementIds)) s.achievementIds = new Set(s.achievementIds);
        if (Array.isArray(s.discoveredAlchemyIds)) s.discoveredAlchemyIds = new Set(s.discoveredAlchemyIds);
      }
      return parsed;
    },
    setItem: (name, value) => {
      // Convert Sets to arrays before storing
      const toStore = JSON.parse(JSON.stringify(value, (key, val) => {
        if (val instanceof Set) return Array.from(val);
        return val;
      }));
      localStorage.setItem(name, JSON.stringify(toStore));
    },
    removeItem: (name) => localStorage.removeItem(name),
  },
}));
