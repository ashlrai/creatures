import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PARTICLES = 200;
const TRAVEL_DURATION_MS = 300;
const PARTICLE_RADIUS = 3;

/** NT color palette (CSS strings) matching SpikeParticles.tsx */
const NT_COLORS: Record<string, string> = {
  ACh: 'rgba(26, 212, 240, 0.9)',
  Acetylcholine: 'rgba(26, 212, 240, 0.9)',
  GABA: 'rgba(204, 51, 170, 0.9)',
  Glu: 'rgba(51, 221, 85, 0.9)',
  Glutamate: 'rgba(51, 221, 85, 0.9)',
  DA: 'rgba(255, 136, 34, 0.9)',
  Dopamine: 'rgba(255, 136, 34, 0.9)',
  '5-HT': 'rgba(221, 187, 34, 0.9)',
  Serotonin: 'rgba(221, 187, 34, 0.9)',
};
const DEFAULT_COLOR = 'rgba(200, 200, 255, 0.9)';

const NT_GLOW_COLORS: Record<string, string> = {
  ACh: '#1ad4f0',
  Acetylcholine: '#1ad4f0',
  GABA: '#cc33aa',
  Glu: '#33dd55',
  Glutamate: '#33dd55',
  DA: '#ff8822',
  Dopamine: '#ff8822',
  '5-HT': '#ddbb22',
  Serotonin: '#ddbb22',
};
const DEFAULT_GLOW = '#ccccff';

// ── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  color: string;
  glowColor: string;
}

interface LayoutNode {
  cx: number;
  cy: number;
}

