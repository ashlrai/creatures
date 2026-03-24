import { useCallback, useState, useEffect, useRef, useMemo, Component, type ReactNode } from 'react';
import { Scene } from './components/Scene';
import { ConnectomeExplorer } from './components/ui/ConnectomeExplorer';
import { DrugTestingPanel } from './components/ui/DrugTestingPanel';
import { Waveform } from './components/ui/Waveform';
import { EvolutionDashboard } from './components/ui/EvolutionDashboard';
import { FitnessGraph } from './components/ui/FitnessGraph';
import { GodAgentPanel } from './components/ui/GodAgentPanel';
import { ArenaView } from './components/evolution/ArenaView';
import { ConnectomeComparison } from './components/evolution/ConnectomeComparison';
import { GenerationTimeline } from './components/evolution/GenerationTimeline';
import { useSimulation } from './hooks/useSimulation';
import { useDemoMode } from './hooks/useDemoMode';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useHashRouter, type HashState } from './hooks/useHashRouter';
import { NeuronTooltip } from './components/ui/NeuronTooltip';
import { useSimulationStore } from './stores/simulationStore';
import { useEvolutionStore } from './stores/evolutionStore';
import { GlobalErrorBoundary } from './components/ErrorBoundary';
import {
  NeuralActivitySkeleton,
  InteractionSkeleton,
  ConnectomeSkeleton,
  WaveformSkeleton,
} from './components/ui/Skeleton';
import type { ConnectionStatus } from './stores/simulationStore';

