import { useState, useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

// ── Drug definitions (matching DrugTestingPanel) ────────────────────────────

const DRUG_COMPOUNDS = [
  'Picrotoxin',
  'Aldicarb',
  'Levamisole',
  'Muscimol',
  'Dopamine',
  'Serotonin',
  'Ivermectin',
  'Nemadipine',
] as const;

type MeasurementMetric = 'mean_firing_rate' | 'active_neuron_fraction' | 'synchrony_index';

const METRIC_LABELS: Record<MeasurementMetric, string> = {
  mean_firing_rate: 'Mean firing rate',
  active_neuron_fraction: 'Active neuron fraction',
  synchrony_index: 'Synchrony index',
};

// ── Types ───────────────────────────────────────────────────────────────────

interface DoseResult {
  concentration: number;
  meanResponse: number;
  stdResponse: number;
  semResponse: number;
  allResponses: number[];
}

interface HillFit {
  bottom: number;
  top: number;
  ec50: number;
  hillCoeff: number;
  rSquared: number;
  ec50CI: [number, number]; // 95% CI
}

// ── Measurement helpers ─────────────────────────────────────────────────────

function measureMetric(metric: MeasurementMetric): number {
  const frame = useSimulationStore.getState().frame;
  if (!frame) return 0;

  switch (metric) {
    case 'mean_firing_rate': {
      const rates = frame.firing_rates;
      if (!rates || rates.length === 0) return frame.n_active;
      return rates.reduce((a, b) => a + b, 0) / rates.length;
    }
    case 'active_neuron_fraction': {
      const rates = frame.firing_rates;
      if (!rates || rates.length === 0) {
        const exp = useSimulationStore.getState().experiment;
        const total = exp?.n_neurons ?? 302;
        return frame.n_active / total;
      }
      const active = rates.filter((r) => r > 0.5).length;
      return active / rates.length;
    }
    case 'synchrony_index': {
      // Compute coefficient of variation of firing rates (inverse = synchrony)
      const rates = frame.firing_rates;
      if (!rates || rates.length < 2) return 0;
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      if (mean < 0.01) return 0;
      const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
      const cv = Math.sqrt(variance) / mean;
      // Lower CV => more synchronous. Map to 0-1 range.
      return Math.max(0, Math.min(1, 1 - cv / 3));
    }
  }
}

function sendCommand(cmd: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('neurevo-command', { detail: cmd }));
}

function wait(ms: number, signal?: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      if (signal?.cancelled) reject(new Error('cancelled'));
      else resolve();
    }, ms);
    if (signal) {
      const check = setInterval(() => {
        if (signal.cancelled) {
          clearTimeout(id);
          clearInterval(check);
          reject(new Error('cancelled'));
        }
      }, 50);
      // Clear interval when timeout resolves
      setTimeout(() => clearInterval(check), ms + 100);
    }
  });
}

// ── Log-spaced concentrations ───────────────────────────────────────────────

function logSpace(min: number, max: number, n: number): number[] {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const step = (logMax - logMin) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.pow(10, logMin + i * step));
}

// ── Hill equation ───────────────────────────────────────────────────────────

function hillEquation(c: number, bottom: number, top: number, ec50: number, n: number): number {
  if (c <= 0) return bottom;
  return bottom + (top - bottom) / (1 + Math.pow(ec50 / c, n));
}

// ── Levenberg-Marquardt fitter for Hill equation ────────────────────────────

