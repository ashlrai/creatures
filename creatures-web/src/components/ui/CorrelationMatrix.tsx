import { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Cross-neuron correlation matrix heatmap.
 * Default: 3x3 group-level correlation (sensory / inter / motor).
 * Toggle: full NxN neuron-level (capped at 60 neurons for performance).
 * Blue (negative) -> white (zero) -> red (positive) diverging color scale.
 *
 * Self-contained: reads frame data from useSimulationStore and accumulates
 * the last 200 frames of firing_rates internally.
 */
export function CorrelationMatrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Array<number[]>>([]);
  const frameCountRef = useRef<number>(0);
  const lastTRef = useRef<number>(-1);
  const cachedMatrixRef = useRef<{ matrix: number[][]; labels: string[] } | null>(null);
  const neuronTypeMapRef = useRef<Record<number, 'sensory' | 'inter' | 'motor'>>({});
  const [showFull, setShowFull] = useState(false);

  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 0;

  const BUFFER_SIZE = 200;
  const UPDATE_INTERVAL = 30;
  const MAX_NEURONS_FULL = 60;

  // Load neuron types once
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    (async () => {
      try {
        const res = await fetch(`${base}neuron-types.json`);
        if (!res.ok) return;
        const data: Record<string, { type: 'sensory' | 'inter' | 'motor' }> = await res.json();
        const entries = Object.values(data);
        const map: Record<number, 'sensory' | 'inter' | 'motor'> = {};
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.type === 'sensory' || entry.type === 'inter' || entry.type === 'motor') {
            map[i] = entry.type;
          }
        }
        neuronTypeMapRef.current = map;
      } catch { /* neuron-types.json not available */ }
    })();
  }, []);

  // Classify neurons into groups and build sorted order
  const classifyNeurons = useCallback(() => {
    const neuronTypes = neuronTypeMapRef.current;
    const sensory: number[] = [];
    const inter: number[] = [];
    const motor: number[] = [];

    for (let i = 0; i < nNeurons; i++) {
      const t = neuronTypes[i];
      if (t === 'sensory') sensory.push(i);
      else if (t === 'motor') motor.push(i);
      else inter.push(i);
    }
    return { sensory, inter, motor, sorted: [...sensory, ...inter, ...motor] };
  }, [nNeurons]);

  // Compute Pearson correlation between two series
  const pearson = (a: number[], b: number[]): number => {
    const n = a.length;
    if (n < 3) return 0;

    let sumA = 0, sumB = 0;
    for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
    const meanA = sumA / n;
    const meanB = sumB / n;

    let cov = 0, varA = 0, varB = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      cov += da * db;
      varA += da * da;
      varB += db * db;
    }

    const denom = Math.sqrt(varA * varB);
    if (denom < 1e-12) return 0;
    return cov / denom;
  };

  // Compute averaged group correlation for a pair of neuron groups
  const groupCorrelation = (
    groupA: number[],
    groupB: number[],
    buffer: number[][],
  ): number => {
    if (groupA.length === 0 || groupB.length === 0 || buffer.length < 3) return 0;

    let sum = 0;
    let count = 0;
    for (const a of groupA) {
      const seriesA = buffer.map((f) => f[a] ?? 0);
      for (const b of groupB) {
        const seriesB = buffer.map((f) => f[b] ?? 0);
        sum += pearson(seriesA, seriesB);
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  };

  // Correlation value -> RGB color: blue (negative) -> white (zero) -> red (positive)
  const corrToColor = (r: number): [number, number, number] => {
    const clamped = Math.max(-1, Math.min(1, r));
    if (clamped < 0) {
      const t = 1 + clamped; // 0..1 where 0=fully negative, 1=zero
      return [
        Math.round(30 + t * 225),
        Math.round(60 + t * 195),
        Math.round(180 + t * 75),
      ];
    } else {
      const t = clamped; // 0..1 where 0=zero, 1=fully positive
      return [
        255,
        Math.round(255 - t * 195),
        Math.round(255 - t * 195),
      ];
    }
  };

  // Accumulate firing rates from each new frame
  useEffect(() => {
    if (!frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    bufferRef.current.push([...frame.firing_rates]);
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }
    frameCountRef.current++;

    // Only recompute correlation matrix every UPDATE_INTERVAL frames
    if (frameCountRef.current % UPDATE_INTERVAL !== 0) return;

    const buffer = bufferRef.current;
    const { sensory, inter, motor, sorted } = classifyNeurons();

    if (showFull) {
      // Full NxN correlation matrix (capped at MAX_NEURONS_FULL)
      const indices = sorted.slice(0, MAX_NEURONS_FULL);
      const n = indices.length;
      const neuronTypes = neuronTypeMapRef.current;
      const labels: string[] = indices.map((idx) => {
        const t = neuronTypes[idx];
        if (t === 'sensory') return 'S';
        if (t === 'motor') return 'M';
        return 'I';
      });

      // Pre-extract time series
      const series: number[][] = indices.map((idx) => buffer.map((f) => f[idx] ?? 0));
      const matrix: number[][] = [];

      for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
          if (i === j) {
            matrix[i][j] = 1;
          } else if (j < i) {
            matrix[i][j] = matrix[j][i]; // symmetric
          } else {
            matrix[i][j] = pearson(series[i], series[j]);
          }
        }
      }
      cachedMatrixRef.current = { matrix, labels };
    } else {
      // 3x3 group-level correlation
      const groups = [sensory, inter, motor];
      const groupLabels = ['S', 'I', 'M'];
      const matrix: number[][] = [];

      for (let i = 0; i < 3; i++) {
        matrix[i] = [];
        for (let j = 0; j < 3; j++) {
          if (i === j) {
            matrix[i][j] = groups[i].length > 1
              ? groupCorrelation(groups[i], groups[j], buffer)
              : 1;
          } else if (j < i) {
            matrix[i][j] = matrix[j][i];
          } else {
            matrix[i][j] = groupCorrelation(groups[i], groups[j], buffer);
          }
        }
      }
      cachedMatrixRef.current = { matrix, labels: groupLabels };
    }
  }, [frame, showFull, classifyNeurons]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    const cached = cachedMatrixRef.current;
    if (!cached || cached.matrix.length === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Accumulating data...', 8, h / 2);
      return;
    }

    const { matrix, labels } = cached;
    const n = matrix.length;
    const margin = showFull ? 12 : 28;
    const plotSize = Math.min(w, h) - margin * 2;
    const cellSize = plotSize / n;

    // Draw cells using ImageData for full NxN, fillRect for grouped
    if (n > 10) {
      const imageData = ctx.createImageData(w, h);
      const pixels = imageData.data;

      // Fill background
      for (let p = 0; p < pixels.length; p += 4) {
        pixels[p] = 5; pixels[p + 1] = 5; pixels[p + 2] = 13; pixels[p + 3] = 255;
      }

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const corr = matrix[i][j];
          const [r, g, b] = corrToColor(corr);
          const xStart = Math.floor(margin + j * cellSize);
          const xEnd = Math.floor(margin + (j + 1) * cellSize);
          const yStart = Math.floor(margin + i * cellSize);
          const yEnd = Math.floor(margin + (i + 1) * cellSize);

          for (let y = yStart; y < yEnd && y < h; y++) {
            for (let x = xStart; x < xEnd && x < w; x++) {
              const idx = (y * w + x) * 4;
              pixels[idx] = r;
              pixels[idx + 1] = g;
              pixels[idx + 2] = b;
              pixels[idx + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    } else {
      // Small matrix: use fillRect for cleaner look with gaps
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const corr = matrix[i][j];
          const [r, g, b] = corrToColor(corr);
          const x = margin + j * cellSize;
          const y = margin + i * cellSize;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

          // Value label inside cell
          ctx.fillStyle = Math.abs(corr) > 0.5 ? '#fff' : 'rgba(200,200,200,0.8)';
          ctx.font = '11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(corr.toFixed(2), x + cellSize / 2, y + cellSize / 2);
        }
      }

      // Row/column labels for grouped mode
      const typeColors: Record<string, string> = { S: '#00ff88', I: '#00ccff', M: '#ff4466' };
      for (let i = 0; i < n; i++) {
        const label = labels[i];
        ctx.fillStyle = typeColors[label] ?? 'rgba(140,170,200,0.6)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, margin + i * cellSize + cellSize / 2, margin - 4);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, margin - 4, margin + i * cellSize + cellSize / 2);
      }
    }

    // Draw type boundary lines in full mode
    if (showFull && n > 3) {
      const { sensory, inter } = classifyNeurons();
      const cappedSensory = Math.min(sensory.length, MAX_NEURONS_FULL);
      const cappedInter = Math.min(inter.length, MAX_NEURONS_FULL - cappedSensory);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;

      if (cappedSensory > 0 && cappedSensory < n) {
        const pos = margin + cappedSensory * cellSize;
        ctx.beginPath(); ctx.moveTo(margin, pos); ctx.lineTo(margin + plotSize, pos); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pos, margin); ctx.lineTo(pos, margin + plotSize); ctx.stroke();
      }
      const interEnd = cappedSensory + cappedInter;
      if (interEnd > 0 && interEnd < n) {
        const pos = margin + interEnd * cellSize;
        ctx.beginPath(); ctx.moveTo(margin, pos); ctx.lineTo(margin + plotSize, pos); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pos, margin); ctx.lineTo(pos, margin + plotSize); ctx.stroke();
      }
    }

    // Color scale legend
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const legendY = h - 10;
    const legendW = 60;
    const legendX = w - legendW - 8;
    for (let i = 0; i < legendW; i++) {
      const v = -1 + (2 * i) / legendW;
      const [r, g, b] = corrToColor(v);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(legendX + i, legendY, 1, 6);
    }
    ctx.fillStyle = 'rgba(140, 170, 200, 0.35)';
    ctx.font = '8px monospace';
    ctx.fillText('-1', legendX - 12, legendY - 1);
    ctx.textAlign = 'right';
    ctx.fillText('+1', legendX + legendW + 12, legendY - 1);

    // Frame count label
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(`${bufferRef.current.length} frames`, 4, h - 4);
  }, [showFull, classifyNeurons]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, frame]);

  return (
    <div style={{ position: 'relative', width: '200px' }}>
      <label
        style={{
          position: 'absolute',
          top: 2,
          right: 4,
          zIndex: 1,
          fontSize: '9px',
          fontFamily: 'monospace',
          color: 'rgba(140, 170, 200, 0.5)',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <input
          type="checkbox"
          checked={showFull}
          onChange={(e) => {
            setShowFull(e.target.checked);
            cachedMatrixRef.current = null;
            frameCountRef.current = 0;
          }}
          style={{ width: 10, height: 10, accentColor: '#00ccff' }}
        />
        NxN
      </label>
      <canvas
        ref={canvasRef}
        width={200}
        height={200}
        style={{ width: '200px', height: '200px', borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
