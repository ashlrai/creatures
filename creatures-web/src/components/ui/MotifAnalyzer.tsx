import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useUIPreferencesStore } from '../../stores/uiPreferencesStore';
import { CollapsiblePanel } from './CollapsiblePanel';

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

interface Motif {
  name: string;
  description: string;
  /** Adjacency pattern for 3-node subgraph: [AB, AC, BA, BC, CA, CB] */
  pattern: [boolean, boolean, boolean, boolean, boolean, boolean];
  color: string;
  icon: string;
}

interface MotifInstance {
  motif: string;
  neurons: [number, number, number];
  neuronIds: [string, string, string];
  strength: number;
}

interface MotifResult {
  motif: Motif;
  count: number;
  expected: number;
  zScore: number;
  instances: MotifInstance[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MOTIFS: Motif[] = [
  {
    name: 'Feedforward Chain',
    description: 'A->B->C, simple signal relay',
    pattern: [true, false, false, true, false, false],
    color: '#00d4ff',
    icon: 'A->B->C',
  },
  {
    name: 'Feedforward Inhibition',
    description: 'A->B, A->C, C-|B',
    pattern: [true, true, false, false, true, false],
    color: '#ff6b4a',
    icon: 'A->B, A->C->B',
  },
  {
    name: 'Recurrent Excitation',
    description: 'A<->B mutual excitation',
    pattern: [true, false, true, false, false, false],
    color: '#4aff8b',
    icon: 'A<->B',
  },
  {
    name: 'Feedback Inhibition',
    description: 'A->B->C->A loop',
    pattern: [true, false, false, true, false, true],
    color: '#ffaa00',
    icon: 'A->B->C->A',
  },
  {
    name: 'Convergent Input',
    description: 'A->C, B->C, fan-in',
    pattern: [false, true, false, true, false, false],
    color: '#cc44ff',
    icon: 'A->C<-B',
  },
  {
    name: 'Divergent Output',
    description: 'A->B, A->C, fan-out',
    pattern: [true, true, false, false, false, false],
    color: '#ff4488',
    icon: 'A->B,C',
  },
];

const MAX_NEURONS = 100;
const CANVAS_SIZE = 220;
const BG_COLOR = '#030308';

// ── Motif Detection ──────────────────────────────────────────────────────────

/**
 * Build an NxN boolean adjacency matrix from edges.
 * Returns the matrix and a parallel weight matrix.
 */
function buildAdjacencyMatrix(
  nodes: ConnectomeNode[],
  edges: ConnectomeEdge[],
): { adj: boolean[][]; weights: number[][]; idToIdx: Map<string, number> } {
  const n = nodes.length;
  const adj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  const weights: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const idToIdx = new Map<string, number>();
  nodes.forEach((node, i) => idToIdx.set(node.id, i));

  for (const edge of edges) {
    const i = idToIdx.get(edge.pre);
    const j = idToIdx.get(edge.post);
    if (i !== undefined && j !== undefined && i !== j) {
      adj[i][j] = true;
      weights[i][j] += Math.abs(edge.weight);
    }
  }
  return { adj, weights, idToIdx };
}

/**
 * Compute the probability of observing a specific motif pattern in an
 * Erdos-Renyi random graph with edge probability p.
 * Pattern is [AB, AC, BA, BC, CA, CB].
 */
function motifProbability(pattern: boolean[], p: number): number {
  let prob = 1;
  for (const edgePresent of pattern) {
    prob *= edgePresent ? p : (1 - p);
  }
  return prob;
}

/**
 * Detect all 3-node motif instances in the graph.
 * Caps at MAX_NEURONS for performance.
 */
function detectMotifs(graph: ConnectomeGraph): {
  results: MotifResult[];
  density: number;
  totalMotifs: number;
} {
  const cappedNodes = graph.nodes.slice(0, MAX_NEURONS);
  const cappedEdges = graph.edges.filter((e) => {
    const nodeIds = new Set(cappedNodes.map((n) => n.id));
    return nodeIds.has(e.pre) && nodeIds.has(e.post);
  });

  const { adj, weights } = buildAdjacencyMatrix(cappedNodes, cappedEdges);
  const n = cappedNodes.length;

  // Edge density
  const maxEdges = n * (n - 1);
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (adj[i][j]) edgeCount++;
    }
  }
  const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

