import { useRef, useEffect } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

export function NeuralActivityDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useSimulationStore((s) => s.frame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame?.firing_rates) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const rates = frame.firing_rates;
    const n = rates.length;
    if (n === 0) return;

    // Grid layout
    const cols = Math.ceil(Math.sqrt(n * (w / h)));
    const rows = Math.ceil(n / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const pad = 0.8;

    // Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rate = rates[i];

      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const r = Math.min(cellW, cellH) * pad / 2;

      if (rate > 0.5) {
        const t = Math.min(rate / 150, 1);
        let cr: number, cg: number, cb: number;
        if (t < 0.3) {
          const s = t / 0.3;
          cr = 10 + s * 20; cg = 30 + s * 80; cb = 80 + s * 120;
        } else if (t < 0.7) {
          const s = (t - 0.3) / 0.4;
          cr = 30 + s * 225; cg = 110 + s * 145; cb = 200 - s * 50;
        } else {
          const s = (t - 0.7) / 0.3;
          cr = 255; cg = 255; cb = 150 + s * 105;
        }

        // Glow halo
        if (t > 0.3) {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.5);
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},${t * 0.4})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);
        }

        // Neuron dot
        ctx.beginPath();
        ctx.arc(cx, cy, r * (0.5 + t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        ctx.fill();
      } else {
        // Silent neuron
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0f1a';
        ctx.fill();
      }
    }

    // Label
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '10px monospace';
    ctx.fillText(`${n} neurons | ${frame.n_active} active`, 6, h - 6);
  }, [frame]);

  return (
    <div className="glass" style={{ padding: 8 }}>
      <div className="glass-label">Neural Activity Map</div>
      <canvas
        ref={canvasRef}
        width={256}
        height={380}
        style={{ width: '100%', height: '380px', borderRadius: 6, display: 'block' }}
      />
    </div>
  );
}
