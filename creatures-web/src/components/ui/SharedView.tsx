import { useEffect, useState } from 'react';

/**
 * SharedView -- renders a shareable experiment, evolution run, or discovery
 * based on the URL hash. Works without a running simulation.
 */

type ShareType = 'experiment' | 'evolution' | 'discovery';

interface ShareRoute {
  type: ShareType;
  id: string;
}

function parseShareRoute(hash: string): ShareRoute | null {
  const path = hash.replace(/^#\/?/, '');
  const match = path.match(/^(experiment|evolution|discovery)\/(.+)$/);
  if (!match) return null;
  return { type: match[1] as ShareType, id: match[2] };
}

/** Check if the current hash matches a share route */
export function isShareRoute(hash: string): boolean {
  return parseShareRoute(hash) !== null;
}

async function fetchShareData(route: ShareRoute): Promise<Record<string, unknown>> {
  const urlMap: Record<ShareType, (id: string) => string> = {
    experiment: (id) => `/api/history/share/${id}`,
    evolution: (id) => `/api/history/evolution/${id}/share`,
    discovery: (id) => `/god/share/${id}`,
  };
  const res = await fetch(urlMap[route.type](route.id));
  if (!res.ok) {
    throw new Error(`Failed to load shared ${route.type} (${res.status})`);
  }
  return res.json();
}

// -- Sub-views for each share type --

function ExperimentCard({ data }: { data: Record<string, unknown> }) {
  const results = (data.results ?? {}) as Record<string, unknown>;
  const config = (data.config ?? {}) as Record<string, unknown>;
  const stats = (results.statistics ?? results.stats ?? {}) as Record<string, unknown>;
  const measurements = (results.measurements ?? []) as Array<Record<string, unknown>>;
  const report = (results.report ?? results.summary ?? '') as string;

  return (
    <div className="share-card">
      <div className="share-badge">Experiment</div>
      <h2 className="share-title">{(data.name as string) || 'Untitled Experiment'}</h2>
      <div className="share-meta">
        <span>Organism: <strong>{(data.organism as string) ?? 'unknown'}</strong></span>
        <span>Status: <strong>{(data.status as string) ?? '--'}</strong></span>
      </div>

      {config && Object.keys(config).length > 0 && (
        <div className="share-section">
          <div className="share-section-label">Protocol</div>
          <div className="share-kv-grid">
            {Object.entries(config).slice(0, 6).map(([k, v]) => (
              <div key={k} className="share-kv">
                <span className="share-kv-key">{k}</span>
                <span className="share-kv-val">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {measurements.length > 0 && (
        <div className="share-section">
          <div className="share-section-label">Measurements ({measurements.length})</div>
          <div className="share-measurements">
            {measurements.slice(0, 8).map((m, i) => (
              <div key={i} className="share-measurement">
                <span className="share-kv-key">{(m.name as string) ?? `#${i + 1}`}</span>
                <span className="share-kv-val">{String(m.value ?? m.mean ?? '--')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats && Object.keys(stats).length > 0 && (
        <div className="share-section">
          <div className="share-section-label">Statistics</div>
          <div className="share-kv-grid">
            {Object.entries(stats).slice(0, 8).map(([k, v]) => (
              <div key={k} className="share-kv">
                <span className="share-kv-key">{k}</span>
                <span className="share-kv-val">{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div className="share-section">
          <div className="share-section-label">Report</div>
          <p className="share-report">{typeof report === 'string' ? report.slice(0, 600) : String(report)}</p>
        </div>
      )}
    </div>
  );
}

function EvolutionCard({ data }: { data: Record<string, unknown> }) {
  const worldLog = (data.world_log ?? []) as Array<Record<string, unknown>>;
  const report = (data.final_report ?? '') as string;

  return (
    <div className="share-card">
      <div className="share-badge share-badge-evo">Evolution Run</div>
      <h2 className="share-title">Evolution &mdash; {(data.organism as string) ?? 'unknown'}</h2>
      <div className="share-meta">
        <span>Generations: <strong>{String(data.generations ?? '--')}</strong></span>
        <span>Best fitness: <strong>{typeof data.best_fitness === 'number' ? (data.best_fitness as number).toFixed(4) : '--'}</strong></span>
        <span>Status: <strong>{(data.status as string) ?? '--'}</strong></span>
      </div>

      {worldLog.length > 0 && (
        <div className="share-section">
          <div className="share-section-label">World Log ({worldLog.length} entries)</div>
          <div className="share-world-log">
            {worldLog.slice(-6).map((entry, i) => (
              <div key={i} className="share-log-entry">
                <span className="share-log-gen">Gen {String(entry.generation ?? i)}</span>
                <span className="share-log-detail">
                  fitness={typeof entry.best_fitness === 'number' ? (entry.best_fitness as number).toFixed(3) : String(entry.best_fitness ?? '--')}
                  {entry.event ? ` | ${entry.event}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div className="share-section">
          <div className="share-section-label">Final Report</div>
          <p className="share-report">{report.slice(0, 600)}</p>
        </div>
      )}
    </div>
  );
}

function DiscoveryCard({ data }: { data: Record<string, unknown> }) {
  const evidence = (data.evidence ?? {}) as Record<string, unknown>;

  return (
    <div className="share-card">
      <div className="share-badge share-badge-disc">Discovery</div>
      <h2 className="share-title">{(data.title as string) || 'Untitled Discovery'}</h2>
      <div className="share-meta">
        <span>Category: <strong>{(data.category as string) ?? '--'}</strong></span>
        <span>Significance: <strong>{typeof data.significance === 'number' ? (data.significance as number).toFixed(2) : '--'}</strong></span>
      </div>

      {typeof data.hypothesis_statement === 'string' && data.hypothesis_statement && (
        <div className="share-section">
          <div className="share-section-label">Hypothesis</div>
          <p className="share-report">{data.hypothesis_statement}</p>
        </div>
      )}

      {typeof data.description === 'string' && data.description && (
        <div className="share-section">
          <div className="share-section-label">Description</div>
          <p className="share-report">{data.description}</p>
        </div>
      )}

      {Object.keys(evidence).length > 0 && (
        <div className="share-section">
          <div className="share-section-label">Evidence</div>
          <div className="share-kv-grid">
            {Object.entries(evidence).slice(0, 10).map(([k, v]) => (
              <div key={k} className="share-kv">
                <span className="share-kv-key">{k}</span>
                <span className="share-kv-val">{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const cardComponents: Record<ShareType, React.FC<{ data: Record<string, unknown> }>> = {
  experiment: ExperimentCard,
  evolution: EvolutionCard,
  discovery: DiscoveryCard,
};

export function SharedView({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<ShareRoute | null>(null);

  useEffect(() => {
    const parsed = parseShareRoute(window.location.hash);
    if (!parsed) {
      setError('Invalid share URL');
      setLoading(false);
      return;
    }
    setRoute(parsed);
    fetchShareData(parsed)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div className="share-overlay">
      <div className="share-container">
        <header className="share-header">
          <div className="share-logo">Neurevo</div>
          <button className="btn btn-ghost" onClick={onExit}>
            Back to Simulation
          </button>
        </header>

        {loading && (
          <div className="share-loading">
            <div className="share-spinner" />
            <span>Loading shared result...</span>
          </div>
        )}

        {error && (
          <div className="share-error">
            <div className="share-error-title">Could not load shared result</div>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={onExit}>Go to Simulation</button>
          </div>
        )}

        {data && route && (() => {
          const Card = cardComponents[route.type];
          return (
            <>
              <Card data={data} />
              <div className="share-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href).catch(() => {});
                  }}
                >
                  Copy Share Link
                </button>
                <button className="btn btn-ghost" onClick={onExit}>
                  Run this experiment yourself
                </button>
              </div>
            </>
          );
        })()}
      </div>

      <style>{`
        .share-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: var(--bg-primary, #050510);
          overflow-y: auto;
          display: flex;
          justify-content: center;
        }
        .share-container {
          width: 100%;
          max-width: 680px;
          padding: 24px 20px 60px;
        }
        .share-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 32px;
        }
        .share-logo {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.3px;
          background: linear-gradient(135deg, #e0eaf0, #88ccff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .share-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 28px 24px;
        }
        .share-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 3px 10px;
          border-radius: 4px;
          background: rgba(136, 204, 255, 0.12);
          color: var(--accent-cyan, #88ccff);
          margin-bottom: 12px;
        }
        .share-badge-evo {
          background: rgba(255, 187, 85, 0.12);
          color: var(--accent-amber, #ffbb55);
        }
        .share-badge-disc {
          background: rgba(221, 102, 255, 0.12);
          color: var(--accent-magenta, #dd66ff);
        }
        .share-title {
          font-size: 22px;
          font-weight: 600;
          color: var(--text-primary, #e0eaf0);
          margin: 0 0 12px;
        }
        .share-meta {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 12px;
          color: var(--text-secondary, #8899aa);
          margin-bottom: 20px;
        }
        .share-meta strong {
          color: var(--text-primary, #e0eaf0);
        }
        .share-section {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        .share-section-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-label, #556677);
          margin-bottom: 10px;
        }
        .share-kv-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 16px;
        }
        .share-kv {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }
        .share-kv-key {
          color: var(--text-secondary, #8899aa);
        }
        .share-kv-val {
          color: var(--text-primary, #e0eaf0);
          font-family: var(--font-mono, monospace);
        }
        .share-measurements {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 16px;
        }
        .share-measurement {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }
        .share-report {
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-secondary, #8899aa);
          margin: 0;
        }
        .share-world-log {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .share-log-entry {
          display: flex;
          gap: 10px;
          font-size: 11px;
          font-family: var(--font-mono, monospace);
        }
        .share-log-gen {
          color: var(--accent-amber, #ffbb55);
          min-width: 60px;
        }
        .share-log-detail {
          color: var(--text-secondary, #8899aa);
        }
        .share-actions {
          display: flex;
          gap: 10px;
          margin-top: 24px;
          justify-content: center;
        }
        .share-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 80px 0;
          color: var(--text-secondary, #8899aa);
          font-size: 13px;
        }
        .share-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(136, 204, 255, 0.2);
          border-top-color: var(--accent-cyan, #88ccff);
          border-radius: 50%;
          animation: share-spin 0.8s linear infinite;
        }
        @keyframes share-spin {
          to { transform: rotate(360deg); }
        }
        .share-error {
          text-align: center;
          padding: 60px 0;
          color: var(--text-secondary, #8899aa);
        }
        .share-error-title {
          font-size: 16px;
          color: var(--accent-magenta, #dd66ff);
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}
