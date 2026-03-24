import { useEffect, useState, useCallback, useRef } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConnectomeNode {
  id: string;
  type: 'sensory' | 'inter' | 'motor';
  nt: string | null;
  x: number;
  y: number;
  z: number;
}

interface ConnectomeEdge {
  pre: string;
  post: string;
  weight: number;
  type: string;
}

interface ConnectomeGraph {
  nodes: ConnectomeNode[];
  edges: ConnectomeEdge[];
  n_neurons: number;
  n_edges: number;
}

interface ConnectionEntry {
  neuronId: string;
  weight: number;
  type: string;
}

interface NeuronProfile {
  id: string;
  type: string;
  nt: string | null;
  firingRate: number;
  presynaptic: ConnectionEntry[];
  postsynaptic: ConnectionEntry[];
  inDegree: number;
  outDegree: number;
  hubScore: number;
  layerDepth: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  sensory: '#22cc66',
  inter: '#3388ff',
  motor: '#ff4422',
};

const TYPE_LABELS: Record<string, string> = {
  sensory: 'SENSORY',
  inter: 'INTER',
  motor: 'MOTOR',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Classify firing pattern based on rate */
function classifyPattern(rate: number): string {
  if (rate < 1) return 'silent';
  if (rate > 40) return 'bursting';
  return 'tonic';
}

/** Compute BFS layer depth from sensory neurons */
function computeLayerDepth(
  neuronId: string,
  nodes: ConnectomeNode[],
  edges: ConnectomeEdge[],
): number {
  // Build adjacency: pre -> post (forward direction)
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.pre)) adj.set(e.pre, []);
    adj.get(e.pre)!.push(e.post);
  }

  // BFS from all sensory neurons
  const sensoryIds = nodes.filter((n) => n.type === 'sensory').map((n) => n.id);
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const sid of sensoryIds) {
    depth.set(sid, 0);
    queue.push(sid);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const d = depth.get(current)!;
    for (const neighbor of adj.get(current) ?? []) {
      if (!depth.has(neighbor)) {
        depth.set(neighbor, d + 1);
        queue.push(neighbor);
      }
    }
  }

  return depth.get(neuronId) ?? -1;
}

// ── Component ────────────────────────────────────────────────────────────────

