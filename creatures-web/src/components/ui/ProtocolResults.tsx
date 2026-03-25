import { useRef, useEffect, useCallback } from 'react';
import { useProtocolStore } from '../../stores/protocolStore';

// ── Statistics ────────────────────────────────────────────────────────────────

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

function pairedTTest(
  a: number[],
  b: number[],
): { t: number; p: number; ci: [number, number] } {
  const n = Math.min(a.length, b.length);
  if (n < 2) return { t: 0, p: 1, ci: [0, 0] };

  const diffs = a.slice(0, n).map((v, i) => v - b[i]);
  const m = diffs.reduce((s, v) => s + v, 0) / n;
  const v = diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);

  if (se < 1e-15) return { t: 0, p: 1, ci: [m, m] };

  const t = m / se;
  const p = 2 * (1 - normalCDF(Math.abs(t)));
  // ~95% CI using z approximation
  const margin = 1.96 * se;
  return { t, p, ci: [m - margin, m + margin] };
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

function cohensD(a: number[], b: number[]): number {
  const pooledSD = Math.sqrt(
    ((a.length - 1) * std(a) ** 2 + (b.length - 1) * std(b) ** 2) /
      (a.length + b.length - 2),
  );
  if (pooledSD < 1e-15) return 0;
  return (mean(a) - mean(b)) / pooledSD;
}

