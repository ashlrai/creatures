import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvolutionStore } from '../stores/evolutionStore';
import type { EvolutionRun, EvolutionWsMessage, GenerationStats, GodReport } from '../types/evolution';
import { detectEvents } from '../utils/evolutionEventDetector';

import { API_BASE, WS_BASE } from '../config';
import { getChallengeById } from '../data/challengePresets';

/**
 * Hook that drives evolution via the real backend API and WebSocket stream.
 * Falls back to local mock data when the backend is unreachable (static deploys).
 */
export function useEvolution() {
  const { setRun, addGeneration, reset, addEvent, setRunStartTime } = useEvolutionStore();
  const wsRef = useRef<WebSocket | null>(null);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // ─── Event detection helper ─────────────────────────────────────
  const runEventDetection = useCallback(() => {
    const state = useEvolutionStore.getState();
    const { fitnessHistory, speciesHistory } = state;
    const idx = fitnessHistory.generations.length - 1;
    if (idx < 0) return;

    const events = detectEvents({
      generations: fitnessHistory.generations,
      best: fitnessHistory.best,
      mean: fitnessHistory.mean,
      speciesHistory,
      currentIndex: idx,
    });

    for (const evt of events) {
      state.addEvent(evt);
    }
  }, []);

  // ─── API helpers ──────────────────────────────────────────────────

  const createRun = useCallback(
    async (opts?: {
      organism?: string;
      population_size?: number;
      n_generations?: number;
      fitness_mode?: string;
      environment_preset?: string;
    }) => {
      const body = {
        organism: opts?.organism ?? 'c_elegans',
        population_size: opts?.population_size ?? 150,
        n_generations: opts?.n_generations ?? 100,
        fitness_mode: opts?.fitness_mode ?? 'vectorized',
        environment_preset: opts?.environment_preset,
      };
      const res = await fetch(`${API_BASE}/evolution/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const run: EvolutionRun = await res.json();
      setRun(run);
      return run;
    },
    [setRun],
  );

  const startRun = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/evolution/runs/${id}/start`, { method: 'POST' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json() as Promise<EvolutionRun>;
  }, []);

  const pauseRun = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/evolution/runs/${id}/pause`, { method: 'POST' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const run: EvolutionRun = await res.json();
    setRun(run);
    return run;
  }, [setRun]);

  const fetchHistory = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/evolution/runs/${id}/history`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json() as Promise<GenerationStats[]>;
  }, []);

  // ─── WebSocket ────────────────────────────────────────────────────

  const connectWs = useCallback(
    (runId: string) => {
      if (wsRef.current) wsRef.current.close();

      const ws = new WebSocket(`${WS_BASE}/evolution/ws/${runId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setBackendAvailable(true);
      };

      ws.onclose = () => setWsConnected(false);

      ws.onerror = () => {
        setWsConnected(false);
        console.warn('Evolution WebSocket error');
      };

      ws.onmessage = (evt) => {
        try {
          const msg: EvolutionWsMessage = JSON.parse(evt.data);

          if (msg.type === 'generation_complete') {
            const stats: GenerationStats = {
              generation: msg.generation,
              best_fitness: msg.best_fitness,
              mean_fitness: msg.mean_fitness,
              std_fitness: msg.std_fitness,
              n_species: msg.n_species,
              elapsed_seconds: msg.elapsed_seconds,
              best_genome_id: msg.best_genome_id,
            };
            addGeneration(stats);
            runEventDetection();

            // Capture God Agent interventions from the WS stream
            if (msg.god_intervention) {
              const { addGodReport, addEvent: addEvt } = useEvolutionStore.getState();
              addGodReport({
                analysis: msg.god_intervention.analysis ?? '',
                fitness_trend: 'intervening',
                interventions: msg.god_intervention.interventions ?? [],
                hypothesis: '',
                report: '',
              });
              addEvt({
                id: `evt_${msg.generation}_god_intervention`,
                generation: msg.generation,
                timestamp: Date.now(),
                type: 'god_intervention',
                severity: 'info',
                title: 'God Agent intervened',
                description: msg.god_intervention.analysis?.slice(0, 120) ?? 'Intervention applied',
                icon: '\uD83E\uDDE0',
              });
            }
          } else if (msg.type === 'run_complete') {
            const run = useEvolutionStore.getState().currentRun;
            if (run) {
              setRun({ ...run, status: 'completed' });
              addEvent({
                id: `evt_${run.generation}_run_complete`,
                generation: run.generation,
                timestamp: Date.now(),
                type: 'run_complete',
                severity: 'success',
                title: 'Evolution complete',
                description: `Finished ${run.n_generations} generations. Best fitness: ${run.best_fitness.toFixed(1)}`,
                icon: '\u2705',
              });
            }
          } else if (msg.type === 'god_intervention') {
            const { addGodReport } = useEvolutionStore.getState();
            addGodReport({
              analysis: msg.analysis ?? '',
              fitness_trend: 'intervening',
              interventions: msg.interventions ?? [],
              hypothesis: '',
              report: '',
            });
          } else if (msg.type === 'error') {
            console.error('Evolution error:', msg.message);
          }
        } catch (err) {
          console.warn('Failed to parse evolution WS message:', err);
        }
      };
    },
    [addGeneration, setRun, addEvent, runEventDetection],
  );

  const disconnectWs = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // ─── Mock fallback — realistic client-side evolution ──────────────

  const generateMockCurve = useCallback((opts?: {
    startFitness?: number;
    maxFitness?: number;
    nGens?: number;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
  }) => {
    const difficulty = opts?.difficulty ?? 'beginner';
    const nGens = opts?.nGens ?? 100;
    const startFitness = opts?.startFitness ?? 83.0;
    const maxFitness = opts?.maxFitness ?? 92.0;

    // Difficulty-tuned improvement parameters
    const earlyGainBase = difficulty === 'beginner' ? 0.25
      : difficulty === 'intermediate' ? 0.18
      : 0.10;
    const earlyGainNoise = difficulty === 'beginner' ? 0.15
      : difficulty === 'intermediate' ? 0.10
      : 0.06;
    const driftBias = difficulty === 'beginner' ? -0.35
      : difficulty === 'intermediate' ? -0.40
      : -0.45;
    const breakthroughGain = difficulty === 'beginner' ? 1.2
      : difficulty === 'intermediate' ? 0.8
      : 0.5;
    const midBoostGain = difficulty === 'beginner' ? 0.6
      : difficulty === 'intermediate' ? 0.4
      : 0.2;
    // Advanced difficulty introduces extra plateau regions
    const plateauZones = difficulty === 'advanced'
      ? [{ from: 25, to: 45 }, { from: 65, to: 80 }]
      : [];

    const earlyCap = startFitness + (maxFitness - startFitness) * 0.65;

    const curve: GenerationStats[] = [];
    let bestFitness = startFitness;
    let synapseCount = 3363;

    for (let g = 1; g <= nGens; g++) {
      const progress = g / nGens;

      // Check if we're in a plateau zone (advanced difficulty)
      const inPlateau = plateauZones.some(z => g >= z.from && g <= z.to);

      if (inPlateau) {
        // Very slow drift during plateaus
        bestFitness += (Math.random() - 0.48) * 0.05;
      } else if (g <= Math.floor(nGens * 0.2)) {
        bestFitness += (earlyGainBase + Math.random() * earlyGainNoise);
      } else if (g === Math.floor(nGens * 0.42)) {
        bestFitness += midBoostGain;
      } else if (g === Math.floor(nGens * 0.76)) {
        bestFitness += breakthroughGain;
      } else {
        bestFitness += (Math.random() + driftBias) * 0.15;
      }

      bestFitness = Math.max(bestFitness, startFitness);
      if (g <= Math.floor(nGens * 0.2)) bestFitness = Math.min(bestFitness, earlyCap);
      else bestFitness = Math.min(bestFitness, maxFitness + 1);

      const gap = 2.5 + Math.random() * 1.5;
      const meanFitness = bestFitness - gap;
      const stdFitness = 2.5 - progress * 1.0 + (Math.random() - 0.5) * 0.3;

      let nSpecies: number;
      if (g < 10) nSpecies = 2 + Math.floor(Math.random() * 2);
      else if (g < 30) nSpecies = 3 + Math.floor(Math.random() * 3);
      else if (g < 60) nSpecies = 2 + Math.floor(Math.random() * 4);
      else nSpecies = 1 + Math.floor(Math.random() * 3);
      nSpecies = Math.max(1, Math.min(5, nSpecies));

      synapseCount += Math.floor(Math.random() * 0.5);
      if (g === Math.floor(nGens * 0.76)) synapseCount += 8;

      curve.push({
        generation: g,
        best_fitness: parseFloat(bestFitness.toFixed(3)),
        mean_fitness: parseFloat(meanFitness.toFixed(3)),
        std_fitness: parseFloat(Math.max(0.5, stdFitness).toFixed(3)),
        n_species: nSpecies,
        best_genome_id: `genome_${g}_best`,
        elapsed_seconds: g * 0.5,
      });
    }
    return { curve, finalSynapseCount: synapseCount };
  }, []);

  const godInterventions: Record<number, { analysis: string; interventions: GodReport['interventions']; mode: string }> = {
    15: {
      analysis: 'Fitness improvement rate declining after initial rapid gains. Population diversity is narrowing prematurely. Recommending increased mutation rate to maintain exploration of solution space.',
      interventions: [
        { action: 'increase_mutation_rate', reasoning: 'Early stagnation detected \u2014 fitness plateau at gen 12-15', description: 'Mutation rate increased from 0.03 to 0.08 to break local optima' },
      ],
      mode: 'adaptive',
    },
    40: {
      analysis: 'Population converging on a single behavioral strategy (chemotaxis-dominant). Species count dropped to 2. Adding environmental complexity to reward diverse sensory integration.',
      interventions: [
        { action: 'add_environmental_complexity', reasoning: 'Premature convergence \u2014 only 2 species remaining', description: 'Added oscillating chemical gradients and thermal noise to environment' },
        { action: 'inject_diversity', reasoning: 'Behavioral monoculture risk', description: 'Introduced 5 random migrants with novel connection topologies' },
      ],
      mode: 'interventionist',
    },
    75: {
      analysis: 'Breakthrough detected: organism genome_76_best evolved a novel sensory-motor pathway connecting AWC chemosensory neurons directly to VB motor neurons, bypassing the standard interneuron relay. This shortcut improves reaction time by ~40ms. Fitness jumped from 89.2 to 91.4 in a single generation.',
      interventions: [
        { action: 'protect_innovation', reasoning: 'Novel neural pathway detected \u2014 preserving lineage', description: 'Marked top 3 genomes as elite (immune to mutation for 5 generations)' },
      ],
      mode: 'observer',
    },
  };

  const startMock = useCallback(() => {
    reset();
    setBackendAvailable(false);
    setRunStartTime(Date.now());

    // Look up selected challenge to vary the mock curve by difficulty
    const { selectedChallenge } = useEvolutionStore.getState();
    const preset = selectedChallenge ? getChallengeById(selectedChallenge) : undefined;
    const difficulty = preset?.difficulty ?? 'beginner';

    const curveParams: Parameters<typeof generateMockCurve>[0] = (() => {
      switch (difficulty) {
        case 'intermediate':
          return { startFitness: 75, maxFitness: 88, difficulty: 'intermediate' as const };
        case 'advanced':
          return { startFitness: 60, maxFitness: 80, difficulty: 'advanced' as const };
        case 'beginner':
        default:
          return { startFitness: 83, maxFitness: 92, difficulty: 'beginner' as const };
      }
    })();

    // Use preset's recommended values if available
    const nGenerations = preset?.recommendedGenerations ?? 100;
    const populationSize = preset?.recommendedPopulation ?? 50;
    curveParams.nGens = nGenerations;

    const { curve } = generateMockCurve(curveParams);

    const mockRun: EvolutionRun = {
      id: `mock_${Date.now()}`,
      status: 'running',
      generation: 0,
      n_generations: nGenerations,
      best_fitness: 0,
      mean_fitness: 0,
      population_size: populationSize,
      organism: 'c_elegans',
    };
    setRun(mockRun);

    if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);

    let genIndex = 0;

    mockIntervalRef.current = setInterval(() => {
      const state = useEvolutionStore.getState();
      const status = state.currentRun?.status;

      if (status !== 'running') return;

      if (genIndex >= curve.length) {
        const run = state.currentRun;
        if (run) {
          state.setRun({ ...run, status: 'completed' });
          state.addEvent({
            id: `evt_${run.n_generations}_run_complete`,
            generation: run.n_generations,
            timestamp: Date.now(),
            type: 'run_complete',
            severity: 'success',
            title: 'Evolution complete',
            description: `Finished ${run.n_generations} generations. Best fitness: ${run.best_fitness.toFixed(1)}`,
            icon: '\u2705',
          });
        }
        if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
        return;
      }

      const stats = curve[genIndex];
      state.addGeneration(stats);

      // Run event detection after adding generation
      const updated = useEvolutionStore.getState();
      const idx = updated.fitnessHistory.generations.length - 1;
      if (idx >= 0) {
        const events = detectEvents({
          generations: updated.fitnessHistory.generations,
          best: updated.fitnessHistory.best,
          mean: updated.fitnessHistory.mean,
          speciesHistory: updated.speciesHistory,
          currentIndex: idx,
        });
        for (const evt of events) {
          updated.addEvent(evt);
        }
      }

      // Fire God Agent interventions at key generations
      const gen = stats.generation;
      if (godInterventions[gen]) {
        const intervention = godInterventions[gen];
        const report: GodReport = {
          analysis: intervention.analysis,
          interventions: intervention.interventions,
          mode: intervention.mode,
          generation: gen,
          fitness_trend: gen <= 20 ? 'improving' : gen <= 60 ? 'plateau' : 'breakthrough',
        };
        state.addGodReport(report);
        state.addEvent({
          id: `evt_${gen}_god_intervention`,
          generation: gen,
          timestamp: Date.now(),
          type: 'god_intervention',
          severity: 'info',
          title: 'God Agent intervened',
          description: intervention.analysis.slice(0, 120),
          icon: '\uD83E\uDDE0',
        });
      }

      genIndex++;
    }, 500);
  }, [reset, setRun, setRunStartTime, generateMockCurve]);

  const stopMock = useCallback(() => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
  }, []);

  // ─── Unified start / pause / resume ───────────────────────────────

  const start = useCallback(
    async (opts?: {
      organism?: string;
      population_size?: number;
      n_generations?: number;
      fitness_mode?: string;
      environment_preset?: string;
    }) => {
      const wasEvoMode = useEvolutionStore.getState().isEvolutionMode;
      reset();
      if (wasEvoMode) useEvolutionStore.getState().toggleEvolutionMode();
      setRunStartTime(Date.now());

      // Pass selected challenge from store if not explicitly provided
      const selectedChallenge = useEvolutionStore.getState().selectedChallenge;
      const envPreset = opts?.environment_preset ?? selectedChallenge ?? undefined;

      try {
        const run = await createRun({
          ...opts,
          environment_preset: envPreset,
        });
        await startRun(run.id);
        setRun({ ...run, status: 'running' });
        connectWs(run.id);
        setBackendAvailable(true);
      } catch {
        console.warn('Evolution API unavailable \u2014 using mock data');
        startMock();
      }
    },
    [reset, createRun, startRun, setRun, connectWs, startMock, setRunStartTime],
  );

  const pause = useCallback(async () => {
    const run = useEvolutionStore.getState().currentRun;
    if (!run) return;

    if (backendAvailable && !run.id.startsWith('mock_')) {
      try {
        await pauseRun(run.id);
      } catch {
        setRun({ ...run, status: 'paused' });
      }
    } else {
      setRun({ ...run, status: 'paused' });
    }
  }, [backendAvailable, pauseRun, setRun]);

  const resume = useCallback(async () => {
    const run = useEvolutionStore.getState().currentRun;
    if (!run) return;

    if (backendAvailable && !run.id.startsWith('mock_')) {
      try {
        await startRun(run.id);
        setRun({ ...run, status: 'running' });
        connectWs(run.id);
      } catch {
        setRun({ ...run, status: 'running' });
      }
    } else {
      setRun({ ...run, status: 'running' });
    }
  }, [backendAvailable, startRun, setRun, connectWs]);

  // ─── Cleanup ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      disconnectWs();
      stopMock();
    };
  }, [disconnectWs, stopMock]);

  return {
    start,
    pause,
    resume,
    fetchHistory,
    backendAvailable,
    wsConnected,
  };
}
