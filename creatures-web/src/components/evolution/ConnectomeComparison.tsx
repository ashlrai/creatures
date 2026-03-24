import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface Neuron {
  id: string;
  type: 'sensory' | 'inter' | 'motor';
  bodyPos: number; // 0 = head, 1 = tail (normalized along body axis)
  lateralPos: number; // -1 to 1 (lateral position within type band)
}

interface Connection {
  pre: string;
  post: string;
  weight: number;
}

interface ComparisonData {
  neurons: Neuron[];
  biological: Connection[];
  evolved: Connection[];
  generation: number;
}

type ConnectionDiffType = 'preserved' | 'deleted' | 'strengthened' | 'weakened' | 'novel';

interface ConnectionDiff {
  pre: string;
  post: string;
  bioWeight: number;
  evoWeight: number;
  diffType: ConnectionDiffType;
}

interface ComparisonStats {
  totalBiological: number;
  totalEvolved: number;
  preserved: number;
  preservedPct: number;
  modified: number;
  modifiedPct: number;
  strengthened: number;
  weakened: number;
  novel: number;
  deleted: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BG_COLOR = '#030308';
const DIVIDER_COLOR = 'rgba(60, 100, 160, 0.3)';

const DIFF_COLORS: Record<ConnectionDiffType, string> = {
  preserved: '#22cc66',
  deleted: '#ff3333',
  strengthened: '#3388ff',
  weakened: '#ff8833',
  novel: '#00dddd',
};

const TYPE_COLORS: Record<string, string> = {
  sensory: '#22cc66',
  inter: '#3388ff',
  motor: '#ff4422',
};

// ── Mock data generation ─────────────────────────────────────────────────────

// Deterministic pseudo-random from seed
function seededRand(seed: number): number {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function generateMockData(generation: number): ComparisonData {
  // Create ~60 representative neurons (subset of C. elegans)
  const neuronDefs: Array<{ id: string; type: 'sensory' | 'inter' | 'motor' }> = [];

  const sensoryNames = [
    'ALML', 'ALMR', 'AVM', 'PLML', 'PLMR', 'PVD', 'ASHL', 'ASHR',
    'ADLL', 'ADLR', 'ASEL', 'ASER', 'AWCL', 'AWCR', 'AWAL', 'AWAR',
  ];
  const interNames = [
    'AVAL', 'AVAR', 'AVBL', 'AVBR', 'AVDL', 'AVDR', 'AVEL', 'AVER',
    'RIML', 'RIMR', 'AINL', 'AINR', 'AIBL', 'AIBR', 'AIAL', 'AIAR',
    'PVCL', 'PVCR', 'DVA', 'AVG', 'LUAL', 'LUAR', 'PVQL', 'PVQR',
  ];
  const motorNames = [
    'DA01', 'DA02', 'DA03', 'DA04', 'DA05', 'DB01', 'DB02', 'DB03',
    'VA01', 'VA02', 'VA03', 'VA04', 'VB01', 'VB02', 'VB03', 'VB04',
    'DD01', 'DD02', 'DD03', 'VD01', 'VD02', 'VD03',
  ];

  for (const name of sensoryNames) neuronDefs.push({ id: name, type: 'sensory' });
  for (const name of interNames) neuronDefs.push({ id: name, type: 'inter' });
  for (const name of motorNames) neuronDefs.push({ id: name, type: 'motor' });

  const neurons: Neuron[] = neuronDefs.map((def, i) => ({
    id: def.id,
    type: def.type,
    bodyPos: seededRand(i * 13 + 7),
    lateralPos: (seededRand(i * 31 + 17) - 0.5) * 2,
  }));

  // Generate biological connections (roughly 3x neuron count)
  const biological: Connection[] = [];
  const neuronIds = neurons.map((n) => n.id);
  const totalConnections = Math.round(neuronIds.length * 3.2);

  for (let i = 0; i < totalConnections; i++) {
    const preIdx = Math.floor(seededRand(i * 47 + 3) * neuronIds.length);
    let postIdx = Math.floor(seededRand(i * 83 + 11) * neuronIds.length);
    if (postIdx === preIdx) postIdx = (postIdx + 1) % neuronIds.length;
    biological.push({
      pre: neuronIds[preIdx],
      post: neuronIds[postIdx],
      weight: 0.2 + seededRand(i * 59 + 23) * 0.8,
    });
  }

  // Generate evolved connectome:
  // ~95% preserved, ~30% of those modified, 5 novel, 2 deleted
  const evolved: Connection[] = [];
  const deleteCount = 2;
  const novelCount = 5;
  const deleteIndices = new Set<number>();

  // Pick connections to delete
  for (let d = 0; d < deleteCount; d++) {
    const idx = Math.floor(seededRand(d * 97 + generation) * biological.length);
    deleteIndices.add(idx);
  }

  // Copy biological with modifications
  for (let i = 0; i < biological.length; i++) {
    if (deleteIndices.has(i)) continue; // deleted

    const conn = { ...biological[i] };
    const modRand = seededRand(i * 71 + generation * 13 + 41);

    // ~30% get weight modifications
    if (modRand < 0.15) {
      // Strengthen (>50% increase)
      conn.weight = Math.min(1.0, conn.weight * (1.6 + seededRand(i * 37 + 19) * 0.8));
    } else if (modRand < 0.30) {
      // Weaken (>50% decrease)
      conn.weight = conn.weight * (0.1 + seededRand(i * 43 + 23) * 0.35);
    }

    evolved.push(conn);
  }

  // Add novel connections
  for (let n = 0; n < novelCount; n++) {
    const preIdx = Math.floor(seededRand(n * 111 + generation * 7 + 53) * neuronIds.length);
    let postIdx = Math.floor(seededRand(n * 131 + generation * 11 + 67) * neuronIds.length);
    if (postIdx === preIdx) postIdx = (postIdx + 1) % neuronIds.length;
    evolved.push({
      pre: neuronIds[preIdx],
      post: neuronIds[postIdx],
      weight: 0.3 + seededRand(n * 79 + generation) * 0.5,
    });
  }

  return { neurons, biological, evolved, generation };
}

// ── Diffing logic ────────────────────────────────────────────────────────────

function computeDiffs(data: ComparisonData): { diffs: ConnectionDiff[]; stats: ComparisonStats } {
  const bioMap = new Map<string, number>();
  for (const c of data.biological) {
    const key = `${c.pre}->${c.post}`;
    bioMap.set(key, c.weight);
  }

  const evoMap = new Map<string, number>();
  for (const c of data.evolved) {
    const key = `${c.pre}->${c.post}`;
    evoMap.set(key, c.weight);
  }

  const diffs: ConnectionDiff[] = [];
  let preserved = 0;
  let strengthened = 0;
  let weakened = 0;
  let deleted = 0;
  let novel = 0;

  // Check all biological connections
  for (const [key, bioWeight] of bioMap) {
    const [pre, post] = key.split('->');
    const evoWeight = evoMap.get(key);

    if (evoWeight === undefined) {
      diffs.push({ pre, post, bioWeight, evoWeight: 0, diffType: 'deleted' });
      deleted++;
    } else {
      const ratio = evoWeight / bioWeight;
      if (ratio > 1.5) {
        diffs.push({ pre, post, bioWeight, evoWeight, diffType: 'strengthened' });
        strengthened++;
      } else if (ratio < 0.5) {
        diffs.push({ pre, post, bioWeight, evoWeight, diffType: 'weakened' });
        weakened++;
      } else {
        diffs.push({ pre, post, bioWeight, evoWeight, diffType: 'preserved' });
        preserved++;
      }
    }
  }

  // Check for novel connections (in evolved but not biological)
  for (const [key, evoWeight] of evoMap) {
    if (!bioMap.has(key)) {
      const [pre, post] = key.split('->');
      diffs.push({ pre, post, bioWeight: 0, evoWeight, diffType: 'novel' });
      novel++;
    }
  }

  const totalBio = data.biological.length;
  const modified = strengthened + weakened;
  const stats: ComparisonStats = {
    totalBiological: totalBio,
    totalEvolved: data.evolved.length,
    preserved,
    preservedPct: totalBio > 0 ? Math.round((preserved / totalBio) * 100) : 0,
    modified,
    modifiedPct: totalBio > 0 ? Math.round((modified / totalBio) * 100) : 0,
    strengthened,
    weakened,
    novel,
    deleted,
  };

  return { diffs, stats };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ConnectomeComparison({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRun = useEvolutionStore((s) => s.currentRun);

  const generation = currentRun?.generation ?? 42;

  // Generate mock comparison data
  const comparisonData = useMemo(() => generateMockData(generation), [generation]);
  const { diffs, stats } = useMemo(() => computeDiffs(comparisonData), [comparisonData]);

  // Filter toggles
  const [visibleTypes, setVisibleTypes] = useState<Set<ConnectionDiffType>>(
    new Set(['preserved', 'deleted', 'strengthened', 'weakened', 'novel'])
  );

  const toggleType = useCallback((t: ConnectionDiffType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  // Layout: compute neuron positions for a given half-width
  const computeNeuronPositions = useCallback(
    (neurons: Neuron[], halfW: number, h: number, offsetX: number) => {
      const marginY = 40;
      const marginX = 20;
      const usableH = h - marginY * 2;
      const usableW = halfW - marginX * 2;

      const typeBands: Record<string, [number, number]> = {
        sensory: [0.05, 0.30],
        inter: [0.30, 0.70],
        motor: [0.70, 0.95],
      };

      const positions = new Map<string, { cx: number; cy: number }>();

      for (let i = 0; i < neurons.length; i++) {
        const n = neurons[i];
        const cy = marginY + n.bodyPos * usableH;

        const band = typeBands[n.type] ?? [0.3, 0.7];
        const bandCenter = (band[0] + band[1]) / 2;
        const bandWidth = band[1] - band[0];
        const tBand = 0.5 + n.lateralPos * 0.4;
        const cx = offsetX + marginX + (bandCenter + (tBand - 0.5) * bandWidth) * usableW;

        positions.set(n.id, { cx, cy });
      }

      return positions;
    },
    []
  );

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const halfW = w / 2;

    // Compute layouts for both sides
    const bioPositions = computeNeuronPositions(comparisonData.neurons, halfW, h, 0);
    const evoPositions = computeNeuronPositions(comparisonData.neurons, halfW, h, halfW);

    // Clear background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Divider line
    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Panel labels
    ctx.font = 'bold 12px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.7)';
    ctx.fillText('Biological Template', halfW / 2, 20);
    ctx.fillText(`Evolved (Gen ${generation})`, halfW + halfW / 2, 20);

    // Draw connections for biological side (left)
    drawConnections(ctx, diffs, bioPositions, visibleTypes, 'bio');

    // Draw connections for evolved side (right)
    drawConnections(ctx, diffs, evoPositions, visibleTypes, 'evo');

    // Draw neurons on both sides
    drawNeurons(ctx, comparisonData.neurons, bioPositions);
    drawNeurons(ctx, comparisonData.neurons, evoPositions);

    // Bottom stats label
    ctx.fillStyle = 'rgba(100, 130, 160, 0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${comparisonData.neurons.length} neurons | ${comparisonData.biological.length} biological synapses | ${comparisonData.evolved.length} evolved synapses`,
      8,
      h - 8
    );
  }, [comparisonData, diffs, generation, visibleTypes, computeNeuronPositions]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      // Trigger re-render by forcing state update
      setVisibleTypes((prev) => new Set(prev));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG_COLOR, borderRadius: 8, overflow: 'hidden' }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', borderBottom: '1px solid rgba(60, 100, 160, 0.15)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #d0dce8)', letterSpacing: '-0.3px' }}>
            Connectome Comparison
          </span>
          <span style={{ fontSize: 10, color: 'rgba(140,170,200,0.5)', fontFamily: 'monospace' }}>
            Gen {generation}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(200,210,220,0.7)', borderRadius: 4, padding: '3px 10px',
            fontSize: 11, cursor: 'pointer',
          }}
        >
          Back to Arena
        </button>
      </div>

      {/* Filter toggles */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
        borderBottom: '1px solid rgba(60, 100, 160, 0.08)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'rgba(140,170,200,0.4)', marginRight: 4 }}>Filter:</span>
        {(Object.keys(DIFF_COLORS) as ConnectionDiffType[]).map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            style={{
              background: visibleTypes.has(t) ? `${DIFF_COLORS[t]}22` : 'transparent',
              border: `1px solid ${visibleTypes.has(t) ? DIFF_COLORS[t] : 'rgba(255,255,255,0.08)'}`,
              color: visibleTypes.has(t) ? DIFF_COLORS[t] : 'rgba(140,170,200,0.3)',
              borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              fontFamily: 'monospace', transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', minHeight: 200 }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: '6px 12px',
        borderTop: '1px solid rgba(60, 100, 160, 0.15)',
        flexShrink: 0,
        fontSize: 12, fontFamily: '"SF Mono", "Fira Code", monospace',
      }}>
        <StatBadge label="Preserved" value={`${stats.preservedPct}%`} color={DIFF_COLORS.preserved} />
        <StatBadge label="Modified" value={`${stats.modifiedPct}%`} color={DIFF_COLORS.strengthened} />
        <StatBadge label="Strengthened" value={String(stats.strengthened)} color={DIFF_COLORS.strengthened} />
        <StatBadge label="Weakened" value={String(stats.weakened)} color={DIFF_COLORS.weakened} />
        <StatBadge label="Novel" value={String(stats.novel)} color={DIFF_COLORS.novel} />
        <StatBadge label="Deleted" value={String(stats.deleted)} color={DIFF_COLORS.deleted} />
      </div>
    </div>
  );
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

function drawConnections(
  ctx: CanvasRenderingContext2D,
  diffs: ConnectionDiff[],
  positions: Map<string, { cx: number; cy: number }>,
  visibleTypes: Set<ConnectionDiffType>,
  side: 'bio' | 'evo',
) {
  for (const diff of diffs) {
    if (!visibleTypes.has(diff.diffType)) continue;

    // On biological side: show preserved, deleted, strengthened, weakened (not novel)
    // On evolved side: show preserved, strengthened, weakened, novel (not deleted)
    if (side === 'bio' && diff.diffType === 'novel') continue;
    if (side === 'evo' && diff.diffType === 'deleted') continue;

    const prePos = positions.get(diff.pre);
    const postPos = positions.get(diff.post);
    if (!prePos || !postPos) continue;

    const color = DIFF_COLORS[diff.diffType];
    const weight = side === 'bio' ? diff.bioWeight : diff.evoWeight;
    const alpha = diff.diffType === 'preserved' ? 0.12 : 0.35;

    ctx.strokeStyle = colorWithAlpha(color, alpha);
    ctx.lineWidth = 0.5 + weight * 1.2;
    ctx.beginPath();
    ctx.moveTo(prePos.cx, prePos.cy);
    ctx.lineTo(postPos.cx, postPos.cy);
    ctx.stroke();
  }
}

function drawNeurons(
  ctx: CanvasRenderingContext2D,
  neurons: Neuron[],
  positions: Map<string, { cx: number; cy: number }>,
) {
  for (const neuron of neurons) {
    const pos = positions.get(neuron.id);
    if (!pos) continue;

    const baseColor = TYPE_COLORS[neuron.type] ?? '#666666';
    const radius = 3.5;

    // Neuron dot
    ctx.beginPath();
    ctx.arc(pos.cx, pos.cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = adjustBrightness(baseColor, 0.5);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = adjustBrightness(baseColor, 0.25);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'rgba(140,170,200,0.5)' }}>{label}:</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </span>
  );
}

// ── Utility helpers ──────────────────────────────────────────────────────────

function adjustBrightness(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