  // Initialize result accumulators per motif
  const motifInstances: Map<string, MotifInstance[]> = new Map();
  for (const motif of MOTIFS) {
    motifInstances.set(motif.name, []);
  }

  // Enumerate all ordered triples i < j < k
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        // The 6 possible directed edges among (i, j, k)
        // For each motif, we need to check all 6 permutations of
        // (A, B, C) -> (i, j, k) to handle the ordered triple correctly.
        // But since our triples are ordered i<j<k, we check all 6 role assignments.
        const perms: [number, number, number][] = [
          [i, j, k], [i, k, j], [j, i, k], [j, k, i], [k, i, j], [k, j, i],
        ];

        for (const motif of MOTIFS) {
          let matched = false;
          for (const [a, b, c] of perms) {
            if (matched) break;
            // pattern: [AB, AC, BA, BC, CA, CB]
            const edges = [
              adj[a][b], adj[a][c], adj[b][a], adj[b][c], adj[c][a], adj[c][b],
            ];
            // Exact match: every edge in pattern must match
            let isMatch = true;
            for (let e = 0; e < 6; e++) {
              if (motif.pattern[e] !== edges[e]) {
                isMatch = false;
                break;
              }
            }
            if (isMatch) {
              matched = true;
              const strength =
                (motif.pattern[0] ? weights[a][b] : 0) +
                (motif.pattern[1] ? weights[a][c] : 0) +
                (motif.pattern[2] ? weights[b][a] : 0) +
                (motif.pattern[3] ? weights[b][c] : 0) +
                (motif.pattern[4] ? weights[c][a] : 0) +
                (motif.pattern[5] ? weights[c][b] : 0);

              motifInstances.get(motif.name)!.push({
                motif: motif.name,
                neurons: [i, j, k],
                neuronIds: [cappedNodes[i].id, cappedNodes[j].id, cappedNodes[k].id],
                strength,
              });
            }
          }
        }
      }
    }
  }

  // Compute expected counts and Z-scores
  const nTriples = (n * (n - 1) * (n - 2)) / 6; // C(n, 3)
  let totalMotifs = 0;

  const results: MotifResult[] = MOTIFS.map((motif) => {
    const instances = motifInstances.get(motif.name) ?? [];
    const count = instances.length;
    totalMotifs += count;

    // Each triple can be assigned 6 role orderings, so expected count
    // accounts for the 6 permutation checks we perform.
    const pMotif = motifProbability(motif.pattern, density);
    // Number of distinguishable role assignments depends on motif symmetry.
    // For simplicity, multiply nTriples by 6 (permutations) to get the
    // effective number of trials, since we check all 6 orderings per triple.
    // However, we only record the *first* match per triple, so expected
    // count = nTriples * P(at least one of 6 permutations matches).
    // For sparse graphs this is approximately nTriples * 6 * pMotif.
    const expected = nTriples * 6 * pMotif;
    const variance = expected * (1 - 6 * pMotif); // binomial variance approximation
    const stdDev = Math.sqrt(Math.max(variance, 1));
    const zScore = expected > 0 ? (count - expected) / stdDev : 0;

    // Sort instances by strength descending
    instances.sort((a, b) => b.strength - a.strength);

    return { motif, count, expected, zScore, instances };
  });

  return { results, density, totalMotifs };
}

// ── Mock Graph Generator ─────────────────────────────────────────────────────

