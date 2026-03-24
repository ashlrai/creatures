import { useState } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import { ActivityHeatmap } from './ActivityHeatmap';

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

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#e0e0e0',
  fontSize: 12,
  width: '100%',
  outline: 'none',
};

interface DashboardProps {
  onPoke: (segment: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStart: (organism: string) => void;
  onLesion: (neuronId: string) => void;
  onStimulate: (neuronIds: string[], current: number) => void;
  connected: boolean;
}

export function Dashboard({ onPoke, onPause, onResume, onStart, onLesion, onStimulate, connected }: DashboardProps) {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const history = useSimulationStore((s) => s.frameHistory);
  const loading = useSimulationStore((s) => s.loading);
  const error = useSimulationStore((s) => s.error);
  const [lesionInput, setLesionInput] = useState('');
  const [stimInput, setStimInput] = useState('');

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', display: 'flex', flexDirection: 'column',
      padding: 16, gap: 12,
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', pointerEvents: 'auto' }}>
        <div style={panelStyle}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>
            Creatures
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
            Virtual organisms powered by real brain wiring
          </div>
        </div>

        <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#4CAF50' : '#F44336',
            boxShadow: connected ? '0 0 8px #4CAF50' : 'none',
          }} />
          <span style={{ fontSize: 12 }}>
            {connected ? 'Live' : 'Disconnected'}
          </span>
          {frame && (
            <span style={{ fontSize: 12, opacity: 0.5, fontFamily: 'monospace' }}>
              {frame.t_ms.toFixed(0)}ms
            </span>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', pointerEvents: 'auto', flexWrap: 'wrap' }}>
        {/* Stats + mini graph */}
        <div style={{ ...panelStyle, minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, opacity: 0.6 }}>
            NEURAL ACTIVITY
          </div>
          {frame ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.4 }}>Active neurons</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#2196F3', fontFamily: 'monospace' }}>
                  {frame.n_active}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.4 }}>Muscles</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#FF5722', fontFamily: 'monospace' }}>
                  {Object.keys(frame.muscle_activations).length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, opacity: 0.4 }}>Displacement</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#4CAF50', fontFamily: 'monospace' }}>
                  {history.length > 0
                    ? history[history.length - 1].displacement.toFixed(4)
                    : '0.0000'}
                </span>
              </div>

              {/* Mini activity sparkline */}
              <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                {history.slice(-80).map((h, i) => {
                  const height = Math.min(100, h.n_active * 1.5);
                  return (
                    <div key={i} style={{
                      flex: 1,
                      height: `${height}%`,
                      background: h.n_active > 10
                        ? `hsl(${200 - Math.min(h.n_active, 60) * 3}, 80%, 50%)`
                        : h.n_active > 0
                          ? '#1565C0'
                          : 'rgba(255,255,255,0.03)',
                      borderRadius: '1px 1px 0 0',
                      minHeight: 1,
                      transition: 'height 0.1s',
                    }} />
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.3, padding: '20px 0', textAlign: 'center' }}>
              Select an organism to begin
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}>CONTROLS</div>

          {!experiment ? (
            loading ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: 24, height: 24, border: '3px solid rgba(255,255,255,0.1)',
                  borderTopColor: '#4CAF50', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 8px',
                }} />
                <div style={{ fontSize: 12, opacity: 0.6 }}>Building neural network...</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <>
                {error && (
                  <div style={{ fontSize: 11, color: '#F44336', marginBottom: 6 }}>{error}</div>
                )}
                <button
                  onClick={() => onStart('c_elegans')}
                  style={{ ...buttonStyle, background: '#4CAF50', color: 'white' }}
                >
                  C. elegans (299 neurons)
                </button>
                <button
                  onClick={() => onStart('drosophila')}
                  style={{ ...buttonStyle, background: '#FF9800', color: 'white' }}
                >
                  Fruit Fly (1000 neurons)
                </button>
              </>
            )
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onPoke('seg_8')}
                  style={{ ...buttonStyle, flex: 1, background: '#E91E63', color: 'white' }}
                >
                  Poke Tail
                </button>
                <button
                  onClick={() => onPoke('seg_2')}
                  style={{ ...buttonStyle, flex: 1, background: '#FF5722', color: 'white' }}
                >
                  Poke Head
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={onPause}
                  style={{ ...buttonStyle, flex: 1, background: '#333', color: '#aaa' }}
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

        {/* Neuron tools (only when running) */}
        {experiment && (
          <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}>NEURON TOOLS</div>

            {/* Lesion */}
            <div>
              <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 3 }}>Lesion neuron (remove all synapses)</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  style={inputStyle}
                  placeholder="e.g. AVAL"
                  value={lesionInput}
                  onChange={(e) => setLesionInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && lesionInput) {
                      onLesion(lesionInput);
                      setLesionInput('');
                    }
                  }}
                />
                <button
                  onClick={() => { if (lesionInput) { onLesion(lesionInput); setLesionInput(''); } }}
                  style={{ ...buttonStyle, background: '#b71c1c', color: 'white', padding: '6px 12px', fontSize: 11 }}
                >
                  Lesion
                </button>
              </div>
            </div>

            {/* Stimulate */}
            <div>
              <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 3 }}>Stimulate neuron (inject current)</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  style={inputStyle}
                  placeholder="e.g. PLML"
                  value={stimInput}
                  onChange={(e) => setStimInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && stimInput) {
                      onStimulate([stimInput], 30);
                      setStimInput('');
                    }
                  }}
                />
                <button
                  onClick={() => { if (stimInput) { onStimulate([stimInput], 30); setStimInput(''); } }}
                  style={{ ...buttonStyle, background: '#1565C0', color: 'white', padding: '6px 12px', fontSize: 11 }}
                >
                  Stim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Organism info */}
        {experiment && (
          <div style={panelStyle}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, opacity: 0.6 }}>
              ORGANISM
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {experiment.organism === 'drosophila' ? 'Drosophila' : 'C. elegans'}
            </div>
            <div style={{ fontSize: 12, opacity: 0.4, marginTop: 4, fontFamily: 'monospace' }}>
              {experiment.n_neurons.toLocaleString()} neurons
            </div>
            <div style={{ fontSize: 12, opacity: 0.4, fontFamily: 'monospace' }}>
              {experiment.n_synapses.toLocaleString()} synapses
            </div>
          </div>
        )}

        {/* Activity heatmap */}
        {frame && frame.firing_rates && frame.firing_rates.length > 0 && (
          <ActivityHeatmap />
        )}
      </div>
    </div>
  );
}
