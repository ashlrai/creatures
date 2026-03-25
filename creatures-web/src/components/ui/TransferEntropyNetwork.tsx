import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useAnalysisWorker } from '../../hooks/useAnalysisWorker';

/**
 * Directed graph visualization of information flow via Transfer Entropy.
 * Self-contained: maintains internal firing rate buffer (last 200 frames),
 * uses useAnalysisWorker() to compute TE every 120 frames.
 * Nodes arranged in a circle; directed arrows show significant TE(i->j).
 */
export function TransferEntropyNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Array<number[]>>([]);
  const frameCountRef = useRef<number>(0);
  const lastTRef = useRef<number>(-1);
  const animPhaseRef = useRef<number>(0);

  const frame = useSimulationStore((s) => s.frame);
  const { computeTE, teResult, pending, degradationWarning } = useAnalysisWorker();

  const BUFFER_SIZE = 200;
  const MIN_FRAMES = 50;
  const UPDATE_INTERVAL = 120;

  // Accumulate firing rates and trigger TE computation
  useEffect(() => {
    if (!frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    bufferRef.current.push([...frame.firing_rates]);
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }
    frameCountRef.current++;

    if (
      frameCountRef.current % UPDATE_INTERVAL === 0 &&
      bufferRef.current.length >= MIN_FRAMES
    ) {
      computeTE(bufferRef.current);
    }
  }, [frame, computeTE]);

  // TE magnitude -> color: cool blue (low) to warm red/orange (high)
  const teToColor = (v: number, maxVal: number): string => {
    const t = maxVal > 1e-9 ? Math.min(1, v / maxVal) : 0;
    // blue (0) -> orange (0.5) -> red (1)
    const r = Math.round(40 + t * 215);
    const g = Math.round(80 + Math.max(0, 1 - 2 * Math.abs(t - 0.5)) * 140);
    const b = Math.round(220 * (1 - t));
    return `rgb(${r},${g},${b})`;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    animPhaseRef.current = (animPhaseRef.current + 0.008) % 1;

    if (!teResult || !teResult.teMatrix || teResult.teMatrix.length === 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Accumulating data...', 8, h / 2);
      return;
    }

    const { teMatrix, significanceMask, neuronIndices } = teResult;
    const n = teMatrix.length;

    // Compute per-node outgoing TE and find max TE / significant edges
    let maxTE = 0;
    let sigEdgeCount = 0;
    const outgoingTE = new Float64Array(n);
    const incomingTE = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (significanceMask[i][j]) {
          const val = teMatrix[i][j];
          if (val > maxTE) maxTE = val;
          outgoingTE[i] += val;
          incomingTE[j] += val;
          sigEdgeCount++;
        }
      }
    }

    // Layout: arrange neurons in a circle
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 28;

    const nodeX = new Float64Array(n);
    const nodeY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      nodeX[i] = cx + radius * Math.cos(angle);
      nodeY[i] = cy + radius * Math.sin(angle);
    }

    // Max outgoing TE for node sizing
    let maxOutgoing = 0;
    for (let i = 0; i < n; i++) {
      if (outgoingTE[i] > maxOutgoing) maxOutgoing = outgoingTE[i];
    }

    const phase = animPhaseRef.current;

    // Draw edges (arrows)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || !significanceMask[i][j]) continue;
        const val = teMatrix[i][j];
        const t = maxTE > 1e-9 ? val / maxTE : 0;

        const x1 = nodeX[i];
        const y1 = nodeY[i];
        const x2 = nodeX[j];
        const y2 = nodeY[j];

        // Line thickness proportional to TE magnitude
        const lineWidth = 0.5 + t * 3;

        // Pulsing opacity that travels along the arrow direction
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;

        // Draw the line
        ctx.save();
        ctx.strokeStyle = teToColor(val, maxTE);
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = 0.3 + t * 0.5;

        ctx.beginPath();
        // Shorten line to not overlap nodes
        const nodeRadiusSrc = 3 + (maxOutgoing > 1e-9 ? (outgoingTE[i] / maxOutgoing) * 5 : 0);
        const nodeRadiusDst = 3 + (maxOutgoing > 1e-9 ? (outgoingTE[j] / maxOutgoing) * 5 : 0);
        const ux = dx / dist;
        const uy = dy / dist;
        const sx = x1 + ux * (nodeRadiusSrc + 2);
        const sy = y1 + uy * (nodeRadiusSrc + 2);
        const ex = x2 - ux * (nodeRadiusDst + 4);
        const ey = y2 - uy * (nodeRadiusDst + 4);

        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead
        const headLen = 5 + t * 3;
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.fillStyle = teToColor(val, maxTE);
        ctx.globalAlpha = 0.4 + t * 0.5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLen * Math.cos(angle - 0.4),
          ey - headLen * Math.sin(angle - 0.4),
        );
        ctx.lineTo(
          ex - headLen * Math.cos(angle + 0.4),
          ey - headLen * Math.sin(angle + 0.4),
        );
        ctx.closePath();
        ctx.fill();

        // Animated pulse dot traveling along the arrow
        const pulseT = ((phase * 3 + i * 0.1 + j * 0.07) % 1);
        const px = sx + (ex - sx) * pulseT;
        const py = sy + (ey - sy) * pulseT;
        ctx.globalAlpha = (0.3 + t * 0.7) * (1 - Math.abs(pulseT - 0.5) * 2);
        ctx.fillStyle = teToColor(val, maxTE);
        ctx.beginPath();
        ctx.arc(px, py, lineWidth + 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // Draw nodes
    for (let i = 0; i < n; i++) {
      const nodeSize = 3 + (maxOutgoing > 1e-9 ? (outgoingTE[i] / maxOutgoing) * 5 : 0);

      // Node glow
      const grad = ctx.createRadialGradient(
        nodeX[i], nodeY[i], 0,
        nodeX[i], nodeY[i], nodeSize + 4,
      );
      const hubT = maxOutgoing > 1e-9 ? outgoingTE[i] / maxOutgoing : 0;
      grad.addColorStop(0, `rgba(0, 220, 255, ${0.3 + hubT * 0.5})`);
      grad.addColorStop(1, 'rgba(0, 220, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nodeX[i], nodeY[i], nodeSize + 4, 0, Math.PI * 2);
      ctx.fill();

      // Node circle
      ctx.fillStyle = `rgba(0, ${Math.round(180 + hubT * 75)}, ${Math.round(220 + hubT * 35)}, ${0.7 + hubT * 0.3})`;
      ctx.beginPath();
      ctx.arc(nodeX[i], nodeY[i], nodeSize, 0, Math.PI * 2);
      ctx.fill();

      // Node label (only for small networks)
      if (n <= 20) {
        ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelDist = nodeSize + 10;
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        ctx.fillText(
          `${neuronIndices[i]}`,
          nodeX[i] + labelDist * Math.cos(angle) * 0.3,
          nodeY[i] + labelDist * Math.sin(angle) * 0.3 - 10,
        );
      }
    }

    // Stats in bottom-left
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${n} neurons  ${sigEdgeCount} edges`, 4, h - 4);
  }, [teResult]);

  // Continuous animation loop for the pulsing effect
  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <div
      style={{
        position: 'relative',
        width: '220px',
        background: 'var(--glass-bg, rgba(10, 12, 28, 0.75))',
        border: '1px solid var(--glass-border, rgba(80, 120, 200, 0.15))',
        borderRadius: '8px',
        padding: '6px',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'var(--label-color, rgba(140, 170, 200, 0.6))',
          marginBottom: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Information Flow</span>
        {pending && (
          <span style={{ color: 'rgba(0, 204, 255, 0.6)', fontSize: '9px' }}>
            Computing...
          </span>
        )}
      </div>
      {degradationWarning && (
        <div
          style={{
            fontSize: '8px',
            fontFamily: 'monospace',
            color: '#ff8844',
            marginBottom: '2px',
          }}
        >
          {degradationWarning}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={220}
        height={220}
        style={{ width: '220px', height: '220px', borderRadius: 4, display: 'block' }}
      />
    </div>
  );
}
