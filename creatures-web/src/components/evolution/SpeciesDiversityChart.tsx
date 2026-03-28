import { useRef, useEffect } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';

interface Props {
  width?: number;
  height?: number;
}

export function SpeciesDiversityChart({ width = 220, height = 100 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speciesHistory = useEvolutionStore((s) => s.speciesHistory);
  const generations = useEvolutionStore((s) => s.fitnessHistory.generations);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const w = width;
    const h = height;
    const pad = { top: 8, right: 8, bottom: 20, left: 28 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    }

    if (speciesHistory.length < 1) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting species data...', w / 2, h / 2);
      return;
    }

    // Data
    const maxVal = Math.max(1, ...speciesHistory) + 1;

    // Area fill
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    for (let i = 0; i < speciesHistory.length; i++) {
      const x = pad.left + (i / Math.max(1, speciesHistory.length - 1)) * plotW;
      const y = pad.top + plotH - (speciesHistory[i] / maxVal) * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(pad.left + ((speciesHistory.length - 1) / Math.max(1, speciesHistory.length - 1)) * plotW, pad.top + plotH);
    ctx.closePath();
    const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    areaGrad.addColorStop(0, 'rgba(255, 170, 34, 0.15)');
    areaGrad.addColorStop(1, 'rgba(255, 170, 34, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < speciesHistory.length; i++) {
      const x = pad.left + (i / Math.max(1, speciesHistory.length - 1)) * plotW;
      const y = pad.top + plotH - (speciesHistory[i] / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#ffaa22';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Single dot if only 1 point
    if (speciesHistory.length === 1) {
      const x = pad.left;
      const y = pad.top + plotH - (speciesHistory[0] / maxVal) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffaa22';
      ctx.fill();
    }

    // Y-axis labels
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round((maxVal * (4 - i)) / 4);
      const y = pad.top + (i / 4) * plotH + 3;
      ctx.fillText(String(val), pad.left - 4, y);
    }

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Generation', w / 2, h - 2);

  }, [speciesHistory, generations, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
