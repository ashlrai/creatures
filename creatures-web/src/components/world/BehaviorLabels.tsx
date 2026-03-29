import type { MassiveOrganism } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// Behavior classification and configuration for organism states
//
// Analyzes organism state (energy, age, food eaten) to infer behavioral
// state. Used by ContextSidebar's colony panel for behavior breakdown.
// Uses simple heuristics until per-organism neural data is available
// in Phase 2.
// ---------------------------------------------------------------------------

export type Behavior = 'foraging' | 'exploring' | 'thriving' | 'struggling' | 'elder' | 'newborn';

export const BEHAVIOR_CONFIG: Record<Behavior, { label: string; color: string; icon: string }> = {
  foraging: { label: 'Foraging', color: 'rgba(0, 255, 136, 0.8)', icon: '\u{1F331}' },
  exploring: { label: 'Exploring', color: 'rgba(0, 180, 255, 0.8)', icon: '\u{1F30D}' },
  thriving: { label: 'Thriving', color: 'rgba(255, 200, 100, 0.8)', icon: '\u{2B50}' },
  struggling: { label: 'Low Energy', color: 'rgba(255, 80, 80, 0.8)', icon: '\u{26A0}' },
  elder: { label: 'Elder', color: 'rgba(180, 140, 255, 0.8)', icon: '\u{1F451}' },
  newborn: { label: 'Newborn', color: 'rgba(140, 220, 255, 0.8)', icon: '\u{1F95A}' },
};

export function classifyBehavior(org: MassiveOrganism, meanEnergy: number): Behavior {
  const energy = org.energy;
  const age = org.age ?? 0;
  const food = org.lifetime_food_eaten ?? 0;

  // Newborn: very young
  if (age < 50) return 'newborn';

  // Elder: very old with decent energy
  if (age > 800 && energy > meanEnergy * 0.5) return 'elder';

  // Struggling: low energy
  if (energy < 30) return 'struggling';

  // Thriving: high energy and high food
  if (energy > 150 && food > 5) return 'thriving';

  // Foraging: moderate energy, has eaten food recently
  if (food > 2) return 'foraging';

  // Default: exploring
  return 'exploring';
}
