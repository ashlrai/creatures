import { useMemo } from 'react';
import { useEvolutionStore } from '../stores/evolutionStore';

export interface EvolutionProgress {
  elapsedMs: number;
  elapsedFormatted: string;
  percentComplete: number;
  gensPerSecond: number;
  etaMs: number;
  etaFormatted: string;
  currentGen: number;
  totalGens: number;
  /** Last 20 inter-generation intervals in ms (for sparkline) */
  speedHistory: number[];
}

function formatDuration(ms: number): string {
  if (ms <= 0 || !isFinite(ms)) return '--:--';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useEvolutionProgress(): EvolutionProgress {
  const runStartTime = useEvolutionStore((s) => s.runStartTime);
  const timestamps = useEvolutionStore((s) => s.generationTimestamps);
  const currentRun = useEvolutionStore((s) => s.currentRun);

  return useMemo(() => {
    const now = Date.now();
    const currentGen = currentRun?.generation ?? 0;
    const totalGens = currentRun?.n_generations ?? 100;
    const elapsedMs = runStartTime ? now - runStartTime : 0;
    const percentComplete = totalGens > 0 ? (currentGen / totalGens) * 100 : 0;

    // Compute generation speed from last 10 timestamps
    let gensPerSecond = 0;
    if (timestamps.length >= 2) {
      const window = Math.min(10, timestamps.length - 1);
      const dt = timestamps[timestamps.length - 1] - timestamps[timestamps.length - 1 - window];
      if (dt > 0) gensPerSecond = (window / dt) * 1000;
    }

    // ETA
    const remaining = totalGens - currentGen;
    const etaMs = gensPerSecond > 0 ? (remaining / gensPerSecond) * 1000 : 0;

    // Speed sparkline: inter-generation intervals for last 20 gens
    const speedHistory: number[] = [];
    const start = Math.max(1, timestamps.length - 20);
    for (let i = start; i < timestamps.length; i++) {
      speedHistory.push(timestamps[i] - timestamps[i - 1]);
    }

    return {
      elapsedMs,
      elapsedFormatted: formatDuration(elapsedMs),
      percentComplete,
      gensPerSecond,
      etaMs,
      etaFormatted: formatDuration(etaMs),
      currentGen,
      totalGens,
      speedHistory,
    };
  }, [runStartTime, timestamps, currentRun]);
}
