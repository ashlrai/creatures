import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { CollapsiblePanel } from './CollapsiblePanel';
import {
  useExperimentSnapshotStore,
  type ExperimentSnapshot,
} from '../../stores/experimentSnapshotStore';
import { downloadBlob } from '../../utils/exportData';

// ── Statistical helpers ───────────────────────────────────────────────────────

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const p =
    d *
    Math.exp((-x * x) / 2) *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function sem(arr: number[]): number {
  if (arr.length < 2) return 0;
  return std(arr) / Math.sqrt(arr.length);
}

/** Welch's t-test for two independent samples with unequal variance */
export function welchT(
  a: number[],
  b: number[],
): { t: number; p: number; d: number } {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) return { t: 0, p: 1, d: 0 };

  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (na - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (nb - 1);
  const seA = va / na;
  const seB = vb / nb;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff < 1e-15) return { t: 0, p: 1, d: 0 };

  const t = (ma - mb) / seDiff;
  // Two-tailed p from normal approximation (accurate for large df)
  const p = 2 * (1 - normalCDF(Math.abs(t)));

  // Cohen's d with pooled SD
  const pooledSD = Math.sqrt(
    ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2),
  );
  const d = pooledSD > 1e-15 ? (ma - mb) / pooledSD : 0;

  return { t, p, d };
}

/** Mann-Whitney U test for two independent samples */
export function mannWhitneyU(
  a: number[],
  b: number[],
): { u: number; p: number; r: number } {
  const na = a.length;
  const nb = b.length;
  if (na === 0 || nb === 0) return { u: 0, p: 1, r: 0 };

  // Combine and rank
  const combined: { val: number; group: 'a' | 'b' }[] = [
    ...a.map((val) => ({ val, group: 'a' as const })),
    ...b.map((val) => ({ val, group: 'b' as const })),
  ];
  combined.sort((x, y) => x.val - y.val);

  // Assign ranks with tie-averaging
  const ranks = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].val === combined[i].val) j++;
    const avgRank = (i + j + 1) / 2; // 1-indexed average
    for (let k = i; k < j; k++) ranks[k] = avgRank;
    i = j;
  }

  let rankSumA = 0;
  for (let idx = 0; idx < combined.length; idx++) {
    if (combined[idx].group === 'a') rankSumA += ranks[idx];
  }

  const u1 = rankSumA - (na * (na + 1)) / 2;
  const u2 = na * nb - u1;
  const u = Math.min(u1, u2);

  // Normal approximation for p-value
  const muU = (na * nb) / 2;
  const sigmaU = Math.sqrt((na * nb * (na + nb + 1)) / 12);
  const z = sigmaU > 0 ? (u - muU) / sigmaU : 0;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  // Effect size r = Z / sqrt(N)
  const r = Math.abs(z) / Math.sqrt(na + nb);

  return { u, p, r };
}

// ── Pairwise stats ────────────────────────────────────────────────────────────

interface PairwiseResult {
  snapA: string;
  snapB: string;
  colorA: string;
  colorB: string;
  welch: { t: number; p: number; d: number };
  mwu: { u: number; p: number; r: number };
}

function computePairwise(snapshots: ExperimentSnapshot[]): PairwiseResult[] {
  const results: PairwiseResult[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    for (let j = i + 1; j < snapshots.length; j++) {
      const a = snapshots[i];
      const b = snapshots[j];
      results.push({
        snapA: a.name,
        snapB: b.name,
        colorA: a.color,
        colorB: b.color,
        welch: welchT(a.firingRates, b.firingRates),
        mwu: mannWhitneyU(a.firingRates, b.firingRates),
      });
    }
  }
  return results;
}

function sigStars(p: number): string {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'n.s.';
}

