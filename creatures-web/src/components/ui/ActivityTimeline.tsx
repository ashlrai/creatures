import { useRef, useEffect, useCallback } from 'react';

export interface ActivityTimelineProps {
  /** Recent frames with spike and type information. */
  spikeHistory: Array<{ t_ms: number; spikes: number[] }>;
  neuronTypes?: Record<number, 'sensory' | 'inter' | 'motor'>;
  nNeurons: number;
  windowMs?: number; // default 500
}

/**
 * Timeline of neural events: oscilloscope-style traces showing
 * total active, motor, and sensory neuron counts over time.
 * Canvas 2D with smooth lines and grid.
 */
export function ActivityTimeline({
  spikeHistory,
  neuronTypes,
  nNeurons,
  windowMs = 500,
}: ActivityTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

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

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.15)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += h / 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let x = 0; x < w; x += w / 10) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    if (spikeHistory.length < 2 || nNeurons === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Waiting for activity data...', 8, h / 2);
      return;
    }

    // Determine time window
    const latestT = spikeHistory[spikeHistory.length - 1].t_ms;
    const tMin = latestT - windowMs;

    // Compute per-frame counts
    type Counts = { t_ms: number; total: number; sensory: number; motor: number };
    const counts: Counts[] = [];

    for (const frame of spikeHistory) {
      if (frame.t_ms < tMin) continue;

      let total = 0;
      let sensory = 0;
      let motor = 0;

      // Count unique spiking neurons per type
      for (const neuronIdx of frame.spikes) {
        total++;
        const nType = neuronTypes?.[neuronIdx];
        if (nType === 'sensory') sensory++;
        else if (nType === 'motor') motor++;
      }

      counts.push({ t_ms: frame.t_ms, total, sensory, motor });
    }

    if (counts.length < 2) return;

    // Find max for Y scaling
    const maxCount = Math.max(5, ...counts.map((c) => c.total));
    const yPad = h * 0.05;
    const yRange = h - yPad * 2;

    const toX = (t: number) => ((t - tMin) / windowMs) * w;
    const toY = (v: number) => h - yPad - (v / maxCount) * yRange;

    // Draw line helper
    const drawLine = (
      values: Counts[],
      getter: (c: Counts) => number,
      color: string,
      lineWidth: number,
      glowBlur: number,
    ) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (glowBlur > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glowBlur;
      }

      for (let i = 0; i < values.length; i++) {
        const x = toX(values[i].t_ms);
        const y = toY(getter(values[i]));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // Total active (cyan)
    drawLine(counts, (c) => c.total, '#00ccff', 1.5, 4);

    // Motor (magenta)
    drawLine(counts, (c) => c.motor, '#ff2288', 1.2, 3);

    // Sensory (green)
    drawLine(counts, (c) => c.sensory, '#00ff88', 1.2, 3);

    // Legend
    ctx.font = '9px monospace';
    ctx.globalAlpha = 0.5;

    ctx.fillStyle = '#00ccff';
    ctx.fillText('total', 4, 10);

    ctx.fillStyle = '#ff2288';
    ctx.fillText('motor', 40, 10);

    ctx.fillStyle = '#00ff88';
    ctx.fillText('sensory', 80, 10);

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'rgba(140, 170, 200, 1)';
    ctx.fillText(`max: ${maxCount}`, w - 55, 10);
    ctx.globalAlpha = 1;
  }, [spikeHistory, neuronTypes, nNeurons, windowMs]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={120}
      style={{ width: '100%', height: '120px', borderRadius: 4, display: 'block' }}
    />
  );
}
