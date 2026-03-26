import { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * ConsciousnessDashboard — displays real-time consciousness metrics:
 *   - Φ (Integrated Information) gauge
 *   - Neural Complexity (CN) profile
 *   - PCI (Perturbational Complexity Index)
 *   - Ignition event counter
 *
 * Fetches from /api/consciousness/{simId}/report every 3 seconds.
 */

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

interface ConsciousnessMetrics {
  phi: number;
  neural_complexity: number;
  pci: number;
  ignition_rate_per_second: number;
  ignition_events: Array<{
    time_ms: number;
    peak_activation: number;
    strength: number;
  }>;
  complexity_profile: number[];
  n_neurons: number;
  n_spikes: number;
  summary: string;
}

export function ConsciousnessDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [metrics, setMetrics] = useState<ConsciousnessMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<{ phi: number; cn: number; pci: number; t: number }[]>([]);

  const experiment = useSimulationStore((s) => s.experiment);
  const frame = useSimulationStore((s) => s.frame);
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);

  // Fetch consciousness metrics periodically
  useEffect(() => {
    if (!experiment?.id || connectionStatus !== 'connected') return;

    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/consciousness/${experiment.id}/report?bin_ms=5&top_k=25`
        );
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
          setError(null);
          historyRef.current.push({
            phi: data.phi,
            cn: data.neural_complexity,
            pci: data.pci,
            t: Date.now(),
          });
          if (historyRef.current.length > 60) {
            historyRef.current = historyRef.current.slice(-60);
          }
        } else if (res.status === 400) {
          setError('Accumulating spikes...');
        }
      } catch {
        // Silently fail — API may not be running
      }
      setLoading(false);
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, [experiment?.id, connectionStatus]);

  // Draw the dashboard
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    if (!metrics && !error) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for simulation...', w / 2, h / 2);
      return;
    }

    if (error) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(error, w / 2, h / 2);
      return;
    }

    if (!metrics) return;

    const phi = metrics.phi;
    const cn = metrics.neural_complexity;
    const pci = metrics.pci;
    const ignitions = metrics.ignition_rate_per_second;

    // === PHI GAUGE (top section) ===
    const gaugeY = 30;
    const gaugeR = 25;
    const gaugeX = w / 2;

    // Background arc
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY + gaugeR, gaugeR, Math.PI, 0);
    ctx.strokeStyle = 'rgba(80, 120, 200, 0.15)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Phi arc (0-2 range mapped to semicircle)
    const phiNorm = Math.min(phi / 2.0, 1.0);
    const phiAngle = Math.PI + phiNorm * Math.PI;
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY + gaugeR, gaugeR, Math.PI, phiAngle);
    const phiGrad = ctx.createLinearGradient(gaugeX - gaugeR, 0, gaugeX + gaugeR, 0);
    phiGrad.addColorStop(0, '#0066ff');
    phiGrad.addColorStop(0.5, '#00ccff');
    phiGrad.addColorStop(1, '#ff00ff');
    ctx.strokeStyle = phiGrad;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Phi value
    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Φ = ${phi.toFixed(3)}`, gaugeX, gaugeY + gaugeR - 2);

    // Label
    ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
    ctx.font = '8px monospace';
    ctx.fillText('Integrated Information', gaugeX, gaugeY + gaugeR + 16);

    // === METRICS ROW ===
    const rowY = gaugeY + gaugeR + 35;
    const colW = w / 3;

    const drawMetric = (x: number, label: string, value: string, color: string) => {
      ctx.fillStyle = color;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(value, x, rowY);
      ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
      ctx.font = '7px monospace';
      ctx.fillText(label, x, rowY + 12);
    };

    drawMetric(colW * 0.5, 'Complexity', cn.toFixed(2), '#44ff88');
    drawMetric(colW * 1.5, 'PCI', pci.toFixed(3), '#ffaa44');
    drawMetric(colW * 2.5, 'Ignitions/s', ignitions.toFixed(1), '#ff4488');

    // === COMPLEXITY PROFILE (bar chart) ===
    const profile = metrics.complexity_profile;
    if (profile && profile.length > 0) {
      const barY = rowY + 25;
      const barH = 30;
      const barW = (w - 20) / profile.length;
      const maxP = Math.max(...profile, 0.001);

      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Scale Profile', 10, barY - 3);

      for (let i = 0; i < profile.length; i++) {
        const h2 = (profile[i] / maxP) * barH;
        const t = profile[i] / maxP;
        ctx.fillStyle = `rgba(${Math.round(68 + t * 187)}, ${Math.round(255 - t * 100)}, ${Math.round(136 - t * 50)}, 0.8)`;
        ctx.fillRect(10 + i * barW, barY + barH - h2, barW - 1, h2);
      }
    }

    // === PHI HISTORY (sparkline) ===
    const history = historyRef.current;
    if (history.length > 1) {
      const sparkY = h - 35;
      const sparkH = 25;
      const sparkW = w - 20;

      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Φ History', 10, sparkY - 3);

      const maxPhi = Math.max(...history.map((h) => h.phi), 0.01);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 204, 255, 0.6)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < history.length; i++) {
        const x = 10 + (i / (history.length - 1)) * sparkW;
        const y = sparkY + sparkH - (history[i].phi / maxPhi) * sparkH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // === SPIKES INFO ===
    ctx.fillStyle = 'rgba(140, 170, 200, 0.25)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${metrics.n_spikes.toLocaleString()} spikes | ${metrics.n_neurons.toLocaleString()} neurons`,
      w - 6,
      h - 4
    );
  }, [metrics, error]);

  // Animation loop
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
            Computing...
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={220}
        height={200}
        style={{
          width: '220px',
          height: '200px',
          borderRadius: 4,
          display: 'block',
        }}
      />
    </div>
  );
}
