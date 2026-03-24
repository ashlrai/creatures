import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvolutionStore } from '../stores/evolutionStore';
import type { EvolutionRun, EvolutionWsMessage, GenerationStats, GodReport } from '../types/evolution';

const API_BASE = '/api';
const protocol =
  typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE =
  typeof window !== 'undefined' ? `${protocol}//${window.location.host}` : 'ws://localhost:5173';

/**
 * Hook that drives evolution via the real backend API and WebSocket stream.
 * Falls back to local mock data when the backend is unreachable (static deploys).
 */
export function useEvolution() {
  const { setRun, addGeneration, reset } = useEvolutionStore();
  const wsRef = useRef<WebSocket | null>(null);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // ─── API helpers ──────────────────────────────────────────────────

  const createRun = useCallback(
    async (opts?: { organism?: string; population_size?: number; n_generations?: number }) => {
      const body = {
        organism: opts?.organism ?? 'c_elegans',
        population_size: opts?.population_size ?? 150,
        n_generations: opts?.n_generations ?? 100,
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

            // Capture God Agent interventions from the WS stream
            if (msg.god_intervention) {
              const { addGodReport } = useEvolutionStore.getState();
              addGodReport({
                analysis: msg.god_intervention.analysis ?? '',
                fitness_trend: 'intervening',
                interventions: msg.god_intervention.interventions ?? [],
                hypothesis: '',
                report: '',
              });
            }
          } else if (msg.type === 'run_complete') {
            const run = useEvolutionStore.getState().currentRun;
            if (run) setRun({ ...run, status: 'completed' });
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
    [addGeneration, setRun],
  );

  const disconnectWs = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // ─── Mock fallback — realistic client-side evolution ──────────────

  /**
   * Pre-generate a realistic fitness curve for 100 generations.
   * - Starts at ~83, rapid improvement to ~88 over first 20 gens
   * - Plateau with occasional breakthroughs from 88 → 92 over next 80 gens
   * - Realistic noise (std ~1.5–2.5), speciation events (1–5 species)
   */
  const generateMockCurve = useCallback(() => {
    const nGens = 100;
    const curve: GenerationStats[] = [];
    let bestFitness = 83.0;
    let synapseCount = 3363;

    for (let g = 1; g <= nGens; g++) {
      const progress = g / nGens;

      // Fitness trajectory: rapid early gains, then plateau with breakthroughs
      if (g <= 20) {
        // Rapid improvement phase: 83 → 88
        bestFitness += (0.25 + Math.random() * 0.15);
      } else if (g === 42) {
        // Breakthrough after God Agent environmental complexity increase
        bestFitness += 0.6;
      } else if (g === 76) {
        // Major breakthrough — novel sensory-motor pathway
        bestFitness += 1.2;
      } else {
        // Slow improvement with noise
        bestFitness += (Math.random() - 0.35) * 0.15;
      }

      // Clamp to realistic range
      bestFitness = Math.max(bestFitness, 83);
      if (g <= 20) bestFitness = Math.min(bestFitness, 89);
      else bestFitness = Math.min(bestFitness, 93);

      // Mean trails best by 2-4 points
      const gap = 2.5 + Math.random() * 1.5;
      const meanFitness = bestFitness - gap;

      // Std deviation: higher early, decreases as population converges
      const stdFitness = 2.5 - progress * 1.0 + (Math.random() - 0.5) * 0.3;

      // Speciation: starts at 3, peaks around gen 30-50, then consolidates
      let nSpecies: number;
      if (g < 10) nSpecies = 2 + Math.floor(Math.random() * 2);
      else if (g < 30) nSpecies = 3 + Math.floor(Math.random() * 3);
      else if (g < 60) nSpecies = 2 + Math.floor(Math.random() * 4);
      else nSpecies = 1 + Math.floor(Math.random() * 3);
      nSpecies = Math.max(1, Math.min(5, nSpecies));

      // Synapse count grows slowly
      synapseCount += Math.floor(Math.random() * 0.5);
      if (g === 76) synapseCount += 8; // breakthrough adds connections

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

  /**
   * God Agent mock interventions — triggered at specific generations.
   */
  const godInterventions: Record<number, { analysis: string; interventions: GodReport['interventions']; mode: string }> = {
    15: {
      analysis: 'Fitness improvement rate declining after initial rapid gains. Population diversity is narrowing prematurely. Recommending increased mutation rate to maintain exploration of solution space.',
      interventions: [
        { action: 'increase_mutation_rate', reasoning: 'Early stagnation detected — fitness plateau at gen 12-15', description: 'Mutation rate increased from 0.03 to 0.08 to break local optima' },
      ],
      mode: 'adaptive',
    },
    40: {
      analysis: 'Population converging on a single behavioral strategy (chemotaxis-dominant). Species count dropped to 2. Adding environmental complexity to reward diverse sensory integration.',
      interventions: [
        { action: 'add_environmental_complexity', reasoning: 'Premature convergence — only 2 species remaining', description: 'Added oscillating chemical gradients and thermal noise to environment' },
        { action: 'inject_diversity', reasoning: 'Behavioral monoculture risk', description: 'Introduced 5 random migrants with novel connection topologies' },
      ],
      mode: 'interventionist',
    },
    75: {
      analysis: 'Breakthrough detected: organism genome_76_best evolved a novel sensory-motor pathway connecting AWC chemosensory neurons directly to VB motor neurons, bypassing the standard interneuron relay. This shortcut improves reaction time by ~40ms. Fitness jumped from 89.2 to 91.4 in a single generation.',
      interventions: [
        { action: 'protect_innovation', reasoning: 'Novel neural pathway detected — preserving lineage', description: 'Marked top 3 genomes as elite (immune to mutation for 5 generations)' },
      ],
      mode: 'observer',
    },
  };

  const startMock = useCallback(() => {
    reset();
    setBackendAvailable(false);

    const { curve } = generateMockCurve();

    const mockRun: EvolutionRun = {
      id: `mock_${Date.now()}`,
      status: 'running',
      generation: 0,
      n_generations: 100,
      best_fitness: 0,
      mean_fitness: 0,
      population_size: 50,
      organism: 'c_elegans',
    };
    setRun(mockRun);

    if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);

    let genIndex = 0;

    mockIntervalRef.current = setInterval(() => {
      const state = useEvolutionStore.getState();
      const status = state.currentRun?.status;

      // Pause support: skip tick when paused
      if (status !== 'running') return;

      if (genIndex >= curve.length) {
        const run = state.currentRun;
        if (run) useEvolutionStore.getState().setRun({ ...run, status: 'completed' });
        if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
        return;
      }

      const stats = curve[genIndex];
      useEvolutionStore.getState().addGeneration(stats);

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
        useEvolutionStore.getState().addGodReport(report);
      }

      genIndex++;
    }, 500);
  }, [reset, setRun, generateMockCurve]);

  const stopMock = useCallback(() => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
  }, []);

  // ─── Unified start / pause / resume ───────────────────────────────

  /**
   * Start a new evolution run. Attempts the real API first; on failure
   * falls back to local mock data.
   */
  const start = useCallback(
    async (opts?: { organism?: string; population_size?: number; n_generations?: number }) => {
      // Reset state but preserve evolution mode
      const wasEvoMode = useEvolutionStore.getState().isEvolutionMode;
      reset();
      if (wasEvoMode) useEvolutionStore.getState().toggleEvolutionMode();
      try {
        const run = await createRun(opts);
        await startRun(run.id);
        setRun({ ...run, status: 'running' });
        connectWs(run.id);
        setBackendAvailable(true);
      } catch {
        console.warn('Evolution API unavailable — using mock data');
        startMock();
      }
    },
    [reset, createRun, startRun, setRun, connectWs, startMock],
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
