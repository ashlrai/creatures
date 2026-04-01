// ============================================================================
// Quest Objective Tracker
// Automatically checks whether user actions complete quest objectives.
// Called after navigate(), discoverAlchemy(), and startConversation().
// Only checks objectives for the active quest — not all 41 quests.
// ============================================================================

import type { Quest, QuestObjective } from '../data/knowledge-graph';
import { QUESTS_BY_ID, EPOCHS } from '../data/curriculum';
import { getVisitedCountForEra } from '../data/halls';

// Objective types that require manual/complex evaluation — skip auto-check
const MANUAL_OBJECTIVE_TYPES = new Set([
  'cast_battle_vote',
  'answer_question',
  'find_connection',
  'debate_character',
  'solve_challenge',
]);

// Parse "Visit at least N events" from description for explore_era objectives.
// Falls back to 1 if no number found (e.g. "Navigate the Timeline River").
const EXPLORE_COUNT_RE = /at least (\d+)/i;
function getExploreThreshold(objective: QuestObjective): number {
  const match = objective.description.match(EXPLORE_COUNT_RE);
  return match ? parseInt(match[1], 10) : 1;
}

// ── State shape expected from the museum store ──────────────────────────────

interface TrackableState {
  activeQuestId: string | null;
  completedObjectiveIds: Set<string>;
  completedQuestIds: Set<string>;
  completedEpochIds: Set<string>;
  visitedEntityIds: Set<string>;
  discoveredAlchemyIds: Set<string>;
  conversationHistory: { characterId: string }[];
  activeConversation: { characterId: string } | null;
}

interface StoreActions {
  completeObjective: (objectiveId: string, xpReward: number) => void;
  completeQuest: (questId: string) => void;
  completeEpoch: (epochId: string) => void;
}

// ── Objective completion checks ─────────────────────────────────────────────

function isObjectiveMet(
  objective: QuestObjective,
  state: TrackableState,
): boolean {
  if (MANUAL_OBJECTIVE_TYPES.has(objective.type)) return false;

  switch (objective.type) {
    case 'visit_event': {
      return !!objective.targetEntityId && state.visitedEntityIds.has(objective.targetEntityId);
    }

    case 'talk_to_character': {
      if (!objective.targetEntityId) return false;
      const targetId = objective.targetEntityId;
      // Check active conversation or history
      if (state.activeConversation?.characterId === targetId) return true;
      return state.conversationHistory.some(c => c.characterId === targetId);
    }

    case 'explore_era': {
      if (!objective.targetEntityId) return false;
      const threshold = getExploreThreshold(objective);
      const visited = getVisitedCountForEra(objective.targetEntityId, state.visitedEntityIds);
      return visited >= threshold;
    }

    case 'discover_alchemy': {
      return !!objective.targetAlchemyId && state.discoveredAlchemyIds.has(objective.targetAlchemyId);
    }

    // complete_path and watch_simulation could be auto-tracked in the future
    default:
      return false;
  }
}

// ── Main entry point — call after every trackable user action ───────────────

export function checkObjectiveCompletion(
  state: TrackableState,
  actions: StoreActions,
): void {
  const { activeQuestId } = state;
  if (!activeQuestId) return;

  const quest = QUESTS_BY_ID.get(activeQuestId);
  if (!quest) return;

  // Already completed — nothing to do
  if (state.completedQuestIds.has(activeQuestId)) return;

  let newCompletions = false;

  // Check each incomplete objective
  for (const obj of quest.objectives) {
    if (state.completedObjectiveIds.has(obj.id)) continue;
    if (isObjectiveMet(obj, state)) {
      actions.completeObjective(obj.id, obj.xpReward);
      newCompletions = true;
    }
  }

  if (!newCompletions) return;

  // Re-read completed objectives after mutations (actions are synchronous Zustand set() calls)
  // We need to check against the *updated* set, which includes what we just completed.
  // Build the projected set of completed objective IDs.
  const projectedCompleted = new Set(state.completedObjectiveIds);
  for (const obj of quest.objectives) {
    if (projectedCompleted.has(obj.id)) continue;
    if (isObjectiveMet(obj, state)) {
      projectedCompleted.add(obj.id);
    }
  }

  // Check quest completion: all required (non-optional) objectives done
  const allRequiredDone = quest.objectives
    .filter(o => !o.optional)
    .every(o => projectedCompleted.has(o.id));

  if (allRequiredDone && !state.completedQuestIds.has(quest.id)) {
    actions.completeQuest(quest.id);

    // Check epoch completion: all quests in the epoch done
    checkEpochCompletion(quest, state, actions);
  }
}

// ── Epoch completion check ──────────────────────────────────────────────────

function checkEpochCompletion(
  justCompletedQuest: Quest,
  state: TrackableState,
  actions: StoreActions,
): void {
  const epoch = EPOCHS.find(e => e.id === justCompletedQuest.epochId);
  if (!epoch) return;
  if (state.completedEpochIds.has(epoch.id)) return;

  // Build projected completed quest set (includes the one we just completed)
  const projectedQuests = new Set(state.completedQuestIds);
  projectedQuests.add(justCompletedQuest.id);

  const allQuestsDone = epoch.questIds.every(qid => projectedQuests.has(qid));
  if (allQuestsDone) {
    actions.completeEpoch(epoch.id);
  }
}
