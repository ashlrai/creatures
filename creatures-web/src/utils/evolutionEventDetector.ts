import type { EvolutionEvent, EvolutionEventType, EventSeverity } from '../types/evolution';

interface DetectorInput {
  generations: number[];
  best: number[];
  mean: number[];
  speciesHistory: number[];
  currentIndex: number; // index of the generation that was just added
}

function makeEvent(
  gen: number,
  type: EvolutionEventType,
  severity: EventSeverity,
  title: string,
  description: string,
  icon: string,
): EvolutionEvent {
  return {
    id: `evt_${gen}_${type}`,
    generation: gen,
    timestamp: Date.now(),
    type,
    severity,
    title,
    description,
    icon,
  };
}

/**
 * Detects evolution milestones and events from the current state.
 * Called after each addGeneration. Returns zero or more events to add to the log.
 */
export function detectEvents(input: DetectorInput): EvolutionEvent[] {
  const { generations, best, mean, speciesHistory, currentIndex: i } = input;
  const events: EvolutionEvent[] = [];
  const gen = generations[i];

  if (i < 1) {
    // First generation — emit run start
    events.push(makeEvent(gen, 'run_start', 'info', 'Evolution started', 'Population initialized. Natural selection begins.', '\u25B6'));
    return events;
  }

  // --- Fitness breakthrough ---
  const fitnessDelta = best[i] - best[i - 1];
  const threshold = Math.max(0.3, 0.02 * best[i]);
  if (fitnessDelta > threshold) {
    events.push(makeEvent(
      gen, 'breakthrough', 'success',
      `Fitness breakthrough!`,
      `Best fitness jumped by ${fitnessDelta.toFixed(2)} to ${best[i].toFixed(1)}`,
      '\u26A1',
    ));
  }

  // --- New species emerged ---
  if (speciesHistory.length > 1 && i < speciesHistory.length) {
    const prevSpecies = speciesHistory[i - 1];
    const currSpecies = speciesHistory[i];
    if (currSpecies > prevSpecies) {
      const delta = currSpecies - prevSpecies;
      events.push(makeEvent(
        gen, 'species_emerged', 'info',
        `${delta} new species emerged`,
        `Species count: ${prevSpecies} \u2192 ${currSpecies}. Population diversifying.`,
        '\uD83C\uDF31',
      ));
    }

    // --- Species extinction ---
    if (prevSpecies - currSpecies >= 2) {
      events.push(makeEvent(
        gen, 'species_extinct', 'warning',
        'Species extinction event',
        `${prevSpecies - currSpecies} species went extinct. Count: ${prevSpecies} \u2192 ${currSpecies}`,
        '\uD83D\uDCA8',
      ));
    }

    // --- Major divergence ---
    if (currSpecies - prevSpecies >= 2) {
      events.push(makeEvent(
        gen, 'divergence', 'info',
        'Population diverging',
        `Major speciation event: ${currSpecies - prevSpecies} new species in one generation`,
        '\uD83D\uDD00',
      ));
    }
  }

  // --- Convergence (std_fitness declining for 5+ gens) ---
  if (i >= 5 && mean.length > 5) {
    // Check if best - mean gap has been shrinking
    const gaps: number[] = [];
    for (let j = Math.max(0, i - 4); j <= i; j++) {
      gaps.push(best[j] - mean[j]);
    }
    const allDecreasing = gaps.every((g, idx) => idx === 0 || g <= gaps[idx - 1] + 0.01);
    if (allDecreasing && gaps[gaps.length - 1] < gaps[0] * 0.6) {
      events.push(makeEvent(
        gen, 'convergence', 'warning',
        'Population converging',
        'Fitness spread narrowing. Diversity may be dropping.',
        '\u2B50',
      ));
    }
  }

  // --- Stagnation (best unchanged for 10+ gens) ---
  if (i >= 10) {
    const lookback = best.slice(Math.max(0, i - 9), i + 1);
    const maxDelta = Math.max(...lookback) - Math.min(...lookback);
    if (maxDelta < 0.1) {
      events.push(makeEvent(
        gen, 'stagnation', 'critical',
        'Evolution stagnating',
        `Best fitness unchanged (\u00B1${maxDelta.toFixed(2)}) for 10 generations. Consider intervention.`,
        '\u23F8',
      ));
    }
  }

  return events;
}