interface EdgeInfo {
  preIdx: number;
  postIdx: number;
  nt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function seededRand(seed: number): number {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Build a circular neuron layout and synthetic edge list.
 * This mirrors ConnectomeExplorer's circular layout approach.
 */
function buildLayout(nNeurons: number, w: number, h: number): { nodes: LayoutNode[]; edges: EdgeInfo[] } {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.4;
  const ntList = ['ACh', 'GABA', 'Glu', 'DA', '5-HT'];

  const nodes: LayoutNode[] = [];
  for (let i = 0; i < nNeurons; i++) {
    const angle = (2 * Math.PI * i) / nNeurons - Math.PI / 2;
    nodes.push({
      cx: cx + Math.cos(angle) * radius,
      cy: cy + Math.sin(angle) * radius,
    });
  }

  // Build synthetic outgoing edges (sparse: ~5 per neuron on average)
  const edges: EdgeInfo[] = [];
  const nEdges = Math.min(nNeurons * 5, 3000);
  const edgeSet = new Set<string>();

  for (let attempt = 0; attempt < nEdges * 2 && edges.length < nEdges; attempt++) {
    const pre = Math.floor(seededRand(attempt * 37 + 1) * nNeurons);
    const post = Math.floor(seededRand(attempt * 53 + 3) * nNeurons);
    if (pre === post) continue;
    const key = `${pre}-${post}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);

    const nt = ntList[Math.floor(seededRand(attempt * 67 + 7) * ntList.length)];
    edges.push({ preIdx: pre, postIdx: post, nt });
  }

  return { nodes, edges };
}

/** Build an adjacency map: neuron index -> array of edges where it is pre */
function buildOutgoingMap(edges: EdgeInfo[]): Map<number, EdgeInfo[]> {
  const map = new Map<number, EdgeInfo[]>();
  for (const e of edges) {
    let list = map.get(e.preIdx);
    if (!list) {
      list = [];
      map.set(e.preIdx, list);
    }
    list.push(e);
  }
  return map;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpikeFlowOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const layoutRef = useRef<{ nodes: LayoutNode[]; edges: EdgeInfo[]; outgoing: Map<number, EdgeInfo[]> } | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ w: 400, h: 300 });

  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 302;

  // Build layout once per neuron count / canvas size
  const { w, h } = canvasSize;
  useMemo(() => {
    const layout = buildLayout(nNeurons, w, h);
    layoutRef.current = {
      ...layout,
      outgoing: buildOutgoingMap(layout.edges),
    };
  }, [nNeurons, w, h]);

  // Spawn particles on new spikes
  useEffect(() => {
    if (!enabled || !frame?.spikes || frame.spikes.length === 0) return;
    const layout = layoutRef.current;
    if (!layout) return;

    const now = performance.now();
    const particles = particlesRef.current;

    for (const spikeIdx of frame.spikes) {
      if (spikeIdx < 0 || spikeIdx >= layout.nodes.length) continue;

      const outEdges = layout.outgoing.get(spikeIdx);
      if (!outEdges || outEdges.length === 0) continue;

      const from = layout.nodes[spikeIdx];

      // Spawn a particle for each outgoing edge (up to 5 random to avoid overload)
      const edgesToUse = outEdges.length <= 5
        ? outEdges
        : outEdges.filter((_, i) => seededRand(now + spikeIdx * 13 + i * 7) < 5 / outEdges.length);

      for (const edge of edgesToUse) {
        const to = layout.nodes[edge.postIdx];
        if (!to) continue;

        particles.push({
          fromX: from.cx,
          fromY: from.cy,
          toX: to.cx,
          toY: to.cy,
          startTime: now,
          color: NT_COLORS[edge.nt] ?? DEFAULT_COLOR,
          glowColor: NT_GLOW_COLORS[edge.nt] ?? DEFAULT_GLOW,
        });
      }
    }

    // Cap particles
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }, [frame, enabled]);

  // Animation loop
  useEffect(() => {
    if (!enabled) return;

    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const cw = canvas.width;
      const ch = canvas.height;

      ctx.clearRect(0, 0, cw, ch);

      const now = performance.now();
      const particles = particlesRef.current;

      // Filter out expired particles
      let writeIdx = 0;
      for (let i = 0; i < particles.length; i++) {
        const age = now - particles[i].startTime;
        if (age < TRAVEL_DURATION_MS) {
          particles[writeIdx++] = particles[i];
        }
      }
      particles.length = writeIdx;

      // Draw particles
      for (const p of particles) {
        const t = (now - p.startTime) / TRAVEL_DURATION_MS;
        // Ease-out interpolation
        const eased = 1 - (1 - t) * (1 - t);
        const x = p.fromX + (p.toX - p.fromX) * eased;
        const y = p.fromY + (p.toY - p.fromY) * eased;
        const alpha = 1 - t; // fade out as it arrives

        // Glow
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, PARTICLE_RADIUS * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = p.glowColor;
        ctx.fill();
        ctx.restore();

        // Core dot
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, PARTICLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
        setCanvasSize({ w: width, h: height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleToggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        // Clearing particles on disable
        particlesRef.current.length = 0;
      }
      return !prev;
    });
  }, []);

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary, #ccd)',
            letterSpacing: '0.04em',
          }}
        >
          Spike Flow
        </span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: 'var(--text-secondary, #99a)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
            style={{
              width: 12,
              height: 12,
              accentColor: 'var(--accent-cyan, #0ff)',
              cursor: 'pointer',
            }}
          />
          Show spike flow
        </label>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 180,
          position: 'relative',
          background: enabled ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)',
          borderRadius: '0 0 4px 4px',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            opacity: enabled ? 1 : 0.3,
            transition: 'opacity 0.2s',
          }}
        />

        {!enabled && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-label, #667)',
              fontSize: 11,
              fontStyle: 'italic',
              pointerEvents: 'none',
            }}
          >
            Spike flow disabled
          </div>
        )}

        {/* Active particle count badge */}
        {enabled && (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              right: 6,
              fontSize: 9,
              color: 'rgba(140, 170, 200, 0.4)',
              fontFamily: 'var(--font-mono, monospace)',
              pointerEvents: 'none',
            }}
          >
            {nNeurons} neurons
          </div>
        )}
      </div>
    </div>
  );
}
