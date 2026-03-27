import { useRef, useEffect, useCallback } from 'react';

interface DataPoint {
  population: number;
  generation: number;
  lineages: number;
  step: number;
}

interface Props {
  width?: number;
  height?: number;
}

export function EvolutionTimeline({ width = 300, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<DataPoint[]>([]);
  const MAX_POINTS = 200;

  const addPoint = useCallback((point: DataPoint) => {
    dataRef.current.push(point);
    if (dataRef.current.length > MAX_POINTS) {
      dataRef.current = dataRef.current.slice(-MAX_POINTS);
    }
  }, []);

  // Expose addPoint via a custom event listener
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) addPoint(detail);
    };
    window.addEventListener('neurevo-evo-data', handler);
    return () => window.removeEventListener('neurevo-evo-data', handler);
  }, [addPoint]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = 'rgba(6, 8, 18, 0.6)';
      ctx.fillRect(0, 0, width, height);

      const data = dataRef.current;
      if (data.length < 2) {
        ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for evolution data...', width / 2, height / 2);
        animId = requestAnimationFrame(render);
        return;
      }

      // Find scales
      const maxPop = Math.max(...data.map(d => d.population), 1);
      const maxGen = Math.max(...data.map(d => d.generation), 1);
      const maxLin = Math.max(...data.map(d => d.lineages), 1);

      const margin = { top: 18, right: 8, bottom: 4, left: 8 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      // Draw lines
      const drawLine = (values: number[], maxVal: number, color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < values.length; i++) {
          const x = margin.left + (i / (values.length - 1)) * plotW;
          const y = margin.top + plotH - (values[i] / maxVal) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      drawLine(data.map(d => d.population), maxPop, '#00d4ff');
      drawLine(data.map(d => d.generation), maxGen, '#ffcc88');
      drawLine(data.map(d => d.lineages), maxLin, '#00ff88');

      // Legend
      ctx.font = '9px monospace';
      const legends = [
        { label: `Pop: ${data[data.length-1].population}`, color: '#00d4ff', x: margin.left },
        { label: `Gen: ${data[data.length-1].generation}`, color: '#ffcc88', x: margin.left + 80 },
        { label: `Lin: ${data[data.length-1].lineages}`, color: '#00ff88', x: margin.left + 155 },
      ];
      for (const l of legends) {
        ctx.fillStyle = l.color;
        ctx.fillRect(l.x, 4, 6, 6);
        ctx.fillStyle = 'rgba(180, 200, 220, 0.6)';
        ctx.textAlign = 'left';
        ctx.fillText(l.label, l.x + 10, 11);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [width, height]);

  return (
    <canvas ref={canvasRef} style={{ width, height, borderRadius: 8, display: 'block' }} />
  );
}
