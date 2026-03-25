import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 2D PCA projection of neural population state.
 * Each dot is a timepoint projected onto the top 2 principal components.
 * Older points are dimmer; a trailing tail connects the most recent 20 points.
 *
 * Self-contained: reads frame data from useSimulationStore and accumulates
 * the last 100 frames of firing_rates internally.
 */
export function PopulationProjection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Array<number[]>>([]);
  const lastTRef = useRef<number>(-1);

  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 0;

  const BUFFER_SIZE = 100;
  const TAIL_LENGTH = 20;

  // Power iteration to find top eigenvector of a symmetric matrix
  const powerIteration = (
    matrix: number[][],
    dim: number,
    nIter: number = 50,
  ): number[] => {
    let v = new Array(dim);
    for (let i = 0; i < dim; i++) v[i] = Math.sin(i * 1.37 + 0.7);

    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-12) { v[0] = 1; norm = 1; }
    for (let i = 0; i < dim; i++) v[i] /= norm;

    for (let iter = 0; iter < nIter; iter++) {
      const mv = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        let sum = 0;
        for (let j = 0; j < dim; j++) sum += matrix[i][j] * v[j];
        mv[i] = sum;
      }
      norm = Math.sqrt(mv.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-12) break;
      for (let i = 0; i < dim; i++) v[i] = mv[i] / norm;
    }
    return v;
  };

  // Deflate matrix: remove component corresponding to eigenvector v
  const deflate = (matrix: number[][], v: number[], dim: number): number[][] => {
    let eigenvalue = 0;
    for (let i = 0; i < dim; i++) {
      let row = 0;
      for (let j = 0; j < dim; j++) row += matrix[i][j] * v[j];
      eigenvalue += v[i] * row;
    }

    const result: number[][] = [];
    for (let i = 0; i < dim; i++) {
      result[i] = new Array(dim);
      for (let j = 0; j < dim; j++) {
        result[i][j] = matrix[i][j] - eigenvalue * v[i] * v[j];
      }
    }
    return result;
  };

  // Accumulate firing rates from each new frame
  useEffect(() => {
    if (!frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    bufferRef.current.push([...frame.firing_rates]);
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }
  }, [frame]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    const buffer = bufferRef.current;
    if (buffer.length < 5 || nNeurons === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Accumulating data...', 8, h / 2);
      return;
    }

    const T = buffer.length;
    const D = Math.min(nNeurons, buffer[0].length);
    if (D < 2) return;

    // Center the data (subtract mean per neuron)
    const means = new Array(D).fill(0);
    for (let t = 0; t < T; t++) {
      for (let d = 0; d < D; d++) means[d] += buffer[t][d] ?? 0;
    }
    for (let d = 0; d < D; d++) means[d] /= T;

    const centered: number[][] = [];
    for (let t = 0; t < T; t++) {
      centered[t] = new Array(D);
      for (let d = 0; d < D; d++) centered[t][d] = (buffer[t][d] ?? 0) - means[d];
    }

    // Compute covariance matrix (capD x capD) for performance
    const capD = Math.min(D, 60);
    const cov: number[][] = [];
    for (let i = 0; i < capD; i++) {
      cov[i] = new Array(capD).fill(0);
      for (let j = i; j < capD; j++) {
        let sum = 0;
        for (let t = 0; t < T; t++) sum += centered[t][i] * centered[t][j];
        cov[i][j] = sum / (T - 1);
        if (j !== i) {
          if (!cov[j]) cov[j] = new Array(capD).fill(0);
          cov[j][i] = cov[i][j];
        }
      }
    }

    // Extract top 2 eigenvectors via power iteration + deflation
    const pc1 = powerIteration(cov, capD);
    const deflated = deflate(cov, pc1, capD);
    const pc2 = powerIteration(deflated, capD);

    // Project each timepoint to 2D
    const projected: [number, number][] = [];
    for (let t = 0; t < T; t++) {
      let x = 0, y = 0;
      for (let d = 0; d < capD; d++) {
        x += centered[t][d] * pc1[d];
        y += centered[t][d] * pc2[d];
      }
      projected.push([x, y]);
    }

    // Auto-scale axes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of projected) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;
    const pad = 0.1;
    minX -= rangeX * pad; maxX += rangeX * pad;
    minY -= rangeY * pad; maxY += rangeY * pad;

    const margin = 16;
    const plotW = w - margin * 2;
    const plotH = h - margin * 2;

    const toCanvasX = (v: number) => margin + ((v - minX) / (maxX - minX)) * plotW;
    const toCanvasY = (v: number) => margin + ((v - minY) / (maxY - minY)) * plotH;

    // Draw subtle grid / axes through zero
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.15)';
    ctx.lineWidth = 0.5;
    const zeroX = toCanvasX(0);
    const zeroY = toCanvasY(0);
    if (zeroX > margin && zeroX < w - margin) {
      ctx.beginPath(); ctx.moveTo(zeroX, margin); ctx.lineTo(zeroX, h - margin); ctx.stroke();
    }
    if (zeroY > margin && zeroY < h - margin) {
      ctx.beginPath(); ctx.moveTo(margin, zeroY); ctx.lineTo(w - margin, zeroY); ctx.stroke();
    }

    // Draw trailing tail (recent TAIL_LENGTH points)
    const tailStart = Math.max(0, T - TAIL_LENGTH);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.25)';
    ctx.lineWidth = 1.5;
    for (let t = tailStart; t < T; t++) {
      const cx = toCanvasX(projected[t][0]);
      const cy = toCanvasY(projected[t][1]);
      if (t === tailStart) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Draw scatter dots
    for (let t = 0; t < T; t++) {
      const cx = toCanvasX(projected[t][0]);
      const cy = toCanvasY(projected[t][1]);

      // Age-based coloring: older = dimmer blue, recent = bright cyan
      const age = t / (T - 1); // 0=oldest, 1=newest
      const alpha = 0.15 + age * 0.7;
      const green = Math.round(100 + age * 155);
      const blue = Math.round(180 + age * 75);

      ctx.fillStyle = `rgba(0, ${green}, ${blue}, ${alpha})`;
      const radius = t === T - 1 ? 4 : 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight current state with ring
    const last = projected[T - 1];
    const lx = toCanvasX(last[0]);
    const ly = toCanvasY(last[1]);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('PC1', w - margin - 16, h - 4);
    ctx.save();
    ctx.translate(6, margin + 14);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('PC2', 0, 0);
    ctx.restore();

    ctx.fillText(`${T} pts`, 4, h - 4);
  }, [nNeurons]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, frame]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      style={{ width: '200px', height: '200px', borderRadius: 4, display: 'block' }}
    />
  );
}
