import { useState, useEffect, useRef, useCallback } from 'react';
import { useSTDPStore } from '../../stores/stdpStore';
import { WeightChangeHeatmap } from './WeightChangeHeatmap';
import { LearningCurve } from './LearningCurve';

/**
 * Container dashboard for STDP (Spike-Timing-Dependent Plasticity) visualization.
 * Glass panel with collapsible body, toggle, summary stats, heatmap, and learning curve.
 */
export function STDPDashboard() {
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enabled = useSTDPStore((s) => s.enabled);
  const setEnabled = useSTDPStore((s) => s.setEnabled);
  const snapshots = useSTDPStore((s) => s.weightSnapshots);
  const reset = useSTDPStore((s) => s.reset);
  const connectToEvents = useSTDPStore((s) => s.connectToEvents);

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  // Connect store to custom events on mount
  useEffect(() => {
    const cleanup = connectToEvents();
    return cleanup;
  }, [connectToEvents]);

  const dispatchCommand = useCallback((detail: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent('neurevo-command', { detail }));
  }, []);

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      dispatchCommand({
        type: 'enable_stdp',
        enabled: true,
        a_plus: 0.01,
        a_minus: 0.012,
        w_max: 10.0,
      });
    } else {
      dispatchCommand({ type: 'enable_stdp', enabled: false });
      // Stop periodic requests
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [enabled, setEnabled, dispatchCommand]);

  // Periodically request weight snapshots while enabled
  useEffect(() => {
    if (enabled) {
      // Request immediately
      dispatchCommand({ type: 'get_weights' });
      intervalRef.current = setInterval(() => {
        dispatchCommand({ type: 'get_weights' });
      }, 2000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, dispatchCommand]);

  const handleRequestSnapshot = useCallback(() => {
    dispatchCommand({ type: 'get_weights' });
  }, [dispatchCommand]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="glass">
      <button
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="glass-label" style={{ margin: 0 }}>Synaptic Plasticity</span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-label)',
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'none',
        }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {/* Enable/disable toggle */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn btn-ghost"
              style={{
                flex: 1,
                fontSize: 11,
                background: enabled ? 'rgba(0, 200, 255, 0.15)' : undefined,
                borderColor: enabled ? 'rgba(0, 200, 255, 0.4)' : undefined,
              }}
              onClick={handleToggle}
            >
              {enabled ? 'STDP Enabled' : 'Enable STDP'}
            </button>
            {enabled && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 9, padding: '3px 6px' }}
                onClick={handleReset}
                title="Reset weight history"
              >
                Reset
              </button>
            )}
          </div>

          {!enabled && (
            <div style={{
              fontSize: 10,
              color: 'rgba(140, 170, 200, 0.4)',
              textAlign: 'center',
              padding: '8px 0',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              Enable STDP to begin
            </div>
          )}

          {enabled && !latest && (
            <div style={{
              fontSize: 10,
              color: 'rgba(140, 170, 200, 0.4)',
              textAlign: 'center',
              padding: '8px 0',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              Waiting for weight data...
            </div>
          )}

          {enabled && latest && (
            <>
              {/* Summary stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 4,
                fontSize: 9,
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                <div style={{
                  textAlign: 'center',
                  padding: '3px 2px',
                  borderRadius: 3,
                  background: 'rgba(0, 255, 136, 0.08)',
                }}>
                  <div style={{ color: 'rgba(0, 255, 136, 0.7)' }}>Potentiated</div>
                  <div style={{ color: 'rgba(0, 255, 136, 0.9)', fontSize: 12 }}>
                    {latest.changes.n_potentiated}
                  </div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '3px 2px',
                  borderRadius: 3,
                  background: 'rgba(255, 68, 102, 0.08)',
                }}>
                  <div style={{ color: 'rgba(255, 68, 102, 0.7)' }}>Depressed</div>
                  <div style={{ color: 'rgba(255, 68, 102, 0.9)', fontSize: 12 }}>
                    {latest.changes.n_depressed}
                  </div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '3px 2px',
                  borderRadius: 3,
                  background: 'rgba(0, 200, 255, 0.08)',
                }}>
                  <div style={{ color: 'rgba(0, 200, 255, 0.7)' }}>Mean dw</div>
                  <div style={{ color: 'rgba(0, 200, 255, 0.9)', fontSize: 12 }}>
                    {latest.changes.mean_change.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Heatmap */}
              <WeightChangeHeatmap />

              {/* Learning curve */}
              <LearningCurve />

              {/* Manual snapshot request */}
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 10 }}
                onClick={handleRequestSnapshot}
              >
                Request Weight Snapshot
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
