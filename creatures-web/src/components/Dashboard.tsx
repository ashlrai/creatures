import { useSimulationStore } from '../stores/simulationStore';

const panelStyle: React.CSSProperties = {
  background: 'rgba(10, 10, 20, 0.85)',
  borderRadius: 8,
  padding: '12px 16px',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  transition: 'all 0.15s',
};

interface DashboardProps {
  onPoke: (segment: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStart: () => void;
  connected: boolean;
}

export function Dashboard({ onPoke, onPause, onResume, onStart, connected }: DashboardProps) {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const history = useSimulationStore((s) => s.frameHistory);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', display: 'flex', flexDirection: 'column',
      padding: 16, gap: 12,
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', pointerEvents: 'auto' }}>
        <div style={panelStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' }}>
            Creatures
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
            Virtual Organism Simulator
          </div>
        </div>

        <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#4CAF50' : '#F44336',
          }} />
          <span style={{ fontSize: 12 }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          {frame && (
            <span style={{ fontSize: 12, opacity: 0.6 }}>
              t={frame.t_ms.toFixed(0)}ms
            </span>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom controls */}
      <div style={{ display: 'flex', gap: 12, pointerEvents: 'auto' }}>
        {/* Stats panel */}
        <div style={{ ...panelStyle, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
            NEURAL ACTIVITY
          </div>
          {frame ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>Active neurons</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#2196F3' }}>
                  {frame.n_active}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>Active muscles</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#FF5722' }}>
                  {Object.keys(frame.muscle_activations).length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, opacity: 0.5 }}>Displacement</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#4CAF50' }}>
                  {history.length > 0
                    ? history[history.length - 1].displacement.toFixed(4)
                    : '0.0000'}
                </span>
              </div>

              {/* Mini activity graph */}
              <div style={{ marginTop: 8, height: 40, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                {history.slice(-60).map((h, i) => (
                  <div key={i} style={{
                    flex: 1,
                    height: `${Math.min(100, h.n_active * 2)}%`,
                    background: h.n_active > 0 ? '#2196F3' : 'rgba(255,255,255,0.05)',
                    borderRadius: '1px 1px 0 0',
                    minHeight: 1,
                  }} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.4 }}>No data yet</div>
          )}
        </div>

        {/* Control buttons */}
        <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>CONTROLS</div>

          {!experiment ? (
            <button
              onClick={onStart}
              style={{ ...buttonStyle, background: '#4CAF50', color: 'white' }}
            >
              Start Experiment
            </button>
          ) : (
            <>
              <button
                onClick={() => onPoke('seg_8')}
                style={{ ...buttonStyle, background: '#FF5722', color: 'white' }}
              >
                Poke Posterior
              </button>
              <button
                onClick={() => onPoke('seg_2')}
                style={{ ...buttonStyle, background: '#FF9800', color: 'white' }}
              >
                Poke Anterior
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={onPause}
                  style={{ ...buttonStyle, flex: 1, background: '#333', color: '#ccc' }}
                >
                  Pause
                </button>
                <button
                  onClick={onResume}
                  style={{ ...buttonStyle, flex: 1, background: '#1a237e', color: '#90CAF9' }}
                >
                  Resume
                </button>
              </div>
            </>
          )}
        </div>

        {/* Experiment info */}
        {experiment && (
          <div style={panelStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
              ORGANISM
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              C. elegans
            </div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
              {experiment.n_neurons} neurons
            </div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>
              {experiment.n_synapses} synapses
            </div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>
              12 body segments
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
