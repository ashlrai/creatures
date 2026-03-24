import { useRef, useEffect } from 'react';
import { useSimulationStore } from '../stores/simulationStore';

const WIDTH = 300;
const HEIGHT = 120;

function rateToColor(rate: number): [number, number, number] {
  const t = Math.min(rate / 200, 1);
  if (t < 0.33) {
    const s = t * 3;
    return [0, s * 100, 180 - s * 80]; // dark blue → cyan
  } else if (t < 0.66) {
    const s = (t - 0.33) * 3;
    return [s * 255, 100 + s * 155, 100 - s * 100]; // cyan → yellow
  } else {
    const s = (t - 0.66) * 3;
    return [255, 255 * (1 - s * 0.7), 0]; // yellow → red
  }
}

export function ActivityHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useSimulationStore((s) => s.frame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !frame.firing_rates) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rates = frame.firing_rates;
    const n = rates.length;
    if (n === 0) return;

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(n * (WIDTH / HEIGHT)));
    const rows = Math.ceil(n / cols);
    const cellW = WIDTH / cols;
    const cellH = HEIGHT / rows;

    // Clear
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw each neuron as a colored cell
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rate = rates[i];

      if (rate > 0.1) {
        const [r, g, b] = rateToColor(rate);
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      } else {
        ctx.fillStyle = '#0f0f1a';
      }
      ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px monospace';
    ctx.fillText(`${n} neurons | ${frame.n_active} active | t=${frame.t_ms.toFixed(0)}ms`, 4, HEIGHT - 4);
  }, [frame]);

  return (
    <div style={{
      background: 'rgba(10, 10, 20, 0.85)',
      borderRadius: 8,
      padding: '8px 12px',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, opacity: 0.6 }}>
        NEURAL ACTIVITY MAP
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        style={{ borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
