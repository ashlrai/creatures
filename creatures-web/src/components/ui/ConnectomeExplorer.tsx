import { useRef, useEffect, useState, useCallback } from 'react';
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

interface NeuronTypeInfo {
  type: string;
  nt: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  sensory: '#22cc66',
  inter: '#3388ff',
  motor: '#ff4422',
};

const BG_COLOR = '#030308';

// ── Component ────────────────────────────────────────────────────────────────

export function ConnectomeExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const organism = experiment?.organism ?? 'c_elegans';

  const [graph, setGraph] = useState<ConnectomeGraph | null>(null);
  const [neuronTypes, setNeuronTypes] = useState<Record<string, NeuronTypeInfo>>({});
  const [selectedNeuron, setSelectedNeuronLocal] = useState<string | null>(null);
  const setSelectedNeuronGlobal = useSimulationStore((s) => s.setSelectedNeuron);
  const [hoveredNeuron, setHoveredNeuron] = useState<string | null>(null);

  // Wrapper that sets both local and global selected neuron
  const setSelectedNeuron = useCallback((id: string | null) => {
    setSelectedNeuronLocal(id);
    setSelectedNeuronGlobal(id);
  }, [setSelectedNeuronGlobal]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // View transform state + version counter to trigger redraws
  const viewRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const [viewVersion, setViewVersion] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; startOX: number; startOY: number } | null>(null);

  // Precomputed layout positions (canvas coords)
  const layoutRef = useRef<Map<string, { cx: number; cy: number }>>(new Map());
  // Adjacency index
  const adjRef = useRef<{ inDeg: Map<string, number>; outDeg: Map<string, number>; neighbors: Map<string, Set<string>> }>({
    inDeg: new Map(), outDeg: new Map(), neighbors: new Map(),
  });

  // ── Data loading ─────────────────────────────────────────────────────────

  /** Build adjacency index from a ConnectomeGraph */
  const buildAdjacency = useCallback((data: ConnectomeGraph) => {
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    const neighbors = new Map<string, Set<string>>();
    for (const n of data.nodes) {
      inDeg.set(n.id, 0);
      outDeg.set(n.id, 0);
      neighbors.set(n.id, new Set());
    }
    for (const e of data.edges) {
      outDeg.set(e.pre, (outDeg.get(e.pre) ?? 0) + 1);
      inDeg.set(e.post, (inDeg.get(e.post) ?? 0) + 1);
      neighbors.get(e.pre)?.add(e.post);
      neighbors.get(e.post)?.add(e.pre);
    }
    adjRef.current = { inDeg, outDeg, neighbors };
  }, []);

  /** Generate a synthetic Drosophila connectome graph */
  const generateFlyGraph = useCallback((nNeurons: number, nSynapses: number) => {
    // Seeded pseudo-random for deterministic generation
    const seededRand = (seed: number) => {
      let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const nodes: ConnectomeNode[] = [];
    const neurotransmitters = ['ACh', 'GABA', 'Glu', 'DA', '5-HT'];

    // ~10% sensory, ~70% interneuron, ~20% motor/descending
    for (let i = 0; i < nNeurons; i++) {
      const r = seededRand(i * 13 + 7);
      let type: 'sensory' | 'inter' | 'motor';
      if (r < 0.10) type = 'sensory';
      else if (r < 0.80) type = 'inter';
      else type = 'motor';

      // Positional layout: sensory at top (low x), motor at bottom (high x)
      let xBase: number;
      if (type === 'sensory') xBase = seededRand(i * 3 + 1) * 0.25;
      else if (type === 'inter') xBase = 0.2 + seededRand(i * 3 + 2) * 0.6;
      else xBase = 0.7 + seededRand(i * 3 + 3) * 0.3;

      nodes.push({
        id: `FBN${String(i).padStart(5, '0')}`,
        type,
        nt: neurotransmitters[Math.floor(seededRand(i * 11 + 5) * neurotransmitters.length)],
        x: xBase,
        y: seededRand(i * 17 + 9) * 0.8 + 0.1,
        z: (seededRand(i * 23 + 11) - 0.5) * 0.002,
      });
    }

    // Generate random edges, biased toward feed-forward (sensory -> inter -> motor)
    const typeOrder: Record<string, number> = { sensory: 0, inter: 1, motor: 2 };
    const edges: ConnectomeEdge[] = [];
    const edgeTypes = ['chemical', 'electrical'];
    const maxAttempts = nSynapses * 3;
    const edgeSet = new Set<string>();

    for (let attempt = 0; attempt < maxAttempts && edges.length < nSynapses; attempt++) {
      const preIdx = Math.floor(seededRand(attempt * 37 + 1) * nNeurons);
      const postIdx = Math.floor(seededRand(attempt * 41 + 3) * nNeurons);
      if (preIdx === postIdx) continue;

      const key = `${preIdx}-${postIdx}`;
      if (edgeSet.has(key)) continue;

      // Bias toward feed-forward connections (70% chance)
      const preOrder = typeOrder[nodes[preIdx].type] ?? 1;
      const postOrder = typeOrder[nodes[postIdx].type] ?? 1;
      if (preOrder > postOrder && seededRand(attempt * 53 + 7) < 0.7) continue;

      edgeSet.add(key);
      edges.push({
        pre: nodes[preIdx].id,
        post: nodes[postIdx].id,
        weight: Math.floor(seededRand(attempt * 59 + 11) * 5) + 1,
        type: edgeTypes[seededRand(attempt * 67 + 13) < 0.85 ? 0 : 1],
      });
    }

    const data: ConnectomeGraph = { nodes, edges, n_neurons: nodes.length, n_edges: edges.length };
    setGraph(data);
    buildAdjacency(data);
    // Reset layout so it recomputes on next render
    layoutRef.current = new Map();
    setSelectedNeuron(null);
    setHoveredNeuron(null);
  }, [buildAdjacency]);

  /** Load C. elegans connectome from API or static file */
  const loadCelegansGraph = useCallback(async () => {
    const base = import.meta.env.BASE_URL || '/';
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
      setGraph(data);
      buildAdjacency(data);
      // Reset layout so it recomputes on next render
      layoutRef.current = new Map();
      setSelectedNeuron(null);
      setHoveredNeuron(null);
    } catch (err) {
      console.warn('ConnectomeExplorer: failed to load C. elegans graph', err);
    }
  }, [buildAdjacency]);

  useEffect(() => {
    if (organism === 'drosophila') {
      generateFlyGraph(experiment?.n_neurons ?? 500, experiment?.n_synapses ?? 10000);
    } else {
      loadCelegansGraph();
    }
  }, [organism, experiment?.n_neurons, experiment?.n_synapses, generateFlyGraph, loadCelegansGraph]);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    const loadTypes = async () => {
      try {
        const res = await fetch(`${base}neuron-types.json`);
        if (res.ok) {
          const data: Record<string, NeuronTypeInfo> = await res.json();
          setNeuronTypes(data);
        }
      } catch {
        // non-critical
      }
    };
    loadTypes();
  }, []);

  // ── Layout computation ───────────────────────────────────────────────────

  const computeLayout = useCallback((nodes: ConnectomeNode[], canvasW: number, canvasH: number) => {
    // Sort by x position (body axis: head=low x, tail=high x)
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    const minX = sorted[0]?.x ?? 0;
    const maxX = sorted[sorted.length - 1]?.x ?? 1;
    const rangeX = maxX - minX || 1;

    const marginY = 24;
    const marginX = 12;
    const usableH = canvasH - marginY * 2;
    const usableW = canvasW - marginX * 2;

    // X band by neuron type (fraction of usableW)
    const typeBands: Record<string, [number, number]> = {
      sensory: [0.08, 0.35],   // far left
      inter:   [0.30, 0.70],   // center
      motor:   [0.60, 0.92],   // far right
    };

    // Seeded pseudo-random for deterministic jitter
    const seededRand = (seed: number) => {
      let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const layout = new Map<string, { cx: number; cy: number }>();
    for (let idx = 0; idx < sorted.length; idx++) {
      const node = sorted[idx];
      // Y = position along body axis (head top, tail bottom)
      const tBody = (node.x - minX) / rangeX;
      const cy = marginY + tBody * usableH + (seededRand(idx * 3 + 1) - 0.5) * 8;

      // X = type-based band with jitter from z-axis and random offset
      const band = typeBands[node.type] ?? [0.3, 0.7];
      const bandCenter = (band[0] + band[1]) / 2;
      const bandWidth = band[1] - band[0];
      // Use z-position for lateral offset within band, plus jitter
      const zOffset = node.z * 200; // normalize small z values
      const jitter = (seededRand(idx * 7 + 3) - 0.5) * 0.6;
      const tBand = Math.max(0, Math.min(1, 0.5 + zOffset + jitter));
      const cx = marginX + (bandCenter + (tBand - 0.5) * bandWidth) * usableW;

      layout.set(node.id, { cx, cy });
    }
    layoutRef.current = layout;
  }, []);

  // ── Canvas rendering ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Recompute layout if needed
    if (layoutRef.current.size === 0) {
      computeLayout(graph.nodes, w, h);
    }
    const layout = layoutRef.current;
    const view = viewRef.current;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(view.offsetX + w / 2, view.offsetY + h / 2);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-w / 2, -h / 2);

    // Firing rates lookup
    const firingRates = frame?.firing_rates ?? [];
    const rateMap = new Map<string, number>();
    graph.nodes.forEach((n, i) => {
      rateMap.set(n.id, firingRates[i] ?? 0);
    });

    // Selected neuron neighbors
    const selectedNeighbors = selectedNeuron ? adjRef.current.neighbors.get(selectedNeuron) : null;

    // Draw synapse lines (only between active neurons, or for selected neuron)
    ctx.lineWidth = 0.5;
    for (const edge of graph.edges) {
      const prePos = layout.get(edge.pre);
      const postPos = layout.get(edge.post);
      if (!prePos || !postPos) continue;

      const preRate = rateMap.get(edge.pre) ?? 0;
      const postRate = rateMap.get(edge.post) ?? 0;

      const isSelectedEdge = selectedNeuron && (edge.pre === selectedNeuron || edge.post === selectedNeuron);
      const bothActive = preRate > 1 && postRate > 1;

      if (!isSelectedEdge && !bothActive) continue;

      if (isSelectedEdge) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
      } else {
        const alpha = Math.min(0.15, (preRate + postRate) / 200);
        ctx.strokeStyle = `rgba(100, 150, 220, ${alpha})`;
        ctx.lineWidth = 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(prePos.cx, prePos.cy);
      ctx.lineTo(postPos.cx, postPos.cy);
      ctx.stroke();
    }

    // Draw neurons
    for (const node of graph.nodes) {
      const pos = layout.get(node.id);
      if (!pos) continue;

      const rate = rateMap.get(node.id) ?? 0;
      const t = Math.min(rate / 80, 1);
      const baseColor = TYPE_COLORS[node.type] ?? '#666666';
      const isSelected = node.id === selectedNeuron;
      const isNeighbor = selectedNeighbors?.has(node.id) ?? false;
      const isHovered = node.id === hoveredNeuron;

      // Radius: 4-8px based on firing rate
      const radius = 4 + t * 4;

      // Dim non-related neurons when something is selected
      let alpha = 1;
      if (selectedNeuron && !isSelected && !isNeighbor) {
        alpha = 0.2;
      }

      // Glow for active neurons
      if (t > 0.2) {
        ctx.save();
        ctx.globalAlpha = t * 0.4 * alpha;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(pos.cx, pos.cy, radius * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();
        ctx.restore();
      }

      // Neuron circle
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pos.cx, pos.cy, radius, 0, Math.PI * 2);

      if (t > 0.1) {
        // Active: brighter version of type color
        const brightness = 0.4 + t * 0.6;
        ctx.fillStyle = adjustBrightness(baseColor, brightness);
      } else {
        // Quiet: dim
        ctx.fillStyle = adjustBrightness(baseColor, 0.15);
      }
      ctx.fill();

      // Selection ring
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.arc(pos.cx, pos.cy, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Label in corner
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '10px monospace';
    ctx.fillText(`${experiment?.n_neurons ?? graph.nodes.length} neurons | ${experiment?.n_synapses ?? graph.edges.length} synapses`, 6, h - 6);
  }, [frame, graph, selectedNeuron, hoveredNeuron, computeLayout, viewVersion, experiment]);

  // ── Hit testing ──────────────────────────────────────────────────────────

  const hitTest = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const rawX = (clientX - rect.left) * scaleX;
    const rawY = (clientY - rect.top) * scaleY;

    const view = viewRef.current;
    const w = canvas.width;
    const h = canvas.height;

    // Reverse the view transform
    const canvasX = (rawX - view.offsetX - w / 2) / view.scale + w / 2;
    const canvasY = (rawY - view.offsetY - h / 2) / view.scale + h / 2;

    const layout = layoutRef.current;
    let closest: string | null = null;
    let closestDist = 12; // hit radius in canvas px

    for (const node of graph.nodes) {
      const pos = layout.get(node.id);
      if (!pos) continue;
      const dx = canvasX - pos.cx;
      const dy = canvasY - pos.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = node.id;
      }
    }
    return closest;
  }, [graph]);

  // ── Mouse handlers ───────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      viewRef.current.offsetX = dragRef.current.startOX + dx;
      viewRef.current.offsetY = dragRef.current.startOY + dy;
      setViewVersion(v => v + 1);
      return;
    }

    const hit = hitTest(e.clientX, e.clientY);
    setHoveredNeuron(hit);
  }, [hitTest]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOX: viewRef.current.offsetX,
      startOY: viewRef.current.offsetY,
    };
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const dx = Math.abs(e.clientX - dragRef.current.startX);
      const dy = Math.abs(e.clientY - dragRef.current.startY);
      dragRef.current = null;

      // If barely moved, treat as click
      if (dx < 3 && dy < 3) {
        const hit = hitTest(e.clientX, e.clientY);
        setSelectedNeuron(selectedNeuron === hit ? null : hit);
      }
    }
  }, [hitTest, selectedNeuron, setSelectedNeuron]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(5, viewRef.current.scale * delta));
    viewRef.current.scale = newScale;
    setViewVersion(v => v + 1);
  }, []);

  // ── Stimulate / Lesion commands ──────────────────────────────────────────

  const sendWsCommand = useCallback((cmd: Record<string, unknown>) => {
    // Access the WebSocket via a custom event — App.tsx listens
    window.dispatchEvent(new CustomEvent('neurevo-command', { detail: cmd }));
  }, []);

  const handleStimulate = useCallback(() => {
    if (!selectedNeuron) return;
    sendWsCommand({ type: 'stimulate', neuron_ids: [selectedNeuron], current: 30 });
  }, [selectedNeuron, sendWsCommand]);

  const handleLesion = useCallback(() => {
    if (!selectedNeuron) return;
    sendWsCommand({ type: 'lesion_neuron', neuron_id: selectedNeuron });
  }, [selectedNeuron, sendWsCommand]);

  // ── Resize observer for canvas dimensions ────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = 1; // keep 1:1 for perf on canvas
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        // Recompute layout
        if (graph) {
          computeLayout(graph.nodes, canvas.width, canvas.height);
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [graph, computeLayout]);

  // ── Neuron info lookup ───────────────────────────────────────────────────

  function getNeuronInfo(neuronId: string) {
    const node = graph?.nodes.find((n) => n.id === neuronId);
    const typeInfo = neuronTypes[neuronId];
    let rate = 0;
    if (frame?.firing_rates && graph) {
      const idx = graph.nodes.findIndex((n) => n.id === neuronId);
      if (idx >= 0) rate = frame.firing_rates[idx] ?? 0;
    }
    return {
      name: neuronId,
      type: node?.type ?? typeInfo?.type ?? 'unknown',
      nt: node?.nt ?? typeInfo?.nt ?? 'unknown',
      rate,
    };
  }

  const selectedInfo = selectedNeuron ? {
    ...getNeuronInfo(selectedNeuron),
    inDeg: adjRef.current.inDeg.get(selectedNeuron) ?? 0,
    outDeg: adjRef.current.outDeg.get(selectedNeuron) ?? 0,
  } : null;

  const tooltipInfo = hoveredNeuron && hoveredNeuron !== selectedNeuron
    ? getNeuronInfo(hoveredNeuron)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="glass"
        style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative', minHeight: 200, cursor: dragRef.current ? 'grabbing' : 'crosshair' }}
      >
        <div className="glass-label" style={{ position: 'absolute', top: 8, left: 10, zIndex: 2 }}>
          Connectome Explorer — {organism === 'drosophila' ? 'Drosophila' : 'C. elegans'}
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHoveredNeuron(null); dragRef.current = null; }}
          onWheel={handleWheel}
        />

        {/* Tooltip */}
        {tooltipInfo && (
          <div
            className="connectome-tooltip"
            style={{
              left: mousePos.x - (containerRef.current?.getBoundingClientRect().left ?? 0) + 12,
              top: mousePos.y - (containerRef.current?.getBoundingClientRect().top ?? 0) - 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12 }}>{tooltipInfo.name}</div>
            <div style={{ fontSize: 10, color: TYPE_COLORS[tooltipInfo.type] ?? '#888' }}>
              {tooltipInfo.type} | {tooltipInfo.nt ?? 'unknown'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-label)' }}>
              Firing: {tooltipInfo.rate.toFixed(1)} Hz
            </div>
          </div>
        )}
      </div>

      {/* Selected neuron detail */}
      {selectedInfo && (
        <div className="neuron-detail">
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {selectedInfo.name}
          </div>
          <div style={{ fontSize: 11, color: TYPE_COLORS[selectedInfo.type] ?? '#888', marginTop: 2 }}>
            {selectedInfo.type} | {selectedInfo.nt}
          </div>
          <div className="stat-row" style={{ marginTop: 6 }}>
            <span className="stat-label">Firing rate</span>
            <span className="stat-value stat-cyan" style={{ fontSize: 13 }}>
              {selectedInfo.rate.toFixed(1)} Hz
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">In-degree</span>
            <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedInfo.inDeg}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Out-degree</span>
            <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedInfo.outDeg}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} onClick={handleStimulate}>
              Stimulate
            </button>
            <button className="btn btn-danger" style={{ flex: 1, fontSize: 11 }} onClick={handleLesion}>
              Lesion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function adjustBrightness(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}
