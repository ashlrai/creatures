import { useRef, useEffect } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useAnalysisWorker } from '../../hooks/useAnalysisWorker';

/**
 * Summary panel showing causal analysis results.
 * Self-contained: uses its own useAnalysisWorker instance, computes every 200 frames.
 * Shows top causal pairs, information hubs, receivers, and network stats.
 */
export function CausalDashboard() {
  const bufferRef = useRef<Array<number[]>>([]);
  const frameCountRef = useRef<number>(0);
  const lastTRef = useRef<number>(-1);

  const frame = useSimulationStore((s) => s.frame);
  const { computeMI, computeTE, miResult, teResult, pending } = useAnalysisWorker();

  const BUFFER_SIZE = 200;
  const MIN_FRAMES = 50;
  const UPDATE_INTERVAL = 200;

  // Accumulate firing rates and trigger computation
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
      computeMI(bufferRef.current);
    }
  }, [frame, computeTE, computeMI]);

  // Derive stats from teResult
  const stats = (() => {
    if (!teResult || !teResult.teMatrix || teResult.teMatrix.length === 0) return null;

    const { teMatrix, significanceMask, neuronIndices } = teResult;
    const n = teMatrix.length;

    // Collect significant edges
    const edges: { src: number; dst: number; srcIdx: number; dstIdx: number; te: number }[] = [];
    const outgoing = new Float64Array(n);
    const incoming = new Float64Array(n);
    let totalTE = 0;
    let maxTE = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (significanceMask[i][j]) {
          const val = teMatrix[i][j];
          edges.push({
            src: i,
            dst: j,
            srcIdx: neuronIndices[i],
            dstIdx: neuronIndices[j],
            te: val,
          });
          outgoing[i] += val;
          incoming[j] += val;
          totalTE += val;
          if (val > maxTE) maxTE = val;
        }
      }
    }

    // Sort edges by TE descending
    edges.sort((a, b) => b.te - a.te);
    const topPairs = edges.slice(0, 5);

    // Top hubs (outgoing)
    const hubEntries = neuronIndices
      .map((idx, i) => ({ idx, total: outgoing[i] }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Top receivers (incoming)
    const receiverEntries = neuronIndices
      .map((idx, i) => ({ idx, total: incoming[i] }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const meanTE = edges.length > 0 ? totalTE / edges.length : 0;

    return { topPairs, hubEntries, receiverEntries, sigEdges: edges.length, meanTE, maxTE };
  })();

  // MI stats
  const miStats = (() => {
    if (!miResult || !miResult.miMatrix || miResult.miMatrix.length === 0) return null;
    const { miMatrix } = miResult;
    const n = miMatrix.length;
    let maxMI = 0;
    let totalMI = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = miMatrix[i][j];
        totalMI += val;
        count++;
        if (val > maxMI) maxMI = val;
      }
    }
    return { meanMI: count > 0 ? totalMI / count : 0, maxMI };
  })();

  const labelStyle: React.CSSProperties = {
    fontSize: '9px',
    fontFamily: 'monospace',
    color: 'rgba(0, 204, 255, 0.7)',
    fontWeight: 600,
    marginTop: '8px',
    marginBottom: '3px',
    letterSpacing: '0.5px',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '9px',
    fontFamily: 'monospace',
    color: 'rgba(180, 200, 220, 0.8)',
    lineHeight: '1.5',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
  };

  const dimStyle: React.CSSProperties = {
    color: 'rgba(140, 170, 200, 0.4)',
  };

  const formatBits = (v: number) => v.toFixed(3);

  const hasData = stats !== null;

  return (
    <div
      style={{
        width: '220px',
        maxHeight: '300px',
        overflowY: 'auto',
        background: 'var(--glass-bg, rgba(10, 12, 28, 0.75))',
        border: '1px solid var(--glass-border, rgba(80, 120, 200, 0.15))',
        borderRadius: '8px',
        padding: '8px',
        backdropFilter: 'blur(12px)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(80,120,200,0.2) transparent',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'var(--label-color, rgba(140, 170, 200, 0.6))',
          marginBottom: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Causal Analysis</span>
        {pending && (
          <span style={{ color: 'rgba(0, 204, 255, 0.6)', fontSize: '9px' }}>
            Computing...
          </span>
        )}
      </div>

      {!hasData && (
        <div
          style={{
            fontSize: '10px',
            fontFamily: 'monospace',
            color: 'rgba(140, 170, 200, 0.3)',
            textAlign: 'center',
            padding: '20px 0',
          }}
        >
          Accumulating data...
        </div>
      )}

      {hasData && stats && (
        <>
          {/* Top Causal Pairs */}
          <div style={labelStyle}>Top Causal Pairs</div>
          <div style={valueStyle}>
            {stats.topPairs.length === 0 && (
              <span style={dimStyle}>No significant pairs</span>
            )}
            {stats.topPairs.map((p, i) => (
              <div key={i} style={rowStyle}>
                <span>
                  N{p.srcIdx} <span style={dimStyle}>&rarr;</span> N{p.dstIdx}
                </span>
                <span>{formatBits(p.te)} bits</span>
              </div>
            ))}
          </div>

          {/* Information Hubs */}
          <div style={labelStyle}>Information Hubs</div>
          <div style={valueStyle}>
            {stats.hubEntries.length === 0 && (
              <span style={dimStyle}>None</span>
            )}
            {stats.hubEntries.map((h, i) => (
              <div key={i} style={rowStyle}>
                <span>N{h.idx}</span>
                <span>{formatBits(h.total)} bits out</span>
              </div>
            ))}
          </div>

          {/* Information Receivers */}
          <div style={labelStyle}>Information Receivers</div>
          <div style={valueStyle}>
            {stats.receiverEntries.length === 0 && (
              <span style={dimStyle}>None</span>
            )}
            {stats.receiverEntries.map((r, i) => (
              <div key={i} style={rowStyle}>
                <span>N{r.idx}</span>
                <span>{formatBits(r.total)} bits in</span>
              </div>
            ))}
          </div>

          {/* Network Stats */}
          <div style={labelStyle}>Network Stats</div>
          <div style={valueStyle}>
            <div style={rowStyle}>
              <span style={dimStyle}>Significant edges</span>
              <span>{stats.sigEdges}</span>
            </div>
            <div style={rowStyle}>
              <span style={dimStyle}>Mean TE</span>
              <span>{formatBits(stats.meanTE)} bits</span>
            </div>
            <div style={rowStyle}>
              <span style={dimStyle}>Max TE</span>
              <span>{formatBits(stats.maxTE)} bits</span>
            </div>
            {miStats && (
              <>
                <div style={rowStyle}>
                  <span style={dimStyle}>Mean MI</span>
                  <span>{formatBits(miStats.meanMI)} bits</span>
                </div>
                <div style={rowStyle}>
                  <span style={dimStyle}>Max MI</span>
                  <span>{formatBits(miStats.maxMI)} bits</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
