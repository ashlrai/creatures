import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useAnalysisWorker } from '../../hooks/useAnalysisWorker';

/**
 * Canvas-based mutual information heatmap.
 * Self-contained: maintains internal firing rate buffer (last 200 frames),
 * uses useAnalysisWorker() to compute MI every 60 frames once buffer >= 50.
 * Dark -> bright cyan color scale.
 */
export function MutualInfoMatrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Array<number[]>>([]);
  const frameCountRef = useRef<number>(0);
  const lastTRef = useRef<number>(-1);

  const frame = useSimulationStore((s) => s.frame);
  const { computeMI, miResult, pending, degradationWarning } = useAnalysisWorker();

  const BUFFER_SIZE = 200;
  const MIN_FRAMES = 50;
  const UPDATE_INTERVAL = 60;

  // Accumulate firing rates and trigger MI computation
  useEffect(() => {
    if (!frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    bufferRef.current.push([...frame.firing_rates]);
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }
    frameCountRef.current++;

    if (
      frameCountRef.current % UPDATE_INTERVAL === 0 &&
      bufferRef.current.length >= MIN_FRAMES
    ) {
      computeMI(bufferRef.current);
    }
  }, [frame, computeMI]);

  // MI value -> color: dark (#050510) at 0, bright cyan (#00ffff) at max
  const miToColor = (v: number, maxVal: number): [number, number, number] => {
    const t = maxVal > 1e-9 ? Math.min(1, v / maxVal) : 0;
    return [
      Math.round(5 + t * 0),
      Math.round(5 + t * 250),
      Math.round(16 + t * 239),
    ];
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

    if (!miResult || !miResult.miMatrix || miResult.miMatrix.length === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Accumulating data...', 8, h / 2);
      return;
    }

    const { miMatrix } = miResult;
    const n = miMatrix.length;

    // Find max MI (excluding diagonal)
    let maxMI = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && miMatrix[i][j] > maxMI) maxMI = miMatrix[i][j];
      }
    }

    const margin = n > 10 ? 8 : 16;
    const plotSize = Math.min(w, h) - margin * 2;
    const cellSize = plotSize / n;

    if (n > 10) {
      // Use ImageData for large matrices
      const imageData = ctx.createImageData(w, h);
      const pixels = imageData.data;

      // Fill background
      for (let p = 0; p < pixels.length; p += 4) {
        pixels[p] = 5; pixels[p + 1] = 5; pixels[p + 2] = 13; pixels[p + 3] = 255;
      }

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const val = miMatrix[i][j];
          const [r, g, b] = miToColor(val, maxMI);
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
      // Small matrix: fillRect with gaps
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const val = miMatrix[i][j];
          const [r, g, b] = miToColor(val, maxMI);
          const x = margin + j * cellSize;
          const y = margin + i * cellSize;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

          // Value label
          if (cellSize > 20) {
            ctx.fillStyle = val / maxMI > 0.5 ? '#fff' : 'rgba(200,200,200,0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
          }
        }
      }
    }

    // Color scale legend
    const legendY = h - 10;
    const legendW = 50;
    const legendX = w - legendW - 8;
    for (let i = 0; i < legendW; i++) {
      const t = i / legendW;
      const [r, g, b] = miToColor(t * maxMI, maxMI);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(legendX + i, legendY, 1, 6);
    }
    ctx.fillStyle = 'rgba(140, 170, 200, 0.35)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('0', legendX - 8, legendY - 1);
    ctx.textAlign = 'right';
    ctx.fillText(maxMI.toFixed(2), legendX + legendW + 24, legendY - 1);

    // Frame count
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(`${bufferRef.current.length} frames`, 4, h - 4);
  }, [miResult]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, frame]);

  return (
    <div
      style={{
        position: 'relative',
        width: '200px',
        background: 'var(--glass-bg, rgba(10, 12, 28, 0.75))',
        border: '1px solid var(--glass-border, rgba(80, 120, 200, 0.15))',
        borderRadius: '8px',
        padding: '6px',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'var(--label-color, rgba(140, 170, 200, 0.6))',
          marginBottom: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Mutual Information</span>
        {pending && (
          <span style={{ color: 'rgba(0, 204, 255, 0.6)', fontSize: '9px' }}>
            Computing...
          </span>
        )}
      </div>
      {degradationWarning && (
        <div
          style={{
            fontSize: '8px',
            fontFamily: 'monospace',
            color: '#ff8844',
            marginBottom: '2px',
          }}
        >
          {degradationWarning}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={200}
        height={200}
        style={{ width: '200px', height: '200px', borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
