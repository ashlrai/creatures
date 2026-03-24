import { useCallback, useState, Component, type ReactNode } from 'react';
import { Scene } from './components/Scene';
import { NeuralActivityDisplay } from './components/ui/NeuralActivityDisplay';
import { Waveform } from './components/ui/Waveform';
import { EvolutionDashboard } from './components/ui/EvolutionDashboard';
import { FitnessGraph } from './components/ui/FitnessGraph';
import { GodAgentPanel } from './components/ui/GodAgentPanel';
import { useSimulation } from './hooks/useSimulation';
import { useDemoMode } from './hooks/useDemoMode';
import { useSimulationStore } from './stores/simulationStore';
import { useEvolutionStore } from './stores/evolutionStore';

// Error boundary for the 3D scene — if WebGL crashes, show fallback
class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error) {
    console.warn('3D Scene error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100%', height: '100%',
          background: 'radial-gradient(ellipse at 50% 35%, #0c1228, #050510)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 14, color: '#556' }}>3D rendering unavailable</div>
          <div style={{ fontSize: 11, color: '#334', maxWidth: 300, textAlign: 'center' }}>
            {this.state.error}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const {
    createExperiment, connect, poke, stimulate, pause, resume, sendCommand,
    connected, experiment,
  } = useSimulation();
  const { startDemo, isDemo } = useDemoMode();
  const isEvolutionMode = useEvolutionStore((s) => s.isEvolutionMode);
  const toggleEvolutionMode = useEvolutionStore((s) => s.toggleEvolutionMode);
  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);
  const frame = useSimulationStore((s) => s.frame);
  const loading = useSimulationStore((s) => s.loading);
  const error = useSimulationStore((s) => s.error);
  const history = useSimulationStore((s) => s.frameHistory);

