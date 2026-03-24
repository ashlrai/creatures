import { useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DoseResponseChartProps {
  drugName: string;
  ec50: number;
  hillCoefficient: number;
  maxDose?: number;
}

// ---------------------------------------------------------------------------
// Hill equation: response = dose^n / (ec50^n + dose^n)
// ---------------------------------------------------------------------------

function hillResponse(dose: number, ec50: number, n: number): number {
  const dN = Math.pow(dose, n);
  const eN = Math.pow(ec50, n);
  return dN / (eN + dN);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 200;
const PAD = { top: 18, right: 14, bottom: 28, left: 36 };

export function DoseResponseChart({
  drugName,
  ec50,
  hillCoefficient,
  maxDose = 3.0,
}: DoseResponseChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth : 260;
    const height = CHART_HEIGHT;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // --- Grid lines ---
    ctx.strokeStyle = 'rgba(80, 130, 200, 0.08)';
    ctx.lineWidth = 0.5;
    // Horizontal grid (response 0, 0.25, 0.5, 0.75, 1.0)
    for (let r = 0; r <= 1; r += 0.25) {
      const y = PAD.top + plotH * (1 - r);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
    }
    // Vertical grid (dose)
    const doseStep = maxDose <= 2 ? 0.5 : 1.0;
    for (let d = 0; d <= maxDose; d += doseStep) {
      const x = PAD.left + (d / maxDose) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
    }

    // --- Axes ---
    ctx.strokeStyle = 'rgba(140, 170, 200, 0.2)';
    ctx.lineWidth = 1;
    // Y axis
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + plotH);
    ctx.stroke();
    // X axis
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top + plotH);
    ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
    ctx.stroke();

    // --- Sigmoid curve ---
    ctx.beginPath();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const dose = (i / steps) * maxDose;
      const resp = hillResponse(dose, ec50, hillCoefficient);
      const x = PAD.left + (dose / maxDose) * plotW;
      const y = PAD.top + plotH * (1 - resp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Subtle glow pass
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const dose = (i / steps) * maxDose;
      const resp = hillResponse(dose, ec50, hillCoefficient);
      const x = PAD.left + (dose / maxDose) * plotW;
      const y = PAD.top + plotH * (1 - resp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // --- EC50 marker ---
    const ec50X = PAD.left + (ec50 / maxDose) * plotW;
    const ec50Y = PAD.top + plotH * (1 - 0.5); // response = 0.5 at EC50
    // Dashed line from axis to point
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 1;
    // Vertical dashed
    ctx.beginPath();
    ctx.moveTo(ec50X, PAD.top + plotH);
    ctx.lineTo(ec50X, ec50Y);
    ctx.stroke();
    // Horizontal dashed
    ctx.beginPath();
    ctx.moveTo(PAD.left, ec50Y);
    ctx.lineTo(ec50X, ec50Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // EC50 dot
    ctx.beginPath();
    ctx.arc(ec50X, ec50Y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00d4ff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ec50X, ec50Y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // EC50 label
    ctx.font = '9px "SF Mono", "Fira Code", monospace';
    ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.textAlign = 'left';
    ctx.fillText(`EC50=${ec50}`, ec50X + 6, ec50Y - 4);

    // --- Axis labels ---
    ctx.font = '9px "SF Mono", "Fira Code", monospace';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';

    // X axis ticks
    ctx.textAlign = 'center';
    for (let d = 0; d <= maxDose; d += doseStep) {
      const x = PAD.left + (d / maxDose) * plotW;
      ctx.fillText(d.toFixed(1), x, PAD.top + plotH + 14);
    }
    // X axis title
    ctx.fillText('Dose', PAD.left + plotW / 2, height - 4);

    // Y axis ticks
    ctx.textAlign = 'right';
    for (let r = 0; r <= 1; r += 0.5) {
      const y = PAD.top + plotH * (1 - r);
      ctx.fillText(r.toFixed(1), PAD.left - 4, y + 3);
    }

    // Title
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = 'var(--text-primary)';
    ctx.textAlign = 'left';
    ctx.fillText(`${drugName} (n=${hillCoefficient})`, PAD.left, PAD.top - 6);
  }, [drugName, ec50, hillCoefficient, maxDose]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: CHART_HEIGHT,
        display: 'block',
        borderRadius: 4,
      }}
    />
  );
}