function fitHill(concentrations: number[], responses: number[]): HillFit {
  const N = concentrations.length;
  if (N < 2) {
    return { bottom: 0, top: 1, ec50: 1, hillCoeff: 1, rSquared: 0, ec50CI: [0, 10] };
  }

  // Initial parameter estimates
  const sortedResp = [...responses].sort((a, b) => a - b);
  let bottom = sortedResp[0];
  let top = sortedResp[sortedResp.length - 1];

  // Geometric mean of concentrations as EC50 initial guess
  const logMean = concentrations.reduce((s, c) => s + Math.log10(Math.max(c, 1e-10)), 0) / N;
  let ec50 = Math.pow(10, logMean);
  let hillN = 1.0;

  // Ensure top > bottom
  if (top - bottom < 0.01) {
    top = bottom + 1;
  }

  // Parameters: [bottom, top, ec50, n]
  let params = [bottom, top, ec50, hillN];
  let lambda = 0.01; // Damping factor

  const predict = (p: number[]) => concentrations.map((c) => hillEquation(c, p[0], p[1], p[2], p[3]));

  const residuals = (p: number[]) => {
    const pred = predict(p);
    return responses.map((r, i) => r - pred[i]);
  };

  const sumSquares = (p: number[]) => {
    const res = residuals(p);
    return res.reduce((s, r) => s + r * r, 0);
  };

  // Jacobian: partial derivatives of each prediction w.r.t. each parameter
  const jacobian = (p: number[]): number[][] => {
    const eps = [1e-6, 1e-6, Math.max(1e-6, p[2] * 1e-4), 1e-4];
    const J: number[][] = [];
    const pred0 = predict(p);

    for (let i = 0; i < N; i++) {
      const row: number[] = [];
      for (let j = 0; j < 4; j++) {
        const pPlus = [...p];
        pPlus[j] += eps[j];
        const predPlus = hillEquation(concentrations[i], pPlus[0], pPlus[1], pPlus[2], pPlus[3]);
        row.push((predPlus - pred0[i]) / eps[j]);
      }
      J.push(row);
    }
    return J;
  };

  // LM iterations
  let currentSS = sumSquares(params);

  for (let iter = 0; iter < 40; iter++) {
    const J = jacobian(params);
    const res = residuals(params);

    // J^T * J
    const JtJ: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    const JtR: number[] = new Array(4).fill(0);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < 4; j++) {
        JtR[j] += J[i][j] * res[i];
        for (let k = 0; k < 4; k++) {
          JtJ[j][k] += J[i][j] * J[i][k];
        }
      }
    }

    // Add damping: (J^T J + lambda * diag(J^T J)) * delta = J^T * r
    const A: number[][] = JtJ.map((row, i) => row.map((v, j) => v + (i === j ? lambda * (v + 1e-8) : 0)));

    // Solve 4x4 system via Gaussian elimination
    const delta = solve4x4(A, JtR);
    if (!delta) break;

    // Trial parameters
    const trial = params.map((p, i) => p + delta[i]);

    // Enforce constraints: ec50 > 0, n > 0.1
    trial[2] = Math.max(1e-6, trial[2]);
    trial[3] = Math.max(0.1, Math.min(10, trial[3]));

    const trialSS = sumSquares(trial);

    if (trialSS < currentSS) {
      params = trial;
      currentSS = trialSS;
      lambda *= 0.5;
    } else {
      lambda *= 2;
    }

    // Convergence check
    if (Math.abs(delta.reduce((s, d) => s + d * d, 0)) < 1e-12) break;
  }

  // Compute R-squared
  const meanResp = responses.reduce((a, b) => a + b, 0) / N;
  const ssTot = responses.reduce((s, r) => s + (r - meanResp) ** 2, 0);
  const ssRes = currentSS;
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // Bootstrap 95% CI for EC50
  const ec50Samples: number[] = [];
  for (let b = 0; b < 100; b++) {
    const bootConc: number[] = [];
    const bootResp: number[] = [];
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(Math.random() * N);
      bootConc.push(concentrations[idx]);
      bootResp.push(responses[idx]);
    }
    const bootFit = fitHillQuick(bootConc, bootResp, params);
    if (isFinite(bootFit.ec50) && bootFit.ec50 > 0) {
      ec50Samples.push(bootFit.ec50);
    }
  }

  ec50Samples.sort((a, b) => a - b);
  const ciLow = ec50Samples.length > 5 ? ec50Samples[Math.floor(ec50Samples.length * 0.025)] : params[2] * 0.5;
  const ciHigh = ec50Samples.length > 5 ? ec50Samples[Math.floor(ec50Samples.length * 0.975)] : params[2] * 2;

  return {
    bottom: params[0],
    top: params[1],
    ec50: params[2],
    hillCoeff: params[3],
    rSquared,
    ec50CI: [ciLow, ciHigh],
  };
}