function standardError(arr: number[]): number {
  if (arr.length < 2) return 0;
  return std(arr) / Math.sqrt(arr.length);
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProtocolResults() {
  const results = useProtocolStore((s) => s.results);
  const psthCanvasRef = useRef<HTMLCanvasElement>(null);
  const compCanvasRef = useRef<HTMLCanvasElement>(null);

  // Aggregate across trials
  const allBaseline = results.flatMap((r) => r.baselineRates);
  const allPost = results.flatMap((r) => r.postRates);

  const hasData = allBaseline.length > 0 && allPost.length > 0;
  const stat = hasData ? pairedTTest(allBaseline, allPost) : null;
  const d = hasData ? cohensD(allBaseline, allPost) : 0;
  const meanBL = mean(allBaseline);
  const meanPost = mean(allPost);
  const seBL = standardError(allBaseline);
  const sePost = standardError(allPost);

  // ── Draw PSTH canvas ───────────────────────────────────────────────────

  useEffect(() => {
    const canvas = psthCanvasRef.current;
    if (!canvas || results.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Collect all measurement arrays across trials
    const allMetrics: Record<string, number[][]> = {};
    for (const r of results) {
      for (const [key, vals] of Object.entries(r.measurements)) {
        if (!allMetrics[key]) allMetrics[key] = [];
        allMetrics[key].push(vals);
      }
    }

    if (Object.keys(allMetrics).length === 0 && !hasData) return;

    // Use post rates as a simple PSTH proxy
    const rates = allPost.length > 0 ? allPost : Object.values(allMetrics)[0]?.flat() ?? [];
    if (rates.length === 0) return;

    const maxRate = Math.max(...rates, 1);
    const barW = Math.max(2, (w - 40) / rates.length);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += h / 4) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Bars
    for (let i = 0; i < rates.length; i++) {
      const barH = (rates[i] / maxRate) * (h - 20);
      const x = 30 + i * barW;
      const y = h - 10 - barH;

      const gradient = ctx.createLinearGradient(x, y, x, h - 10);
      gradient.addColorStop(0, 'rgba(0, 212, 255, 0.8)');
      gradient.addColorStop(1, 'rgba(0, 212, 255, 0.2)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barW - 1, barH);
    }

    // Y axis label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.fillText(`${maxRate.toFixed(0)}`, 2, 12);
    ctx.fillText('0', 2, h - 10);

    // X axis label
    ctx.fillText('Neuron index', w / 2 - 20, h - 1);
  }, [results, allPost, hasData]);

  // ── Draw comparison canvas ─────────────────────────────────────────────

  useEffect(() => {
    const canvas = compCanvasRef.current;
    if (!canvas || !hasData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(meanBL + seBL, meanPost + sePost, 1);
    const barW = 60;
    const gap = 30;
    const startX = (w - 2 * barW - gap) / 2;
    const chartH = h - 40;

    // Baseline bar
    const blH = (meanBL / maxVal) * chartH;
    const blX = startX;
    const blY = h - 20 - blH;
    ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
    ctx.fillRect(blX, blY, barW, blH);

    // Baseline error bar
    const blErrH = (seBL / maxVal) * chartH;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    const blMidX = blX + barW / 2;
    ctx.beginPath();
    ctx.moveTo(blMidX, blY - blErrH);
    ctx.lineTo(blMidX, blY + blErrH);
    ctx.moveTo(blMidX - 5, blY - blErrH);
    ctx.lineTo(blMidX + 5, blY - blErrH);
    ctx.moveTo(blMidX - 5, blY + blErrH);
    ctx.lineTo(blMidX + 5, blY + blErrH);
    ctx.stroke();

    // Post bar
    const postH = (meanPost / maxVal) * chartH;
    const postX = startX + barW + gap;
    const postY = h - 20 - postH;
    ctx.fillStyle = stat && stat.p < 0.05
      ? 'rgba(68, 204, 102, 0.7)'
      : 'rgba(0, 212, 255, 0.6)';
    ctx.fillRect(postX, postY, barW, postH);

    // Post error bar
    const postErrH = (sePost / maxVal) * chartH;
    const postMidX = postX + barW / 2;
    ctx.beginPath();
    ctx.moveTo(postMidX, postY - postErrH);
    ctx.lineTo(postMidX, postY + postErrH);
    ctx.moveTo(postMidX - 5, postY - postErrH);
    ctx.lineTo(postMidX + 5, postY - postErrH);
    ctx.moveTo(postMidX - 5, postY + postErrH);
    ctx.lineTo(postMidX + 5, postY + postErrH);
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Baseline', blMidX, h - 5);
    ctx.fillText('Post', postMidX, h - 5);

    // p-value annotation
    if (stat) {
      const pColor = stat.p < 0.05 ? '#44cc66' : '#888';
      ctx.fillStyle = pColor;
      ctx.font = '9px monospace';
      const annotY = Math.min(blY, postY) - 12;
      ctx.fillText(`p = ${stat.p < 0.001 ? '<0.001' : stat.p.toFixed(3)}`, w / 2, annotY);

      // Bracket
      ctx.strokeStyle = pColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(blMidX, annotY + 4);
      ctx.lineTo(blMidX, annotY + 8);
      ctx.lineTo(postMidX, annotY + 8);
      ctx.lineTo(postMidX, annotY + 4);
      ctx.stroke();

      // Effect size below
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '8px monospace';
      ctx.fillText(`d = ${d.toFixed(2)}`, w / 2, h - 20 + 14);
    }

    ctx.textAlign = 'start';
  }, [results, hasData, meanBL, meanPost, seBL, sePost, stat, d]);

  // ── Export handlers ────────────────────────────────────────────────────

  const handleExportJSON = useCallback(() => {
    const data = {
      nTrials: results.length,
      results,
      summary: {
        meanBaseline: meanBL,
        meanPost: meanPost,
        tStatistic: stat?.t ?? null,
        pValue: stat?.p ?? null,
        ci95: stat?.ci ?? null,
        cohensD: d,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protocol_results_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, meanBL, meanPost, stat, d]);

  const handleExportPNG = useCallback(() => {
    const canvas = compCanvasRef.current ?? psthCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `protocol_figure_${Date.now()}.png`;
    a.click();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  if (results.length === 0) return null;

  return (
    <div
      style={{
        width: '100%',
        background: 'rgba(12, 16, 24, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Protocol Results
        <span
          style={{
            fontSize: 9,
            fontWeight: 400,
            color: 'var(--text-label)',
            marginLeft: 8,
          }}
        >
          {results.length} trial{results.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* PSTH section */}
      <div>
        <div style={sectionLabelStyle}>PSTH — Firing Rates</div>
        <canvas
          ref={psthCanvasRef}
          width={400}
          height={120}
          style={{
            width: '100%',
            height: 120,
            borderRadius: 6,
            background: 'rgba(0,0,0,0.2)',
          }}
        />
      </div>

      {/* Comparison section */}
      {hasData && (
        <div>
          <div style={sectionLabelStyle}>Baseline vs Post</div>
          <canvas
            ref={compCanvasRef}
            width={300}
            height={160}
            style={{
              width: '100%',
              height: 160,
              borderRadius: 6,
              background: 'rgba(0,0,0,0.2)',
            }}
          />
        </div>
      )}

      {/* Statistical summary */}
      <div>
        <div style={sectionLabelStyle}>Statistical Summary</div>
        <div
          style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 6,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <StatRow label="Mean baseline" value={`${meanBL.toFixed(3)} Hz`} />
          <StatRow label="Mean post" value={`${meanPost.toFixed(3)} Hz`} />
          {stat && (
            <>
              <StatRow
                label="Paired t-test"
                value={`t = ${stat.t.toFixed(3)}, p = ${stat.p < 0.001 ? '<0.001' : stat.p.toFixed(4)}`}
                color={stat.p < 0.05 ? '#44cc66' : '#888'}
              />
              <StatRow
                label="95% CI"
                value={`[${stat.ci[0].toFixed(3)}, ${stat.ci[1].toFixed(3)}]`}
              />
              <StatRow
                label="Effect size (Cohen's d)"
                value={d.toFixed(3)}
                color={
                  Math.abs(d) >= 0.8
                    ? '#ff4444'
                    : Math.abs(d) >= 0.5
                      ? '#ffaa22'
                      : '#888'
                }
              />
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textAlign: 'center',
                  marginTop: 4,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background:
                    stat.p < 0.05
                      ? 'rgba(68, 204, 102, 0.12)'
                      : 'rgba(255,255,255,0.03)',
                  color: stat.p < 0.05 ? '#44cc66' : '#888',
                }}
              >
                {stat.p < 0.001
                  ? 'Highly significant (p < 0.001)'
                  : stat.p < 0.01
                    ? 'Very significant (p < 0.01)'
                    : stat.p < 0.05
                      ? 'Significant (p < 0.05)'
                      : 'Not significant (p >= 0.05)'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleExportJSON} style={exportBtnStyle}>
          Export Results (JSON)
        </button>
        <button onClick={handleExportPNG} style={exportBtnStyle}>
          Export Figure (PNG)
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
      }}
    >
      <span style={{ color: 'var(--text-label)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--accent-cyan)', fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: 'var(--text-label)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 4,
};

const exportBtnStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 10,
  fontWeight: 600,
  padding: '5px 0',
  borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
};
