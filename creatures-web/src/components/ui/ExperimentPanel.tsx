import { useState, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface Measurement {
  time_ms: number;
  metric: string;
  value: number;
  label: string;
}

interface ExperimentResult {
  protocol_name: string;
  description?: string;
  measurements: Measurement[];
  control_measurements?: Measurement[];
  summary: Record<string, number | string>;
  report: string;
}

// ── Preset experiments ──────────────────────────────────────────────────────

const PRESETS = [
  { key: 'touch_withdrawal', label: 'Touch Withdrawal' },
  { key: 'dose_response', label: 'Drug Dose-Response' },
  { key: 'gaba_knockout', label: 'GABA Knockout' },
  { key: 'chemotaxis_learning', label: 'Chemotaxis Learning' },
] as const;

// ── Component ───────────────────────────────────────────────────────────────

export function ExperimentPanel() {
  const [expanded, setExpanded] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESETS[0].key);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  const runExperiment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setShowReport(false);

    try {
      const res = await fetch('/api/experiments/protocols/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: selectedPreset }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data: ExperimentResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Experiment failed');
    } finally {
      setLoading(false);
    }
  }, [selectedPreset]);

  return (
    <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Collapsible header */}
      <div
        className="glass-label"
        onClick={toggle}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Experiment Protocols</span>
        <span style={{ fontSize: '10px', opacity: 0.5 }}>
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Protocol selector */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={`btn ${selectedPreset === p.key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 10, padding: '3px 8px', flex: '1 1 auto', minWidth: 0 }}
                onClick={() => setSelectedPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Run button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', position: 'relative' }}
            disabled={loading}
            onClick={runExperiment}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span className="experiment-spinner" />
                Running...
              </span>
            ) : (
              'Run Experiment'
            )}
          </button>

          {/* Error */}
          {error && (
            <div style={{
              fontSize: 10,
              color: 'var(--accent-magenta)',
              padding: '4px 8px',
              background: 'rgba(255, 34, 136, 0.06)',
              borderRadius: 6,
            }}>
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Protocol info */}
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--accent-cyan)',
              }}>
                {result.protocol_name}
              </div>
              {result.description && (
                <div style={{ fontSize: 9, color: 'var(--text-label)', lineHeight: 1.4 }}>
                  {result.description}
                </div>
              )}

              {/* Measurements table */}
              <div style={{
                maxHeight: 160,
                overflowY: 'auto',
                borderRadius: 6,
                background: 'rgba(0,0,0,0.2)',
              }}>
                <table style={{
                  width: '100%',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  borderCollapse: 'collapse',
                }}>
                  <thead>
                    <tr style={{ color: 'var(--text-label)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '3px 4px', textAlign: 'left', fontWeight: 600 }}>t(ms)</th>
                      <th style={{ padding: '3px 4px', textAlign: 'left', fontWeight: 600 }}>metric</th>
                      <th style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 600 }}>value</th>
                      <th style={{ padding: '3px 4px', textAlign: 'left', fontWeight: 600 }}>label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.measurements.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(80,130,200,0.04)' }}>
                        <td style={{ padding: '2px 4px', color: 'var(--text-secondary)' }}>{m.time_ms}</td>
                        <td style={{ padding: '2px 4px', color: 'var(--text-primary)' }}>{m.metric}</td>
                        <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--accent-cyan)' }}>
                          {typeof m.value === 'number' ? m.value.toFixed(3) : m.value}
                        </td>
                        <td style={{ padding: '2px 4px', color: 'var(--text-label)' }}>{m.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Control comparison */}
              {result.control_measurements && result.control_measurements.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-label)', marginBottom: 2, fontFamily: 'var(--font-mono)' }}>
                    Control Comparison
                  </div>
                  <div style={{
                    maxHeight: 100,
                    overflowY: 'auto',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.15)',
                  }}>
                    <table style={{
                      width: '100%',
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      borderCollapse: 'collapse',
                    }}>
                      <tbody>
                        {result.control_measurements.map((m, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(80,130,200,0.04)' }}>
                            <td style={{ padding: '2px 4px', color: 'var(--text-secondary)' }}>{m.time_ms}</td>
                            <td style={{ padding: '2px 4px', color: 'var(--text-primary)' }}>{m.metric}</td>
                            <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--accent-green)' }}>
                              {typeof m.value === 'number' ? m.value.toFixed(3) : m.value}
                            </td>
                            <td style={{ padding: '2px 4px', color: 'var(--text-label)' }}>{m.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Summary statistics */}
              {result.summary && Object.keys(result.summary).length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-label)', marginBottom: 2, fontFamily: 'var(--font-mono)' }}>
                    Summary
                  </div>
                  {Object.entries(result.summary).map(([key, val]) => (
                    <div className="stat-row" key={key}>
                      <span className="stat-label">{key}</span>
                      <span className="stat-value stat-cyan">
                        {typeof val === 'number' ? val.toFixed(3) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Export report button */}
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 10 }}
                onClick={() => setShowReport((v) => !v)}
              >
                {showReport ? 'Hide Report' : 'Export Report'}
              </button>

              {showReport && result.report && (
                <pre style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: 6,
                  padding: 8,
                  maxHeight: 200,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}>
                  {result.report}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spinner keyframes injected via style tag */}
      <style>{`
        .experiment-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.15);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: exp-spin 0.6s linear infinite;
        }
        @keyframes exp-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
