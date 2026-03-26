import { useCallback, useState, useEffect, useRef, useMemo, Component, type ReactNode } from 'react';
import { Scene } from './components/Scene';
import { ConnectomeExplorer } from './components/ui/ConnectomeExplorer';
import { DrugTestingPanel } from './components/ui/DrugTestingPanel';
import { TransportControls } from './components/ui/TransportControls';
import { useTransportStore } from './stores/transportStore';
import { EvolutionDashboard } from './components/ui/EvolutionDashboard';
import { FitnessGraph } from './components/ui/FitnessGraph';
import { GodAgentPanel } from './components/ui/GodAgentPanel';
import { ArenaView } from './components/evolution/ArenaView';
import { ConnectomeComparison } from './components/evolution/ConnectomeComparison';
import { GenerationTimeline } from './components/evolution/GenerationTimeline';
import { EcosystemView, type MassiveOrganism, type MassiveNeuralStats, type EmergentEvent } from './components/ecosystem/EcosystemView';
import { EcosystemView3D } from './components/ecosystem/EcosystemView3D';
import { SpeciesComparison } from './components/ui/SpeciesComparison';
import { useSimulation } from './hooks/useSimulation';
import { useDemoMode } from './hooks/useDemoMode';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useHashRouter, type HashState } from './hooks/useHashRouter';
import { VideoRecorder } from './components/ui/VideoRecorder';
import { SharePanel } from './components/ui/SharePanel';
import type { ShareableState } from './utils/shareableState';
import { NeuronTooltip } from './components/ui/NeuronTooltip';
import { NeuronDetailPanel } from './components/ui/NeuronDetailPanel';
import { NeuralMetrics } from './components/ui/NeuralMetrics';
import { RecordingPanel } from './components/ui/RecordingPanel';
import { ExperimentPanel } from './components/ui/ExperimentPanel';
import { ParameterPanel } from './components/ui/ParameterPanel';
import { ExportPanel } from './components/ui/ExportPanel';
import { CircuitSurgeryToolbar } from './components/ui/CircuitSurgeryToolbar';
import { ModificationLog } from './components/ui/ModificationLog';
import { useCircuitModificationStore } from './stores/circuitModificationStore';
import { BreadcrumbNav } from './components/ui/BreadcrumbNav';
import { NeuronDetail } from './components/ui/NeuronDetail';
import { STDPDashboard } from './components/ui/STDPDashboard';
import { OptogeneticsPanel } from './components/ui/OptogeneticsPanel';
import { MutualInfoMatrix } from './components/ui/MutualInfoMatrix';
import { ConsciousnessDashboard } from './components/ui/ConsciousnessDashboard';
import { TransferEntropyNetwork } from './components/ui/TransferEntropyNetwork';
import { CausalDashboard } from './components/ui/CausalDashboard';
import { ProtocolTimeline } from './components/ui/ProtocolTimeline';
import { ProtocolResults } from './components/ui/ProtocolResults';
import { ConnectomeDiff } from './components/ui/ConnectomeDiff';
import { CalciumOverlay } from './components/ui/CalciumOverlay';
import { ActivityTimelineConnected } from './components/ui/ActivityTimeline';
import { Oscilloscope } from './components/ui/Oscilloscope';
import { DoseResponsePanel } from './components/ui/DoseResponsePanel';
import { PhasePortrait3D } from './components/ui/PhasePortrait3D';
import { ExperimentComparison } from './components/ui/ExperimentComparison';
import { EnvironmentEditor } from './components/ui/EnvironmentEditor';
import { MotifAnalyzer } from './components/ui/MotifAnalyzer';
import { NeuralDecoder } from './components/ui/NeuralDecoder';
import { useSimulationStore } from './stores/simulationStore';
import { useEvolutionStore } from './stores/evolutionStore';
import { PanelErrorBoundary } from './components/ErrorBoundary';
import { useUIPreferencesStore } from './stores/uiPreferencesStore';
import { CorrelationMatrixConnected as CorrelationMatrix, PopulationProjectionConnected as PopulationProjection, PowerSpectralDensityConnected as PowerSpectralDensity } from './components/ui/AdvancedVizWrappers';
import { Tutorial } from './components/ui/Tutorial';
import { SharedView, isShareRoute } from './components/ui/SharedView';
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
  const history = useSimulationStore((s) => s.frameHistory);
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const researchMode = useUIPreferencesStore((s) => s.researchMode);
  const reconnectAttempts = useSimulationStore((s) => s.reconnectAttempts);

  // Shared view detection -- if the URL hash matches a share route, show SharedView
  const [showSharedView, setShowSharedView] = useState(() => isShareRoute(window.location.hash));

  const [appMode, setAppMode] = useState<'sim' | 'evo' | 'eco'>('sim');
  const [lesionInput, setLesionInput] = useState('');
  const [stimInput, setStimInput] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showConnectomeComparison, setShowConnectomeComparison] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [ecosystemId, setEcosystemId] = useState<string | null>(null);
  const [ecoStats, setEcoStats] = useState<{ c_elegans: number; drosophila: number; food: number } | null>(null);
  const [ecoLoading, setEcoLoading] = useState(false);
  // Massive brain-world state
  const [ecoScale, setEcoScale] = useState<'standard' | 'massive'>('standard');
  const [massiveId, setMassiveId] = useState<string | null>(null);
  const [massiveOrganisms, setMassiveOrganisms] = useState<MassiveOrganism[]>([]);
  const [massiveNeuralStats, setMassiveNeuralStats] = useState<MassiveNeuralStats | null>(null);
  const [massiveEmergent, setMassiveEmergent] = useState<EmergentEvent[]>([]);
  const [massiveWorldType, setMassiveWorldType] = useState<string>('soil');
  const [massivePopulation, setMassivePopulation] = useState(0);
  const massiveStepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'brain' | 'tools' | 'science'>('brain');
  const [showWelcome, setShowWelcome] = useLocalStorage('neurevo:welcomed', true);
  const [showTutorial, setShowTutorial] = useState(() => !Tutorial.isComplete());
  const autoStarted = useRef(false);

  // --- Local storage persistence ---
  const [savedOrganism, setSavedOrganism] = useLocalStorage<string>('neurevo:organism', 'c_elegans');
  const [savedMode, setSavedMode] = useLocalStorage<'sim' | 'evo'>('neurevo:mode', 'sim');
  const [drugPanelExpanded, setDrugPanelExpanded] = useLocalStorage<boolean>('neurevo:drugPanelExpanded', false);

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
    if (hash === 'app/eco' || hash === 'eco') {
      setAppMode('eco');
    } else if (savedMode === 'evo') {
      setAppMode('evo');
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (appMode === 'eco' && window.location.hash !== '#/app/eco') {
      window.location.hash = '#/app/eco';
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

  // Handle shareable state URLs: decode and apply experiment configuration
  const handleShareState = useCallback((shared: ShareableState) => {
    // Apply organism
    if (shared.organism && shared.organism !== currentOrganism) {
      handleSwitchOrganism(shared.organism);
    }
    // Apply mode
    setAppMode(shared.appMode);
    // Apply research mode
    if (shared.researchMode !== researchMode) {
      useUIPreferencesStore.getState().toggleResearchMode();
    }
    // Apply circuit modifications
    if (shared.modifications && shared.modifications.length > 0) {
      const modStore = useCircuitModificationStore.getState();
      for (const mod of shared.modifications) {
        modStore.addModification({
          type: mod.type as 'lesion' | 'stimulate' | 'silence' | 'record',
          neuronIds: mod.neuronIds,
          params: {},
        });
        // Also send the actual commands to the backend
        for (const nid of mod.neuronIds) {
          if (mod.type === 'lesion') {
            sendCommand({ type: 'lesion_neuron', neuron_id: nid });
          } else if (mod.type === 'stimulate') {
            sendCommand({ type: 'stimulate', neuron_ids: [nid], current: 25 });
          }
        }
      }
    }
    // Apply drug state
    if (shared.drugState?.compound) {
      sendCommand({
        type: 'apply_drug',
        compound: shared.drugState.compound,
        dose: shared.drugState.dose ?? 1,
      });
    }
    // Apply parameters
    if (shared.parameters) {
      for (const [key, value] of Object.entries(shared.parameters)) {
        sendCommand({ type: 'set_param', key, value });
      }
    }
    // Clear the share hash so normal routing resumes
    const modeHash = shared.appMode === 'evo' ? '#/app/evo' : `#/app/sim/${shared.organism}`;
    window.location.hash = modeHash;
    notify('Shared experiment state applied');
  }, [currentOrganism, researchMode, handleSwitchOrganism, sendCommand]);

  // Listen for eco hash and share routes on popstate/hashchange
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash;
      if (isShareRoute(hash)) {
        setShowSharedView(true);
        return;
      }
      setShowSharedView(false);
      const path = hash.replace(/^#\/?/, '');
      if (path === 'app/eco' || path === 'eco') {
        setAppMode('eco');
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useHashRouter(hashState, handleHashChangeWithOrganism, handleShareState);

  // --- Massive brain-world step + poll loop ---
  useEffect(() => {
    if (!massiveId || ecoScale !== 'massive') {
      // Cleanup on unmount or scale change
      if (massiveStepRef.current) {
        clearInterval(massiveStepRef.current);
        massiveStepRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        // Step the simulation forward
        await fetch(`/api/ecosystem/massive/${massiveId}/step?steps=10`, { method: 'POST' });
        if (cancelled) return;

        // Get state
        const stateRes = await fetch(`/api/ecosystem/massive/${massiveId}`);
        if (stateRes.ok && !cancelled) {
          const data = await stateRes.json();
          if (data.organisms) setMassiveOrganisms(data.organisms);
          if (data.neural_stats) setMassiveNeuralStats(data.neural_stats);
          setMassivePopulation(data.total_alive ?? data.organisms?.length ?? 0);
        }

        // Check emergent behaviors (less frequent -- every other poll)
        if (Math.random() < 0.5) {
          const emRes = await fetch(`/api/ecosystem/massive/${massiveId}/emergent`);
          if (emRes.ok && !cancelled) {
            const emData = await emRes.json();
            if (emData.events) setMassiveEmergent(emData.events);
          }
        }
      } catch {
        // API unavailable -- keep polling, it may recover
      }
    };

    massiveStepRef.current = setInterval(poll, 500);
    poll(); // Initial fetch

    return () => {
      cancelled = true;
      if (massiveStepRef.current) {
        clearInterval(massiveStepRef.current);
        massiveStepRef.current = null;
      }
    };
  }, [massiveId, ecoScale]);

  // --- Create massive brain-world ---
  const createMassiveEcosystem = useCallback(async (worldType: string, nOrganisms = 1000, neuronsPerOrg = 50) => {
    setEcoLoading(true);
    try {
      const res = await fetch('/api/ecosystem/massive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n_organisms: nOrganisms, neurons_per: neuronsPerOrg, world_type: worldType }),
      });
      if (res.ok) {
        const data = await res.json();
        const newId = data.id ?? null;
        setMassiveId(newId);
        setMassiveWorldType(worldType);
        setMassiveOrganisms([]);
        setMassiveNeuralStats(null);
        setMassiveEmergent([]);
        setMassivePopulation(nOrganisms);
        notify(`Massive brain-world created (${nOrganisms} organisms)`);
      } else {
        notify('Massive API unavailable -- check server');
      }
    } catch {
      notify('Massive API unavailable -- check server');
    } finally {
      setEcoLoading(false);
    }
  }, []);

  // --- Build current shareable state ---
  const buildShareableState = useCallback((): ShareableState => {
    const modStore = useCircuitModificationStore.getState();
    const modifications = modStore.modifications.map((m) => ({
      type: m.type,
      neuronIds: m.neuronIds,
    }));
    return {
      organism: currentOrganism,
      modifications,
      parameters: {}, // Parameters are sent directly; we track what's been modified
      drugState: null, // Drug state is ephemeral; captured if available
      appMode,
      researchMode,
    };
  }, [currentOrganism, appMode, researchMode]);

  // --- Share button handler ---
  const handleShare = useCallback(() => {
    setShowSharePanel(true);
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
      } else if (key === 'k') {
        e.preventDefault();
        useTransportStore.getState().togglePlaying();
      } else if (key === ',') {
        useTransportStore.getState().stepBack();
      } else if (key === '.') {
        useTransportStore.getState().stepForward();
      } else if (key === '[') {
        const ts = useTransportStore.getState();
        ts.setSpeed(Math.max(0.1, ts.speed / 1.5));
      } else if (key === ']') {
        const ts = useTransportStore.getState();
        ts.setSpeed(Math.min(10, ts.speed * 1.5));
      } else if (key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        useCircuitModificationStore.getState().undo();
      } else if ((key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (key === 'y' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        useCircuitModificationStore.getState().redo();
      } else if (key === 'l') {
        useTransportStore.getState().toggleLoop();
      } else if (key === 'escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markInteracted, handlePoke, toggleEvolutionMode]);

  // If the URL is a share link, render only the shared view
  if (showSharedView) {
    return (
      <SharedView onExit={() => {
        setShowSharedView(false);
        window.location.hash = '#/app/sim/c_elegans';
      }} />
    );
  }

  return (
    <div className="app-root">
      {notification && <div className="notify">{notification}</div>}

      {/* Neuron hover tooltip + detail panel — rendered outside Canvas */}
      <NeuronTooltip />
      <NeuronDetailPanel />
      <CircuitSurgeryToolbar />
      <BreadcrumbNav />
      <NeuronDetail />

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

      {/* Interactive tutorial — shows after welcome is dismissed */}
      {!showWelcome && showTutorial && (
        <Tutorial
          onComplete={() => setShowTutorial(false)}
          onPoke={handlePoke}
          onSetSidebarTab={setSidebarTab}
          onSetAppMode={setAppMode}
        />
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
              className={`organism-pill${!experiment || (experiment.organism !== 'drosophila' && experiment.organism !== 'zebrafish') ? ' active' : ''}`}
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
            <button
              className={`organism-pill${experiment?.organism === 'zebrafish' ? ' active' : ''}`}
              onClick={() => handleSwitchOrganism('zebrafish')}
            >
              Zebrafish
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
          <button
            className={`mode-switch-btn${researchMode ? ' active' : ''}`}
            onClick={() => useUIPreferencesStore.getState().toggleResearchMode()}
            title="Toggle Research Mode"
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            Research
          </button>
          <ConnectionIndicator status={connectionStatus} connected={connected} attempts={reconnectAttempts} />
          {frame && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-label)' }}>{frame.t_ms.toFixed(0)}ms</span>}
          <VideoRecorder />
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '3px 10px', position: 'relative' }}
            onClick={handleShare}
            title="Share experiment state"
          >
            Share
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="app-content">
        {/* Left sidebar */}
        <div className="sidebar">
          {appMode === 'eco' ? (
            <>
              {/* Scale selector */}
              <div className="glass">
                <div className="glass-label">Scale</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <button
                    className={`btn ${ecoScale === 'standard' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, fontSize: 11 }}
                    onClick={() => setEcoScale('standard')}
                  >
                    Standard (~25)
                  </button>
                  <button
                    className={`btn ${ecoScale === 'massive' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, fontSize: 11 }}
                    onClick={() => setEcoScale('massive')}
                  >
                    Massive (1K+)
                  </button>
                </div>
              </div>

              {ecoScale === 'massive' ? (
                <>
                  {/* World type selector */}
                  <div className="glass">
                    <div className="glass-label">World Type</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                      {(['soil', 'pond', 'lab_plate', 'abstract'] as const).map((wt) => (
                        <button
                          key={wt}
                          className={`btn ${massiveWorldType === wt ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ flex: '1 1 45%', fontSize: 10, padding: '4px 6px' }}
                          onClick={() => setMassiveWorldType(wt)}
                        >
                          {wt === 'lab_plate' ? 'Lab Plate' : wt.charAt(0).toUpperCase() + wt.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      disabled={ecoLoading}
                      onClick={() => createMassiveEcosystem(massiveWorldType)}
                    >
                      {ecoLoading ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span className="experiment-spinner" />
                          Creating...
                        </span>
                      ) : 'Create Brain-World'}
                    </button>
                    {massiveId && (
                      <div style={{ fontSize: 10, color: 'var(--text-label)', marginTop: 4 }}>
                        ID: {massiveId.slice(0, 12)}...
                      </div>
                    )}
                  </div>

                  {/* Neural stats panel */}
                  <div className="glass">
                    <div className="glass-label">Neural Stats</div>
                    <div className="stat-row">
                      <span className="stat-label">Total neurons</span>
                      <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>
                        {massiveNeuralStats ? massiveNeuralStats.total_neurons.toLocaleString() : '--'}
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Active neurons</span>
                      <span className="stat-value" style={{ color: 'var(--accent-green)' }}>
                        {massiveNeuralStats
                          ? `${((massiveNeuralStats.total_fired / Math.max(1, massiveNeuralStats.total_neurons)) * 100).toFixed(1)}%`
                          : '--'}
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Mean firing rate</span>
                      <span className="stat-value" style={{ color: 'var(--accent-amber)' }}>
                        {massiveNeuralStats ? massiveNeuralStats.mean_firing_rate.toFixed(4) : '--'}
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Emergent behaviors</span>
                      <span className="stat-value" style={{ color: 'var(--accent-magenta)' }}>
                        {massiveEmergent.length}
                      </span>
                    </div>
                  </div>

                  {/* Population display */}
                  <div className="glass">
                    <div className="glass-label">Population</div>
                    <div className="stat-row">
                      <span className="stat-label">Alive</span>
                      <span className="stat-value stat-cyan">{massivePopulation.toLocaleString()}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Displayed</span>
                      <span className="stat-value" style={{ color: 'var(--text-secondary)' }}>{massiveOrganisms.length.toLocaleString()}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Standard ecosystem controls (unchanged) */}
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
                            notify('Ecosystem API unavailable -- using local sim');
                          }
                        } catch {
                          notify('Ecosystem API unavailable -- using local sim');
                        } finally {
                          setEcoLoading(false);
                        }
                      }}
                    >
                      {ecoLoading ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span className="experiment-spinner" />
                          Creating...
                        </span>
                      ) : 'Create Ecosystem'}
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
              )}
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
                  <PanelErrorBoundary name="Oscilloscope">
                    <Oscilloscope />
                  </PanelErrorBoundary>
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
                  <PanelErrorBoundary name="Circuit Log">
                    <ModificationLog />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Optogenetics">
                    <OptogeneticsPanel />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Parameters">
                    <ParameterPanel />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Dose-Response">
                    <DoseResponsePanel />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Environment">
                    <EnvironmentEditor />
                  </PanelErrorBoundary>
                </>
              )}

              {sidebarTab === 'science' && (
                <>
                  <PanelErrorBoundary name="Neural Metrics">
                    <NeuralMetrics />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Recording">
                    <RecordingPanel />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Experiments">
                    <ExperimentPanel />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="STDP">
                    <STDPDashboard />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Activity Timeline">
                    <ActivityTimelineConnected />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Export">
                    <ExportPanel />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Phase Portrait">
                    <PhasePortrait3D />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Compare Experiments">
                    <ExperimentComparison />
                  </PanelErrorBoundary>
                  <PanelErrorBoundary name="Neural Decoder">
                    <NeuralDecoder />
                  </PanelErrorBoundary>
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
            ecoScale === 'massive' ? (
              <EcosystemView3D
                massiveId={massiveId ?? undefined}
                massiveOrganisms={massiveOrganisms}
                massiveNeuralStats={massiveNeuralStats}
                emergentEvents={massiveEmergent}
                worldType={massiveWorldType}
              />
            ) : (
              <EcosystemView
                ecosystemId={ecosystemId ?? undefined}
              />
            )
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
              <div className="glass-label">{ecoScale === 'massive' ? 'Brain-World Info' : 'Ecosystem Info'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {ecoScale === 'massive' ? (
                  <>
                    <p style={{ margin: '0 0 8px' }}>Massive-scale brain-world with <span style={{ color: 'var(--accent-cyan)' }}>spiking neural networks</span> driving every organism.</p>
                    <p style={{ margin: '0 0 8px' }}>Each organism has <span style={{ color: 'var(--accent-magenta)' }}>{massiveNeuralStats?.neurons_per_organism ?? '...'} neurons</span> connected by <span style={{ color: 'var(--accent-amber)' }}>{massiveNeuralStats ? massiveNeuralStats.total_synapses.toLocaleString() : '...'} synapses</span>.</p>
                    <p style={{ margin: '0 0 8px' }}>World: <span style={{ color: 'var(--accent-green)' }}>{massiveWorldType.replace(/_/g, ' ')}</span></p>
                    {massiveEmergent.length > 0 && (
                      <p style={{ margin: '0 0 8px', color: 'var(--accent-magenta)' }}>
                        {massiveEmergent.length} emergent behavior(s) detected.
                      </p>
                    )}
                    <p style={{ margin: 0, color: 'var(--text-label)' }}>Select a world type and click "Create Brain-World" to start. Organisms make real neural decisions.</p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: '0 0 8px' }}>Multi-species environment with <span style={{ color: 'var(--accent-cyan)' }}>C. elegans</span> and <span style={{ color: 'var(--accent-amber)' }}>Drosophila</span> coexisting.</p>
                    <p style={{ margin: '0 0 8px' }}>Organisms forage for <span style={{ color: 'var(--accent-green)' }}>food sources</span>, compete for resources, and evolve over generations.</p>
                    <p style={{ margin: 0, color: 'var(--text-label)' }}>Use the event triggers in the left panel to perturb the ecosystem and observe emergent behaviors.</p>
                  </>
                )}
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
                <PanelErrorBoundary name="Connectome">
                  <ConnectomeExplorer />
                </PanelErrorBoundary>
                <PanelErrorBoundary name="Species Comparison">
                  <SpeciesComparison />
                </PanelErrorBoundary>
                {researchMode && (
                  <>
                    <PanelErrorBoundary name="Correlation">
                      <CorrelationMatrix />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="PCA">
                      <PopulationProjection />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="PSD">
                      <PowerSpectralDensity />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Consciousness">
                      <ConsciousnessDashboard />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Mutual Information">
                      <MutualInfoMatrix />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Transfer Entropy">
                      <TransferEntropyNetwork />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Causal Analysis">
                      <CausalDashboard />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Connectome Diff">
                      <ConnectomeDiff />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Calcium Imaging">
                      <CalciumOverlay />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary name="Circuit Motifs">
                      <MotifAnalyzer />
                    </PanelErrorBoundary>
                  </>
                )}
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
            <div className="shortcuts-row"><kbd>E</kbd><span>Toggle mode</span></div>
            <div className="shortcuts-row"><kbd>K</kbd><span>Play / Pause</span></div>
            <div className="shortcuts-row"><kbd>,</kbd> / <kbd>.</kbd><span>Step back / forward</span></div>
            <div className="shortcuts-row"><kbd>[</kbd> / <kbd>]</kbd><span>Speed down / up</span></div>
            <div className="shortcuts-row"><kbd>L</kbd><span>Toggle loop</span></div>
            <div className="shortcuts-row"><kbd>Ctrl+Shift+R</kbd><span>Record video</span></div>
            <div className="shortcuts-row"><kbd>?</kbd><span>Show / hide shortcuts</span></div>
            <div className="shortcuts-row"><kbd>Esc</kbd><span>Close panels</span></div>
          </div>
        </div>
      )}

      {/* Share experiment panel */}
      {showSharePanel && (
        <SharePanel
          state={buildShareableState()}
          onClose={() => setShowSharePanel(false)}
        />
      )}

      {/* Protocol timeline & results — positioned above bottom bar */}
      {appMode === 'sim' && (
        <div style={{ position: 'fixed', bottom: 56, left: 180, right: 260, zIndex: 30, pointerEvents: 'auto' }}>
          <PanelErrorBoundary name="Protocol Timeline">
            <ProtocolTimeline />
          </PanelErrorBoundary>
          <PanelErrorBoundary name="Protocol Results">
            <ProtocolResults />
          </PanelErrorBoundary>
        </div>
      )}

      {/* Bottom bar: waveform or generation timeline */}
      <div className="bottom-bar">
        {appMode === 'eco' ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-label)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            {ecoScale === 'massive'
              ? `BRAIN-WORLD LIVE — ${massivePopulation.toLocaleString()} organisms — ${massiveNeuralStats ? massiveNeuralStats.total_neurons.toLocaleString() + ' neurons' : 'initializing...'}`
              : `ECOSYSTEM LIVE — ${(ecoStats?.c_elegans ?? 20) + (ecoStats?.drosophila ?? 5)} organisms`}
          </div>
        ) : appMode === 'evo' ? (
          <GenerationTimeline />
        ) : experiment ? (
          <TransportControls />
        ) : (
          <WaveformSkeleton />
        )}
      </div>
    </div>
  );
}