function formatP(p: number): string {
  if (p < 0.001) return '<0.001';
  return p.toFixed(4);
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

function setupHiDPI(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): CanvasRenderingContext2D | null {
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(DPR, DPR);
  return ctx;
}

function hexToRGBA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Firing Rate Distribution Overlay ──────────────────────────────────────────

function drawFiringRateHistogram(
  canvas: HTMLCanvasElement,
  snapshots: ExperimentSnapshot[],
): void {
  const W = 280;
  const H = 160;
  const ctx = setupHiDPI(canvas, W, H);
  if (!ctx) return;

  const pad = { top: 14, right: 10, bottom: 26, left: 36 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // Determine global range
  let globalMax = 0;
  for (const snap of snapshots) {
    for (const r of snap.firingRates) {
      if (r > globalMax) globalMax = r;
    }
  }
  if (globalMax < 1) globalMax = 1;

  const nBins = 20;
  const binWidth = globalMax / nBins;

  // Build histograms
  const histograms: number[][] = [];
  let maxCount = 0;
  for (const snap of snapshots) {
    const bins = new Array(nBins).fill(0);
    for (const r of snap.firingRates) {
      const idx = Math.min(Math.floor(r / binWidth), nBins - 1);
      bins[idx]++;
    }
    histograms.push(bins);
    for (const c of bins) if (c > maxCount) maxCount = c;
  }
  if (maxCount < 1) maxCount = 1;

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
  }

  // Histogram bars (overlaid with transparency)
  const barW = cw / nBins;
  for (let si = 0; si < snapshots.length; si++) {
    const snap = snapshots[si];
    const bins = histograms[si];
    ctx.fillStyle = hexToRGBA(snap.color, 0.35);
    ctx.strokeStyle = hexToRGBA(snap.color, 0.8);
    ctx.lineWidth = 1;

    for (let bi = 0; bi < nBins; bi++) {
      const barH = (bins[bi] / maxCount) * ch;
      const x = pad.left + bi * barW;
      const y = pad.top + ch - barH;
      ctx.fillRect(x, y, barW - 1, barH);
      ctx.strokeRect(x, y, barW - 1, barH);
    }

    // Mean line
    const m = mean(snap.firingRates);
    const mX = pad.left + (m / globalMax) * cw;
    ctx.strokeStyle = snap.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(mX, pad.top);
    ctx.lineTo(mX, pad.top + ch);
    ctx.stroke();
    ctx.setLineDash([]);

    // SEM whiskers
    const se = sem(snap.firingRates);
    const seLeft = pad.left + ((m - se) / globalMax) * cw;
    const seRight = pad.left + ((m + se) / globalMax) * cw;
    const whiskerY = pad.top + 6 + si * 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(seLeft, whiskerY);
    ctx.lineTo(seRight, whiskerY);
    ctx.stroke();
  }

  // Axes labels
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Firing rate (Hz)', pad.left + cw / 2, H - 3);
  ctx.fillText('0', pad.left, H - 12);
  ctx.fillText(globalMax.toFixed(1), W - pad.right, H - 12);

  ctx.textAlign = 'right';
  ctx.fillText(String(maxCount), pad.left - 3, pad.top + 8);
  ctx.fillText('0', pad.left - 3, pad.top + ch);

  // Rotated Y label
  ctx.save();
  ctx.translate(7, pad.top + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Count', 0, 0);
  ctx.restore();

  // Legend
  ctx.textAlign = 'left';
  const legendX = pad.left + 4;
  let legendY = pad.top + 4;
  ctx.font = '8px monospace';
  for (const snap of snapshots) {
    ctx.fillStyle = snap.color;
    ctx.fillRect(legendX, legendY - 5, 8, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(snap.name.slice(0, 18), legendX + 12, legendY);
    legendY += 10;
  }
}

// ── Bar Chart Comparison ──────────────────────────────────────────────────────

function drawBarComparison(
  canvas: HTMLCanvasElement,
  snapshots: ExperimentSnapshot[],
  pairwise: PairwiseResult[],
): void {
  const W = 280;
  const H = 180;
  const ctx = setupHiDPI(canvas, W, H);
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);

  const metrics = [
    {
      label: 'Pop. Rate',
      key: 'populationRate' as const,
      getErr: (s: ExperimentSnapshot) => sem(s.firingRates),
    },
    {
      label: 'Active Frac.',
      key: 'activeNeuronFraction' as const,
      getErr: () => 0,
    },
    {
      label: 'Synchrony',
      key: 'synchronyIndex' as const,
      getErr: () => 0,
    },
    {
      label: 'Spike Count',
      key: 'spikeCount' as const,
      getErr: () => 0,
    },
  ];

  const pad = { top: 16, right: 8, bottom: 32, left: 40 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const nMetrics = metrics.length;
  const nSnaps = snapshots.length;
  const groupW = cw / nMetrics;
  const barW = Math.min(16, (groupW - 8) / nSnaps);

  // Normalize each metric to max across snapshots
  const maxVals = metrics.map((m) =>
    Math.max(1e-9, ...snapshots.map((s) => s[m.key] as number)),
  );

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
  }

  // Bars
  for (let mi = 0; mi < nMetrics; mi++) {
    const metric = metrics[mi];
    const groupX = pad.left + mi * groupW;
    const totalBarWidth = nSnaps * barW;
    const offset = (groupW - totalBarWidth) / 2;

    for (let si = 0; si < nSnaps; si++) {
      const snap = snapshots[si];
      const val = snap[metric.key] as number;
      const normVal = val / maxVals[mi];
      const barH = normVal * ch;
      const x = groupX + offset + si * barW;
      const y = pad.top + ch - barH;

      const gradient = ctx.createLinearGradient(x, y, x, pad.top + ch);
      gradient.addColorStop(0, hexToRGBA(snap.color, 0.85));
      gradient.addColorStop(1, hexToRGBA(snap.color, 0.3));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barW - 1, barH);

      // Error bar (only for population rate)
      const err = metric.getErr(snap);
      if (err > 0) {
        const errH = (err / maxVals[mi]) * ch;
        const midX = x + (barW - 1) / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, y - errH);
        ctx.lineTo(midX, y + errH);
        ctx.moveTo(midX - 3, y - errH);
        ctx.lineTo(midX + 3, y - errH);
        ctx.moveTo(midX - 3, y + errH);
        ctx.lineTo(midX + 3, y + errH);
        ctx.stroke();
      }
    }

    // Metric label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(metric.label, groupX + groupW / 2, H - 14);

    // Significance stars between first pair if applicable
    if (nSnaps === 2 && pairwise.length > 0) {
      const p = pairwise[0].welch.p;
      const stars = sigStars(p);
      if (stars !== 'n.s.') {
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(stars, groupX + groupW / 2, pad.top + 6);
      }
    }
  }

  // Y axis
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('max', pad.left - 4, pad.top + 8);
  ctx.fillText('0', pad.left - 4, pad.top + ch + 3);

  // Legend at bottom
  ctx.textAlign = 'left';
  ctx.font = '7px monospace';
  let lx = pad.left;
  for (const snap of snapshots) {
    ctx.fillStyle = snap.color;
    ctx.fillRect(lx, H - 6, 6, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(snap.name.slice(0, 10), lx + 9, H - 2);
    lx += 60;
  }
}

// ── Radar / Spider Chart ──────────────────────────────────────────────────────

function drawRadarChart(
  canvas: HTMLCanvasElement,
  snapshots: ExperimentSnapshot[],
): void {
  const W = 200;
  const H = 200;
  const ctx = setupHiDPI(canvas, W, H);
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2 + 4;
  const radius = 72;

  const axes = [
    { label: 'Firing Rate', key: 'populationRate' },
    { label: 'Active Frac.', key: 'activeNeuronFraction' },
    { label: 'Synchrony', key: 'synchronyIndex' },
    { label: 'Spike Count', key: 'spikeCount' },
    { label: 'Mods', key: 'modCount' },
  ];
  const nAxes = axes.length;
  const angleStep = (2 * Math.PI) / nAxes;

  // Compute normalization ranges
  const maxVals: Record<string, number> = {};
  for (const axis of axes) {
    let max = 1e-9;
    for (const snap of snapshots) {
      const v =
        axis.key === 'modCount'
          ? snap.modifications.length
          : (snap[axis.key as keyof ExperimentSnapshot] as number);
      if (v > max) max = v;
    }
    maxVals[axis.key] = max;
  }

  // Grid rings
  for (let ring = 1; ring <= 4; ring++) {
    const r = (ring / 4) * radius;
    ctx.beginPath();
    for (let i = 0; i <= nAxes; i++) {
      const angle = -Math.PI / 2 + i * angleStep;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Axis lines and labels
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < nAxes; i++) {
    const angle = -Math.PI / 2 + i * angleStep;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Label offset
    const lx = cx + Math.cos(angle) * (radius + 14);
    const ly = cy + Math.sin(angle) * (radius + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(axes[i].label, lx, ly + 3);
  }

  // Snapshot polygons
  for (const snap of snapshots) {
    ctx.beginPath();
    for (let i = 0; i <= nAxes; i++) {
      const ai = i % nAxes;
      const axis = axes[ai];
      const rawVal =
        axis.key === 'modCount'
          ? snap.modifications.length
          : (snap[axis.key as keyof ExperimentSnapshot] as number);
      const normVal = Math.min(1, rawVal / (maxVals[axis.key] || 1));
      const r = normVal * radius;
      const angle = -Math.PI / 2 + ai * angleStep;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = hexToRGBA(snap.color, 0.15);
    ctx.fill();
    ctx.strokeStyle = hexToRGBA(snap.color, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Vertices
    for (let i = 0; i < nAxes; i++) {
      const axis = axes[i];
      const rawVal =
        axis.key === 'modCount'
          ? snap.modifications.length
          : (snap[axis.key as keyof ExperimentSnapshot] as number);
      const normVal = Math.min(1, rawVal / (maxVals[axis.key] || 1));
      const r = normVal * radius;
      const angle = -Math.PI / 2 + i * angleStep;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = snap.color;
      ctx.fill();
    }
  }
}

// ── Export helpers ─────────────────────────────────────────────────────────────

function exportCompositeImage(
  histCanvas: HTMLCanvasElement | null,
  barCanvas: HTMLCanvasElement | null,
  radarCanvas: HTMLCanvasElement | null,
): void {
  const canvases = [histCanvas, barCanvas, radarCanvas].filter(
    Boolean,
  ) as HTMLCanvasElement[];
  if (canvases.length === 0) return;

  const gap = 20;
  const totalW =
    canvases.reduce((s, c) => Math.max(s, c.width / DPR), 0) + gap * 2;
  const totalH =
    canvases.reduce((s, c) => s + c.height / DPR, 0) + gap * (canvases.length + 1);

  const composite = document.createElement('canvas');
  composite.width = totalW * DPR;
  composite.height = totalH * DPR;
  const ctx = composite.getContext('2d');
  if (!ctx) return;
  ctx.scale(DPR, DPR);

  // Dark background
  ctx.fillStyle = '#0c1018';
  ctx.fillRect(0, 0, totalW, totalH);

  // Title
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('Neurevo Experiment Comparison', gap, gap - 4);

  let yOffset = gap + 8;
  for (const c of canvases) {
    const w = c.width / DPR;
    const h = c.height / DPR;
    ctx.drawImage(c, 0, 0, c.width, c.height, gap, yOffset, w, h);
    yOffset += h + gap;
  }

  composite.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurevo_comparison_${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function exportCSV(snapshots: ExperimentSnapshot[]): void {
  const header = [
    'name',
    'condition',
    'organism',
    'timestamp',
    'populationRate',
    'activeNeuronFraction',
    'synchronyIndex',
    'spikeCount',
    'modificationCount',
    'meanFiringRate',
    'stdFiringRate',
    'semFiringRate',
  ].join(',');

  const rows = snapshots.map((s) =>
    [
      `"${s.name}"`,
      `"${s.condition}"`,
      `"${s.organism}"`,
      new Date(s.timestamp).toISOString(),
      s.populationRate.toFixed(4),
      s.activeNeuronFraction.toFixed(4),
      s.synchronyIndex.toFixed(4),
      s.spikeCount,
      s.modifications.length,
      mean(s.firingRates).toFixed(4),
      std(s.firingRates).toFixed(4),
      sem(s.firingRates).toFixed(4),
    ].join(','),
  );

  downloadBlob([header, ...rows].join('\n'), `neurevo_snapshots_${Date.now()}.csv`);
}

function exportStatistics(
  pairwise: PairwiseResult[],
  snapshots: ExperimentSnapshot[],
): void {
  const data = {
    generatedAt: new Date().toISOString(),
    nSnapshots: snapshots.length,
    snapshots: snapshots.map((s) => ({
      name: s.name,
      condition: s.condition,
      organism: s.organism,
      populationRate: s.populationRate,
      activeNeuronFraction: s.activeNeuronFraction,
      synchronyIndex: s.synchronyIndex,
      spikeCount: s.spikeCount,
      nNeurons: s.firingRates.length,
      meanFiringRate: mean(s.firingRates),
      stdFiringRate: std(s.firingRates),
      semFiringRate: sem(s.firingRates),
    })),
    pairwiseTests: pairwise.map((pw) => ({
      pair: [pw.snapA, pw.snapB],
      welchT: {
        t: pw.welch.t,
        p: pw.welch.p,
        cohensD: pw.welch.d,
        significant005: pw.welch.p < 0.05,
        significant001: pw.welch.p < 0.01,
      },
      mannWhitneyU: {
        U: pw.mwu.u,
        p: pw.mwu.p,
        effectSizeR: pw.mwu.r,
        significant005: pw.mwu.p < 0.05,
        significant001: pw.mwu.p < 0.01,
      },
    })),
  };

  downloadBlob(
    JSON.stringify(data, null, 2),
    `neurevo_statistics_${Date.now()}.json`,
    'application/json',
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExperimentComparison() {
  const snapshots = useExperimentSnapshotStore((s) => s.snapshots);
  const selectedIds = useExperimentSnapshotStore((s) => s.selectedIds);
  const captureSnapshot = useExperimentSnapshotStore((s) => s.captureSnapshot);
  const removeSnapshot = useExperimentSnapshotStore((s) => s.removeSnapshot);
  const renameSnapshot = useExperimentSnapshotStore((s) => s.renameSnapshot);
  const setCondition = useExperimentSnapshotStore((s) => s.setCondition);
  const setColor = useExperimentSnapshotStore((s) => s.setColor);
  const toggleSelection = useExperimentSnapshotStore((s) => s.toggleSelection);
  const clearSnapshots = useExperimentSnapshotStore((s) => s.clearSnapshots);

  const [newName, setNewName] = useState('');
  const [newCondition, setNewCondition] = useState('control');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'name' | 'condition' | null>(null);
  const [editValue, setEditValue] = useState('');

  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);

  const selected = useMemo(
    () => snapshots.filter((s) => selectedIds.includes(s.id)),
    [snapshots, selectedIds],
  );

  const pairwise = useMemo(() => computePairwise(selected), [selected]);

  const handleCapture = useCallback(() => {
    const name = newName.trim() || `Snapshot ${snapshots.length + 1}`;
    captureSnapshot(name, newCondition);
    setNewName('');
  }, [newName, newCondition, snapshots.length, captureSnapshot]);

  const startEdit = useCallback(
    (id: string, field: 'name' | 'condition', current: string) => {
      setEditingId(id);
      setEditingField(field);
      setEditValue(current);
    },
    [],
  );

  const commitEdit = useCallback(() => {
    if (!editingId || !editingField) return;
    if (editingField === 'name') renameSnapshot(editingId, editValue);
    else setCondition(editingId, editValue);
    setEditingId(null);
    setEditingField(null);
  }, [editingId, editingField, editValue, renameSnapshot, setCondition]);

  // ── Draw canvases when selection changes ──────────────────────────────────

  useEffect(() => {
    if (selected.length < 2) return;
    if (histCanvasRef.current) drawFiringRateHistogram(histCanvasRef.current, selected);
    if (barCanvasRef.current) drawBarComparison(barCanvasRef.current, selected, pairwise);
    if (radarCanvasRef.current) drawRadarChart(radarCanvasRef.current, selected);
  }, [selected, pairwise]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <CollapsiblePanel id="experiment-comparison" label="Experiment Comparison" badge={snapshots.length > 0 ? `${snapshots.length}` : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Capture controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Snapshot name..."
            onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
            style={inputStyle}
          />
          <input
            type="text"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            placeholder="Condition..."
            onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
            style={{ ...inputStyle, width: 90 }}
          />
          <button onClick={handleCapture} style={btnPrimary}>
            Capture
          </button>
          {snapshots.length > 0 && (
            <button onClick={clearSnapshots} style={btnDanger}>
              Clear All
            </button>
          )}
        </div>

        {/* Snapshot list */}
        {snapshots.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: 5,
                  background: selectedIds.includes(snap.id)
                    ? 'rgba(0,212,255,0.08)'
                    : 'rgba(0,0,0,0.15)',
                  border: `1px solid ${selectedIds.includes(snap.id) ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)'}`,
                  transition: 'background 0.15s',
                }}
              >
                {/* Selection checkbox */}
                <input
                  type="checkbox"
                  checked={selectedIds.includes(snap.id)}
                  onChange={() => toggleSelection(snap.id)}
                  style={{ accentColor: snap.color, cursor: 'pointer' }}
                />

                {/* Color swatch (click to cycle) */}
                <button
                  onClick={() => {
                    const palette = ['#00d4ff', '#ff6b4a', '#4aff8b', '#ffaa00', '#cc44ff', '#ff4488'];
                    const idx = palette.indexOf(snap.color);
                    const next = palette[(idx + 1) % palette.length];
                    setColor(snap.id, next);
                  }}
                  title="Click to change color"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: snap.color,
                    border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                  }}
                />

                {/* Name (editable on double-click) */}
                {editingId === snap.id && editingField === 'name' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                    autoFocus
                    style={{ ...inputStyle, flex: 1, fontSize: 9, padding: '1px 4px' }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEdit(snap.id, 'name', snap.name)}
                    style={{
                      flex: 1,
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'default',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={`Double-click to rename. ${snap.name}`}
                  >
                    {snap.name}
                  </span>
                )}

                {/* Condition badge (editable on double-click) */}
                {editingId === snap.id && editingField === 'condition' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                    autoFocus
                    style={{ ...inputStyle, width: 70, fontSize: 8, padding: '1px 4px' }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEdit(snap.id, 'condition', snap.condition)}
                    title="Double-click to edit condition"
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: 'rgba(255,255,255,0.06)',
                      color: snap.color,
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                      cursor: 'default',
                      flexShrink: 0,
                    }}
                  >
                    {snap.condition}
                  </span>
                )}

                {/* Timestamp */}
                <span
                  style={{
                    fontSize: 8,
                    color: 'rgba(255,255,255,0.2)',
                    flexShrink: 0,
                  }}
                >
                  {new Date(snap.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>

                {/* Delete */}
                <button
                  onClick={() => removeSnapshot(snap.id)}
                  title="Remove snapshot"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,100,100,0.5)',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: '0 2px',
                    flexShrink: 0,
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Selection prompt */}
        {snapshots.length > 0 && selected.length < 2 && (
          <div
            style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.3)',
              textAlign: 'center',
              padding: 8,
            }}
          >
            Select 2+ snapshots to compare
          </div>
        )}

        {/* Comparison visualizations */}
        {selected.length >= 2 && (
          <>
            {/* Firing Rate Distribution */}
            <div>
              <div style={sectionLabel}>Firing Rate Distribution</div>
              <canvas
                ref={histCanvasRef}
                style={{
                  width: '100%',
                  maxWidth: 280,
                  height: 160,
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.2)',
                }}
              />
            </div>

            {/* Bar Comparison */}
            <div>
              <div style={sectionLabel}>Metric Comparison</div>
              <canvas
                ref={barCanvasRef}
                style={{
                  width: '100%',
                  maxWidth: 280,
                  height: 180,
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.2)',
                }}
              />
            </div>

            {/* Radar Chart */}
            <div>
              <div style={sectionLabel}>Multi-Dimensional Profile</div>
              <canvas
                ref={radarCanvasRef}
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.2)',
                  margin: '0 auto',
                  display: 'block',
                }}
              />
            </div>

            {/* Statistical Summary Table */}
            {pairwise.length > 0 && (
              <div>
                <div style={sectionLabel}>Statistical Summary</div>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 6,
                    padding: 8,
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thStyle}>Pair</th>
                        <th style={thStyle}>Welch t</th>
                        <th style={thStyle}>p</th>
                        <th style={thStyle}>d</th>
                        <th style={thStyle}>MWU</th>
                        <th style={thStyle}>p</th>
                        <th style={thStyle}>r</th>
                        <th style={thStyle}>Sig</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairwise.map((pw, i) => {
                        const pMin = Math.min(pw.welch.p, pw.mwu.p);
                        const sigColor =
                          pMin < 0.001
                            ? '#ff4444'
                            : pMin < 0.01
                              ? '#ffaa00'
                              : pMin < 0.05
                                ? '#44cc66'
                                : 'rgba(255,255,255,0.25)';
                        return (
                          <tr key={i}>
                            <td style={tdStyle}>
                              <span style={{ color: pw.colorA }}>
                                {pw.snapA.slice(0, 8)}
                              </span>
                              {' vs '}
                              <span style={{ color: pw.colorB }}>
                                {pw.snapB.slice(0, 8)}
                              </span>
                            </td>
                            <td style={tdStyle}>{pw.welch.t.toFixed(2)}</td>
                            <td style={{ ...tdStyle, color: sigColor }}>
                              {formatP(pw.welch.p)}
                            </td>
                            <td style={tdStyle}>{pw.welch.d.toFixed(2)}</td>
                            <td style={tdStyle}>{pw.mwu.u.toFixed(0)}</td>
                            <td style={{ ...tdStyle, color: sigColor }}>
                              {formatP(pw.mwu.p)}
                            </td>
                            <td style={tdStyle}>{pw.mwu.r.toFixed(3)}</td>
                            <td
                              style={{
                                ...tdStyle,
                                fontWeight: 700,
                                color: sigColor,
                              }}
                            >
                              {sigStars(pMin)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Export buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() =>
                  exportCompositeImage(
                    histCanvasRef.current,
                    barCanvasRef.current,
                    radarCanvasRef.current,
                  )
                }
                style={exportBtn}
              >
                Export Figure (PNG)
              </button>
              <button onClick={() => exportCSV(selected)} style={exportBtn}>
                Export Data (CSV)
              </button>
              <button
                onClick={() => exportStatistics(pairwise, selected)}
                style={exportBtn}
              >
                Export Statistics (JSON)
              </button>
            </div>
          </>
        )}
      </div>
    </CollapsiblePanel>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 10,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  flex: 1,
  minWidth: 0,
};

const btnPrimary: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '4px 12px',
  borderRadius: 5,
  border: '1px solid rgba(0,212,255,0.3)',
  background: 'rgba(0,212,255,0.1)',
  color: '#00d4ff',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const btnDanger: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  padding: '4px 8px',
  borderRadius: 5,
  border: '1px solid rgba(255,80,80,0.2)',
  background: 'rgba(255,80,80,0.06)',
  color: 'rgba(255,100,100,0.6)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const exportBtn: React.CSSProperties = {
  flex: 1,
  fontSize: 9,
  fontWeight: 600,
  padding: '5px 0',
  borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  minWidth: 80,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: 'var(--text-label)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 4,
};

const thStyle: React.CSSProperties = {
  padding: '3px 4px',
  textAlign: 'left',
  fontWeight: 700,
  color: 'rgba(255,255,255,0.4)',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '3px 4px',
  color: 'rgba(255,255,255,0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
  whiteSpace: 'nowrap',
};
