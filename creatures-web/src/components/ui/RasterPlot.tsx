import { useRef, useEffect, useCallback, useState } from 'react';

export interface RasterPlotProps {
  spikeHistory: Array<{ t_ms: number; spikes: number[] }>;
  neuronTypes?: Record<number, 'sensory' | 'inter' | 'motor'>;
  nNeurons: number;
  windowMs?: number; // default 500
}

/**
 * Canvas-based raster plot showing spike times for all neurons.
 * X axis: time (ms), Y axis: neurons sorted by type (sensory top, inter middle, motor bottom).
 * Each spike rendered as a small dot, colored by neuron type.
 * Optional burst detection overlay highlights windows where >30% of neurons fire simultaneously.
 */
export function RasterPlot({
  spikeHistory,
  neuronTypes,
  nNeurons,
  windowMs = 500,
}: RasterPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [showBursts, setShowBursts] = useState(true);

  // Build a sorted index: sensory neurons first, then inter, then motor.
  // Returns an array where sortedOrder[displayRow] = original neuron index.
  const buildSortedOrder = useCallback(() => {
    const sensory: number[] = [];
    const inter: number[] = [];
    const motor: number[] = [];
    const unknown: number[] = [];

    for (let i = 0; i < nNeurons; i++) {
      const t = neuronTypes?.[i];
      if (t === 'sensory') sensory.push(i);
      else if (t === 'inter') inter.push(i);
      else if (t === 'motor') motor.push(i);
      else unknown.push(i);
    }

    // unknown neurons go into the inter (middle) band
    return [...sensory, ...inter, ...unknown, ...motor];
  }, [nNeurons, neuronTypes]);

  // Build reverse lookup: originalIndex -> displayRow
  const buildReverseMap = useCallback(
    (sortedOrder: number[]) => {
      const map = new Map<number, number>();
      for (let i = 0; i < sortedOrder.length; i++) {
        map.set(sortedOrder[i], i);
      }
      return map;
    },
    [],
  );

  const TYPE_COLORS: Record<string, string> = {
    sensory: '#00ff88', // green
    inter: '#00ccff',   // blue/cyan
    motor: '#ff4466',   // red
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

    if (spikeHistory.length === 0 || nNeurons === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Waiting for spike data...', 8, h / 2);
      return;
    }

    const sortedOrder = buildSortedOrder();
    const reverseMap = buildReverseMap(sortedOrder);

    // Determine time window
    const latestT = spikeHistory[spikeHistory.length - 1].t_ms;
    const tMin = latestT - windowMs;
    const tMax = latestT;

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.12)';
    ctx.lineWidth = 0.5;
    // Horizontal grid: every 50 neurons
    const neuronStep = Math.max(10, Math.ceil(nNeurons / 8));
    for (let n = 0; n < nNeurons; n += neuronStep) {
      const y = (n / nNeurons) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical grid: every 100ms
    for (let t = Math.ceil(tMin / 100) * 100; t <= tMax; t += 100) {
      const x = ((t - tMin) / windowMs) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw spikes
    const dotRadius = Math.max(1, Math.min(2, h / nNeurons * 0.4));

    for (let fi = 0; fi < spikeHistory.length; fi++) {
      const frame = spikeHistory[fi];
      if (frame.t_ms < tMin) continue;

      const x = ((frame.t_ms - tMin) / windowMs) * w;

      for (let si = 0; si < frame.spikes.length; si++) {
        const neuronIdx = frame.spikes[si];
        if (neuronIdx < 0 || neuronIdx >= nNeurons) continue;

        const row = reverseMap.get(neuronIdx) ?? neuronIdx;
        const y = (row / nNeurons) * h;

        const nType = neuronTypes?.[neuronIdx] ?? 'inter';
        ctx.fillStyle = TYPE_COLORS[nType] ?? '#00ccff';

        ctx.fillRect(x - dotRadius, y - dotRadius, dotRadius * 2, dotRadius * 2);
      }
    }

    // Burst detection overlay: a "burst" = >30% of neurons firing within a 5ms window
    if (showBursts && nNeurons > 0) {
      const BURST_WINDOW_MS = 5;
      const BURST_THRESHOLD = 0.30;

      // Scan through time in 5ms bins within the visible window
      const binStart = Math.floor(tMin / BURST_WINDOW_MS) * BURST_WINDOW_MS;
      const binEnd = tMax;

      for (let binT = binStart; binT < binEnd; binT += BURST_WINDOW_MS) {
        const binTEnd = binT + BURST_WINDOW_MS;

        // Count unique neurons that fire within this bin
        const firedNeurons = new Set<number>();
        for (let fi = 0; fi < spikeHistory.length; fi++) {
          const frame = spikeHistory[fi];
          if (frame.t_ms < binT || frame.t_ms >= binTEnd) continue;
          for (let si = 0; si < frame.spikes.length; si++) {
            firedNeurons.add(frame.spikes[si]);
          }
        }

        const fraction = firedNeurons.size / nNeurons;
        if (fraction >= BURST_THRESHOLD) {
          // Draw semi-transparent rectangle behind this burst region
          const x1 = ((Math.max(binT, tMin) - tMin) / windowMs) * w;
          const x2 = ((Math.min(binTEnd, tMax) - tMin) / windowMs) * w;

          // Scale opacity with burst intensity (0.15 base, up to 0.3 for 100%)
          const intensity = Math.min(fraction, 1);
          const alpha = 0.10 + intensity * 0.15;

          ctx.fillStyle = `rgba(255, 180, 40, ${alpha.toFixed(3)})`;
          ctx.fillRect(x1, 0, x2 - x1, h);
        }
      }
    }

    // Type band labels
    ctx.font = '9px monospace';
    ctx.globalAlpha = 0.35;
    let sensoryCount = 0;
    let interCount = 0;
    let motorCount = 0;
    for (let i = 0; i < nNeurons; i++) {
      const t = neuronTypes?.[i];
      if (t === 'sensory') sensoryCount++;
      else if (t === 'motor') motorCount++;
      else interCount++;
    }

    if (sensoryCount > 0) {
      ctx.fillStyle = '#00ff88';
      ctx.fillText('S', 3, (sensoryCount / nNeurons) * h * 0.5 + 4);
    }
    if (interCount > 0) {
      ctx.fillStyle = '#00ccff';
      const interStart = sensoryCount / nNeurons;
      ctx.fillText('I', 3, (interStart + interCount / nNeurons * 0.5) * h + 4);
    }
    if (motorCount > 0) {
      ctx.fillStyle = '#ff4466';
      const motorStart = (sensoryCount + interCount) / nNeurons;
      ctx.fillText('M', 3, (motorStart + motorCount / nNeurons * 0.5) * h + 4);
    }
    ctx.globalAlpha = 1;

    // Time axis label
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.round(tMin)}ms`, 4, h - 4);
    ctx.fillText(`${Math.round(tMax)}ms`, w - 48, h - 4);
  }, [spikeHistory, neuronTypes, nNeurons, windowMs, buildSortedOrder, buildReverseMap, showBursts]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
          checked={showBursts}
          onChange={(e) => setShowBursts(e.target.checked)}
          style={{ width: 10, height: 10, accentColor: '#ffb428' }}
        />
        Show bursts
      </label>
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        style={{ width: '100%', height: '200px', borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
