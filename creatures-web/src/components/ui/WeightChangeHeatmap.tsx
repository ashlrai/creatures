import { useRef, useEffect, useCallback } from 'react';
import { useSTDPStore } from '../../stores/stdpStore';

/**
 * Canvas-based NxN heatmap of delta-weights (current - initial).
 * Red = strengthened, blue = weakened, black = unchanged.
 * Capped at 60x60 — subsamples larger weight matrices.
 */
export function WeightChangeHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const snapshots = useSTDPStore((s) => s.weightSnapshots);
  const initialWeights = useSTDPStore((s) => s.initialWeights);
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const MAX_DIM = 60;

  const divergingColor = (delta: number, maxAbs: number): [number, number, number] => {
    if (maxAbs < 1e-12) return [13, 13, 13];
    const t = Math.max(-1, Math.min(1, delta / maxAbs));
    if (t < 0) {
      // Negative -> blue (0.2, 0.3, 0.8) blended toward black (0.05, 0.05, 0.05)
      const s = -t; // 0..1 intensity
      return [
        Math.round(13 + s * (51 - 13)),
        Math.round(13 + s * (77 - 13)),
        Math.round(13 + s * (204 - 13)),
      ];
    } else {
      // Positive -> red (0.8, 0.2, 0.15) blended toward black
      const s = t;
      return [
        Math.round(13 + s * (204 - 13)),
        Math.round(13 + s * (51 - 13)),
        Math.round(13 + s * (38 - 13)),
      ];
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    if (!latest || !initialWeights) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('No weight data', 8, h / 2);
      return;
    }

    const currentWeights = latest.weights;
    const nWeights = Math.min(currentWeights.length, initialWeights.length);
    // Infer grid dimension: weights is a flattened NxN matrix
    const rawDim = Math.round(Math.sqrt(nWeights));
    const dim = Math.min(rawDim, MAX_DIM);
    const step = rawDim > MAX_DIM ? rawDim / MAX_DIM : 1;

    // Compute deltas and max absolute
    const deltas: number[] = new Array(dim * dim);
    let maxAbsDelta = 0;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        const srcI = Math.floor(i * step);
        const srcJ = Math.floor(j * step);
        const idx = srcI * rawDim + srcJ;
        const d = (idx < nWeights) ? currentWeights[idx] - initialWeights[idx] : 0;
        deltas[i * dim + j] = d;
        if (Math.abs(d) > maxAbsDelta) maxAbsDelta = Math.abs(d);
      }
    }

    // Render heatmap via ImageData
    const margin = 6;
    const plotSize = w - margin * 2;
    const cellSize = plotSize / dim;

    const imageData = ctx.createImageData(w, h);
    const pixels = imageData.data;
    // Fill background
    for (let p = 0; p < pixels.length; p += 4) {
      pixels[p] = 5; pixels[p + 1] = 5; pixels[p + 2] = 13; pixels[p + 3] = 255;
    }

    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        const delta = deltas[i * dim + j];
        const [r, g, b] = divergingColor(delta, maxAbsDelta);
        const xStart = Math.floor(margin + j * cellSize);
        const xEnd = Math.floor(margin + (j + 1) * cellSize);
        const yStart = Math.floor(margin + i * cellSize);
        const yEnd = Math.floor(margin + (i + 1) * cellSize);

        for (let y = yStart; y < yEnd && y < h; y++) {
          for (let x = xStart; x < xEnd && x < w; x++) {
            const pIdx = (y * w + x) * 4;
            pixels[pIdx] = r;
            pixels[pIdx + 1] = g;
            pixels[pIdx + 2] = b;
            pixels[pIdx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Min/max delta labels
    let minDelta = Infinity, maxDelta = -Infinity;
    for (let k = 0; k < deltas.length; k++) {
      if (deltas[k] < minDelta) minDelta = deltas[k];
      if (deltas[k] > maxDelta) maxDelta = deltas[k];
    }

    ctx.fillStyle = 'rgba(80, 130, 220, 0.7)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`min: ${minDelta.toFixed(4)}`, 4, h - 2);

    ctx.fillStyle = 'rgba(220, 80, 60, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(`max: ${maxDelta.toFixed(4)}`, w - 4, h - 2);

    // Color scale legend bar
    const legendW = 50;
    const legendX = (w - legendW) / 2;
    const legendY = h - 10;
    for (let k = 0; k < legendW; k++) {
      const v = -1 + (2 * k) / legendW;
      const [r, g, b] = divergingColor(v * maxAbsDelta, maxAbsDelta);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(legendX + k, legendY, 1, 5);
    }
  }, [latest, initialWeights]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div style={{ position: 'relative', width: '200px' }}>
      <div style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'rgba(140, 170, 200, 0.5)',
        marginBottom: 2,
      }}>
        Synaptic Weight Changes
      </div>
      <canvas
        ref={canvasRef}
        width={200}
        height={200}
        style={{ width: '200px', height: '200px', borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
