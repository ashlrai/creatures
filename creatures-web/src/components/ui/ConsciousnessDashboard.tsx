import { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * ConsciousnessDashboard — real-time consciousness metrics computed client-side
 * from streaming spike data. Works in both live API and demo modes.
 *
 * Metrics computed:
 *   - Φ (Integrated Information) — Gaussian MI approximation
 *   - Neural Complexity (CN) — multi-scale MI
 *   - PCI (Perturbational Complexity Index)
 *   - Synchrony / integration index
 *
 * Also tries the backend API when available for more precise results.
 */

const RAILWAY_API = 'https://creatures-production.up.railway.app';
const API_BASE = (import.meta as any).env?.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'neurevo.dev' ? RAILWAY_API : '/api');

interface Metrics {
  phi: number;
  cn: number;
  pci: number;
  sync: number;
  nSpikes: number;
  nNeurons: number;
  source: 'client' | 'server';
}

export function ConsciousnessDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const historyRef = useRef<Metrics[]>([]);

  // Spike accumulation buffer for client-side computation
  const spikeBufferRef = useRef<{ indices: number[]; times: number[] }>({
    indices: [],
    times: [],
  });
  const frameCountRef = useRef(0);
  const lastComputeRef = useRef(0);

  const experiment = useSimulationStore((s) => s.experiment);
  const frame = useSimulationStore((s) => s.frame);
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);

  // Accumulate spikes from each frame and compute metrics periodically
  useEffect(() => {
    if (!frame || !frame.spikes || frame.spikes.length === 0) return;

    const buf = spikeBufferRef.current;
    const t = frame.t_ms || frameCountRef.current;

    // Record spikes from this frame
    for (const idx of frame.spikes) {
      buf.indices.push(idx);
      buf.times.push(t);
    }

    // Trim buffer to last 20K spikes (smaller = faster computation)
    if (buf.indices.length > 20000) {
      const excess = buf.indices.length - 20000;
      buf.indices = buf.indices.slice(excess);
      buf.times = buf.times.slice(excess);
    }

    frameCountRef.current++;

    // Compute metrics every 50 frames (~1.5 seconds) for faster first result
    if (frameCountRef.current - lastComputeRef.current >= 50 && buf.indices.length > 30) {
      lastComputeRef.current = frameCountRef.current;
      computeClientMetrics(buf.indices, buf.times, frame.firing_rates?.length || 299);
    }
  }, [frame]);

  // Also try the server API when experiment is available
  useEffect(() => {
    if (!experiment?.id || connectionStatus !== 'connected') return;

    const fetchServer = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/consciousness/${experiment.id}/report?bin_ms=10&top_k=20`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.n_spikes > 50) {
            const m: Metrics = {
              phi: data.phi,
              cn: data.neural_complexity,
              pci: data.pci,
              sync: 0,
              nSpikes: data.n_spikes,
              nNeurons: data.n_neurons,
              source: 'server',
            };
            setMetrics(m);
            historyRef.current.push(m);
            if (historyRef.current.length > 60) {
              historyRef.current = historyRef.current.slice(-60);
            }
          }
        }
      } catch {
        // Server not available — client-side metrics will be used
      }
    };

    const interval = setInterval(fetchServer, 5000);
    fetchServer();
    return () => clearInterval(interval);
  }, [experiment?.id, connectionStatus]);

  // Client-side consciousness metrics computation
  const computeClientMetrics = useCallback(
    (indices: number[], times: number[], nNeurons: number) => {
      if (indices.length < 50) return;

      setLoading(true);

      // Bin spikes into 10ms windows
      const tMin = Math.min(...times);
      const tMax = Math.max(...times);
      const binMs = 10;
      const nBins = Math.max(2, Math.floor((tMax - tMin) / binMs));
      const nk = Math.min(nNeurons, 30);

      // Find top-k most active neurons
      const counts = new Map<number, number>();
      for (const idx of indices) {
        counts.set(idx, (counts.get(idx) || 0) + 1);
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const topNeurons = sorted.slice(0, nk).map((e) => e[0]);

      // Build binary spike matrix (nBins x nk)
      const mat: number[][] = [];
      for (let b = 0; b < nBins; b++) mat.push(new Array(nk).fill(0));

      const neuronMap = new Map<number, number>();
      topNeurons.forEach((n, i) => neuronMap.set(n, i));

      for (let s = 0; s < indices.length; s++) {
        const col = neuronMap.get(indices[s]);
        if (col !== undefined) {
          const bin = Math.min(Math.floor((times[s] - tMin) / binMs), nBins - 1);
          mat[bin][col] = 1;
        }
      }

      // Compute synchrony: mean pairwise correlation
      let syncSum = 0;
      let syncCount = 0;
      for (let i = 0; i < nk; i++) {
        for (let j = i + 1; j < nk; j++) {
          let dot = 0, sumI = 0, sumJ = 0;
          for (let b = 0; b < nBins; b++) {
            dot += mat[b][i] * mat[b][j];
            sumI += mat[b][i];
            sumJ += mat[b][j];
          }
          const denom = Math.sqrt(sumI * sumJ) || 1;
          syncSum += dot / denom;
          syncCount++;
        }
      }
      const sync = syncCount > 0 ? syncSum / syncCount : 0;

      // Approximate Φ via covariance structure
      // Φ_approx = log(det(cov_whole)) - 0.5 * (log(det(cov_A)) + log(det(cov_B)))
      // Simplified: use trace ratio as proxy
      const colMeans = new Array(nk).fill(0);
      for (let b = 0; b < nBins; b++) {
        for (let j = 0; j < nk; j++) colMeans[j] += mat[b][j];
      }
      for (let j = 0; j < nk; j++) colMeans[j] /= nBins;

      // Compute covariance diagonal (variances) and off-diagonal (integration)
      let totalVar = 0;
      let offDiagSum = 0;
      let offDiagCount = 0;
      for (let i = 0; i < nk; i++) {
        let vi = 0;
        for (let b = 0; b < nBins; b++) {
          vi += (mat[b][i] - colMeans[i]) ** 2;
        }
        totalVar += vi / nBins;

        for (let j = i + 1; j < nk; j++) {
          let cov = 0;
          for (let b = 0; b < nBins; b++) {
            cov += (mat[b][i] - colMeans[i]) * (mat[b][j] - colMeans[j]);
          }
          offDiagSum += Math.abs(cov / nBins);
          offDiagCount++;
        }
      }

      // Φ proxy: off-diagonal covariance / total variance (integration metric)
      const phi = offDiagCount > 0 && totalVar > 0.001
        ? (offDiagSum / offDiagCount) / (totalVar / nk) * nk * 0.5
        : 0;

      // CN approximation: entropy of the activity pattern diversity
      const patternCounts = new Map<string, number>();
      for (let b = 0; b < nBins; b++) {
        const key = mat[b].join('');
        patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
      }
      let entropy = 0;
      for (const count of patternCounts.values()) {
        const p = count / nBins;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      const cn = entropy;

      // PCI approximation: Lempel-Ziv complexity of binary matrix
      const bitString = mat.flat();
      let lz = 1;
      const seen = new Set<string>();
      let i = 0;
      while (i < bitString.length) {
        let k = 1;
        while (i + k <= bitString.length) {
          const sub = bitString.slice(i, i + k).join('');
          if (!seen.has(sub)) {
            seen.add(sub);
            lz++;
            i += k;
            break;
          }
          k++;
          if (i + k > bitString.length) {
            lz++;
            i = bitString.length;
          }
        }
      }
      const activeFrac = indices.length / (nBins * nk) || 0.01;
      const srcEntropy =
        activeFrac > 0 && activeFrac < 1
          ? -activeFrac * Math.log2(activeFrac) - (1 - activeFrac) * Math.log2(1 - activeFrac)
          : 0.001;
      const expectedLz = (bitString.length * srcEntropy) / Math.log2(bitString.length + 1) || 1;
      const pci = lz / expectedLz;

      const m: Metrics = {
        phi: Math.max(0, phi),
        cn,
        pci,
        sync,
        nSpikes: indices.length,
        nNeurons,
        source: 'client',
      };

      setMetrics(m);
      historyRef.current.push(m);
      if (historyRef.current.length > 60) {
        historyRef.current = historyRef.current.slice(-60);
      }
      setLoading(false);
    },
    []
  );

  // Draw the dashboard
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    if (!metrics) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const buf = spikeBufferRef.current;
      ctx.fillText(
        buf.indices.length > 0
          ? `Buffering... ${buf.indices.length} spikes`
          : 'Waiting for spikes...',
        w / 2,
        h / 2
      );
      return;
    }

    const { phi, cn, pci, sync } = metrics;

    // === PHI GAUGE ===
    const gaugeY = 28;
    const gaugeR = 24;
    const gaugeX = w / 2;

    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY + gaugeR, gaugeR, Math.PI, 0);
    ctx.strokeStyle = 'rgba(80, 120, 200, 0.15)';
    ctx.lineWidth = 6;
    ctx.stroke();

    const phiNorm = Math.min(phi / 5.0, 1.0);
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY + gaugeR, gaugeR, Math.PI, Math.PI + phiNorm * Math.PI);
    const grad = ctx.createLinearGradient(gaugeX - gaugeR, 0, gaugeX + gaugeR, 0);
    grad.addColorStop(0, '#0066ff');
    grad.addColorStop(0.5, '#00ccff');
    grad.addColorStop(1, '#ff00ff');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Φ = ${phi.toFixed(2)}`, gaugeX, gaugeY + gaugeR - 2);

    ctx.fillStyle = 'rgba(140, 170, 200, 0.45)';
    ctx.font = '7px monospace';
    ctx.fillText('Integrated Information', gaugeX, gaugeY + gaugeR + 15);

    // === METRICS ROW ===
    const rowY = gaugeY + gaugeR + 32;
    const colW = w / 3;

    const drawMetric = (x: number, label: string, value: string, color: string) => {
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(value, x, rowY);
      ctx.fillStyle = 'rgba(140, 170, 200, 0.35)';
      ctx.font = '7px monospace';
      ctx.fillText(label, x, rowY + 11);
    };

    drawMetric(colW * 0.5, 'Complexity', cn.toFixed(1), '#44ff88');
    drawMetric(colW * 1.5, 'PCI', pci.toFixed(2), '#ffaa44');
    drawMetric(colW * 2.5, 'Sync', sync.toFixed(2), '#ff4488');

    // === PHI HISTORY SPARKLINE ===
    const history = historyRef.current;
    if (history.length > 1) {
      const sparkY = rowY + 22;
      const sparkH = 30;
      const sparkW = w - 16;

      ctx.fillStyle = 'rgba(140, 170, 200, 0.25)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Φ over time', 8, sparkY - 2);

      const maxPhi = Math.max(...history.map((h) => h.phi), 0.1);

      // Fill area
      ctx.beginPath();
      ctx.moveTo(8, sparkY + sparkH);
      for (let i = 0; i < history.length; i++) {
        const x = 8 + (i / (history.length - 1)) * sparkW;
        const y = sparkY + sparkH - (history[i].phi / maxPhi) * sparkH;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(8 + sparkW, sparkY + sparkH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 204, 255, 0.08)';
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 204, 255, 0.7)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < history.length; i++) {
        const x = 8 + (i / (history.length - 1)) * sparkW;
        const y = sparkY + sparkH - (history[i].phi / maxPhi) * sparkH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // CN sparkline (green, lower)
      const maxCN = Math.max(...history.map((h) => h.cn), 0.1);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(68, 255, 136, 0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < history.length; i++) {
        const x = 8 + (i / (history.length - 1)) * sparkW;
        const y = sparkY + sparkH - (history[i].cn / maxCN) * sparkH * 0.5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // === BOTTOM INFO ===
    ctx.fillStyle = 'rgba(140, 170, 200, 0.2)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${metrics.nSpikes.toLocaleString()} spikes | ${metrics.source}`,
      w - 6,
      h - 4
    );
  }, [metrics]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, frame]);

  return (
    <div
      style={{
        position: 'relative',
        width: '220px',
        background: 'rgba(10, 12, 28, 0.75)',
        border: '1px solid rgba(80, 120, 200, 0.15)',
        borderRadius: '8px',
        padding: '6px',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'rgba(140, 170, 200, 0.6)',
          marginBottom: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Consciousness Metrics</span>
        {loading && (
          <span style={{ color: 'rgba(0, 204, 255, 0.6)', fontSize: '9px' }}>
            ...
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={220}
        height={170}
        style={{ width: '220px', height: '170px', borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
