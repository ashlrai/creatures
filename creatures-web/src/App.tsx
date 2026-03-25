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
import { EcosystemView } from './components/ecosystem/EcosystemView';
import { SpeciesComparison } from './components/ui/SpeciesComparison';
import { useSimulation } from './hooks/useSimulation';
import { useDemoMode } from './hooks/useDemoMode';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useHashRouter, type HashState } from './hooks/useHashRouter';
import { NeuronTooltip } from './components/ui/NeuronTooltip';
import { NeuronDetailPanel } from './components/ui/NeuronDetailPanel';
import { NeuralMetrics } from './components/ui/NeuralMetrics';
import { RecordingPanel } from './components/ui/RecordingPanel';
import { ExperimentPanel } from './components/ui/ExperimentPanel';
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

  const [appMode, setAppMode] = useState<'sim' | 'evo' | 'eco'>('sim');
  const [lesionInput, setLesionInput] = useState('');
  const [stimInput, setStimInput] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showConnectomeComparison, setShowConnectomeComparison] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [ecosystemId, setEcosystemId] = useState<string | null>(null);
  const [ecoStats, setEcoStats] = useState<{ c_elegans: number; drosophila: number; food: number } | null>(null);
  const [ecoLoading, setEcoLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'brain' | 'tools' | 'science'>('brain');
  const [showWelcome, setShowWelcome] = useLocalStorage('neurevo:welcomed', true);
  const autoStarted = useRef(false);

  // --- Local storage persistence ---
  const [savedOrganism, setSavedOrganism] = useLocalStorage<string>('neurevo:organism', 'c_elegans');
  const [savedMode, setSavedMode] = useLocalStorage<'sim' | 'evo'>('neurevo:mode', 'sim');
  const [drugPanelExpanded, setDrugPanelExpanded] = useLocalStorage<boolean>('neurevo:drugPanelExpanded', false);
  const [savedGeneration, setSavedGeneration] = useLocalStorage<number>('neurevo:lastGeneration', 0);

  // Sync appMode with evolution store for backward compatibility
  useEffect(() => {
    if (appMode === 'evo' && !isEvolutionMode) {
      toggleEvolutionMode();
    } else if (appMode !== 'evo' && isEvolutionMode) {
      toggleEvolutionMode();
    }
  }, [appMode, isEvolutionMode, toggleEvolutionMode]);

  // Sync evolution mode from/to localStorage
  useEffect(() => {
    setSavedMode(appMode === 'evo' ? 'evo' : 'sim');
  }, [appMode, setSavedMode]);

  // Restore mode from localStorage / hash on mount
  useEffect(() => {
    // Check hash first
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash === 'eco') {
      setAppMode('eco');
    } else if (savedMode === 'evo') {
      setAppMode('evo');
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

  // Organism-aware constants
  const isFly = currentOrganism === 'drosophila';
  const pokeSegments = isFly
    ? { tail: 'Abdomen', head: 'Thorax', all: ['Thorax', 'Head', 'Abdomen'] }
    : { tail: 'seg_8', head: 'seg_2', all: ['seg_2', 'seg_5', 'seg_8', 'seg_10'] };
  const pokeLabels = isFly
    ? { tail: 'Poke Abdomen', head: 'Poke Thorax' }
    : { tail: 'Poke Tail', head: 'Poke Head' };
  const neuronDefaults = isFly
    ? { lesion: 'DN', stim: 'DN' }
    : { lesion: 'AVAL', stim: 'PLML' };
  const organismLabel = isFly ? 'fly' : 'worm';

  // Auto-start demo on page load — no welcome screen, immediate wow factor
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    startDemo(savedOrganism).then(() => {
      const store = useSimulationStore.getState();
      store.setPoke(savedOrganism === 'drosophila' ? 'Thorax' : 'seg_8');
      setShowHint(true);
    });
  }, [startDemo]);

  // Auto-poke periodically in demo mode to keep the organism visually active
  useEffect(() => {
    if (!isDemo || !experiment) return;
    const segments = pokeSegments.all;
    const interval = setInterval(() => {
      const seg = segments[Math.floor(Math.random() * segments.length)];
      useSimulationStore.getState().setPoke(seg);
    }, 8000);
    return () => clearInterval(interval);
  }, [isDemo, experiment, currentOrganism]);

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
  // Eco mode is handled outside the hash router since HashState only supports sim/evo
  const hashState = useMemo<HashState>(() => ({
    mode: appMode === 'evo' ? 'evo' : 'sim',
    organism: currentOrganism,
    compare: showConnectomeComparison,
  }), [appMode, currentOrganism, showConnectomeComparison]);

  // Manually set hash for eco mode
  useEffect(() => {
    if (appMode === 'eco' && window.location.hash !== '#/eco') {
      window.location.hash = '#/eco';
    }
  }, [appMode]);

  const handleHashChange = useCallback((state: HashState) => {
    // Sync mode
    if (state.mode === 'evo') {
      setAppMode('evo');
    } else {
      setAppMode('sim');
    }
    // Sync connectome comparison
    setShowConnectomeComparison(state.compare);
  }, []);

  // Handle organism change from hash separately to avoid stale closure
  const handleHashChangeWithOrganism = useCallback((state: HashState) => {
    handleHashChange(state);
    const current = useSimulationStore.getState().experiment?.organism ?? savedOrganism;
    if (state.organism !== current) {
      handleSwitchOrganism(state.organism);
    }
  }, [handleHashChange, savedOrganism, handleSwitchOrganism]);

  // Listen for eco hash on popstate/hashchange
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash === 'eco') {
        setAppMode('eco');
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

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
    notify(`Poke ${segment} — sensory neurons activated`);
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
        handlePoke(pokeSegments.tail);
      } else if (key === 'h') {
        markInteracted();
        handlePoke(pokeSegments.head);
      } else if (key === 'e') {
        markInteracted();
        setAppMode((m) => m === 'sim' ? 'evo' : m === 'evo' ? 'eco' : 'sim');
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

      {/* Neuron hover tooltip + detail panel — rendered outside Canvas */}
      <NeuronTooltip />
      <NeuronDetailPanel />

      {/* Welcome overlay — shown on first visit */}
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="welcome-card">
            <div className="welcome-title">Neurevo</div>
            <div className="welcome-subtitle">
              Simulate real biological brains. Touch, test drugs, evolve, and discover.
            </div>
            <div className="welcome-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowWelcome(false);
                  handleSwitchOrganism('c_elegans');
                }}
              >
                Start Exploring
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowWelcome(false);
                  setAppMode('evo');
                }}
              >
                Watch Evolution
              </button>
            </div>
            <div className="welcome-dismiss" onClick={() => setShowWelcome(false)}>
              Press <strong>?</strong> for keyboard shortcuts
            </div>
          </div>
        </div>
      )}

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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div className="mode-switch">
            <button
              className={`mode-switch-btn${appMode === 'sim' ? ' active' : ''}`}
              onClick={() => setAppMode('sim')}
            >
              Simulation
            </button>
            <button
              className={`mode-switch-btn${appMode === 'evo' ? ' active' : ''}`}
              onClick={() => setAppMode('evo')}
            >
              Evolution
            </button>
            <button
              className={`mode-switch-btn${appMode === 'eco' ? ' active' : ''}`}
              onClick={() => setAppMode('eco')}
            >
              Ecosystem
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
          {appMode === 'eco' ? (
            <>
              <div className="glass">
                <div className="glass-label">Ecosystem Controls</div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginBottom: 8 }}
                  disabled={ecoLoading}
                  onClick={async () => {
                    setEcoLoading(true);
                    try {
                      const res = await fetch('/api/ecosystem', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ populations: { c_elegans: 20, drosophila: 5 } }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        const newId = data.id ?? data.ecosystem_id ?? null;
                        setEcosystemId(newId);
                        notify('Ecosystem created');
                        // Fetch initial stats
                        if (newId) {
                          try {
                            const statsRes = await fetch(`/api/ecosystem/${newId}/stats`);
                            if (statsRes.ok) {
                              const statsData = await statsRes.json();
                              setEcoStats({
                                c_elegans: statsData.by_species?.c_elegans?.count ?? statsData.c_elegans_count ?? statsData.c_elegans ?? 0,
                                drosophila: statsData.by_species?.drosophila?.count ?? statsData.drosophila_count ?? statsData.drosophila ?? 0,
                                food: Math.round((statsData.total_food_energy ?? 0) / 50) || (statsData.total_food ?? statsData.food ?? 10),
                              });
                            }
                          } catch { /* stats fetch non-critical */ }
                        }
                      } else {
                        notify('Ecosystem API unavailable — using local sim');
                      }
                    } catch {
                      notify('Ecosystem API unavailable — using local sim');
                    } finally {
                      setEcoLoading(false);
                    }
                  }}
                >
                  {ecoLoading ? 'Creating...' : 'Create Ecosystem'}
                </button>
                {ecosystemId && (
                  <div style={{ fontSize: 10, color: 'var(--text-label)', marginBottom: 4 }}>
                    ID: {ecosystemId.slice(0, 8)}...
                  </div>
                )}
              </div>
              <div className="glass">
                <div className="glass-label">Population</div>
                <div className="stat-row">
                  <span className="stat-label">C. elegans</span>
                  <span className="stat-value stat-cyan">{ecoStats?.c_elegans ?? 20}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Drosophila</span>
                  <span className="stat-value stat-amber">{ecoStats?.drosophila ?? 5}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Food sources</span>
                  <span className="stat-value stat-green">{ecoStats?.food ?? 12}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Species</span>
                  <span className="stat-value" style={{ color: 'var(--text-secondary)' }}>2</span>
                </div>
              </div>
              <div className="glass">
                <div className="glass-label">Environmental Events</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    { type: 'food_scarcity', label: 'Food Scarcity', cls: 'btn-danger' },
                    { type: 'predator_surge', label: 'Predator Surge', cls: 'btn-amber' },
                    { type: 'mutation_burst', label: 'Mutation Burst', cls: 'btn-primary' },
                    { type: 'climate_shift', label: 'Climate Shift', cls: 'btn-ghost' },
                  ] as const).map(({ type, label, cls }) => (
                    <button
                      key={type}
                      className={`btn ${cls}`}
                      style={{ width: '100%' }}
                      onClick={async () => {
                        if (!ecosystemId) {
                          notify(`${label} triggered (local)`);
                          return;
                        }
                        try {
                          const res = await fetch(`/api/ecosystem/${ecosystemId}/event`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type }),
                          });
                          if (res.ok) {
                            notify(`${label} event triggered`);
                            // Refresh stats
                            try {
                              const sr = await fetch(`/api/ecosystem/${ecosystemId}/stats`);
                              if (sr.ok) {
                                const sd = await sr.json();
                                setEcoStats({
                                  c_elegans: sd.c_elegans_count ?? sd.c_elegans ?? 0,
                                  drosophila: sd.drosophila_count ?? sd.drosophila ?? 0,
                                  food: sd.total_food ?? sd.food ?? 0,
                                });
                              }
                            } catch { /* ignore stats fetch failure */ }
                          } else {
                            notify(`${label} triggered (local)`);
                          }
                        } catch {
                          notify(`${label} triggered (local)`);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : appMode === 'evo' ? (
            <>
              <EvolutionDashboard
                showConnectomeComparison={showConnectomeComparison}
                onToggleConnectomeComparison={() => setShowConnectomeComparison((v) => !v)}
              />
              <GodAgentPanel />
            </>
          ) : experiment ? (
            <>
              <div className="sidebar-tabs">
                <button className={`sidebar-tab${sidebarTab === 'brain' ? ' active' : ''}`} onClick={() => setSidebarTab('brain')}>Brain</button>
                <button className={`sidebar-tab${sidebarTab === 'tools' ? ' active' : ''}`} onClick={() => setSidebarTab('tools')}>Tools</button>
                <button className={`sidebar-tab${sidebarTab === 'science' ? ' active' : ''}`} onClick={() => setSidebarTab('science')}>Science</button>
              </div>

              {sidebarTab === 'brain' && (
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
                      <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { markInteracted(); handlePoke(pokeSegments.tail); }}>{pokeLabels.tail}</button>
                      <button className="btn btn-amber" style={{ flex: 1 }} onClick={() => { markInteracted(); handlePoke(pokeSegments.head); }}>{pokeLabels.head}</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn btn-ghost" style={{ flex: 1 }} onClick={pause}>Pause</button>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={resume}>Resume</button>
                    </div>
                  </div>
                </>
              )}

              {sidebarTab === 'tools' && (
                <>
                  <div className="glass">
                    <div className="glass-label">Neuron Surgery</div>
                    <div style={{ fontSize: 10, color: 'var(--text-label)', marginBottom: 4 }}>Lesion neuron</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input className="input" placeholder={neuronDefaults.lesion} value={lesionInput} onChange={(e) => setLesionInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && lesionInput) { handleLesion(lesionInput); setLesionInput(''); }}} />
                      <button className="btn btn-danger" onClick={() => { if (lesionInput) { handleLesion(lesionInput); setLesionInput(''); }}}>Cut</button>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-label)', marginTop: 8, marginBottom: 4 }}>Stimulate neuron</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input className="input" placeholder={neuronDefaults.stim} value={stimInput} onChange={(e) => setStimInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && stimInput) { handleStim([stimInput]); setStimInput(''); }}} />
                      <button className="btn btn-primary" onClick={() => { if (stimInput) { handleStim([stimInput]); setStimInput(''); }}}>Zap</button>
                    </div>
                  </div>
                  <DrugTestingPanel isDemo={isDemo} expanded={drugPanelExpanded} onToggleExpanded={setDrugPanelExpanded} />
                </>
              )}

              {sidebarTab === 'science' && (
                <>
                  <NeuralMetrics />
                  <RecordingPanel />
                  <ExperimentPanel />
                </>
              )}
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
          {appMode === 'eco' ? (
            <EcosystemView ecosystemId={ecosystemId} />
          ) : appMode === 'evo' ? (
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
          {appMode === 'eco' ? (
            <div className="glass" style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="glass-label">Ecosystem Info</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 8px' }}>Multi-species environment with <span style={{ color: 'var(--accent-cyan)' }}>C. elegans</span> and <span style={{ color: 'var(--accent-amber)' }}>Drosophila</span> coexisting.</p>
                <p style={{ margin: '0 0 8px' }}>Organisms forage for <span style={{ color: 'var(--accent-green)' }}>food sources</span>, compete for resources, and evolve over generations.</p>
                <p style={{ margin: 0, color: 'var(--text-label)' }}>Use the event triggers in the left panel to perturb the ecosystem and observe emergent behaviors.</p>
              </div>
            </div>
          ) : appMode === 'evo' ? (
            <div className="glass" style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="glass-label">Fitness Over Generations</div>
              <div style={{ flex: 1, minHeight: 300 }}>
                <FitnessGraph history={fitnessHistory} width={220} height={420} />
              </div>
            </div>
          ) : (
            experiment ? (
              <>
                <ConnectomeExplorer />
                <SpeciesComparison />
              </>
            ) : <ConnectomeSkeleton />
          )}
        </div>
      </div>

      {/* Persistent interaction hint — disappears on first interaction */}
      {showHint && !hasInteracted && (
        <div className="interaction-hint-persistent" onClick={markInteracted}>
          Touch the {organismLabel} &bull; Lesion neurons &bull; Test drugs &bull; Switch to Evolution mode
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
        {appMode === 'eco' ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-label)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            ECOSYSTEM LIVE — {(ecoStats?.c_elegans ?? 20) + (ecoStats?.drosophila ?? 5)} organisms
          </div>
        ) : appMode === 'evo' ? (
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