/** Quick hill fit (fewer iterations) for bootstrap resampling */
function fitHillQuick(concentrations: number[], responses: number[], initParams: number[]): { ec50: number } {
  const N = concentrations.length;
  let params = [...initParams];
  let lambda = 0.1;

  const predict = (p: number[]) => concentrations.map((c) => hillEquation(c, p[0], p[1], p[2], p[3]));
  const sumSquares = (p: number[]) => {
    const pred = predict(p);
    return responses.reduce((s, r, i) => s + (r - pred[i]) ** 2, 0);
  };

  let currentSS = sumSquares(params);

  for (let iter = 0; iter < 10; iter++) {
    const eps = [1e-6, 1e-6, Math.max(1e-6, params[2] * 1e-4), 1e-4];
    const pred0 = predict(params);
    const res = responses.map((r, i) => r - pred0[i]);

    const JtJ: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    const JtR: number[] = new Array(4).fill(0);

    for (let i = 0; i < N; i++) {
      const jRow: number[] = [];
      for (let j = 0; j < 4; j++) {
        const pPlus = [...params];
        pPlus[j] += eps[j];
        jRow.push((hillEquation(concentrations[i], pPlus[0], pPlus[1], pPlus[2], pPlus[3]) - pred0[i]) / eps[j]);
      }
      for (let j = 0; j < 4; j++) {
        JtR[j] += jRow[j] * res[i];
        for (let k = 0; k < 4; k++) {
          JtJ[j][k] += jRow[j] * jRow[k];
        }
      }
    }

    const A = JtJ.map((row, i) => row.map((v, j) => v + (i === j ? lambda * (v + 1e-8) : 0)));
    const delta = solve4x4(A, JtR);
    if (!delta) break;

    const trial = params.map((p, i) => p + delta[i]);
    trial[2] = Math.max(1e-6, trial[2]);
    trial[3] = Math.max(0.1, Math.min(10, trial[3]));

    const trialSS = sumSquares(trial);
    if (trialSS < currentSS) {
      params = trial;
      currentSS = trialSS;
      lambda *= 0.5;
    } else {
      lambda *= 2;
    }
  }

  return { ec50: params[2] };
}

/** Solve 4x4 linear system Ax = b via Gaussian elimination with partial pivoting */
function solve4x4(A: number[][], b: number[]): number[] | null {
  const n = 4;
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-15) return null;
    if (maxRow !== col) [M[col], M[maxRow]] = [M[maxRow], M[col]];

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let j = row + 1; j < n; j++) {
      sum -= M[row][j] * x[j];
    }
    x[row] = sum / M[row][row];
  }

  return x;
}

// ── Canvas drawing ──────────────────────────────────────────────────────────

const CHART_W = 280;
const CHART_H = 220;
const PAD = { top: 24, right: 16, bottom: 36, left: 44 };