function generateMockGraph(nNeurons: number): ConnectomeGraph {
  const seededRand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const n = Math.min(nNeurons, MAX_NEURONS);
  const neurotransmitters = ['ACh', 'GABA', 'Glu', 'DA', '5-HT'];
  const nodes: ConnectomeNode[] = [];

  for (let i = 0; i < n; i++) {
    const r = seededRand(i * 13 + 7);
    const type: 'sensory' | 'inter' | 'motor' =
      r < 0.1 ? 'sensory' : r < 0.8 ? 'inter' : 'motor';
    nodes.push({
      id: `N${String(i).padStart(4, '0')}`,
      type,
      nt: neurotransmitters[Math.floor(seededRand(i * 11 + 5) * neurotransmitters.length)],
      x: seededRand(i * 3 + 1),
      y: seededRand(i * 17 + 9),
      z: (seededRand(i * 23 + 11) - 0.5) * 0.002,
    });
  }

  // Realistic sparsity: ~5-10% connection density
  const targetEdges = Math.floor(n * n * 0.07);
  const edges: ConnectomeEdge[] = [];
  const edgeSet = new Set<string>();

  for (let attempt = 0; attempt < targetEdges * 3 && edges.length < targetEdges; attempt++) {
    const pre = Math.floor(seededRand(attempt * 37 + 1) * n);
    const post = Math.floor(seededRand(attempt * 41 + 3) * n);
    if (pre === post) continue;
    const key = `${pre}-${post}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({
      pre: nodes[pre].id,
      post: nodes[post].id,
      weight: Math.floor(seededRand(attempt * 59 + 11) * 5) + 1,
      type: 'chemical',
    });
  }

  return { nodes, edges, n_neurons: nodes.length, n_edges: edges.length };
}

// ── Canvas Drawing ───────────────────────────────────────────────────────────

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  graph: ConnectomeGraph,
  results: MotifResult[],
  selectedMotifIdx: number | null,
  animPhase: number,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const n = Math.min(graph.nodes.length, MAX_NEURONS);
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.38;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Compute circular layout positions
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    positions.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }

  // Build edge lookup from node IDs to indices
  const idToIdx = new Map<string, number>();
  graph.nodes.slice(0, n).forEach((node, i) => idToIdx.set(node.id, i));

  // Determine highlighted neurons and edges
  const highlightedNeurons = new Set<number>();
  const highlightedEdges: { from: number; to: number; color: string }[] = [];
  let motifColor = '#00d4ff';

  if (selectedMotifIdx !== null && selectedMotifIdx >= 0 && selectedMotifIdx < results.length) {
    const result = results[selectedMotifIdx];
    motifColor = result.motif.color;

    for (const instance of result.instances) {
      for (const idx of instance.neurons) {
        highlightedNeurons.add(idx);
      }

      // Draw the motif's pattern edges for this instance
      // Check all 6 role assignments to find which matches
      const [i, j, k] = instance.neurons;
      const perms: [number, number, number][] = [
        [i, j, k], [i, k, j], [j, i, k], [j, k, i], [k, i, j], [k, j, i],
      ];

      // Build local adjacency
      const localAdj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
      for (const edge of graph.edges) {
        const ei = idToIdx.get(edge.pre);
        const ej = idToIdx.get(edge.post);
        if (ei !== undefined && ej !== undefined) localAdj[ei][ej] = true;
      }

      for (const [a, b, c] of perms) {
        const edges = [
          localAdj[a][b], localAdj[a][c], localAdj[b][a],
          localAdj[b][c], localAdj[c][a], localAdj[c][b],
        ];
        let isMatch = true;
        for (let e = 0; e < 6; e++) {
          if (result.motif.pattern[e] !== edges[e]) { isMatch = false; break; }
        }
        if (isMatch) {
          // Record the directed edges that are part of the pattern
          const pairs: [number, number][] = [
            [a, b], [a, c], [b, a], [b, c], [c, a], [c, b],
          ];
          for (let e = 0; e < 6; e++) {
            if (result.motif.pattern[e]) {
              highlightedEdges.push({ from: pairs[e][0], to: pairs[e][1], color: motifColor });
            }
          }
          break;
        }
      }
    }
  }

  // Draw all edges dim
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = 'rgba(60, 80, 100, 0.08)';
  for (const edge of graph.edges) {
    const i = idToIdx.get(edge.pre);
    const j = idToIdx.get(edge.post);
    if (i === undefined || j === undefined || i >= n || j >= n) continue;
    ctx.beginPath();
    ctx.moveTo(positions[i].x, positions[i].y);
    ctx.lineTo(positions[j].x, positions[j].y);
    ctx.stroke();
  }

  // Draw highlighted edges (thicker, colored, pulsing)
  if (highlightedEdges.length > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(animPhase * 3);
    const alpha = 0.3 + pulse * 0.5;

    ctx.lineWidth = 1.5 + pulse;
    ctx.lineCap = 'round';

    for (const { from, to, color } of highlightedEdges) {
      if (from >= n || to >= n) continue;
      const fromPos = positions[from];
      const toPos = positions[to];

      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      ctx.lineTo(toPos.x, toPos.y);
      ctx.stroke();

      // Draw arrowhead
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const nx = dx / len;
      const ny = dy / len;
      const arrowLen = 5;
      const tipX = toPos.x - nx * 4;
      const tipY = toPos.y - ny * 4;

      ctx.fillStyle = hexToRgba(color, alpha);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - nx * arrowLen - ny * 2.5, tipY - ny * arrowLen + nx * 2.5);
      ctx.lineTo(tipX - nx * arrowLen + ny * 2.5, tipY - ny * arrowLen - nx * 2.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw neurons
  for (let i = 0; i < n; i++) {
    const pos = positions[i];
    const isHighlighted = highlightedNeurons.has(i);
    const nodeRadius = isHighlighted ? 3.5 : 2;
    const nodeAlpha = isHighlighted ? 1 : 0.25;

    if (isHighlighted) {
      // Glow
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.shadowColor = motifColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = motifColor;
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = nodeAlpha;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
    ctx.fillStyle = isHighlighted ? motifColor : '#556677';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Corner label
  ctx.fillStyle = 'rgba(140, 170, 200, 0.35)';
  ctx.font = '9px monospace';
  ctx.fillText(`${n} neurons`, 6, h - 6);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Motif Mini Diagram (SVG) ─────────────────────────────────────────────────

function MotifDiagram({ pattern, color }: { pattern: boolean[]; color: string }) {
  // 3 nodes in a triangle layout: A (top-left), B (top-right), C (bottom-center)
  const nodes = [
    { x: 12, y: 6, label: 'A' },
    { x: 38, y: 6, label: 'B' },
    { x: 25, y: 30, label: 'C' },
  ];
  // Edge pairs corresponding to pattern: [AB, AC, BA, BC, CA, CB]
  const edgePairs: [number, number][] = [
    [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1],
  ];

  return (
    <svg width={50} height={36} viewBox="0 0 50 36" style={{ flexShrink: 0 }}>
      {edgePairs.map(([from, to], idx) => {
        if (!pattern[idx]) return null;
        const fromNode = nodes[from];
        const toNode = nodes[to];
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / len;
        const ny = dy / len;
        // Shorten line to avoid overlapping circles
        const startX = fromNode.x + nx * 5;
        const startY = fromNode.y + ny * 5;
        const endX = toNode.x - nx * 5;
        const endY = toNode.y - ny * 5;
        return (
          <line
            key={idx}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={color}
            strokeWidth={1.2}
            opacity={0.7}
            markerEnd="none"
          />
        );
      })}
      {nodes.map((node, i) => (
        <g key={i}>
          <circle cx={node.x} cy={node.y} r={4} fill={color} opacity={0.85} />
          <text
            x={node.x}
            y={node.y + 3}
            textAnchor="middle"
            fill="#000"
            fontSize={6}
            fontWeight={700}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Z-Score Badge ────────────────────────────────────────────────────────────

function ZScoreBadge({ z }: { z: number }) {
  const color = z > 2 ? '#4aff8b' : z < -2 ? '#ff4455' : 'rgba(180, 200, 220, 0.45)';
  const label = z > 2 ? 'ENRICHED' : z < -2 ? 'DEPLETED' : 'NORMAL';
  return (
    <span
      style={{
        fontSize: 8,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 3,
        background: `${color}22`,
        color,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {label} (Z={z.toFixed(1)})
    </span>
  );
}

// ── Export Utilities ──────────────────────────────────────────────────────────

function exportMotifJSON(results: MotifResult[], density: number, totalMotifs: number) {
  const data = {
    timestamp: new Date().toISOString(),
    networkDensity: density,
    totalMotifs,
    motifs: results.map((r) => ({
      name: r.motif.name,
      description: r.motif.description,
      count: r.count,
      expected: Math.round(r.expected * 100) / 100,
      zScore: Math.round(r.zScore * 100) / 100,
      instances: r.instances.map((inst) => ({
        neuronIds: inst.neuronIds,
        strength: inst.strength,
      })),
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `motif-analysis-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCanvasPNG(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `motif-overlay-${Date.now()}.png`;
  a.click();
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MotifAnalyzer() {
  const experiment = useSimulationStore((s) => s.experiment);
  const researchMode = useUIPreferencesStore((s) => s.researchMode);

  const [graph, setGraph] = useState<ConnectomeGraph | null>(null);
  const [selectedMotifIdx, setSelectedMotifIdx] = useState<number | null>(null);
  const [selectedInstanceIdx, setSelectedInstanceIdx] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  // ── Load or generate connectome graph ──────────────────────────────────

  useEffect(() => {
    if (!researchMode) return;
    let cancelled = false;

    const loadGraph = async () => {
      const base = import.meta.env.BASE_URL || '/';
      try {
        // Try API first, then static file
        let data: ConnectomeGraph;
        try {
          const res = await fetch('/api/morphology/connectome-graph');
          if (!res.ok) throw new Error('api');
          data = await res.json();
        } catch {
          try {
            const res = await fetch(`${base}connectome-graph.json`);
            if (!res.ok) throw new Error('static');
            data = await res.json();
          } catch {
            // Fall back to mock graph
            const n = experiment?.n_neurons ?? 60;
            data = generateMockGraph(n);
          }
        }

        if (!cancelled) {
          // Cap to MAX_NEURONS
          if (data.nodes.length > MAX_NEURONS) {
            const cappedIds = new Set(data.nodes.slice(0, MAX_NEURONS).map((nd) => nd.id));
            data = {
              nodes: data.nodes.slice(0, MAX_NEURONS),
              edges: data.edges.filter((e) => cappedIds.has(e.pre) && cappedIds.has(e.post)),
              n_neurons: MAX_NEURONS,
              n_edges: data.edges.filter((e) => cappedIds.has(e.pre) && cappedIds.has(e.post)).length,
            };
          }
          setGraph(data);
        }
      } catch {
        // Last resort: mock
        if (!cancelled) {
          setGraph(generateMockGraph(experiment?.n_neurons ?? 60));
        }
      }
    };

    loadGraph();
    return () => { cancelled = true; };
  }, [experiment?.n_neurons, researchMode]);

  // ── Run motif detection ────────────────────────────────────────────────

  const analysisResults = useMemo(() => {
    if (!graph) return null;
    setIsAnalyzing(true);
    const r = detectMotifs(graph);
    setIsAnalyzing(false);
    return r;
  }, [graph]);

  const results = analysisResults?.results ?? [];
  const density = analysisResults?.density ?? 0;
  const totalMotifs = analysisResults?.totalMotifs ?? 0;

  // ── Statistical summary ────────────────────────────────────────────────

  const summary = useMemo(() => {
    if (results.length === 0) return null;

    const sorted = [...results].sort((a, b) => b.zScore - a.zScore);
    const mostEnriched = sorted[0];
    const mostDepleted = sorted[sorted.length - 1];

    let interpretation = '';
    if (mostEnriched && mostEnriched.zScore > 2) {
      interpretation = `This network is enriched for ${mostEnriched.motif.name.toLowerCase()} (Z=${mostEnriched.zScore.toFixed(1)}), suggesting `;
      if (mostEnriched.motif.name === 'Feedforward Chain') {
        interpretation += 'strong serial signal propagation pathways.';
      } else if (mostEnriched.motif.name === 'Feedforward Inhibition') {
        interpretation += 'strong sensory processing circuits with lateral inhibition.';
      } else if (mostEnriched.motif.name === 'Recurrent Excitation') {
        interpretation += 'persistent activity or working memory circuits.';
      } else if (mostEnriched.motif.name === 'Feedback Inhibition') {
        interpretation += 'oscillatory or rhythmic pattern generation circuits.';
      } else if (mostEnriched.motif.name === 'Convergent Input') {
        interpretation += 'integrative processing with multi-source convergence.';
      } else if (mostEnriched.motif.name === 'Divergent Output') {
        interpretation += 'broadcast signaling and command neuron architecture.';
      }
    } else {
      interpretation = 'Motif distribution is consistent with a random network.';
    }

    return { mostEnriched, mostDepleted, interpretation };
  }, [results]);

  // ── Canvas animation ───────────────────────────────────────────────────

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    animRef.current += 0.02;
    drawOverlay(ctx, graph, results, selectedMotifIdx, animRef.current);
    animFrameRef.current = requestAnimationFrame(drawCanvas);
  }, [graph, results, selectedMotifIdx]);

  useEffect(() => {
    if (!researchMode) return;
    animFrameRef.current = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawCanvas, researchMode]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleHighlight = useCallback((idx: number) => {
    setSelectedMotifIdx((prev) => (prev === idx ? null : idx));
    setSelectedInstanceIdx(null);
  }, []);

  const handleInstanceClick = useCallback((neuronIds: [string, string, string]) => {
    // Dispatch neuron selection to global store for cross-component sync
    const store = useSimulationStore.getState();
    store.setSelectedNeuron(neuronIds[0]);
  }, []);

  // ── Selected motif data ────────────────────────────────────────────────

  const selectedResult = selectedMotifIdx !== null ? results[selectedMotifIdx] : null;

  // Gate behind researchMode — all hooks are above this line
  if (!researchMode) return null;

  return (
    <CollapsiblePanel id="motif-analyzer" label="Circuit Motifs" badge="RESEARCH">
      {isAnalyzing ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-label)' }}>
          Analyzing motifs...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* ── Motif Catalog ──────────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}
          >
            {results.map((result, idx) => {
              const isSelected = selectedMotifIdx === idx;
              return (
                <div
                  key={result.motif.name}
                  style={{
                    background: isSelected
                      ? `${result.motif.color}15`
                      : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${
                      isSelected ? `${result.motif.color}44` : 'var(--border-subtle)'
                    }`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => handleHighlight(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MotifDiagram pattern={result.motif.pattern} color={result.motif.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: result.motif.color,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {result.motif.name}
                      </div>
                      <div style={{ fontSize: 8, color: 'var(--text-label)', marginTop: 1 }}>
                        {result.motif.description}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 4,
                    }}
                  >
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>
                        {result.count}
                      </span>{' '}
                      found
                      <span style={{ opacity: 0.5 }}> / {Math.round(result.expected)} exp</span>
                    </div>
                    <ZScoreBadge z={result.zScore} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Instance Browser ───────────────────────────────────── */}
          {selectedResult && selectedResult.instances.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-label)',
                  marginBottom: 4,
                }}
              >
                Instances ({selectedResult.instances.length})
              </div>
              <div
                style={{
                  maxHeight: 120,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {selectedResult.instances.slice(0, 50).map((instance, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '3px 6px',
                      borderRadius: 4,
                      background:
                        selectedInstanceIdx === idx
                          ? `${selectedResult.motif.color}18`
                          : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      transition: 'background 0.1s ease',
                    }}
                    onClick={() => {
                      setSelectedInstanceIdx(idx);
                      handleInstanceClick(instance.neuronIds);
                    }}
                  >
                    <span style={{ color: 'var(--text-primary)' }}>
                      {instance.neuronIds.join(' - ')}
                    </span>
                    <span
                      style={{
                        color: selectedResult.motif.color,
                        fontSize: 9,
                        fontWeight: 600,
                        opacity: 0.7,
                      }}
                    >
                      w={instance.strength.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Connectome Overlay Canvas ──────────────────────────── */}
          <div
            style={{
              background: 'rgba(3, 3, 8, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                aspectRatio: '1',
              }}
            />
            {selectedMotifIdx !== null && (
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  fontSize: 8,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: `${results[selectedMotifIdx].motif.color}33`,
                  color: results[selectedMotifIdx].motif.color,
                }}
              >
                {results[selectedMotifIdx].motif.name}
              </div>
            )}
          </div>

          {/* ── Statistical Summary ────────────────────────────────── */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: 8,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-label)',
                marginBottom: 6,
              }}
            >
              Summary
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: 'var(--text-label)' }}>Total motifs</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalMotifs}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: 'var(--text-label)' }}>Network density</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {(density * 100).toFixed(1)}%
                </span>
              </div>
              {summary?.mostEnriched && summary.mostEnriched.zScore > 2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-label)' }}>Most enriched</span>
                  <span style={{ color: '#4aff8b', fontWeight: 600, fontSize: 9 }}>
                    {summary.mostEnriched.motif.name}
                  </span>
                </div>
              )}
              {summary?.mostDepleted && summary.mostDepleted.zScore < -2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-label)' }}>Most depleted</span>
                  <span style={{ color: '#ff4455', fontWeight: 600, fontSize: 9 }}>
                    {summary.mostDepleted.motif.name}
                  </span>
                </div>
              )}
            </div>
            {summary?.interpretation && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 9,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                  fontStyle: 'italic',
                }}
              >
                {summary.interpretation}
              </div>
            )}
          </div>

          {/* ── Export Buttons ─────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: 10, padding: '5px 8px' }}
              onClick={() => exportMotifJSON(results, density, totalMotifs)}
            >
              Export JSON
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: 10, padding: '5px 8px' }}
              onClick={() => exportCanvasPNG(canvasRef.current)}
            >
              Export PNG
            </button>
          </div>
        </div>
      )}
    </CollapsiblePanel>
  );
}