/** Connection status indicator for the header */
function ConnectionIndicator({ status, connected, attempts }: {
  status: ConnectionStatus;
  connected: boolean;
  attempts: number;
}) {
  if (status === 'connected' || connected) {
    return (
      <>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }} />
        <span style={{ color: 'var(--text-secondary)' }}>Live</span>
      </>
    );
  }
  if (status === 'reconnecting') {
    return (
      <>
        <div className="connection-dot-reconnecting" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-amber)', boxShadow: '0 0 8px var(--accent-amber)' }} />
        <span style={{ color: 'var(--accent-amber)', fontSize: 11 }}>Reconnecting{'.'.repeat(attempts)}</span>
      </>
    );
  }
  if (status === 'failed') {
    return (
      <>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-magenta)', opacity: 0.7 }} />
        <span style={{ color: 'var(--text-label)', fontSize: 11 }}>Connection lost -- using cached data</span>
      </>
    );
  }
  if (status === 'connecting') {
    return (
      <>
        <div className="connection-dot-reconnecting" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-amber)', boxShadow: '0 0 6px var(--accent-amber)' }} />
        <span style={{ color: 'var(--text-label)', fontSize: 11 }}>Connecting...</span>
      </>
    );
  }
  return null;
}

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
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const reconnectAttempts = useSimulationStore((s) => s.reconnectAttempts);

  const [lesionInput, setLesionInput] = useState('');
  const [stimInput, setStimInput] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showConnectomeComparison, setShowConnectomeComparison] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const autoStarted = useRef(false);

  // --- Local storage persistence ---
  const [savedOrganism, setSavedOrganism] = useLocalStorage<string>('neurevo:organism', 'c_elegans');
  const [savedMode, setSavedMode] = useLocalStorage<'sim' | 'evo'>('neurevo:mode', 'sim');
  const [drugPanelExpanded, setDrugPanelExpanded] = useLocalStorage<boolean>('neurevo:drugPanelExpanded', false);
  const [savedGeneration, setSavedGeneration] = useLocalStorage<number>('neurevo:lastGeneration', 0);

  // Sync evolution mode from/to localStorage
  useEffect(() => {
    setSavedMode(isEvolutionMode ? 'evo' : 'sim');
  }, [isEvolutionMode, setSavedMode]);

  // Restore evolution mode from localStorage on mount
  useEffect(() => {
    if (savedMode === 'evo' && !isEvolutionMode) {
      toggleEvolutionMode();
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track latest generation for persistence
  const latestStats = useEvolutionStore((s) => s.latestStats);
  useEffect(() => {
    if (latestStats?.generation != null) {
      setSavedGeneration(latestStats.generation);
    }
  }, [latestStats, setSavedGeneration]);

  // Derive current organism from experiment or saved value
  const currentOrganism = experiment?.organism ?? savedOrganism;

  // Auto-start demo on page load — no welcome screen, immediate wow factor
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    startDemo(savedOrganism).then(() => {
      // Auto-poke so users see neural cascade immediately
      const store = useSimulationStore.getState();
      store.setPoke('seg_8');
      // Show persistent interaction hint
      setShowHint(true);
    });
  }, [startDemo]);

  // Fix 2: Auto-poke periodically in demo mode to keep the worm visually active
  useEffect(() => {
    if (!isDemo || !experiment) return;
    const interval = setInterval(() => {
      const segments = ['seg_2', 'seg_5', 'seg_8', 'seg_10'];
      const seg = segments[Math.floor(Math.random() * segments.length)];
      useSimulationStore.getState().setPoke(seg);
    }, 8000);
    return () => clearInterval(interval);
  }, [isDemo, experiment]);

  // Dismiss persistent hint on first user interaction
  const markInteracted = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true);
      setShowHint(false);
    }
  }, [hasInteracted]);

  // Bridge custom events from child components to WebSocket
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) sendCommand(detail);
    };
    window.addEventListener('neurevo-command', handler);
    return () => window.removeEventListener('neurevo-command', handler);
  }, [sendCommand]);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2000);
  };

  const handleStart = useCallback(async (organism: string) => {
    try {
      const exp = await createExperiment(organism);
      connect(exp.id);
    } catch {
      await startDemo(organism);
    }
  }, [createExperiment, connect, startDemo]);

  const handleSwitchOrganism = useCallback(async (organism: string) => {
    // Try live server first, fall back to demo
    setSavedOrganism(organism);
    try {
      const exp = await createExperiment(organism);
      connect(exp.id);
    } catch {
      await startDemo(organism);
    }
  }, [createExperiment, connect, startDemo, setSavedOrganism]);

  // --- Hash-based URL routing ---
  const hashState = useMemo<HashState>(() => ({
    mode: isEvolutionMode ? 'evo' : 'sim',
    organism: currentOrganism,
    compare: showConnectomeComparison,
  }), [isEvolutionMode, currentOrganism, showConnectomeComparison]);

  const handleHashChange = useCallback((state: HashState) => {
    // Sync mode
    if (state.mode === 'evo' && !useEvolutionStore.getState().isEvolutionMode) {
      toggleEvolutionMode();
    } else if (state.mode === 'sim' && useEvolutionStore.getState().isEvolutionMode) {
      toggleEvolutionMode();
    }
    // Sync connectome comparison
    setShowConnectomeComparison(state.compare);
  }, [toggleEvolutionMode]);

  // Handle organism change from hash separately to avoid stale closure
  const handleHashChangeWithOrganism = useCallback((state: HashState) => {
    handleHashChange(state);
    const current = useSimulationStore.getState().experiment?.organism ?? savedOrganism;
    if (state.organism !== current) {
      handleSwitchOrganism(state.organism);
    }
  }, [handleHashChange, savedOrganism, handleSwitchOrganism]);

  useHashRouter(hashState, handleHashChangeWithOrganism);

  // --- Share button handler ---
  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      // Fallback for browsers that block clipboard API
      setNotification('Copy this URL to share: ' + url);
      setTimeout(() => setNotification(null), 4000);
    });
  }, []);

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

  // Fix 4: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (key === 'p' || key === ' ') {
        e.preventDefault();
        markInteracted();
        handlePoke('seg_8');
      } else if (key === 'h') {
        markInteracted();
        handlePoke('seg_2');
      } else if (key === 'e') {
        markInteracted();
        toggleEvolutionMode();
      } else if (key === '?') {
        setShowShortcuts((s) => !s);
      } else if (key === 'escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markInteracted, handlePoke, toggleEvolutionMode]);

  return (
    <div className="app-root">
      {notification && <div className="notify">{notification}</div>}

      {/* Neuron hover tooltip — rendered outside Canvas for CSS positioning */}
      <NeuronTooltip />

      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px',
            background: 'linear-gradient(135deg, #e0eaf0, #88ccff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Neurevo
          </div>
          <div className="organism-selector">
            <button
              className={`organism-pill${!experiment || experiment.organism !== 'drosophila' ? ' active' : ''}`}
              onClick={() => handleSwitchOrganism('c_elegans')}
            >
              C. elegans
            </button>
            <button
              className={`organism-pill${experiment?.organism === 'drosophila' ? ' active' : ''}`}
              onClick={() => handleSwitchOrganism('drosophila')}
            >
              Drosophila
            </button>
          </div>
          {experiment && (
            <div style={{ display: 'flex', gap: 16, marginLeft: 8, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
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
          <ConnectionIndicator status={connectionStatus} connected={connected} attempts={reconnectAttempts} />
          {frame && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-label)' }}>{frame.t_ms.toFixed(0)}ms</span>}
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '3px 10px', position: 'relative' }}
            onClick={handleShare}
            title="Copy shareable link"
          >
            {shareCopied ? 'Link copied!' : 'Share'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="app-content">
        {/* Left sidebar */}
        <div className="sidebar">
          {isEvolutionMode ? (
            <>
              <EvolutionDashboard
                showConnectomeComparison={showConnectomeComparison}
                onToggleConnectomeComparison={() => setShowConnectomeComparison((v) => !v)}
              />
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
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { markInteracted(); handlePoke('seg_8'); }}>Poke Tail</button>
                  <button className="btn btn-amber" style={{ flex: 1 }} onClick={() => { markInteracted(); handlePoke('seg_2'); }}>Poke Head</button>
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
              <DrugTestingPanel isDemo={isDemo} expanded={drugPanelExpanded} onToggleExpanded={setDrugPanelExpanded} />
            </>
          ) : (
            <>
              <NeuralActivitySkeleton />
              <InteractionSkeleton />
            </>
          )}
        </div>

        {/* 3D Viewport / Arena */}
        <div className="viewport">
          {isEvolutionMode ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                {showConnectomeComparison ? (
                  <ConnectomeComparison onClose={() => setShowConnectomeComparison(false)} />
                ) : (
                  <ArenaView />
                )}
              </div>
            </div>
          ) : (
            <SceneErrorBoundary>
              <Scene />
            </SceneErrorBoundary>
          )}
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
            experiment ? <ConnectomeExplorer /> : <ConnectomeSkeleton />
          )}
        </div>
      </div>

      {/* Persistent interaction hint — disappears on first interaction */}
      {showHint && !hasInteracted && (
        <div className="interaction-hint-persistent" onClick={markInteracted}>
          Touch the worm &bull; Lesion neurons &bull; Test drugs &bull; Switch to Evolution mode
        </div>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-title">Keyboard Shortcuts</div>
            <div className="shortcuts-row"><kbd>Space</kbd> or <kbd>P</kbd><span>Poke tail</span></div>
            <div className="shortcuts-row"><kbd>H</kbd><span>Poke head</span></div>
            <div className="shortcuts-row"><kbd>E</kbd><span>Toggle Evolution mode</span></div>
            <div className="shortcuts-row"><kbd>?</kbd><span>Show / hide shortcuts</span></div>
            <div className="shortcuts-row"><kbd>Esc</kbd><span>Close this panel</span></div>
          </div>
        </div>
      )}

      {/* Bottom bar: waveform or generation timeline */}
      <div className="bottom-bar">
        {isEvolutionMode ? (
          <GenerationTimeline />
        ) : experiment ? (
          <Waveform />
        ) : (
          <WaveformSkeleton />
        )}
      </div>
    </div>
  );
}
