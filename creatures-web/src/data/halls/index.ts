// ============================================================================
// Hall Data Index — aggregates all hall data into unified collections
// ============================================================================

import type { Era, HistoricalEvent, HistoricalPerson, Artifact, Concept } from '../knowledge-graph';

// History Wing
import { ANCIENT_WORLD_ERA, ANCIENT_WORLD_EVENTS, ANCIENT_WORLD_PEOPLE, ANCIENT_WORLD_ARTIFACTS, ANCIENT_WORLD_CONCEPTS } from './ancient-world';
import { MEDIEVAL_WORLD_ERA, MEDIEVAL_WORLD_EVENTS, MEDIEVAL_WORLD_PEOPLE, MEDIEVAL_WORLD_ARTIFACTS, MEDIEVAL_WORLD_CONCEPTS } from './medieval-world';
import { RENAISSANCE_ERA, RENAISSANCE_EVENTS, RENAISSANCE_PEOPLE, RENAISSANCE_ARTIFACTS, RENAISSANCE_CONCEPTS } from './renaissance';
import { EXPLORATION_ERA, EXPLORATION_EVENTS, EXPLORATION_PEOPLE, EXPLORATION_ARTIFACTS, EXPLORATION_CONCEPTS } from './age-of-exploration';
import { MODERN_ERA_ERA, MODERN_ERA_EVENTS, MODERN_ERA_PEOPLE, MODERN_ERA_ARTIFACTS, MODERN_ERA_CONCEPTS } from './modern-era';
import { TWENTIETH_CENTURY_ERA, TWENTIETH_CENTURY_EVENTS, TWENTIETH_CENTURY_PEOPLE, TWENTIETH_CENTURY_ARTIFACTS, TWENTIETH_CENTURY_CONCEPTS } from './twentieth-century';

// Science Wing
import { SCIENTIFIC_REVOLUTION_ERA, SCIENTIFIC_REVOLUTION_EVENTS, SCIENTIFIC_REVOLUTION_PEOPLE, SCIENTIFIC_REVOLUTION_ARTIFACTS, SCIENTIFIC_REVOLUTION_CONCEPTS } from './scientific-revolution';
import { STARS_COSMOS_ERA, STARS_COSMOS_EVENTS, STARS_COSMOS_PEOPLE, STARS_COSMOS_ARTIFACTS, STARS_COSMOS_CONCEPTS } from './stars-and-cosmos';
import { ELEMENTS_MATTER_ERA, ELEMENTS_MATTER_EVENTS, ELEMENTS_MATTER_PEOPLE, ELEMENTS_MATTER_ARTIFACTS, ELEMENTS_MATTER_CONCEPTS } from './elements-and-matter';
import { LIFE_EVOLUTION_ERA, LIFE_EVOLUTION_EVENTS, LIFE_EVOLUTION_PEOPLE, LIFE_EVOLUTION_ARTIFACTS, LIFE_EVOLUTION_CONCEPTS } from './life-and-evolution';

// ── Unified Arrays ──────────────────────────────────────────────────────────

export const ALL_ERAS: Era[] = [
  // History Wing (chronological)
  ANCIENT_WORLD_ERA,
  MEDIEVAL_WORLD_ERA,
  RENAISSANCE_ERA,
  EXPLORATION_ERA,
  MODERN_ERA_ERA,
  TWENTIETH_CENTURY_ERA,
  // Science Wing
  SCIENTIFIC_REVOLUTION_ERA,
  STARS_COSMOS_ERA,
  ELEMENTS_MATTER_ERA,
  LIFE_EVOLUTION_ERA,
];

export const ALL_EVENTS: HistoricalEvent[] = [
  ...ANCIENT_WORLD_EVENTS,
  ...MEDIEVAL_WORLD_EVENTS,
  ...RENAISSANCE_EVENTS,
  ...EXPLORATION_EVENTS,
  ...MODERN_ERA_EVENTS,
  ...TWENTIETH_CENTURY_EVENTS,
  ...SCIENTIFIC_REVOLUTION_EVENTS,
  ...STARS_COSMOS_EVENTS,
  ...ELEMENTS_MATTER_EVENTS,
  ...LIFE_EVOLUTION_EVENTS,
];

