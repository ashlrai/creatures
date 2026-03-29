import { useEffect, useRef } from 'react';
import { useWorldStore } from '../../stores/worldStore';
import { API_BASE } from '../../config';

// ---------------------------------------------------------------------------
// AIHighlighter — Ambient intelligence that highlights interesting organisms
//
// Periodically analyzes the population and identifies organisms worth
// investigating. Writes to worldStore.highlightedOrganismIndices so the
// PopulationLayer renders them with pulsing rings. Also provides
// suggested zoom targets in the sidebar.
// ---------------------------------------------------------------------------

/** How often to re-analyze (ms) */
const ANALYSIS_INTERVAL = 15000;

/** Max organisms to highlight at once */
const MAX_HIGHLIGHTS = 5;

export interface HighlightReason {
  index: number;
  reason: string;
  metric: string;
  value: number;
}

// Export highlights for sidebar consumption
let currentHighlights: HighlightReason[] = [];
export function getHighlights(): HighlightReason[] {
  return currentHighlights;
}

export function AIHighlighter() {
  const organisms = useWorldStore((s) => s.organisms);
  const massiveId = useWorldStore((s) => s.massiveId);
  const populationStats = useWorldStore((s) => s.populationStats);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!massiveId || organisms.length === 0) return;

    const analyze = () => {
      const highlights: HighlightReason[] = [];

      // 1. Highest energy organism (most successful forager)
      let maxEnergy = 0;
      let maxEnergyIdx = -1;
      for (let i = 0; i < organisms.length; i++) {
        if (organisms[i].energy > maxEnergy) {
          maxEnergy = organisms[i].energy;
          maxEnergyIdx = i;
        }
      }
      if (maxEnergyIdx >= 0) {
        highlights.push({
          index: maxEnergyIdx,
          reason: 'Highest energy in population',
          metric: 'energy',
          value: maxEnergy,
        });
      }

      // 2. Oldest organism (evolutionary survivor)
      let maxAge = 0;
      let maxAgeIdx = -1;
      for (let i = 0; i < organisms.length; i++) {
        if ((organisms[i].age ?? 0) > maxAge) {
          maxAge = organisms[i].age ?? 0;
          maxAgeIdx = i;
        }
      }
      if (maxAgeIdx >= 0 && maxAgeIdx !== maxEnergyIdx) {
        highlights.push({
          index: maxAgeIdx,
          reason: 'Oldest surviving organism',
          metric: 'age',
          value: maxAge,
        });
      }

      // 3. Highest generation (most evolved)
      let maxGen = 0;
      let maxGenIdx = -1;
      for (let i = 0; i < organisms.length; i++) {
        if ((organisms[i].generation ?? 0) > maxGen) {
          maxGen = organisms[i].generation ?? 0;
          maxGenIdx = i;
        }
      }
      if (maxGenIdx >= 0 && maxGenIdx !== maxEnergyIdx && maxGenIdx !== maxAgeIdx) {
        highlights.push({
          index: maxGenIdx,
          reason: 'Most evolved (highest generation)',
          metric: 'generation',
          value: maxGen,
        });
      }

      // 4. Most food eaten (best forager of all time)
      let maxFood = 0;
      let maxFoodIdx = -1;
      for (let i = 0; i < organisms.length; i++) {
        if ((organisms[i].lifetime_food_eaten ?? 0) > maxFood) {
          maxFood = organisms[i].lifetime_food_eaten ?? 0;
          maxFoodIdx = i;
        }
      }
      if (
        maxFoodIdx >= 0 &&
        maxFoodIdx !== maxEnergyIdx &&
        maxFoodIdx !== maxAgeIdx &&
        maxFoodIdx !== maxGenIdx
      ) {
        highlights.push({
          index: maxFoodIdx,
          reason: 'Most food consumed (best forager)',
          metric: 'food',
          value: maxFood,
        });
      }

      // 5. Outlier: organism far from population center (explorer)
      if (organisms.length > 10) {
        let meanX = 0,
          meanY = 0;
        for (const org of organisms) {
          meanX += org.x;
          meanY += org.y;
        }
        meanX /= organisms.length;
        meanY /= organisms.length;

        let maxDist = 0;
        let maxDistIdx = -1;
        for (let i = 0; i < organisms.length; i++) {
          const dx = organisms[i].x - meanX;
          const dy = organisms[i].y - meanY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxDist) {
            maxDist = dist;
            maxDistIdx = i;
          }
        }
        if (
          maxDistIdx >= 0 &&
          !highlights.some((h) => h.index === maxDistIdx)
        ) {
          highlights.push({
            index: maxDistIdx,
            reason: 'Explorer \u2014 farthest from population center',
            metric: 'distance',
            value: maxDist,
          });
        }
      }

      // Update store
      const indices = new Set(
        highlights.slice(0, MAX_HIGHLIGHTS).map((h) => h.index),
      );
      useWorldStore.setState({ highlightedOrganismIndices: indices });

      // Store highlights for sidebar
      currentHighlights = highlights.slice(0, MAX_HIGHLIGHTS);
    };

    // Initial analysis
    analyze();

    // Periodic re-analysis
    intervalRef.current = setInterval(analyze, ANALYSIS_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [massiveId, organisms, populationStats]);

  // No visual output — this component works through the store
  return null;
}
