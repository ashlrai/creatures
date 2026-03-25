import { useState, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface MetricsSummary {
  neuron_count: number;
  synapse_count: number;
  active_neurons: number;
  mean_firing_rate: number;
}

interface SpeciesData {
  name: string;
  label: string;
  color: string;
  metrics: MetricsSummary | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function MetricBar({ label, valueA, valueB, colorA, colorB }: {
  label: string;
  valueA: number;
  valueB: number;
  colorA: string;
  colorB: string;
}) {
  const max = Math.max(valueA, valueB, 1);
  const pctA = (valueA / max) * 100;
  const pctB = (valueB / max) * 100;
  const delta = valueB !== 0 ? ((valueA - valueB) / valueB * 100) : 0;

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 9,
        color: 'var(--text-label)',
        marginBottom: 2,
        fontFamily: 'var(--font-mono)',
      }}>
        <span>{label}</span>
        {valueA > 0 && valueB > 0 && (
          <span style={{
            color: delta > 0 ? 'var(--accent-cyan)' : delta < 0 ? 'var(--accent-magenta)' : 'var(--text-label)',
          }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, height: 6 }}>
        <div style={{
          flex: 1,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pctA}%`,
            height: '100%',
            background: colorA,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{
          flex: 1,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pctB}%`,
            height: '100%',
            background: colorB,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        marginTop: 1,
      }}>
        <span style={{ color: colorA }}>{formatMetric(valueA)}</span>
        <span style={{ color: colorB }}>{formatMetric(valueB)}</span>
      </div>
    </div>
  );
}

function formatMetric(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(3);
}

// ── Component ───────────────────────────────────────────────────────────────

export function SpeciesComparison() {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [species, setSpecies] = useState<[SpeciesData, SpeciesData]>([
    { name: 'c_elegans', label: 'C. elegans', color: 'var(--accent-cyan)', metrics: null },
    { name: 'drosophila', label: 'Drosophila', color: 'var(--accent-amber)', metrics: null },
  ]);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Create experiments for both organisms and fetch their metrics
      const results = await Promise.all(
        species.map(async (sp) => {
          try {
            // Create an experiment for this organism
            const createRes = await fetch('/api/experiments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ organism: sp.name }),
            });

            if (!createRes.ok) {
              throw new Error(`Failed to create ${sp.label} experiment`);
            }

            const expData = await createRes.json();
            const simId = expData.id ?? expData.sim_id;

            // Fetch metrics summary
            const metricsRes = await fetch(`/api/metrics/${simId}/summary`);
            if (!metricsRes.ok) {
              throw new Error(`Failed to fetch ${sp.label} metrics`);
            }

            const metrics: MetricsSummary = await metricsRes.json();
            return { ...sp, metrics };
          } catch {
            // Return species with null metrics on failure
            return sp;
          }
        })
      );

      setSpecies(results as [SpeciesData, SpeciesData]);

      // Check if at least one succeeded
      if (!results[0].metrics && !results[1].metrics) {
        setError('Could not fetch metrics for either organism. Is the server running?');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  }, [species]);

  const [a, b] = species;
  const bothLoaded = a.metrics !== null && b.metrics !== null;
  const eitherLoaded = a.metrics !== null || b.metrics !== null;

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
        <span>Species Comparison</span>
        <span style={{ fontSize: '10px', opacity: 0.5 }}>
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Column headers */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            fontWeight: 700,
            padding: '0 2px',
          }}>
            <span style={{ color: a.color }}>{a.label}</span>
            <span style={{ color: b.color }}>{b.label}</span>
          </div>

          {/* Run comparison button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', position: 'relative' }}
            disabled={loading}
            onClick={runComparison}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span className="comparison-spinner" />
                Comparing...
              </span>
            ) : (
              'Run Comparison'
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
          {bothLoaded && a.metrics && b.metrics && (
            <div>
              <MetricBar
                label="Neuron Count"
                valueA={a.metrics.neuron_count}
                valueB={b.metrics.neuron_count}
                colorA={a.color}
                colorB={b.color}
              />
              <MetricBar
                label="Synapse Count"
                valueA={a.metrics.synapse_count}
                valueB={b.metrics.synapse_count}
                colorA={a.color}
                colorB={b.color}
              />
              <MetricBar
                label="Active Neurons"
                valueA={a.metrics.active_neurons}
                valueB={b.metrics.active_neurons}
                colorA={a.color}
                colorB={b.color}
              />
              <MetricBar
                label="Mean Firing Rate"
                valueA={a.metrics.mean_firing_rate}
                valueB={b.metrics.mean_firing_rate}
                colorA={a.color}
                colorB={b.color}
              />

              {/* Delta summary */}
              <div style={{
                marginTop: 4,
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 6,
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
              }}>
                <div style={{ marginBottom: 2, color: 'var(--text-label)', fontWeight: 600 }}>
                  Ratio ({b.label} / {a.label})
                </div>
                <div className="stat-row">
                  <span className="stat-label">Neurons</span>
                  <span className="stat-value" style={{ color: 'var(--text-primary)' }}>
                    {a.metrics.neuron_count > 0
                      ? (b.metrics.neuron_count / a.metrics.neuron_count).toFixed(2) + 'x'
                      : '--'}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Synapses</span>
                  <span className="stat-value" style={{ color: 'var(--text-primary)' }}>
                    {a.metrics.synapse_count > 0
                      ? (b.metrics.synapse_count / a.metrics.synapse_count).toFixed(2) + 'x'
                      : '--'}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Firing Rate</span>
                  <span className="stat-value" style={{ color: 'var(--text-primary)' }}>
                    {a.metrics.mean_firing_rate > 0
                      ? (b.metrics.mean_firing_rate / a.metrics.mean_firing_rate).toFixed(2) + 'x'
                      : '--'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* One-sided prompt */}
          {eitherLoaded && !bothLoaded && (
            <div style={{
              fontSize: 10,
              color: 'var(--accent-amber)',
              padding: '4px 8px',
              background: 'rgba(255, 170, 34, 0.06)',
              borderRadius: 6,
              textAlign: 'center',
            }}>
              Only one organism loaded. Click "Run Comparison" to fetch both.
            </div>
          )}

          {/* No data prompt */}
          {!eitherLoaded && !loading && !error && (
            <div style={{
              fontSize: 10,
              color: 'var(--text-label)',
              textAlign: 'center',
              padding: '4px 0',
            }}>
              Run a comparison to see side-by-side neural metrics
            </div>
          )}
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`
        .comparison-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.15);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: cmp-spin 0.6s linear infinite;
        }
        @keyframes cmp-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
