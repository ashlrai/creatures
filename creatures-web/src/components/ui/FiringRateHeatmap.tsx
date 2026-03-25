import { useRef, useEffect, useCallback } from 'react';

export interface FiringRateHeatmapProps {
  /** Recent frames with firing rate data. Last 200 frames will be used. */
  rateHistory: Array<{ t_ms: number; firing_rates: number[] }>;
  neuronTypes?: Record<number, 'sensory' | 'inter' | 'motor'>;
  nNeurons: number;
}

/**
 * Heatmap showing firing rates across all neurons over time.
 * X axis: time (frames), Y axis: neurons sorted by type.
 * Color: dark blue (0 Hz) -> cyan -> green -> yellow -> red (high Hz).
 */
export function FiringRateHeatmap({
  rateHistory,
  neuronTypes,
  nNeurons,
}: FiringRateHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Build sorted order: sensory -> inter -> motor
  const buildSortedOrder = useCallback(() => {
    const sensory: number[] = [];
    const inter: number[] = [];
    const motor: number[] = [];

    for (let i = 0; i < nNeurons; i++) {
      const t = neuronTypes?.[i];
      if (t === 'sensory') sensory.push(i);
      else if (t === 'motor') motor.push(i);
      else inter.push(i);
    }
    return [...sensory, ...inter, ...motor];
  }, [nNeurons, neuronTypes]);

  // Maps a normalized rate (0-1) to an RGB color along the heatmap scale
  const rateToColor = (t: number): [number, number, number] => {
    // dark blue -> cyan -> green -> yellow -> red
    if (t < 0.25) {
      const s = t / 0.25;
      return [5, Math.round(10 + s * 90), Math.round(40 + s * 160)]; // dark blue -> cyan
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return [Math.round(s * 30), Math.round(100 + s * 155), Math.round(200 - s * 100)]; // cyan -> green
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return [Math.round(30 + s * 225), Math.round(255 - s * 30), Math.round(100 - s * 80)]; // green -> yellow
    } else {
      const s = (t - 0.75) / 0.25;
      return [255, Math.round(225 - s * 225), Math.round(20 - s * 20)]; // yellow -> red
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    if (rateHistory.length === 0 || nNeurons === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Waiting for firing rate data...', 8, h / 2);
      return;
    }

    const sortedOrder = buildSortedOrder();
    const data = rateHistory.slice(-200);
    const nFrames = data.length;

    // Find max firing rate for normalization
    let maxRate = 1;
    for (let fi = 0; fi < nFrames; fi++) {
      const rates = data[fi].firing_rates;
      for (let ni = 0; ni < rates.length; ni++) {
        if (rates[ni] > maxRate) maxRate = rates[ni];
      }
    }

    // Calculate cell sizes
    const cellH = h / nNeurons;

    // Use ImageData for performance when neuron count is high
    const imageData = ctx.createImageData(w, h);
    const pixels = imageData.data;

    for (let fi = 0; fi < nFrames; fi++) {
      const rates = data[fi].firing_rates;
      const xStart = Math.floor((fi / nFrames) * w);
      const xEnd = Math.floor(((fi + 1) / nFrames) * w);

      for (let row = 0; row < sortedOrder.length; row++) {
        const neuronIdx = sortedOrder[row];
        const rate = neuronIdx < rates.length ? rates[neuronIdx] : 0;
        const normalized = Math.min(rate / maxRate, 1);

        const yStart = Math.floor((row / nNeurons) * h);
        const yEnd = Math.floor(((row + 1) / nNeurons) * h);

        let r: number, g: number, b: number;
        if (normalized < 0.01) {
          r = 5; g = 5; b = 15;
        } else {
          [r, g, b] = rateToColor(normalized);
        }

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

    // Type boundary lines
    let sensoryCount = 0;
    let interCount = 0;
    for (let i = 0; i < nNeurons; i++) {
      const t = neuronTypes?.[i];
      if (t === 'sensory') sensoryCount++;
      else if (t !== 'motor') interCount++;
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    if (sensoryCount > 0 && interCount > 0) {
      const y = (sensoryCount / nNeurons) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (interCount > 0) {
      const y = ((sensoryCount + interCount) / nNeurons) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Labels
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(`${nFrames} frames | max ${maxRate.toFixed(0)} Hz`, 4, h - 4);
  }, [rateHistory, neuronTypes, nNeurons, buildSortedOrder]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={180}
      style={{ width: '100%', height: '180px', borderRadius: 4, display: 'block' }}
    />
  );
}
