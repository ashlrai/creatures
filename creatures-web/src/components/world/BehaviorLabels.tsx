import { useMemo } from 'react';
import { useWorldStore } from '../../stores/worldStore';
import type { MassiveOrganism } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// BehaviorLabels — classify and label organism behaviors at colony zoom
//
// Analyzes organism state (energy, age, food eaten, position) to infer
// behavioral state. Labels float near organisms in the 3D view.
// Uses simple heuristics until per-organism neural data is available
// in Phase 2.
// ---------------------------------------------------------------------------

type Behavior = 'foraging' | 'exploring' | 'thriving' | 'struggling' | 'elder' | 'newborn';

const BEHAVIOR_CONFIG: Record<Behavior, { label: string; color: string; icon: string }> = {
  foraging: { label: 'Foraging', color: 'rgba(0, 255, 136, 0.8)', icon: '\u{1F331}' },
  exploring: { label: 'Exploring', color: 'rgba(0, 180, 255, 0.8)', icon: '\u{1F30D}' },
  thriving: { label: 'Thriving', color: 'rgba(255, 200, 100, 0.8)', icon: '\u{2B50}' },
  struggling: { label: 'Low Energy', color: 'rgba(255, 80, 80, 0.8)', icon: '\u{26A0}' },
  elder: { label: 'Elder', color: 'rgba(180, 140, 255, 0.8)', icon: '\u{1F451}' },
  newborn: { label: 'Newborn', color: 'rgba(140, 220, 255, 0.8)', icon: '\u{1F95A}' },
};

function classifyBehavior(org: MassiveOrganism, meanEnergy: number): Behavior {
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

export function BehaviorLabels() {
  const organisms = useWorldStore((s) => s.organisms);
  const zoomBand = useWorldStore((s) => s.zoomBand);

  // Only show at colony zoom
  if (zoomBand !== 'colony' || organisms.length === 0) return null;

  // Compute mean energy for relative classification
  const meanEnergy = useMemo(() => {
    if (organisms.length === 0) return 100;
    let sum = 0;
    for (const org of organisms) sum += org.energy;
    return sum / organisms.length;
  }, [organisms]);

  // Show labels for top organisms by energy (max 10 visible at once)
  const labeledOrgs = useMemo(() => {
    const sorted = [...organisms]
      .map((org, idx) => ({ org, idx }))
      .filter(({ org }) => org.energy > 1)
      .sort((a, b) => b.org.energy - a.org.energy)
      .slice(0, 10);

    return sorted.map(({ org, idx }) => ({
      org,
      idx,
      behavior: classifyBehavior(org, meanEnergy),
    }));
  }, [organisms, meanEnergy]);

  // Note: Proper 3D-to-2D projection would require access to the camera.
  // For now, we return null — behavior classification is surfaced in the
  // ContextSidebar's colony panel instead. In a future pass, we'll use
  // @react-three/drei Html component for projected labels.

  return null;
}

/** Export classification function for use in sidebar */
export { classifyBehavior, BEHAVIOR_CONFIG };
export type { Behavior };