export function NeuronDetailPanel() {
  const selectedNeuron = useSimulationStore((s) => s.selectedNeuron);
  const setSelectedNeuron = useSimulationStore((s) => s.setSelectedNeuron);
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);

  const [graph, setGraph] = useState<ConnectomeGraph | null>(null);
  const [profile, setProfile] = useState<NeuronProfile | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load connectome graph once
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    let cancelled = false;

    const load = async () => {
      try {
        let data: ConnectomeGraph;
        try {
          const res = await fetch('/api/morphology/connectome-graph');
          if (!res.ok) throw new Error('api');
          data = await res.json();
        } catch {
          const res = await fetch(`${base}connectome-graph.json`);
          if (!res.ok) throw new Error('static');
          data = await res.json();
        }
        if (!cancelled) setGraph(data);
      } catch (err) {
        console.warn('NeuronDetailPanel: failed to load connectome graph', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // Build profile when neuron is selected
  useEffect(() => {
    if (!selectedNeuron || !graph) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    const buildProfile = async () => {
      const node = graph.nodes.find((n) => n.id === selectedNeuron);
      if (!node) {
        setProfile(null);
        return;
      }

      // Try API first
      try {
        const simId = experiment?.id;
        if (simId) {
          const res = await fetch(`/api/analysis/${simId}/neuron/${selectedNeuron}`);
          if (res.ok) {
            const apiData = await res.json();
            if (!cancelled) {
              setProfile({
                id: selectedNeuron,
                type: apiData.type ?? node.type,
                nt: apiData.neurotransmitter ?? node.nt,
                firingRate: apiData.firing_rate ?? 0,
                presynaptic: apiData.presynaptic ?? [],
                postsynaptic: apiData.postsynaptic ?? [],
                inDegree: apiData.in_degree ?? 0,
                outDegree: apiData.out_degree ?? 0,
                hubScore: apiData.hub_score ?? 0,
                layerDepth: apiData.layer_depth ?? 0,
              });
            }
            return;
          }
        }
      } catch {
        // Fall through to local computation
      }

      // Also try the standalone endpoint
      try {
        const res = await fetch(`/api/neurons/${selectedNeuron}/profile`);
        if (res.ok) {
          const apiData = await res.json();
          if (!cancelled) {
            setProfile({
              id: selectedNeuron,
              type: apiData.type ?? node.type,
              nt: apiData.neurotransmitter ?? node.nt,
              firingRate: apiData.firing_rate ?? 0,
              presynaptic: apiData.presynaptic ?? [],
              postsynaptic: apiData.postsynaptic ?? [],
              inDegree: apiData.in_degree ?? 0,
              outDegree: apiData.out_degree ?? 0,
              hubScore: apiData.hub_score ?? 0,
              layerDepth: apiData.layer_depth ?? 0,
            });
          }
          return;
        }
      } catch {
        // Fall through to local computation
      }

      // Build from local connectome data
      const preEdges = graph.edges
        .filter((e) => e.post === selectedNeuron)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map((e) => ({ neuronId: e.pre, weight: e.weight, type: e.type }));

      const postEdges = graph.edges
        .filter((e) => e.pre === selectedNeuron)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map((e) => ({ neuronId: e.post, weight: e.weight, type: e.type }));

      const inDegree = graph.edges.filter((e) => e.post === selectedNeuron).length;
      const outDegree = graph.edges.filter((e) => e.pre === selectedNeuron).length;
      const totalDegree = inDegree + outDegree;
      const maxPossible = (graph.nodes.length - 1) * 2;
      const hubScore = maxPossible > 0 ? totalDegree / maxPossible : 0;

      const layerDepth = computeLayerDepth(selectedNeuron, graph.nodes, graph.edges);

      // Get firing rate from current frame
      const nodeIdx = graph.nodes.findIndex((n) => n.id === selectedNeuron);
      const firingRate = (nodeIdx >= 0 && frame?.firing_rates)
        ? (frame.firing_rates[nodeIdx] ?? 0)
        : 0;

      if (!cancelled) {
        setProfile({
          id: selectedNeuron,
          type: node.type,
          nt: node.nt,
          firingRate,
          presynaptic: preEdges,
          postsynaptic: postEdges,
          inDegree,
          outDegree,
          hubScore,
          layerDepth,
        });
      }
    };

    buildProfile();
    return () => { cancelled = true; };
  }, [selectedNeuron, graph, experiment?.id, frame?.firing_rates]);

  // Update firing rate from live frames (without rebuilding entire profile)
  useEffect(() => {
    if (!profile || !graph || !frame?.firing_rates) return;
    const nodeIdx = graph.nodes.findIndex((n) => n.id === profile.id);
    if (nodeIdx >= 0) {
      const rate = frame.firing_rates[nodeIdx] ?? 0;
      if (Math.abs(rate - profile.firingRate) > 0.1) {
        setProfile((prev) => prev ? { ...prev, firingRate: rate } : null);
      }
    }
  }, [frame?.firing_rates, graph, profile?.id]);

  // Open/close animation
  useEffect(() => {
    if (selectedNeuron) {
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => setIsOpen(true));
    } else {
      setIsOpen(false);
    }
  }, [selectedNeuron]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedNeuron) {
        setSelectedNeuron(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNeuron, setSelectedNeuron]);

  // Close on click outside
  useEffect(() => {
    if (!selectedNeuron) return;

    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if clicking on the 3D canvas or connectome (those set selectedNeuron)
        const target = e.target as HTMLElement;
        if (target.tagName === 'CANVAS' || target.closest('.connectome-explorer')) return;
        setSelectedNeuron(null);
      }
    };

    // Delay adding the listener so the click that opened the panel doesn't close it
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [selectedNeuron, setSelectedNeuron]);

  // Navigate to a connected neuron
  const handleConnectionClick = useCallback(
    (neuronId: string) => {
      setSelectedNeuron(neuronId);
    },
    [setSelectedNeuron],
  );

  const handleClose = useCallback(() => {
    setSelectedNeuron(null);
  }, [setSelectedNeuron]);

  // Always render the panel container (for slide animation), but control visibility
  const showPanel = selectedNeuron !== null;

  return (
    <div
      ref={panelRef}
      className={`neuron-detail-panel ${isOpen && showPanel ? 'neuron-detail-panel--open' : ''}`}
      role="dialog"
      aria-label="Neuron detail panel"
      aria-hidden={!showPanel}
    >
      {!profile ? (
        <div className="neuron-detail-panel__empty">
          <div style={{ fontSize: 13, color: 'var(--text-label)', textAlign: 'center', padding: '40px 16px' }}>
            {selectedNeuron ? (
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
            ) : (
              'Select a neuron to inspect'
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="neuron-detail-panel__header">
            <div style={{ flex: 1 }}>
              <div className="neuron-detail-panel__id">{profile.id}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <span
                  className="neuron-detail-panel__type-badge"
                  style={{
                    color: TYPE_COLORS[profile.type] ?? '#888',
                    background: `${TYPE_COLORS[profile.type] ?? '#888'}18`,
                    borderColor: `${TYPE_COLORS[profile.type] ?? '#888'}44`,
                  }}
                >
                  {TYPE_LABELS[profile.type] ?? profile.type.toUpperCase()}
                </span>
                {profile.nt && (
                  <span className="neuron-detail-panel__nt">{profile.nt}</span>
                )}
              </div>
            </div>
            <button
              className="neuron-detail-panel__close"
              onClick={handleClose}
              aria-label="Close panel"
              title="Close (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Firing info */}
          <div className="neuron-detail-panel__section">
            <div className="neuron-detail-panel__section-label">Firing Activity</div>
            <div className="stat-row">
              <span className="stat-label">Firing rate</span>
              <span className="stat-value stat-cyan" style={{ fontSize: 14 }}>
                {profile.firingRate.toFixed(1)} Hz
              </span>
            </div>
            <div className="neuron-detail-panel__activity-bar">
              <div
                className="neuron-detail-panel__activity-fill"
                style={{
                  width: `${Math.min(100, (profile.firingRate / 80) * 100)}%`,
                  background: profile.firingRate > 40
                    ? 'var(--accent-magenta)'
                    : profile.firingRate > 1
                      ? 'var(--accent-cyan)'
                      : 'rgba(255,255,255,0.1)',
                }}
              />
            </div>
            <div className="stat-row" style={{ marginTop: 4 }}>
              <span className="stat-label">Pattern</span>
              <span
                className="neuron-detail-panel__pattern-tag"
                data-pattern={classifyPattern(profile.firingRate)}
              >
                {classifyPattern(profile.firingRate)}
              </span>
            </div>
          </div>

          {/* Connections */}
          <div className="neuron-detail-panel__section">
            <div className="neuron-detail-panel__section-label">
              Presynaptic inputs ({profile.inDegree})
            </div>
            {profile.presynaptic.length === 0 ? (
              <div className="neuron-detail-panel__no-connections">No inputs</div>
            ) : (
              <div className="neuron-detail-panel__connection-list">
                {profile.presynaptic.map((c) => (
                  <button
                    key={c.neuronId}
                    className="neuron-detail-panel__connection-row"
                    onClick={() => handleConnectionClick(c.neuronId)}
                    title={`Navigate to ${c.neuronId}`}
                  >
                    <span className="neuron-detail-panel__connection-id">{c.neuronId}</span>
                    <span className="neuron-detail-panel__connection-weight">
                      w={c.weight}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="neuron-detail-panel__section">
            <div className="neuron-detail-panel__section-label">
              Postsynaptic outputs ({profile.outDegree})
            </div>
            {profile.postsynaptic.length === 0 ? (
              <div className="neuron-detail-panel__no-connections">No outputs</div>
            ) : (
              <div className="neuron-detail-panel__connection-list">
                {profile.postsynaptic.map((c) => (
                  <button
                    key={c.neuronId}
                    className="neuron-detail-panel__connection-row"
                    onClick={() => handleConnectionClick(c.neuronId)}
                    title={`Navigate to ${c.neuronId}`}
                  >
                    <span className="neuron-detail-panel__connection-id">{c.neuronId}</span>
                    <span className="neuron-detail-panel__connection-weight">
                      w={c.weight}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="neuron-detail-panel__section">
            <div className="neuron-detail-panel__section-label">Graph Metrics</div>
            <div className="stat-row">
              <span className="stat-label">In-degree</span>
              <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {profile.inDegree}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Out-degree</span>
              <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {profile.outDegree}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Hub score</span>
              <span className="stat-value" style={{ fontSize: 13, color: 'var(--accent-amber)' }}>
                {profile.hubScore.toFixed(4)}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Layer depth</span>
              <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {profile.layerDepth >= 0 ? profile.layerDepth : 'N/A'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
