import React, { useState, useCallback } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { PATHS } from '../../data/engagement';
import type { ExplorationPath } from '../../data/knowledge-graph';

// ============================================================================
// PathsView — Exploration paths browser
// Grid of path cards with drill-down into ordered entity lists
// Progress tracking and XP rewards for completing full paths
// ============================================================================

const STYLE_ID = 'paths-view-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes paths-fade-in {
      0% { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes paths-complete-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(46,204,113,0); }
      50% { box-shadow: 0 0 24px 4px rgba(46,204,113,0.15); }
    }
    @keyframes paths-progress-fill {
      0% { width: 0%; }
    }
    @keyframes paths-xp-pop {
      0% { opacity: 1; transform: scale(0.8); }
      50% { transform: scale(1.3); }
      100% { opacity: 0; transform: scale(1) translateY(-30px); }
    }
  `;
  document.head.appendChild(style);
}

const DIFF_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  beginner: { bg: 'rgba(46,204,113,0.08)', fg: '#2ecc71', border: 'rgba(46,204,113,0.25)' },
  intermediate: { bg: 'rgba(243,156,18,0.08)', fg: '#f39c12', border: 'rgba(243,156,18,0.25)' },
  advanced: { bg: 'rgba(231,76,60,0.08)', fg: '#e74c3c', border: 'rgba(231,76,60,0.25)' },
};

function formatEntityName(id: string): string {
  let name = id
    .replace(/^per-(aw-|20c-)?/, '')
    .replace(/^evt-(aw-|20c-)?/, '')
    .replace(/^art-/, '')
    .replace(/-/g, ' ');
  return name.replace(/\b\w/g, c => c.toUpperCase());
}

const TYPE_ICONS: Record<string, string> = {
  event: '\u{1F4C5}',
  person: '\u{1F464}',
  artifact: '\u{1F3A8}',
};

export function PathsView() {
  ensureKeyframes();

  const { navigate, visitedEntityIds, addXp } = useMuseumStore();
  const [activePath, setActivePath] = useState<ExplorationPath | null>(null);
  const [completedPaths, setCompletedPaths] = useState<Set<string>>(() => new Set());
  const [xpPop, setXpPop] = useState<string | null>(null);

  const getProgress = useCallback((path: ExplorationPath) => {
    const visited = path.entityIds.filter(id => visitedEntityIds.has(id)).length;
    return { visited, total: path.entityIds.length, percent: path.entityIds.length > 0 ? (visited / path.entityIds.length) * 100 : 0 };
  }, [visitedEntityIds]);

  const handleCompletePath = useCallback((pathId: string) => {
    if (completedPaths.has(pathId)) return;
    setCompletedPaths(prev => {
      const n = new Set(prev);
      n.add(pathId);
      return n;
    });
    addXp(100);
    setXpPop(pathId);
    setTimeout(() => setXpPop(null), 1200);
  }, [completedPaths, addXp]);

  // Check for path completion when viewing a path
  const checkCompletion = useCallback((path: ExplorationPath) => {
    const progress = getProgress(path);
    if (progress.visited === progress.total && !completedPaths.has(path.id)) {
      handleCompletePath(path.id);
    }
  }, [getProgress, completedPaths, handleCompletePath]);

  // ── Detail View (single path) ──────────────────────────────────────────
  if (activePath) {
    const progress = getProgress(activePath);
    const isComplete = progress.visited === progress.total;
    const diff = DIFF_COLORS[activePath.difficulty] ?? DIFF_COLORS.beginner;

    return (
      <div style={s.container}>
        <div style={s.detailWrapper}>
          {/* Header */}
          <div style={s.detailHeader}>
            <button style={s.backBtn} onClick={() => setActivePath(null)}>
              ← All Paths
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 24 }}>{activePath.icon}</span>
                <h1 style={s.detailTitle}>{activePath.title}</h1>
              </div>
              <p style={s.detailSubtitle}>{activePath.subtitle}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 8 }}>
              <div style={{ ...s.diffBadge, background: diff.bg, color: diff.fg, borderColor: diff.border }}>
                {activePath.difficulty.toUpperCase()}
              </div>
              <span style={s.timeEst}>{activePath.estimatedMinutes} min</span>
            </div>
          </div>

          <p style={s.detailDesc}>{activePath.description}</p>

          {/* Progress bar */}
          <div style={s.progressSection}>
            <div style={s.progressHeader}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {progress.visited} of {progress.total} stops visited
              </span>
              {isComplete && !completedPaths.has(activePath.id) && (
                <span style={{ fontSize: 12, color: '#2ecc71', fontWeight: 600 }}>
                  Path complete!
                </span>
              )}
              {completedPaths.has(activePath.id) && (
                <span style={{ fontSize: 12, color: '#2ecc71', fontWeight: 600 }}>
                  Completed +100 XP
                </span>
              )}
            </div>
            <div style={s.progressBarBg}>
              <div
                style={{
                  ...s.progressBarFill,
                  width: `${progress.percent}%`,
                  background: isComplete
                    ? 'linear-gradient(90deg, #2ecc71, #27ae60)'
                    : `linear-gradient(90deg, ${activePath.color}, ${activePath.color}88)`,
                  animation: 'paths-progress-fill 0.6s ease forwards',
                }}
              />
            </div>
          </div>

          {/* Entity list — ordered stops */}
          <div style={s.stopsList}>
            {activePath.entityIds.map((entityId, i) => {
              const entityType = activePath.entityTypes[i];
              const isVisited = visitedEntityIds.has(entityId);
              const icon = TYPE_ICONS[entityType] ?? '\u{1F4CC}';

              return (
                <button
                  key={entityId}
                  style={{
                    ...s.stopItem,
                    borderLeftColor: isVisited ? activePath.color : 'rgba(255,255,255,0.06)',
                    animation: `paths-fade-in 0.3s ease ${i * 0.05}s both`,
                  }}
                  onClick={() => {
                    const viewMap: Record<string, string> = {
                      event: 'event',
                      person: 'person',
                      artifact: 'artifact',
                    };
                    const view = viewMap[entityType];
                    if (view) navigate(view as any, entityId);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    (e.currentTarget as HTMLElement).style.borderLeftColor = activePath.color;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.01)';
                    (e.currentTarget as HTMLElement).style.borderLeftColor = isVisited ? activePath.color : 'rgba(255,255,255,0.06)';
                  }}
                >
                  {/* Stop number */}
                  <div style={{
                    ...s.stopNumber,
                    background: isVisited ? `${activePath.color}22` : 'rgba(255,255,255,0.04)',
                    color: isVisited ? activePath.color : 'rgba(255,255,255,0.3)',
                    borderColor: isVisited ? `${activePath.color}40` : 'rgba(255,255,255,0.08)',
                  }}>
                    {isVisited ? '\u2713' : i + 1}
                  </div>

                  <div style={s.stopInfo}>
                    <span style={s.stopName}>{formatEntityName(entityId)}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      {icon} {entityType}
                    </span>
                  </div>

                  <span style={s.stopArrow}>→</span>
                </button>
              );
            })}
          </div>

          {/* XP pop */}
          {xpPop === activePath.id && (
            <div style={s.xpPop}>+100 XP — Path Completed!</div>
          )}
        </div>
      </div>
    );
  }

  // ── Grid View (all paths) ──────────────────────────────────────────────
  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.gridHeader}>
        <div style={s.headerLeft}>
          <button style={s.backBtn} onClick={() => navigate('timeline')}>
            ← Back
          </button>
          <div>
            <h1 style={s.gridTitle}>Exploration Paths</h1>
            <p style={s.gridSubtitle}>Curated journeys through history — follow the thread</p>
          </div>
        </div>
        <div style={s.pathCount}>
          {PATHS.length} paths
        </div>
      </div>

      {/* Path Grid */}
      <div style={s.grid}>
        {PATHS.map((path, i) => {
          const progress = getProgress(path);
          const diff = DIFF_COLORS[path.difficulty] ?? DIFF_COLORS.beginner;
          const isComplete = completedPaths.has(path.id);

          return (
            <button
              key={path.id}
              style={{
                ...s.pathCard,
                animation: `paths-fade-in 0.3s ease ${i * 0.04}s both`,
                ...(isComplete ? { animation: `paths-fade-in 0.3s ease ${i * 0.04}s both, paths-complete-pulse 3s ease infinite` } : {}),
              }}
              onClick={() => {
                setActivePath(path);
                checkCompletion(path);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${path.color}50`;
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
              }}
            >
              {/* Icon & Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{path.icon}</span>
                <h3 style={{ ...s.pathTitle, color: path.color }}>{path.title}</h3>
              </div>

              <p style={s.pathSubtitle}>{path.subtitle}</p>

              <p style={s.pathDesc}>
                {path.description.length > 140 ? path.description.slice(0, 140) + '...' : path.description}
              </p>

              {/* Meta row */}
              <div style={s.metaRow}>
                <div style={{ ...s.diffBadgeSmall, background: diff.bg, color: diff.fg, borderColor: diff.border }}>
                  {path.difficulty}
                </div>
                <span style={s.metaText}>{path.estimatedMinutes} min</span>
                <span style={s.metaText}>{path.entityIds.length} stops</span>
              </div>

              {/* Progress */}
              {progress.visited > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.miniProgressBg}>
                    <div style={{
                      ...s.miniProgressFill,
                      width: `${progress.percent}%`,
                      background: isComplete ? '#2ecc71' : path.color,
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, display: 'block' }}>
                    {isComplete ? 'Completed' : `${progress.visited}/${progress.total} visited`}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100%',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // ── Grid header ──
  gridHeader: {
    width: '100%',
    maxWidth: 1000,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
  },
  backBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: 4,
  },
  gridTitle: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    background: 'linear-gradient(135deg, #f39c12, #e74c3c)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  gridSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    margin: '4px 0 0 0',
  },
  pathCount: {
    padding: '5px 12px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: 600,
  },

  // ── Path grid ──
  grid: {
    width: '100%',
    maxWidth: 1000,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
    gap: 16,
  },
  pathCard: {
    padding: '24px 22px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.25s ease',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  pathTitle: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  pathSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    margin: '0 0 8px 0',
    fontStyle: 'italic' as const,
    lineHeight: 1.4,
  },
  pathDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    margin: '0 0 14px 0',
    lineHeight: 1.55,
    flex: 1,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  metaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  diffBadgeSmall: {
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'capitalize' as const,
  },
  miniProgressBg: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.5s ease',
  },

  // ── Detail view ──
  detailWrapper: {
    width: '100%',
    maxWidth: 720,
    position: 'relative' as const,
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#e8e6e3',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  detailSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    margin: 0,
    fontStyle: 'italic' as const,
  },
  detailDesc: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(255,255,255,0.5)',
    margin: '0 0 24px 0',
  },
  diffBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  timeEst: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },

  // ── Progress ──
  progressSection: {
    marginBottom: 24,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Stops list ──
  stopsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  stopItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    borderRadius: 10,
    borderLeft: '3px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.01)',
    border: 'none',
    borderLeftWidth: 3,
    borderLeftStyle: 'solid' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    textAlign: 'left' as const,
    width: '100%',
  },
  stopNumber: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid',
    flexShrink: 0,
  },
  stopInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  stopName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e8e6e3',
  },
  stopArrow: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  xpPop: {
    position: 'fixed' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '16px 32px',
    borderRadius: 12,
    background: 'rgba(46,204,113,0.15)',
    border: '1px solid rgba(46,204,113,0.3)',
    color: '#2ecc71',
    fontSize: 18,
    fontWeight: 700,
    animation: 'paths-xp-pop 1.2s ease forwards',
    zIndex: 100,
  },
};
