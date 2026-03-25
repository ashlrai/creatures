import { useRef, useEffect, useCallback } from 'react';
import { useSTDPStore } from '../../stores/stdpStore';

/**
 * Time series chart of STDP learning metrics over time.
 * Primary trace: total |delta-w| (teal/cyan line).
 * Secondary dots: n_potentiated (green) and n_depressed (red).
 * Canvas line chart on dark background.
 */
export function LearningCurve() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const snapshots = useSTDPStore((s) => s.weightSnapshots);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    if (snapshots.length < 2) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Collecting snapshots...', 8, h / 2);
      return;
    }

    const marginL = 32;
    const marginR = 8;
    const marginT = 14;
    const marginB = 18;
    const plotW = w - marginL - marginR;
    const plotH = h - marginT - marginB;

    // Compute ranges
    let maxAbsChange = 0;
    let maxCount = 0;
    for (const s of snapshots) {
      if (s.changes.total_abs_change > maxAbsChange) maxAbsChange = s.changes.total_abs_change;
      const cnt = Math.max(s.changes.n_potentiated, s.changes.n_depressed);
      if (cnt > maxCount) maxCount = cnt;
    }
    if (maxAbsChange < 1e-12) maxAbsChange = 1;
    if (maxCount < 1) maxCount = 1;

    const n = snapshots.length;
    const idxToX = (i: number) => marginL + (i / (n - 1)) * plotW;
    const valToY = (v: number) => marginT + plotH - (v / maxAbsChange) * plotH;
    const countToY = (c: number) => marginT + plotH - (c / maxCount) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.15)';
    ctx.lineWidth = 0.5;
    for (let frac = 0; frac <= 1; frac += 0.25) {
      const y = marginT + plotH * (1 - frac);
      ctx.beginPath(); ctx.moveTo(marginL, y); ctx.lineTo(w - marginR, y); ctx.stroke();
    }

    // Total abs change line (primary)
    ctx.beginPath();
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const x = idxToX(i);
      const y = valToY(snapshots[i].changes.total_abs_change);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(idxToX(n - 1), marginT + plotH);
    ctx.lineTo(idxToX(0), marginT + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 200, 255, 0.06)';
    ctx.fill();

    // Potentiated dots (green) and depressed dots (red)
    for (let i = 0; i < n; i++) {
      const x = idxToX(i);
      // Potentiated
      ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
      ctx.beginPath();
      ctx.arc(x, countToY(snapshots[i].changes.n_potentiated), 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Depressed
      ctx.fillStyle = 'rgba(255, 68, 102, 0.5)';
      ctx.beginPath();
      ctx.arc(x, countToY(snapshots[i].changes.n_depressed), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Current values labels
    const latest = snapshots[n - 1];
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    ctx.fillStyle = '#00ccff';
    ctx.fillText(`|dw|: ${latest.changes.total_abs_change.toFixed(4)}`, w - 4, 2);

    ctx.fillStyle = 'rgba(0, 255, 136, 0.7)';
    ctx.fillText(`+${latest.changes.n_potentiated}`, w - 4, 12);

    ctx.fillStyle = 'rgba(255, 68, 102, 0.7)';
    ctx.fillText(`-${latest.changes.n_depressed}`, w - 4, 22);

    // Y axis label
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(maxAbsChange.toFixed(3), marginL - 3, marginT);
    ctx.fillText('0', marginL - 3, marginT + plotH);

    // X axis label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('snapshot', w / 2, h - 10);
  }, [snapshots]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      style={{ width: '200px', height: '120px', borderRadius: 4, display: 'block' }}
    />
  );
}