  const [lesionInput, setLesionInput] = useState('');
  const [stimInput, setStimInput] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2000);
  };

  const handleStart = useCallback(async (organism: string) => {
    try {
      const exp = await createExperiment(organism);
      connect(exp.id);
    } catch {
      await startDemo();
    }
  }, [createExperiment, connect, startDemo]);

  const handleLesion = useCallback((id: string) => {
    sendCommand({ type: 'lesion_neuron', neuron_id: id });
    notify(`Lesioned ${id} — all synapses removed`);
  }, [sendCommand]);

  const handlePoke = useCallback((segment: string) => {
    poke(segment);
    notify(`Poke ${segment === 'seg_8' ? 'tail' : 'head'} — touch neurons activated`);
  }, [poke]);

  const handleStim = useCallback((ids: string[]) => {
    stimulate(ids, 30);
    notify(`Stimulating ${ids.join(', ')} — 30mV current`);
  }, [stimulate]);

  return (
    <div className="app-root">
      {notification && <div className="notify">{notification}</div>}

      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px',
            background: 'linear-gradient(135deg, #e0eaf0, #88ccff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Creatures
          </div>
          {experiment && (
            <div style={{ display: 'flex', gap: 16, marginLeft: 16, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--text-label)' }}>
                {experiment.organism === 'drosophila' ? 'Drosophila melanogaster' : 'Caenorhabditis elegans'}
              </span>
              <span style={{ color: 'var(--accent-cyan)' }}>{experiment.n_neurons.toLocaleString()} neurons</span>
              <span style={{ color: 'var(--text-label)' }}>{experiment.n_synapses.toLocaleString()} synapses</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div className="mode-switch">
            <button
              className={`mode-switch-btn${!isEvolutionMode ? ' active' : ''}`}
              onClick={() => { if (isEvolutionMode) toggleEvolutionMode(); }}
            >
              Simulation
            </button>
            <button
              className={`mode-switch-btn${isEvolutionMode ? ' active' : ''}`}
              onClick={() => { if (!isEvolutionMode) toggleEvolutionMode(); }}
            >
              Evolution
            </button>
          </div>
          {connected && (
            <>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Live</span>
            </>
          )}
          {frame && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-label)' }}>{frame.t_ms.toFixed(0)}ms</span>}
        </div>
      </header>

      {/* Main content */}
      <div className="app-content">
        {/* Left sidebar */}
        <div className="sidebar">
          {isEvolutionMode ? (
            <>
              <EvolutionDashboard />
              <GodAgentPanel />
            </>
          ) : experiment ? (
            <>
              <div className="glass">
                <div className="glass-label">Neural Activity</div>
                <div className="stat-row"><span className="stat-label">Active neurons</span><span className="stat-value stat-cyan">{frame?.n_active ?? 0}</span></div>
                <div className="stat-row"><span className="stat-label">Muscles</span><span className="stat-value stat-magenta">{frame ? Object.keys(frame.muscle_activations).length : 0}</span></div>
                <div className="stat-row"><span className="stat-label">Displacement</span><span className="stat-value stat-green">{history.length > 0 ? history[history.length - 1].displacement.toFixed(4) : '—'}</span></div>
                <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', gap: 1, marginTop: 8 }}>
                  {history.slice(-60).map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${Math.min(100, h.n_active * 2)}%`, background: h.n_active > 10 ? `hsl(${190 - Math.min(h.n_active, 50)}, 85%, 55%)` : h.n_active > 0 ? '#1a4466' : 'rgba(255,255,255,0.015)', borderRadius: '1px 1px 0 0', minHeight: 1 }} />
                  ))}
                </div>
              </div>
              <div className="glass">
                <div className="glass-label">Interaction</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handlePoke('seg_8')}>Poke Tail</button>
                  <button className="btn btn-amber" style={{ flex: 1 }} onClick={() => handlePoke('seg_2')}>Poke Head</button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={pause}>Pause</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={resume}>Resume</button>
                </div>
              </div>
              <div className="glass">
                <div className="glass-label">Neuron Surgery</div>
                <div style={{ fontSize: 10, color: 'var(--text-label)', marginBottom: 4 }}>Lesion neuron</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="input" placeholder="AVAL" value={lesionInput} onChange={(e) => setLesionInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && lesionInput) { handleLesion(lesionInput); setLesionInput(''); }}} />
                  <button className="btn btn-danger" onClick={() => { if (lesionInput) { handleLesion(lesionInput); setLesionInput(''); }}}>Cut</button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-label)', marginTop: 8, marginBottom: 4 }}>Stimulate neuron</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="input" placeholder="PLML" value={stimInput} onChange={(e) => setStimInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && stimInput) { handleStim([stimInput]); setStimInput(''); }}} />
                  <button className="btn btn-primary" onClick={() => { if (stimInput) { handleStim([stimInput]); setStimInput(''); }}}>Zap</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 8, textAlign: 'center', opacity: 0.3, fontSize: 12 }}>
              Select an organism to begin
            </div>
          )}
        </div>

        {/* 3D Viewport */}
        <div className="viewport">
          <SceneErrorBoundary>
            <Scene />
          </SceneErrorBoundary>
        </div>

        {/* Right sidebar */}
        <div className="sidebar sidebar-right">
          {isEvolutionMode ? (
            <div className="glass" style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="glass-label">Fitness Over Generations</div>
              <div style={{ flex: 1, minHeight: 300 }}>
                <FitnessGraph history={fitnessHistory} width={256} height={420} />
              </div>
            </div>
          ) : (
            experiment && <NeuralActivityDisplay />
          )}
        </div>
      </div>

      {/* Welcome overlay — OUTSIDE viewport, always renders */}
      {!experiment && (
        <div className="welcome-overlay">
          <div className="welcome-card">
            {loading ? (
              <>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 16px' }} />
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>Building neural network...</div>
                <div style={{ fontSize: 11, color: 'var(--text-label)', marginTop: 4 }}>Compiling spiking neurons from real connectome data</div>
              </>
            ) : (
              <>
                <div className="welcome-title">Creatures</div>
                <div className="welcome-sub">Virtual organisms powered by real brain wiring.<br />Select an organism to bring it to life.</div>
                {error && <div style={{ fontSize: 11, color: 'var(--accent-magenta)', marginBottom: 12 }}>{error}</div>}
                <div className="welcome-buttons">
                  <button className="welcome-btn welcome-btn-worm" onClick={() => handleStart('c_elegans')}>
                    <div><div className="welcome-btn-label">C. elegans</div><div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Nematode worm — the first fully mapped brain</div></div>
                    <div className="welcome-btn-detail">299 neurons<br/>3,363 synapses</div>
                  </button>
                  <button className="welcome-btn welcome-btn-fly" onClick={() => handleStart('drosophila')}>
                    <div><div className="welcome-btn-label">Drosophila</div><div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Fruit fly central complex — navigation circuit</div></div>
                    <div className="welcome-btn-detail">1,000 neurons<br/>15K+ synapses</div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom waveform */}
      <div className="bottom-bar">
        {experiment ? <Waveform /> : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-label)' }}>Neural oscilloscope — select an organism to begin</span>
          </div>
        )}
      </div>
    </div>
  );
}