export const ALL_PEOPLE: HistoricalPerson[] = [
  ...ANCIENT_WORLD_PEOPLE,
  ...MEDIEVAL_WORLD_PEOPLE,
  ...RENAISSANCE_PEOPLE,
  ...EXPLORATION_PEOPLE,
  ...MODERN_ERA_PEOPLE,
  ...TWENTIETH_CENTURY_PEOPLE,
  ...SCIENTIFIC_REVOLUTION_PEOPLE,
  ...STARS_COSMOS_PEOPLE,
  ...ELEMENTS_MATTER_PEOPLE,
  ...LIFE_EVOLUTION_PEOPLE,
];

export const ALL_ARTIFACTS: Artifact[] = [
  ...ANCIENT_WORLD_ARTIFACTS,
  ...MEDIEVAL_WORLD_ARTIFACTS,
  ...RENAISSANCE_ARTIFACTS,
  ...EXPLORATION_ARTIFACTS,
  ...MODERN_ERA_ARTIFACTS,
  ...TWENTIETH_CENTURY_ARTIFACTS,
  ...SCIENTIFIC_REVOLUTION_ARTIFACTS,
  ...STARS_COSMOS_ARTIFACTS,
  ...ELEMENTS_MATTER_ARTIFACTS,
  ...LIFE_EVOLUTION_ARTIFACTS,
];

export const ALL_CONCEPTS: Concept[] = [
  ...ANCIENT_WORLD_CONCEPTS,
  ...MEDIEVAL_WORLD_CONCEPTS,
  ...RENAISSANCE_CONCEPTS,
  ...EXPLORATION_CONCEPTS,
  ...MODERN_ERA_CONCEPTS,
  ...TWENTIETH_CENTURY_CONCEPTS,
  ...SCIENTIFIC_REVOLUTION_CONCEPTS,
  ...STARS_COSMOS_CONCEPTS,
  ...ELEMENTS_MATTER_CONCEPTS,
  ...LIFE_EVOLUTION_CONCEPTS,
];

// ── Lookup Maps ─────────────────────────────────────────────────────────────

export const ERA_MAP = new Map<string, Era>(ALL_ERAS.map(e => [e.id, e]));
export const EVENT_MAP = new Map<string, HistoricalEvent>(ALL_EVENTS.map(e => [e.id, e]));
export const PERSON_MAP = new Map<string, HistoricalPerson>(ALL_PEOPLE.map(p => [p.id, p]));
export const ARTIFACT_MAP = new Map<string, Artifact>(ALL_ARTIFACTS.map(a => [a.id, a]));
export const CONCEPT_MAP = new Map<string, Concept>(ALL_CONCEPTS.map(c => [c.id, c]));

// ── Per-Era Lookups ─────────────────────────────────────────────────────────

export function getEventsForEra(eraId: string): HistoricalEvent[] {
  return ALL_EVENTS.filter(e => e.eraId === eraId);
}

export function getPeopleForEra(eraId: string): HistoricalPerson[] {
  return ALL_PEOPLE.filter(p => p.eraIds.includes(eraId));
}

export function getArtifactsForEra(eraId: string): Artifact[] {
  return ALL_ARTIFACTS.filter(a => a.eraId === eraId);
}

export function getConceptsForEra(eraId: string): Concept[] {
  const eraConceptIds = new Set<string>();
  for (const evt of ALL_EVENTS) {
    if (evt.eraId === eraId) {
      for (const cid of evt.conceptIds) eraConceptIds.add(cid);
    }
  }
  return ALL_CONCEPTS.filter(c => eraConceptIds.has(c.id));
}

export function getEntityCountForEra(eraId: string): number {
  return getEventsForEra(eraId).length
    + getPeopleForEra(eraId).length
    + getArtifactsForEra(eraId).length;
}

export function getVisitedCountForEra(eraId: string, visitedIds: Set<string>): number {
  let count = 0;
  for (const e of getEventsForEra(eraId)) if (visitedIds.has(e.id)) count++;
  for (const p of getPeopleForEra(eraId)) if (visitedIds.has(p.id)) count++;
  for (const a of getArtifactsForEra(eraId)) if (visitedIds.has(a.id)) count++;
  return count;
}
