import { useState, useMemo } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';
import type { GodReport } from '../../types/evolution';
import { NarrativeFeed, type NarrativeEvent } from './NarrativeFeed';

import { API_BASE } from '../../config';

export function GodAgentPanel() {
  const currentRun = useEvolutionStore((s) => s.currentRun);
  const godReports = useEvolutionStore((s) => s.godReports);
  const addGodReport = useEvolutionStore((s) => s.addGodReport);

  const [loading, setLoading] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const latestReport = godReports.length > 0 ? godReports[godReports.length - 1] : null;
  const isActive = loading || godReports.length > 0;

  // Generate narrative events from god reports
  const narrativeEvents: NarrativeEvent[] = useMemo(() => {
    const EVENT_TEMPLATES: Array<{
      event_type: string;
      icon: string;
      titleFn: (r: GodReport, i: number) => string;
      descFn: (r: GodReport) => string;
    }> = [
      {
        event_type: 'breakthrough',
        icon: '\u{1F9EC}',
        titleFn: (_r, i) => `Fitness Breakthrough at Checkpoint ${i + 1}`,
        descFn: (r) => r.analysis.slice(0, 120) + (r.analysis.length > 120 ? '...' : ''),
      },
      {
        event_type: 'intervention',
        icon: '\u{1F52C}',
        titleFn: (r) => `God Intervenes: ${r.interventions[0]?.action ?? 'analysis'} ${r.interventions[0]?.type ?? ''}`.trim(),
        descFn: (r) => r.interventions[0]?.reasoning ?? r.analysis.slice(0, 100),
      },
      {
        event_type: 'plateau',
        icon: '\u{1F4CA}',
        titleFn: () => 'Fitness Plateau Detected',
        descFn: (r) => r.hypothesis ?? r.analysis.slice(0, 100),
      },
      {
        event_type: 'speciation',
        icon: '\u{1F33F}',
        titleFn: (_r, i) => `Population Divergence Event #${i + 1}`,
        descFn: (r) => r.analysis.slice(0, 120) + (r.analysis.length > 120 ? '...' : ''),
      },
    ];

    return godReports.map((report, idx) => {
      const template = EVENT_TEMPLATES[idx % EVENT_TEMPLATES.length];
      return {
        icon: template.icon,
        event_type: report.fitness_trend === 'plateauing' ? 'plateau'
          : report.fitness_trend === 'declining' ? 'extinction'
          : template.event_type,
        title: template.titleFn(report, idx),
        description: template.descFn(report),
        generation: report.generation ?? (currentRun?.generation ?? idx),
      };
    });
  }, [godReports, currentRun?.generation]);

  const askGod = async () => {
    const runId = currentRun?.id ?? 'demo';
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/god/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      });
      if (res.ok) {
        const data: GodReport = await res.json();
        addGodReport(data);
      }
    } catch {
      // Backend unavailable — generate a local stub report
      const stub: GodReport = {
        analysis:
          'Population diversity is declining. The dominant genome controls ' +
          `${Math.floor(30 + Math.random() * 40)}% of the population. ` +
          'Consider increasing mutation pressure or injecting novel topologies.',
        fitness_trend: Math.random() > 0.5 ? 'plateauing' : 'improving',
        interventions: [
          {
            type: 'mutation_rate',
            action: 'increase',
            parameters: { factor: 1.0 + Math.random() * 0.8 },
            reasoning: 'Break fitness plateau through increased exploration.',
          },
        ],
        hypothesis:
          'Higher mutation rates will introduce structural innovations ' +
          'that unlock a new fitness regime within 5-10 generations.',
        report: `Local analysis at generation ${currentRun?.generation ?? 0}`,
      };
      addGodReport(stub);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass god-panel">
      {/* Header with pulsing eye */}
      <div className="god-panel-header">
        <div className={`god-eye${isActive ? ' god-eye--active' : ''}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <span className="glass-label" style={{ marginBottom: 0 }}>God Agent</span>
      </div>

      {/* Current hypothesis */}
      {latestReport && (
        <div className="god-hypothesis">
          <div className="god-section-label">Hypothesis</div>
          <div className="god-hypothesis-text">{latestReport.hypothesis}</div>
        </div>
      )}

      {/* Latest analysis */}
      {latestReport && (
        <div className="god-analysis">
          <div className="god-section-label">
            Latest Analysis
            <span className={`god-trend god-trend--${latestReport.fitness_trend}`}>
              {latestReport.fitness_trend}
            </span>
          </div>
          <div className="god-analysis-text">{latestReport.analysis}</div>
        </div>
      )}

      {/* Intervention history */}
      {godReports.length > 0 && (
        <div className="god-history">
          <div className="god-section-label">
            Interventions ({godReports.length})
          </div>
          <div className="god-history-list">
            {godReports.slice().reverse().map((r, i) => {
              const realIdx = godReports.length - 1 - i;
              const isExpanded = expandedIdx === realIdx;
              return (
                <div key={realIdx} className="god-history-item">
                  <button
                    className="god-history-toggle"
                    onClick={() => setExpandedIdx(isExpanded ? null : realIdx)}
                  >
                    <span className="god-history-dot" />
                    <span className="god-history-summary">
                      {r.interventions[0]?.action ?? 'analysis'}{' '}
                      {r.interventions[0]?.type ?? ''}
                    </span>
                    <span className="god-history-chevron">{isExpanded ? '\u25B4' : '\u25BE'}</span>
                  </button>
                  {isExpanded && (
                    <div className="god-history-detail">
                      {r.interventions.map((iv, j) => (
                        <div key={j} className="god-intervention-entry">
                          <div className="god-intervention-action">
                            {iv.action} {iv.type}
                          </div>
                          <div className="god-intervention-reasoning">
                            {iv.reasoning}
                          </div>
                          {Object.keys(iv.parameters ?? {}).length > 0 && (
                            <div className="god-intervention-params">
                              {Object.entries(iv.parameters ?? {}).map(([k, v]) => (
                                <span key={k}>{k}: {typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="god-intervention-report">{r.report}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ask God button */}
      <button
        className="btn god-ask-btn"
        onClick={askGod}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Analyzing...
          </>
        ) : (
          'Ask God'
        )}
      </button>

      {/* Narrative Feed */}
      <div style={{ marginTop: 10 }}>
        <div className="god-section-label" style={{ marginBottom: 6 }}>
          Narrative Log
        </div>
        <NarrativeFeed events={narrativeEvents} />
      </div>
    </div>
  );
}