function drawDoseResponseCurve(
  canvas: HTMLCanvasElement,
  data: DoseResult[],
  fit: HillFit | null,
  metric: MeasurementMetric,
): void {
  const width = CHART_W;
  const height = CHART_H;
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

  // Data ranges (log scale X)
  const concentrations = data.map((d) => d.concentration);
  const logMin = Math.floor(Math.log10(Math.min(...concentrations)));
  const logMax = Math.ceil(Math.log10(Math.max(...concentrations)));

  const allResponses = data.flatMap((d) => [d.meanResponse + d.semResponse, d.meanResponse - d.semResponse]);
  let yMin = Math.min(0, ...allResponses) * 0.95;
  let yMax = Math.max(...allResponses) * 1.1;
  if (yMax - yMin < 0.01) { yMin = 0; yMax = 1; }

  const toX = (logC: number) => PAD.left + ((logC - logMin) / (logMax - logMin)) * plotW;
  const toY = (val: number) => PAD.top + plotH * (1 - (val - yMin) / (yMax - yMin));

  // Background
  ctx.fillStyle = 'rgba(4, 8, 16, 0.9)';
  ctx.fillRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = 'rgba(80, 130, 200, 0.08)';
  ctx.lineWidth = 0.5;

  // Vertical grid (log decades)
  for (let l = logMin; l <= logMax; l++) {
    const x = toX(l);
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, PAD.top + plotH);
    ctx.stroke();
  }

  // Horizontal grid
  const yStep = niceStep(yMax - yMin, 5);
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = 'rgba(140, 170, 200, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  // 95% CI band (if fit available)
  if (fit) {
    const evalPoints = 100;
    ctx.fillStyle = 'rgba(0, 212, 255, 0.06)';
    ctx.beginPath();

    // Upper bound (use fit with CI high EC50 -- shifts curve)
    for (let i = 0; i <= evalPoints; i++) {
      const logC = logMin + (i / evalPoints) * (logMax - logMin);
      const c = Math.pow(10, logC);
      const val = hillEquation(c, fit.bottom, fit.top, fit.ec50CI[0], fit.hillCoeff);
      const x = toX(logC);
      const y = toY(Math.min(val, yMax));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Lower bound (reverse)
    for (let i = evalPoints; i >= 0; i--) {
      const logC = logMin + (i / evalPoints) * (logMax - logMin);
      const c = Math.pow(10, logC);
      const val = hillEquation(c, fit.bottom, fit.top, fit.ec50CI[1], fit.hillCoeff);
      const x = toX(logC);
      const y = toY(Math.max(val, yMin));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Fitted Hill curve
    ctx.beginPath();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    for (let i = 0; i <= evalPoints; i++) {
      const logC = logMin + (i / evalPoints) * (logMax - logMin);
      const c = Math.pow(10, logC);
      const val = hillEquation(c, fit.bottom, fit.top, fit.ec50, fit.hillCoeff);
      const x = toX(logC);
      const y = toY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Glow
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.12)';
    ctx.lineWidth = 5;
    for (let i = 0; i <= evalPoints; i++) {
      const logC = logMin + (i / evalPoints) * (logMax - logMin);
      const c = Math.pow(10, logC);
      const val = hillEquation(c, fit.bottom, fit.top, fit.ec50, fit.hillCoeff);
      const x = toX(logC);
      const y = toY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // EC50 dashed line
    const ec50Log = Math.log10(fit.ec50);
    if (ec50Log >= logMin && ec50Log <= logMax) {
      const ec50X = toX(ec50Log);
      const ec50Val = hillEquation(fit.ec50, fit.bottom, fit.top, fit.ec50, fit.hillCoeff);
      const ec50Y = toY(ec50Val);

      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ec50X, PAD.top + plotH);
      ctx.lineTo(ec50X, ec50Y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PAD.left, ec50Y);
      ctx.lineTo(ec50X, ec50Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // EC50 label
      ctx.font = '8px "SF Mono", "Fira Code", monospace';
      ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
      ctx.textAlign = 'left';
      ctx.fillText(`EC50=${fit.ec50.toFixed(2)} \u00B5M`, ec50X + 4, ec50Y - 6);
    }

    // Annotations
    ctx.font = '8px "SF Mono", "Fira Code", monospace';
    ctx.fillStyle = 'rgba(180, 200, 220, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(`n = ${fit.hillCoeff.toFixed(2)}`, PAD.left + plotW - 2, PAD.top + 12);
    ctx.fillText(`R\u00B2 = ${fit.rSquared.toFixed(3)}`, PAD.left + plotW - 2, PAD.top + 22);
  }

  // Data points with error bars
  for (const d of data) {
    const logC = Math.log10(d.concentration);
    const x = toX(logC);
    const yMean = toY(d.meanResponse);
    const yUp = toY(d.meanResponse + d.semResponse);
    const yDown = toY(d.meanResponse - d.semResponse);

    // Error bar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yUp);
    ctx.lineTo(x, yDown);
    ctx.stroke();
    // Caps
    ctx.beginPath();
    ctx.moveTo(x - 2, yUp);
    ctx.lineTo(x + 2, yUp);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 2, yDown);
    ctx.lineTo(x + 2, yDown);
    ctx.stroke();

    // Circle
    ctx.beginPath();
    ctx.arc(x, yMean, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#00d4ff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, yMean, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Axis labels
  ctx.font = '8px "SF Mono", "Fira Code", monospace';
  ctx.fillStyle = 'rgba(140, 170, 200, 0.55)';

  // X ticks
  ctx.textAlign = 'center';
  for (let l = logMin; l <= logMax; l++) {
    const x = toX(l);
    const val = Math.pow(10, l);
    ctx.fillText(val >= 1 ? val.toFixed(0) : val.toString(), x, PAD.top + plotH + 12);
  }
  // X title
  ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('Concentration (\u00B5M)', PAD.left + plotW / 2, height - 4);

  // Y ticks
  ctx.textAlign = 'right';
  ctx.font = '8px "SF Mono", "Fira Code", monospace';
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = toY(v);
    ctx.fillText(v.toFixed(1), PAD.left - 4, y + 3);
  }

  // Y title
  ctx.save();
  ctx.translate(8, PAD.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(METRIC_LABELS[metric] ?? 'Response', 0, 0);
  ctx.restore();
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

// ── CSV / PNG export ────────────────────────────────────────────────────────

function exportCSV(drug: string, data: DoseResult[]): void {
  const maxRepeats = Math.max(...data.map((d) => d.allResponses.length));
  const headers = ['concentration_uM', 'mean', 'std', ...Array.from({ length: maxRepeats }, (_, i) => `repeat_${i + 1}`)];
  const rows = data.map((d) => {
    const base = [d.concentration.toFixed(4), d.meanResponse.toFixed(6), d.stdResponse.toFixed(6)];
    const reps = d.allResponses.map((r) => r.toFixed(6));
    while (reps.length < maxRepeats) reps.push('');
    return [...base, ...reps].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dose_response_${drug}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPNG(canvas: HTMLCanvasElement, drug: string): void {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `dose_response_${drug}_${Date.now()}.png`;
  a.click();
}

// ── Component ───────────────────────────────────────────────────────────────

interface DoseResponsePanelProps {
  expanded?: boolean;
  onToggleExpanded?: (v: boolean) => void;
}

export function DoseResponsePanel({ expanded: controlledExpanded, onToggleExpanded }: DoseResponsePanelProps) {
  const connected = useSimulationStore((s) => s.connected);
  const frame = useSimulationStore((s) => s.frame);

  // Collapse state
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = onToggleExpanded ?? setInternalExpanded;

  // Experiment setup
  const [drug, setDrug] = useState<string>(DRUG_COMPOUNDS[0]);
  const [minDose, setMinDose] = useState(0.01);
  const [maxDose, setMaxDose] = useState(100);
  const [nPoints, setNPoints] = useState(8);
  const [metric, setMetric] = useState<MeasurementMetric>('mean_firing_rate');
  const [baselineDuration, setBaselineDuration] = useState(500);
  const [exposureDuration, setExposureDuration] = useState(1000);
  const [washoutDuration, setWashoutDuration] = useState(500);
  const [nRepeats, setNRepeats] = useState(3);

  // Execution state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressFrac, setProgressFrac] = useState(0);
  const cancelRef = useRef({ cancelled: false });

  // Results
  const [results, setResults] = useState<DoseResult[] | null>(null);
  const [fit, setFit] = useState<HillFit | null>(null);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw canvas when results/fit change
  useEffect(() => {
    if (canvasRef.current && results && results.length > 0) {
      drawDoseResponseCurve(canvasRef.current, results, fit, metric);
    }
  }, [results, fit, metric]);

  const canRun = (connected || !!frame) && !running;

  // ── Run dose-response sweep ─────────────────────────────────────────────

  const runSweep = useCallback(async () => {
    setRunning(true);
    setResults(null);
    setFit(null);
    const signal = { cancelled: false };
    cancelRef.current = signal;

    const concentrations = logSpace(minDose, maxDose, nPoints);
    const totalSteps = nPoints * nRepeats;
    const allResults: DoseResult[] = [];

    try {
      // Baseline measurement
      setProgress('Recording baseline...');
      setProgressFrac(0);
      await wait(baselineDuration, signal);

      for (let ci = 0; ci < concentrations.length; ci++) {
        const conc = concentrations[ci];
        const responses: number[] = [];

        for (let rep = 0; rep < nRepeats; rep++) {
          if (signal.cancelled) throw new Error('cancelled');

          const step = ci * nRepeats + rep + 1;
          setProgress(`Testing concentration ${ci + 1}/${nPoints} (${conc.toFixed(2)} \u00B5M), repeat ${rep + 1}/${nRepeats}`);
          setProgressFrac(step / totalSteps);

          // Apply drug at this concentration
          sendCommand({ type: 'apply_drug', compound: drug, dose: conc });

          // Wait exposure duration
          await wait(exposureDuration, signal);

          // Measure (average over last portion -- we sample current frame)
          const measurement = measureMetric(metric);
          responses.push(measurement);

          // Clear drug
          sendCommand({ type: 'clear_stimuli' });

          // Washout
          if (washoutDuration > 0) {
            await wait(washoutDuration, signal);
          }
        }

        const mean = responses.reduce((a, b) => a + b, 0) / responses.length;
        const std = responses.length > 1
          ? Math.sqrt(responses.reduce((s, r) => s + (r - mean) ** 2, 0) / (responses.length - 1))
          : 0;
        const sem = std / Math.sqrt(responses.length);

        allResults.push({
          concentration: conc,
          meanResponse: mean,
          stdResponse: std,
          semResponse: sem,
          allResponses: [...responses],
        });
      }

      // Store results
      setResults(allResults);

      // Fit Hill equation
      setProgress('Fitting Hill equation...');
      const concs = allResults.map((r) => r.concentration);
      const means = allResults.map((r) => r.meanResponse);
      const hillFit = fitHill(concs, means);
      setFit(hillFit);

      setProgress('Complete');
      setProgressFrac(1);
    } catch (e) {
      if ((e as Error).message !== 'cancelled') {
        setProgress(`Error: ${(e as Error).message}`);
      } else {
        setProgress('Cancelled');
      }
    } finally {
      setRunning(false);
    }
  }, [drug, minDose, maxDose, nPoints, metric, baselineDuration, exposureDuration, washoutDuration, nRepeats]);

  const handleCancel = useCallback(() => {
    cancelRef.current.cancelled = true;
    sendCommand({ type: 'clear_stimuli' });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="glass" style={{ padding: expanded ? undefined : '6px 12px' }}>
      <div
        className="glass-label"
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          marginBottom: expanded ? 8 : 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span>Dose-Response</span>
        <span style={{ fontSize: 10, color: 'var(--text-label)' }}>{expanded ? '\u25BE' : '\u25B8'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
          {/* ── Drug selector ── */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Drug</span>
            <select
              value={drug}
              onChange={(e) => setDrug(e.target.value)}
              style={selectStyle}
              disabled={running}
            >
              {DRUG_COMPOUNDS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          {/* ── Concentration range ── */}
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span style={labelTextStyle}>Min (\u00B5M)</span>
              <input
                type="number"
                value={minDose}
                onChange={(e) => setMinDose(Math.max(0.001, parseFloat(e.target.value) || 0.01))}
                style={inputStyle}
                step="0.01"
                min="0.001"
                disabled={running}
              />
            </label>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span style={labelTextStyle}>Max (\u00B5M)</span>
              <input
                type="number"
                value={maxDose}
                onChange={(e) => setMaxDose(Math.max(minDose * 2, parseFloat(e.target.value) || 100))}
                style={inputStyle}
                step="10"
                min="1"
                disabled={running}
              />
            </label>
            <label style={{ ...labelStyle, flex: 1 }}>
              <span style={labelTextStyle}>Points</span>
              <input
                type="number"
                value={nPoints}
                onChange={(e) => setNPoints(Math.max(3, Math.min(20, parseInt(e.target.value) || 8)))}
                style={inputStyle}
                min="3"
                max="20"
                disabled={running}
              />
            </label>
          </div>

          {/* ── Measurement metric ── */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Measurement</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MeasurementMetric)}
              style={selectStyle}
              disabled={running}
            >
              {Object.entries(METRIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>

          {/* ── Duration sliders ── */}
          <SliderRow
            label="Baseline"
            value={baselineDuration}
            onChange={setBaselineDuration}
            min={100}
            max={2000}
            step={100}
            unit="ms"
            disabled={running}
          />
          <SliderRow
            label="Exposure"
            value={exposureDuration}
            onChange={setExposureDuration}
            min={200}
            max={5000}
            step={100}
            unit="ms"
            disabled={running}
          />
          <SliderRow
            label="Washout"
            value={washoutDuration}
            onChange={setWashoutDuration}
            min={0}
            max={2000}
            step={100}
            unit="ms"
            disabled={running}
          />

          {/* ── Repeats ── */}
          <SliderRow
            label="Repeats"
            value={nRepeats}
            onChange={(v) => setNRepeats(Math.round(v))}
            min={1}
            max={5}
            step={1}
            unit=""
            disabled={running}
          />

          {/* ── Run / Cancel ── */}
          {!running ? (
            <button
              onClick={runSweep}
              disabled={!canRun}
              style={{
                width: '100%',
                padding: '8px 0',
                borderRadius: 7,
                border: 'none',
                cursor: canRun ? 'pointer' : 'default',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.03em',
                color: '#fff',
                background: canRun
                  ? 'linear-gradient(135deg, #00d4ff, #00b894)'
                  : 'rgba(255, 255, 255, 0.06)',
                opacity: canRun ? 1 : 0.4,
                transition: 'opacity 0.2s',
              }}
            >
              Run Dose-Response
            </button>
          ) : (
            <button
              onClick={handleCancel}
              style={{
                width: '100%',
                padding: '8px 0',
                borderRadius: 7,
                border: '1px solid rgba(255, 68, 34, 0.3)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                color: '#ff4422',
                background: 'rgba(255, 68, 34, 0.08)',
              }}
            >
              Cancel
            </button>
          )}

          {/* ── Progress ── */}
          {progress && (
            <div>
              <div style={{
                fontSize: 9,
                color: 'var(--text-label)',
                marginBottom: 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {progress}
              </div>
              {running && (
                <div style={{
                  height: 3,
                  borderRadius: 2,
                  background: 'rgba(255, 255, 255, 0.06)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${progressFrac * 100}%`,
                    background: 'linear-gradient(90deg, #00d4ff, #00b894)',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              )}
            </div>
          )}

          {/* ── Chart ── */}
          {results && results.length > 0 && (
            <div style={{
              borderRadius: 6,
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.2)',
              marginTop: 2,
            }}>
              <canvas
                ref={canvasRef}
                style={{ width: CHART_W, height: CHART_H, display: 'block' }}
              />
            </div>
          )}

          {/* ── Results summary ── */}
          {fit && (
            <div style={{
              background: 'rgba(0, 212, 255, 0.04)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 10,
              lineHeight: 1.6,
              fontFamily: '"SF Mono", "Fira Code", monospace',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Fit Results
              </div>
              <ResultRow label="EC50" value={`${fit.ec50.toFixed(3)} \u00B1 ${((fit.ec50CI[1] - fit.ec50CI[0]) / 2).toFixed(3)} \u00B5M`} />
              <ResultRow label="Hill coeff (n)" value={fit.hillCoeff.toFixed(3)} />
              <ResultRow label="Top" value={fit.top.toFixed(4)} />
              <ResultRow label="Bottom" value={fit.bottom.toFixed(4)} />
              <ResultRow label="R\u00B2" value={fit.rSquared.toFixed(4)} />
              <ResultRow label="95% CI" value={`[${fit.ec50CI[0].toFixed(3)}, ${fit.ec50CI[1].toFixed(3)}] \u00B5M`} />
            </div>
          )}

          {/* ── Export buttons ── */}
          {results && results.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, fontSize: 10 }}
                onClick={() => exportCSV(drug, results)}
              >
                Export CSV
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, fontSize: 10 }}
                onClick={() => canvasRef.current && exportPNG(canvasRef.current, drug)}
                disabled={!canvasRef.current}
              >
                Export PNG
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'var(--text-label)', width: 52, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: 3, accentColor: '#00d4ff', cursor: 'pointer' }}
        disabled={disabled}
      />
      <span style={{ fontSize: 9, color: 'var(--text-secondary)', width: 44, textAlign: 'right', flexShrink: 0 }}>
        {value}{unit}
      </span>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-label)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// ── Shared inline styles ────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-label)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 5,
  padding: '4px 6px',
  color: 'var(--text-primary)',
  fontSize: 11,
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 5,
  padding: '4px 6px',
  color: 'var(--text-primary)',
  fontSize: 11,
  width: '100%',
  outline: 'none',
};
