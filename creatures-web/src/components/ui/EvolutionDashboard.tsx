import { useCallback, useEffect, useRef } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';
import { FitnessGraph } from './FitnessGraph';
import type { GenerationStats } from '../../types/evolution';

/**
 * Mock evolution data generator — simulates generations completing.
 * Will be replaced by real WebSocket events from the evolution API.
 */
function useMockEvolution() {
  const { currentRun, setRun, addGeneration } = useEvolutionStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setRun({
      id: `evo_${Date.now()}`,
      status: 'running',
      generation: 0,
      n_generations: 100,
      best_fitness: 0,
      mean_fitness: 0,
      population_size: 150,
      organism: 'c_elegans',
    });
  }, [setRun]);

  const pause = useCallback(() => {
    if (currentRun) {
      setRun({ ...currentRun, status: 'paused' });
    }
  }, [currentRun, setRun]);

  const resume = useCallback(() => {
    if (currentRun) {
      setRun({ ...currentRun, status: 'running' });
    }
  }, [currentRun, setRun]);

  useEffect(() => {
    if (currentRun?.status === 'running') {
      intervalRef.current = setInterval(() => {
        const gen = useEvolutionStore.getState().currentRun?.generation ?? 0;
        const nGens = useEvolutionStore.getState().currentRun?.n_generations ?? 100;
        if (gen >= nGens) {
          const run = useEvolutionStore.getState().currentRun;
          if (run) setRun({ ...run, status: 'completed' });
          return;
        }

        // Simulate improving fitness with noise
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
        addGeneration(stats);
      }, 400);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentRun?.status, setRun, addGeneration]);

  return { start, pause, resume };
}

export function EvolutionDashboard() {
  const currentRun = useEvolutionStore((s) => s.currentRun);
  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);
  const latestStats = useEvolutionStore((s) => s.latestStats);
  const { start, pause, resume } = useMockEvolution();

  const status = currentRun?.status ?? 'idle';
  const generation = currentRun?.generation ?? 0;
  const nGenerations = currentRun?.n_generations ?? 100;

  return (
    <>
      {/* Generation counter */}
      <div className="glass">
        <div className="glass-label">Evolution</div>
        <div className="evo-generation-counter">{generation}</div>
        <div style={{ fontSize: 10, color: 'var(--text-label)', textAlign: 'center', marginTop: 2 }}>
          of {nGenerations} generations
        </div>
        <div style={{
          marginTop: 8,
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${(generation / nGenerations) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-green))',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Fitness stats */}
      <div className="glass">
        <div className="glass-label">Fitness</div>
        <div className="stat-row">
          <span className="stat-label">Best</span>
          <span className="stat-value stat-cyan">{(currentRun?.best_fitness ?? 0).toFixed(3)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Mean</span>
          <span className="stat-value stat-green">{(currentRun?.mean_fitness ?? 0).toFixed(3)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Std dev</span>
          <span className="stat-value" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {(latestStats?.std_fitness ?? 0).toFixed(3)}
          </span>
        </div>
      </div>

      {/* Population info */}
      <div className="glass">
        <div className="glass-label">Population</div>
        <div className="stat-row">
          <span className="stat-label">Size</span>
          <span className="stat-value stat-amber">{currentRun?.population_size ?? 150}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Species</span>
          <span className="stat-value stat-magenta">{latestStats?.n_species ?? 0}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Status</span>
          <span className="stat-value" style={{
            fontSize: 11,
            color: status === 'running' ? 'var(--accent-green)'
              : status === 'paused' ? 'var(--accent-amber)'
              : status === 'completed' ? 'var(--accent-cyan)'
              : 'var(--text-label)',
          }}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="glass">
        <div className="glass-label">Controls</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {status === 'idle' || status === 'completed' ? (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={start}>
              {status === 'completed' ? 'Restart' : 'Start'}
            </button>
          ) : status === 'running' ? (
            <button className="btn btn-amber" style={{ flex: 1 }} onClick={pause}>
              Pause
            </button>
          ) : (
            <>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={resume}>
                Resume
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={start}>
                Restart
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mini fitness graph */}
      <div className="glass" style={{ padding: 8 }}>
        <div className="glass-label">Fitness Curve</div>
        <FitnessGraph history={fitnessHistory} width={196} height={120} />
      </div>
    </>
  );
}
