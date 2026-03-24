import { useRef, useEffect } from 'react';
import type { FitnessHistory } from '../../types/evolution';

interface FitnessGraphProps {
  history: FitnessHistory;
  width: number;
  height: number;
}

export function FitnessGraph({ history, width, height }: FitnessGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 20, right: 16, bottom: 28, left: 48 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Background
    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.15)';
    ctx.lineWidth = 0.5;
    const nGridY = 5;
    for (let i = 0; i <= nGridY; i++) {
      const y = pad.top + (i / nGridY) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }
    const nGridX = 6;
    for (let i = 0; i <= nGridX; i++) {
      const x = pad.left + (i / nGridX) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
    }

    // Plot border
    ctx.strokeStyle = 'rgba(80, 130, 200, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    if (history.generations.length < 2) {
      // Placeholder text
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting evolution data...', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }

    const gens = history.generations;
    const bestData = history.best;
    const meanData = history.mean;

    // Auto-scale Y axis
    const allValues = [...bestData, ...meanData];
    let yMin = Math.min(...allValues);
    let yMax = Math.max(...allValues);
    const yRange = yMax - yMin;
    // Add 10% padding
    yMin = Math.max(0, yMin - yRange * 0.1);
    yMax = yMax + yRange * 0.1;
    if (yMax === yMin) yMax = yMin + 1;

    const xMin = gens[0];
    const xMax = gens[gens.length - 1];
    const xRange = xMax - xMin || 1;

    const toX = (gen: number) => pad.left + ((gen - xMin) / xRange) * plotW;
    const toY = (val: number) => pad.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

    // Draw mean line (green, behind best)
    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 4;
    for (let i = 0; i < gens.length; i++) {
      const x = toX(gens[i]);
      const y = toY(meanData[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw best line (cyan, on top)
    ctx.beginPath();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 6;
    for (let i = 0; i < gens.length; i++) {
      const x = toX(gens[i]);
      const y = toY(bestData[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Y axis labels
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= nGridY; i++) {
      const val = yMin + ((nGridY - i) / nGridY) * (yMax - yMin);
      const y = pad.top + (i / nGridY) * plotH;
      ctx.fillText(val.toFixed(1), pad.left - 4, y + 3);
    }

    // X axis labels
    ctx.textAlign = 'center';
    for (let i = 0; i <= nGridX; i++) {
      const gen = xMin + (i / nGridX) * xRange;
      const x = pad.left + (i / nGridX) * plotW;
      ctx.fillText(Math.round(gen).toString(), x, pad.top + plotH + 14);
    }

    // Legend
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00d4ff';
    ctx.fillRect(pad.left + 6, pad.top + 6, 12, 2);
    ctx.fillStyle = 'rgba(160, 200, 230, 0.5)';
    ctx.fillText('best', pad.left + 22, pad.top + 10);

    ctx.fillStyle = '#00ff88';
    ctx.fillRect(pad.left + 56, pad.top + 6, 12, 2);
    ctx.fillStyle = 'rgba(160, 200, 230, 0.5)';
    ctx.fillText('mean', pad.left + 72, pad.top + 10);

    // Axis title
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('generation', pad.left + plotW / 2, h - 4);
  }, [history, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', borderRadius: 6, display: 'block' }}
    />
  );
}
