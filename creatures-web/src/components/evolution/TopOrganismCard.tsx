import { useEvolutionStore } from '../../stores/evolutionStore';

export function TopOrganismCard() {
  const latestStats = useEvolutionStore((s) => s.latestStats);
  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);

  if (!latestStats) {
    return (
      <div style={{
        padding: '8px 0', textAlign: 'center',
        color: 'rgba(140, 170, 200, 0.3)', fontSize: 10, fontFamily: 'monospace',
      }}>
        No organism data yet
      </div>
    );
  }

  const bestFitness = latestStats.best_fitness;
  const prevBest = fitnessHistory.best.length >= 2
    ? fitnessHistory.best[fitnessHistory.best.length - 2]
    : null;
  const delta = prevBest !== null ? bestFitness - prevBest : 0;
  const genomeId = latestStats.best_genome_id ?? 'unknown';
  const stdDev = latestStats.std_fitness;
  const dominance = bestFitness - latestStats.mean_fitness;

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Main fitness score */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4,
      }}>
        <span style={{
          fontSize: 22, fontFamily: 'monospace', fontWeight: 700,
          color: '#00ccff',
        }}>
          {bestFitness.toFixed(1)}
        </span>
        {delta !== 0 && (
          <span style={{
            fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
            color: delta > 0 ? '#00ff88' : '#ff6644',
          }}>
            {delta > 0 ? '\u2191' : '\u2193'}{Math.abs(delta).toFixed(2)}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 10, fontSize: 9, fontFamily: 'monospace',
        color: 'rgba(140, 170, 200, 0.5)',
      }}>
        <span>\u03C3 {stdDev.toFixed(2)}</span>
        <span>+{dominance.toFixed(1)} vs mean</span>
      </div>

      {/* Genome ID */}
      <div style={{
        marginTop: 4, fontSize: 9, fontFamily: 'monospace',
        color: 'rgba(140, 170, 200, 0.3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {genomeId}
      </div>
    </div>
  );
}
