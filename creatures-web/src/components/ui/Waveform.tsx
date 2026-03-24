import { useRef, useEffect } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

export function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useSimulationStore((s) => s.frameHistory);

  useEffect(() => {
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
    for (let x = 0; x < w; x += w / 8) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    if (history.length < 2) return;

    const data = history.slice(-200);
    const maxActive = Math.max(60, ...data.map(d => d.n_active));

    // Activity trace (cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ccff';
    ctx.shadowBlur = 6;
    for (let i = 0; i < data.length; i++) {
      const x = (i / 200) * w;
      const y = h - (data[i].n_active / maxActive) * h * 0.85 - h * 0.05;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Displacement trace (green)
    const maxDisp = Math.max(0.01, ...data.map(d => d.displacement));
    ctx.beginPath();
    ctx.strokeStyle = '#00ff8844';
    ctx.lineWidth = 1;
    for (let i = 0; i < data.length; i++) {
      const x = (i / 200) * w;
      const y = h - (data[i].displacement / maxDisp) * h * 0.7 - h * 0.05;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Scanline
    const scanX = ((data.length % 200) / 200) * w;
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(scanX, 0); ctx.lineTo(scanX, h); ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(160, 190, 220, 0.35)';
    ctx.font = '9px monospace';
    ctx.fillText('neurons', 4, 10);
    ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
    ctx.fillText('displacement', 4, 20);
  }, [history]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={52}
      style={{ width: '100%', height: '100%', borderRadius: 4 }}
    />
  );
}
