import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvolutionStore } from '../stores/evolutionStore';
import type { EvolutionRun, EvolutionWsMessage, GenerationStats } from '../types/evolution';

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

      const ws = new WebSocket(`${WS_BASE}/ws/evolution/${runId}`);
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
          } else if (msg.type === 'run_complete') {
            const run = useEvolutionStore.getState().currentRun;
            if (run) setRun({ ...run, status: 'completed' });
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

  // ─── Mock fallback ────────────────────────────────────────────────

  const startMock = useCallback(() => {
    reset();
    setBackendAvailable(false);

    const mockRun: EvolutionRun = {
      id: `mock_${Date.now()}`,
      status: 'running',
      generation: 0,
      n_generations: 100,
      best_fitness: 0,
      mean_fitness: 0,
      population_size: 150,
      organism: 'c_elegans',
    };
    setRun(mockRun);

    if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);

    mockIntervalRef.current = setInterval(() => {
      const state = useEvolutionStore.getState();
      const gen = state.currentRun?.generation ?? 0;
      const nGens = state.currentRun?.n_generations ?? 100;
      const status = state.currentRun?.status;

      if (status !== 'running') return;

      if (gen >= nGens) {
        const run = state.currentRun;
        if (run) useEvolutionStore.getState().setRun({ ...run, status: 'completed' });
        if (mockIntervalRef.current) clearInterval(mockIntervalRef.current);
        return;
      }

      const progress = gen / nGens;
      const bestFitness = 0.2 + progress * 0.7 + (Math.random() - 0.3) * 0.05;
      const meanFitness = bestFitness * (0.5 + progress * 0.3) + (Math.random() - 0.5) * 0.03;

      const stats: GenerationStats = {
        generation: gen + 1,
        best_fitness: Math.max(0, bestFitness),
        mean_fitness: Math.max(0, meanFitness),
        std_fitness: 0.1 - progress * 0.06,
        n_species: Math.max(3, Math.round(12 - progress * 6 + Math.random() * 3)),
        best_genome_id: `genome_${gen + 1}_best`,
      };
      useEvolutionStore.getState().addGeneration(stats);
    }, 400);
  }, [reset, setRun]);

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
      reset();
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
