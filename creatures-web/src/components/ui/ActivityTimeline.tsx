import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { CollapsiblePanel } from './CollapsiblePanel';

export interface ActivityTimelineProps {
  /** Recent frames with spike and type information. */
  spikeHistory: Array<{ t_ms: number; spikes: number[] }>;
  neuronTypes?: Record<number, 'sensory' | 'inter' | 'motor'>;
  nNeurons: number;
  windowMs?: number;
}

/**
 * Horizontal scrolling timeline showing neural activity events:
 * - Population firing rate as blue filled area chart
 * - Spike bursts as yellow vertical bars
 * - Circuit modification events as colored diamond markers
 * - Current time indicator at the right edge
 *
 * Wraps in a CollapsiblePanel for the Science tab.
 */
export function ActivityTimeline({
  spikeHistory,
  neuronTypes,
  nNeurons,
  windowMs = 10_000,
}: ActivityTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const modifications = useCircuitModificationStore((s) => s.modifications);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    // Resize canvas to match CSS size at device pixel ratio
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.scale(dpr, dpr);
    }

    const w = cssW;
    const h = cssH;

    // Background
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, w, h);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.12)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y <= h; y += h / 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (spikeHistory.length < 2 || nNeurons === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.25)';
      ctx.font = '10px monospace';
      ctx.fillText('Waiting for activity data...', 8, h / 2);
      return;
    }

    const latestT = spikeHistory[spikeHistory.length - 1].t_ms;
    const tMin = latestT - windowMs;

    const toX = (t: number) => ((t - tMin) / windowMs) * w;

    // ── Layer 1: Population firing rate (blue filled area) ──────────
    // Bin frames into ~100 buckets for smoother rendering
    const nBins = Math.min(200, spikeHistory.length);
    const binSize = windowMs / nBins;
    const binCounts = new Float32Array(nBins);
    let maxRate = 1;

    for (const frame of spikeHistory) {
      if (frame.t_ms < tMin) continue;
      const binIdx = Math.min(nBins - 1, Math.floor((frame.t_ms - tMin) / binSize));
      binCounts[binIdx] += frame.spikes.length;
    }

    // Normalize to firing rate
    for (let i = 0; i < nBins; i++) {
      binCounts[i] = binCounts[i] / Math.max(1, nNeurons);
      if (binCounts[i] > maxRate) maxRate = binCounts[i];
    }

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < nBins; i++) {
      const x = (i / nBins) * w;
      const y = h - (binCounts[i] / maxRate) * (h * 0.8);
      i === 0 ? ctx.lineTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, 0, 0, h);
    areaGrad.addColorStop(0, 'rgba(34, 136, 255, 0.25)');
    areaGrad.addColorStop(1, 'rgba(34, 136, 255, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Stroke line on top
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(34, 136, 255, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < nBins; i++) {
      const x = (i / nBins) * w;
      const y = h - (binCounts[i] / maxRate) * (h * 0.8);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ── Layer 2: Spike burst bars (yellow) ──────────────────────────
    // Detect bursts: bins where activity exceeds 2x mean
    const mean = binCounts.reduce((s, v) => s + v, 0) / nBins;
    const burstThreshold = Math.max(mean * 2, 0.1);

    for (let i = 0; i < nBins; i++) {
      if (binCounts[i] > burstThreshold) {
        const x = (i / nBins) * w;
        const barW = Math.max(1, w / nBins);
        const intensity = Math.min(1, binCounts[i] / maxRate);
        ctx.fillStyle = `rgba(255, 200, 40, ${intensity * 0.5})`;
        ctx.fillRect(x, 0, barW, h);
      }
    }

    // ── Layer 3: Event markers (colored diamonds) ───────────────────
    const modColors: Record<string, string> = {
      lesion: '#ff3366',
      stimulate: '#00ddff',
      silence: '#ffaa22',
      record: '#2288ff',
    };

    for (const mod of modifications) {
      const t = mod.timestamp;
      // Convert wall-clock timestamp to approximate simulation time
      // We can only show markers within our visible window
      const x = toX(t);
      if (x < -10 || x > w + 10) continue;

      const color = modColors[mod.type] ?? '#ffffff';
      const cy = h * 0.15;
      const size = 5;

      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(x, cy - size);
      ctx.lineTo(x + size, cy);
      ctx.lineTo(x, cy + size);
      ctx.lineTo(x - size, cy);
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ── Layer 4: Current time indicator (bright vertical line) ──────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(w - 1, 0);
    ctx.lineTo(w - 1, h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Time labels ─────────────────────────────────────────────────
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    const secInterval = windowMs > 5000 ? 2000 : 1000;
    const firstTick = Math.ceil(tMin / secInterval) * secInterval;
    for (let t = firstTick; t <= latestT; t += secInterval) {
      const x = toX(t);
      ctx.fillText(`${(t / 1000).toFixed(1)}s`, x + 2, h - 3);
      ctx.strokeStyle = 'rgba(140, 170, 200, 0.08)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // ── Legend ───────────────────────────────────────────────────────
    ctx.font = '8px monospace';
    ctx.globalAlpha = 0.45;

    ctx.fillStyle = '#2288ff';
    ctx.fillText('rate', 4, 10);

    ctx.fillStyle = '#ffc828';
    ctx.fillText('burst', 30, 10);

    ctx.globalAlpha = 1;
  }, [spikeHistory, neuronTypes, nNeurons, windowMs, modifications]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: 80,
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
}

/**
 * Self-contained version that reads data from stores.
 * Drop into the Science sidebar tab directly.
 */
export function ActivityTimelineConnected() {
  const frame = useSimulationStore((s) => s.frame);
  const frameHistory = useSimulationStore((s) => s.frameHistory);
  const experiment = useSimulationStore((s) => s.experiment);

  // Build a lightweight spike history from recent frame snapshots
  // We store the last N frames' spike data in a rolling buffer
  const spikeHistoryRef = useRef<Array<{ t_ms: number; spikes: number[] }>>([]);

  useEffect(() => {
    if (!frame) return;
    const buf = spikeHistoryRef.current;
    buf.push({ t_ms: frame.t_ms, spikes: [...frame.spikes] });
    // Keep last ~600 frames (~10s at 60fps)
    if (buf.length > 600) buf.splice(0, buf.length - 600);
  }, [frame]);

  const nNeurons = experiment?.n_neurons ?? 0;

  return (
    <CollapsiblePanel id="activity-timeline" label="Activity Timeline">
      <ActivityTimeline
        spikeHistory={spikeHistoryRef.current}
        nNeurons={nNeurons}
        windowMs={10_000}
      />
    </CollapsiblePanel>
  );
}
