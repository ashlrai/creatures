import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSTDPStore } from '../../stores/stdpStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { CollapsiblePanel } from './CollapsiblePanel';

// ── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 200;
const CANVAS_H = 200;
const HIST_H = 80;
const BG = '#030308';
const NEUTRAL_EDGE = '#334455';

const TYPE_COLORS: Record<string, string> = {
  sensory: '#22cc66',
  inter: '#3388ff',
  motor: '#ff4422',
};

const STRENGTHENED = '#22cc66';
const WEAKENED = '#ff3344';

// ── Types ────────────────────────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  type: 'sensory' | 'inter' | 'motor';
  cx: number;
  cy: number;
}

interface SynapseInfo {
  preIdx: number;
  postIdx: number;
  origWeight: number;
  currWeight: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function seededRand(seed: number): number {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Build a circular layout for N neurons, typed by position in array */
function buildCircularLayout(nNeurons: number, w: number, h: number): LayoutNode[] {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.38;
  const nodes: LayoutNode[] = [];

  for (let i = 0; i < nNeurons; i++) {
    const angle = (2 * Math.PI * i) / nNeurons - Math.PI / 2;
    const frac = i / nNeurons;
    let type: 'sensory' | 'inter' | 'motor';
    if (frac < 0.1) type = 'sensory';
    else if (frac < 0.8) type = 'inter';
    else type = 'motor';

    nodes.push({
      id: `n${i}`,
      type,
      cx: cx + Math.cos(angle) * radius,
      cy: cy + Math.sin(angle) * radius,
    });
  }
  return nodes;
}

/**
 * Derive synapse connections from the flat weight array.
 * The STDP store stores a flat array of all synapse weights.
 * We infer edges as a simple grid: for a network with N neurons and W weights,
 * each weight index maps to a (pre, post) pair. Since we don't have the actual
 * adjacency, we create synthetic edges by distributing weights across neuron pairs.
 */
function deriveSynapses(
  initial: number[],
  current: number[],
  nNeurons: number,
): SynapseInfo[] {
  const nWeights = Math.min(initial.length, current.length);
  const synapses: SynapseInfo[] = [];

  for (let i = 0; i < nWeights; i++) {
    // Deterministic mapping: weight index -> (pre, post) pair
    const preIdx = Math.floor(seededRand(i * 37 + 7) * nNeurons);
    const postIdx = Math.floor(seededRand(i * 53 + 13) * nNeurons);
    if (preIdx === postIdx) continue;
    if (initial[i] === 0 && current[i] === 0) continue;

    synapses.push({
      preIdx,
      postIdx,
      origWeight: initial[i],
      currWeight: current[i],
    });
  }
  return synapses;
}

/** Compute histogram bins from an array of values */
function computeHistogram(values: number[], nBins: number): { bins: number[]; min: number; max: number; binWidth: number } {
  if (values.length === 0) return { bins: new Array(nBins).fill(0), min: 0, max: 1, binWidth: 1 / nBins };
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) { max = min + 1; }
  const binWidth = (max - min) / nBins;
  const bins = new Array(nBins).fill(0);
  for (const v of values) {
    const idx = Math.min(nBins - 1, Math.floor((v - min) / binWidth));
    bins[idx]++;
  }
  return { bins, min, max, binWidth };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

// ── Canvas renderers ─────────────────────────────────────────────────────────

function drawConnectome(
  ctx: CanvasRenderingContext2D,
  nodes: LayoutNode[],
  synapses: SynapseInfo[],
  mode: 'original' | 'current',
  w: number,
  h: number,
) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Max weight for thickness scaling
  const maxW = Math.max(
    1,
    ...synapses.map((s) => Math.abs(mode === 'original' ? s.origWeight : s.currWeight)),
  );

  // Draw edges
  for (const syn of synapses) {
    const pre = nodes[syn.preIdx];
    const post = nodes[syn.postIdx];
    if (!pre || !post) continue;

    const weight = mode === 'original' ? syn.origWeight : syn.currWeight;
    const absW = Math.abs(weight);
    if (absW < 0.001) continue;

    const thickness = 0.5 + (absW / maxW) * 2.5;

    if (mode === 'original') {
      ctx.strokeStyle = NEUTRAL_EDGE;
      ctx.globalAlpha = 0.15 + (absW / maxW) * 0.35;
    } else {
      const delta = syn.currWeight - syn.origWeight;
      const absDelta = Math.abs(delta);
      const maxDelta = Math.max(
        0.001,
        ...synapses.map((s) => Math.abs(s.currWeight - s.origWeight)),
      );
      if (absDelta < 0.001) {
        ctx.strokeStyle = NEUTRAL_EDGE;
        ctx.globalAlpha = 0.12;
      } else if (delta > 0) {
        ctx.strokeStyle = STRENGTHENED;
        ctx.globalAlpha = 0.2 + (absDelta / maxDelta) * 0.7;
      } else {
        ctx.strokeStyle = WEAKENED;
        ctx.globalAlpha = 0.2 + (absDelta / maxDelta) * 0.7;
      }
    }

    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(pre.cx, pre.cy);
    ctx.lineTo(post.cx, post.cy);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Draw neurons
  for (const node of nodes) {
    const color = TYPE_COLORS[node.type] ?? '#666';
    ctx.beginPath();
    ctx.arc(node.cx, node.cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawHistogram(
  ctx: CanvasRenderingContext2D,
  origWeights: number[],
  currWeights: number[],
  w: number,
  h: number,
) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const nBins = 30;
  // Compute combined range
  const allVals = [...origWeights, ...currWeights];
  if (allVals.length === 0) return;

  let gMin = Infinity, gMax = -Infinity;
  for (const v of allVals) {
    if (v < gMin) gMin = v;
    if (v > gMax) gMax = v;
  }
  if (gMax === gMin) gMax = gMin + 1;

  const binWidth = (gMax - gMin) / nBins;
  const oBins = new Array(nBins).fill(0);
  const cBins = new Array(nBins).fill(0);

  for (const v of origWeights) {
    const idx = Math.min(nBins - 1, Math.floor((v - gMin) / binWidth));
    oBins[idx]++;
  }
  for (const v of currWeights) {
    const idx = Math.min(nBins - 1, Math.floor((v - gMin) / binWidth));
    cBins[idx]++;
  }

  const maxCount = Math.max(1, ...oBins, ...cBins);
  const barW = (w - 20) / nBins;
  const plotH = h - 28;
  const baseY = h - 14;

  // Draw original (gray, behind)
  for (let i = 0; i < nBins; i++) {
    const bh = (oBins[i] / maxCount) * plotH;
    ctx.fillStyle = 'rgba(100, 120, 140, 0.5)';
    ctx.fillRect(10 + i * barW, baseY - bh, barW - 1, bh);
  }

  // Draw current (colored, in front)
  for (let i = 0; i < nBins; i++) {
    const bh = (cBins[i] / maxCount) * plotH;
    ctx.fillStyle = 'rgba(60, 200, 255, 0.6)';
    ctx.fillRect(10 + i * barW, baseY - bh, barW - 1, bh);
  }

  // Axis labels
  ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(gMin.toFixed(1), 2, h - 2);
  ctx.textAlign = 'right';
  ctx.fillText(gMax.toFixed(1), w - 2, h - 2);
  ctx.textAlign = 'center';
  ctx.fillText('weight', w / 2, h - 2);
}

// ── Component ────────────────────────────────────────────────────────────────

export function ConnectomeDiff() {
  const origCanvasRef = useRef<HTMLCanvasElement>(null);
  const currCanvasRef = useRef<HTMLCanvasElement>(null);
  const origHistRef = useRef<HTMLCanvasElement>(null);
  const currHistRef = useRef<HTMLCanvasElement>(null);

  const initialWeights = useSTDPStore((s) => s.initialWeights);
  const snapshots = useSTDPStore((s) => s.weightSnapshots);
  const experiment = useSimulationStore((s) => s.experiment);

  const nNeurons = experiment?.n_neurons ?? 302;
  const latestWeights = snapshots.length > 0 ? snapshots[snapshots.length - 1].weights : null;
  const hasData = initialWeights !== null && latestWeights !== null;

  // Memoize layout
  const nodes = useMemo(() => buildCircularLayout(nNeurons, CANVAS_W, CANVAS_H), [nNeurons]);

  // Memoize synapses
  const synapses = useMemo(() => {
    if (!initialWeights || !latestWeights) return [];
    return deriveSynapses(initialWeights, latestWeights, nNeurons);
  }, [initialWeights, latestWeights, nNeurons]);

  // Stats
  const stats = useMemo(() => {
    if (!initialWeights || !latestWeights) return null;
    const origM = mean(initialWeights);
    const origS = std(initialWeights);
    const currM = mean(latestWeights);
    const currS = std(latestWeights);
    let totalChange = 0;
    const len = Math.min(initialWeights.length, latestWeights.length);
    for (let i = 0; i < len; i++) {
      totalChange += Math.abs(latestWeights[i] - initialWeights[i]);
    }
    return { origM, origS, currM, currS, totalChange };
  }, [initialWeights, latestWeights]);

  // Draw connectomes
  useEffect(() => {
    if (!hasData) return;
    const origCtx = origCanvasRef.current?.getContext('2d');
    const currCtx = currCanvasRef.current?.getContext('2d');
    if (origCtx) drawConnectome(origCtx, nodes, synapses, 'original', CANVAS_W, CANVAS_H);
    if (currCtx) drawConnectome(currCtx, nodes, synapses, 'current', CANVAS_W, CANVAS_H);
  }, [hasData, nodes, synapses]);

  // Draw histograms
  useEffect(() => {
    if (!initialWeights || !latestWeights) return;
    const origCtx = origHistRef.current?.getContext('2d');
    const currCtx = currHistRef.current?.getContext('2d');
    if (origCtx) drawHistogram(origCtx, initialWeights, initialWeights, CANVAS_W, HIST_H);
    if (currCtx) drawHistogram(currCtx, initialWeights, latestWeights, CANVAS_W, HIST_H);
  }, [initialWeights, latestWeights]);

  return (
    <CollapsiblePanel id="connectome-diff" label="Connectome Comparison" defaultExpanded={false}>
      {!hasData ? (
        <div
          style={{
            color: 'var(--text-label, #667)',
            fontSize: 11,
            textAlign: 'center',
            padding: '24px 8px',
            fontStyle: 'italic',
          }}
        >
          Enable STDP and collect data to see comparison
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Side-by-side canvases */}
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Original */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-secondary, #99a)',
                  marginBottom: 4,
                  textAlign: 'center',
                  letterSpacing: '0.05em',
                }}
              >
                ORIGINAL
              </div>
              <canvas
                ref={origCanvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
              <canvas
                ref={origHistRef}
                width={CANVAS_W}
                height={HIST_H}
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginTop: 4,
                }}
              />
              {stats && (
                <div style={{ fontSize: 9, color: 'var(--text-label, #667)', marginTop: 2, textAlign: 'center' }}>
                  mean: {stats.origM.toFixed(3)} | std: {stats.origS.toFixed(3)}
                </div>
              )}
            </div>

            {/* Current */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-secondary, #99a)',
                  marginBottom: 4,
                  textAlign: 'center',
                  letterSpacing: '0.05em',
                }}
              >
                CURRENT
              </div>
              <canvas
                ref={currCanvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
              <canvas
                ref={currHistRef}
                width={CANVAS_W}
                height={HIST_H}
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginTop: 4,
                }}
              />
              {stats && (
                <div style={{ fontSize: 9, color: 'var(--text-label, #667)', marginTop: 2, textAlign: 'center' }}>
                  mean: {stats.currM.toFixed(3)} | std: {stats.currS.toFixed(3)}
                </div>
              )}
            </div>
          </div>

          {/* Legend + total change */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 9,
              color: 'var(--text-label, #667)',
              padding: '4px 2px 0',
            }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: STRENGTHENED, marginRight: 3, verticalAlign: 'middle' }} />
                Strengthened
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: WEAKENED, marginRight: 3, verticalAlign: 'middle' }} />
                Weakened
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: NEUTRAL_EDGE, marginRight: 3, verticalAlign: 'middle' }} />
                Unchanged
              </span>
            </div>
            {stats && (
              <span style={{ fontWeight: 600, color: 'var(--accent-cyan, #0ff)' }}>
                Total |dw|: {stats.totalChange.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}
    </CollapsiblePanel>
  );
}
