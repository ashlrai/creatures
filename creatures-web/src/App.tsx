import { useCallback, useState } from 'react';
import { Scene } from './components/Scene';
import { NeuralActivityDisplay } from './components/ui/NeuralActivityDisplay';
import { Waveform } from './components/ui/Waveform';
import { useSimulation } from './hooks/useSimulation';
import { useSimulationStore } from './stores/simulationStore';

export default function App() {
  const {
    createExperiment, connect, poke, stimulate, pause, resume, sendCommand,
    connected, experiment,
  } = useSimulation();
  const frame = useSimulationStore((s) => s.frame);
  const loading = useSimulationStore((s) => s.loading);
  const error = useSimulationStore((s) => s.error);
  const history = useSimulationStore((s) => s.frameHistory);

  const [lesionInput, setLesionInput] = useState('');
  const [stimInput, setStimInput] = useState('');

  const handleStart = useCallback(async (organism: string) => {
    const exp = await createExperiment(organism);
    connect(exp.id);
  }, [createExperiment, connect]);

  const handleLesion = useCallback((id: string) => {
    sendCommand({ type: 'lesion_neuron', neuron_id: id });
  }, [sendCommand]);

  return (
    <div className="app-root">
      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>Creatures</div>
            <div style={{ fontSize: 10, color: 'var(--text-label)' }}>
              Virtual organisms powered by real brain wiring
            </div>
          </div>
          {experiment && (
            <div style={{ display: 'flex', gap: 16, marginLeft: 24, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--text-label)' }}>
                {experiment.organism === 'drosophila' ? 'Drosophila' : 'C. elegans'}
              </span>
              <span style={{ color: 'var(--accent-cyan)' }}>{experiment.n_neurons.toLocaleString()} neurons</span>
              <span style={{ color: 'var(--text-label)' }}>{experiment.n_synapses.toLocaleString()} synapses</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--accent-green)' : 'var(--accent-magenta)',
            boxShadow: connected ? '0 0 8px var(--accent-green)' : 'none',
          }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            {connected ? 'Live' : 'Disconnected'}
          </span>
          {frame && (
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-label)' }}>
              {frame.t_ms.toFixed(0)}ms
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="app-content">
        {/* Left sidebar */}
        <div className="sidebar">
          {/* Organism selector or controls */}
          {!experiment ? (
            <div className="glass">
              <div className="glass-label">Select Organism</div>
              {loading ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <div className="spinner" />
                  <div style={{ fontSize: 11, color: 'var(--text-label)', marginTop: 8 }}>
                    Building neural network...
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {error && <div style={{ fontSize: 10, color: 'var(--accent-magenta)' }}>{error}</div>}
                  <button className="btn btn-primary" onClick={() => handleStart('c_elegans')}>
                    C. elegans — 299 neurons
                  </button>
                  <button className="btn btn-amber" onClick={() => handleStart('drosophila')}>
                    Fruit Fly — 1,000 neurons
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="glass">
                <div className="glass-label">Neural Activity</div>
                <div className="stat-row">
                  <span className="stat-label">Active neurons</span>
                  <span className="stat-value stat-cyan">{frame?.n_active ?? 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Muscles</span>
                  <span className="stat-value stat-magenta">
                    {frame ? Object.keys(frame.muscle_activations).length : 0}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Displacement</span>
                  <span className="stat-value stat-green">
                    {history.length > 0 ? history[history.length - 1].displacement.toFixed(4) : '0.0000'}
                  </span>
                </div>

                {/* Mini sparkline */}
                <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', gap: 1, marginTop: 8 }}>
                  {history.slice(-60).map((h, i) => (
                    <div key={i} style={{
                      flex: 1,
                      height: `${Math.min(100, h.n_active * 2)}%`,
                      background: h.n_active > 10
                        ? `hsl(${190 - Math.min(h.n_active, 50)}, 85%, 55%)`
                        : h.n_active > 0 ? '#1a4466' : 'rgba(255,255,255,0.02)',
                      borderRadius: '1px 1px 0 0',
                      minHeight: 1,
                    }} />
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="glass">
                <div className="glass-label">Controls</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => poke('seg_8')}>
                    Poke Tail
                  </button>
                  <button className="btn btn-amber" style={{ flex: 1 }} onClick={() => poke('seg_2')}>
                    Poke Head
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={pause}>Pause</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={resume}>Resume</button>
                </div>
              </div>

              {/* Neuron tools */}
              <div className="glass">
                <div className="glass-label">Neuron Tools</div>
                <div style={{ fontSize: 10, color: 'var(--text-label)', marginBottom: 4 }}>Lesion (remove synapses)</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="input" placeholder="AVAL" value={lesionInput}
                    onChange={(e) => setLesionInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter' && lesionInput) { handleLesion(lesionInput); setLesionInput(''); }}} />
                  <button className="btn btn-danger" onClick={() => { if (lesionInput) { handleLesion(lesionInput); setLesionInput(''); }}}>
                    Cut
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-label)', marginTop: 8, marginBottom: 4 }}>Stimulate (inject current)</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="input" placeholder="PLML" value={stimInput}
                    onChange={(e) => setStimInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter' && stimInput) { stimulate([stimInput], 30); setStimInput(''); }}} />
                  <button className="btn btn-primary" onClick={() => { if (stimInput) { stimulate([stimInput], 30); setStimInput(''); }}}>
                    Zap
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 3D Viewport */}
        <div className="viewport">
          <Scene />
        </div>

        {/* Right sidebar */}
        <div className="sidebar sidebar-right">
          <NeuralActivityDisplay />
        </div>
      </div>

      {/* Bottom waveform */}
      <div className="bottom-bar">
        <Waveform />
      </div>
    </div>
  );
}
