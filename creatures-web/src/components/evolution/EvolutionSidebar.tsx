import { useEvolutionStore } from '../../stores/evolutionStore';
import { FitnessGraph } from '../ui/FitnessGraph';
import { ProgressIndicators } from './ProgressIndicators';
import { SpeciesDiversityChart } from './SpeciesDiversityChart';
import { TopOrganismCard } from './TopOrganismCard';
import { GenSpeedSparkline } from './GenSpeedSparkline';
import { EvolutionEventFeed } from './EvolutionEventFeed';

export function EvolutionSidebar() {
  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);
  const currentRun = useEvolutionStore((s) => s.currentRun);
  const status = currentRun?.status ?? 'idle';

  const isActive = status === 'running' || status === 'paused' || status === 'completed';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1,
      gap: 6, overflowY: 'auto', overflowX: 'hidden',
      scrollbarWidth: 'thin', minHeight: 0,
    }}>
      {/* Progress section — always visible when active */}
      {isActive && (
        <div className="glass" style={{ padding: 8 }}>
          <ProgressIndicators />
          <GenSpeedSparkline />
        </div>
      )}

      {/* Fitness graph */}
      <div className="glass" style={{ padding: 8, flexShrink: 0 }}>
        <div className="glass-label">Fitness Curve</div>
        <div style={{ height: 140 }}>
          <FitnessGraph history={fitnessHistory} width={220} height={140} />
        </div>
      </div>

      {/* Species diversity */}
      <div className="glass" style={{ padding: 8, flexShrink: 0 }}>
        <div className="glass-label">Species Diversity</div>
        <div style={{ height: 100 }}>
          <SpeciesDiversityChart width={220} height={100} />
        </div>
      </div>

      {/* Top organism */}
      {isActive && (
        <div className="glass" style={{ padding: 8, flexShrink: 0 }}>
          <div className="glass-label">Top Organism</div>
          <TopOrganismCard />
        </div>
      )}

      {/* Event feed — takes remaining space */}
      <div className="glass" style={{
        padding: 8, flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 120,
      }}>
        <div className="glass-label">Evolution Feed</div>
        <EvolutionEventFeed />
      </div>
    </div>
  );
}
