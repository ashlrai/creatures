import React, { useState, useCallback } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { getDailyBattle, BATTLES } from '../../data/engagement';
import type { HistoricalBattle } from '../../data/knowledge-graph';

// ============================================================================
// BattleView — "This or That" daily matchups
// Two entity cards side by side, vote for one, see simulated results
// ============================================================================

const STYLE_ID = 'battle-view-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes battle-slide-in {
      0% { opacity: 0; transform: translateY(16px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes battle-pulse-a {
      0%, 100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
      50% { box-shadow: 0 0 30px 4px rgba(0,229,255,0.12); }
    }
    @keyframes battle-pulse-b {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,107,0); }
      50% { box-shadow: 0 0 30px 4px rgba(255,107,107,0.12); }
    }
    @keyframes battle-bar-fill {
      0% { width: 0%; }
    }
    @keyframes battle-xp-pop {
      0% { opacity: 1; transform: scale(0.8); }
      50% { transform: scale(1.2); }
      100% { opacity: 0; transform: scale(1) translateY(-20px); }
    }
    @keyframes battle-vs-pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.15); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  person: { label: 'PERSON', color: '#7c4dff' },
  event: { label: 'EVENT', color: '#00e5ff' },
  artifact: { label: 'ARTIFACT', color: '#f39c12' },
  concept: { label: 'CONCEPT', color: '#2ecc71' },
  era: { label: 'ERA', color: '#e74c3c' },
};

function formatEntityName(id: string): string {
  // Convert entity IDs into readable names
  // Strip common prefixes
  let name = id
    .replace(/^per-(aw-|20c-)?/, '')
    .replace(/^evt-(aw-|20c-)?/, '')
    .replace(/^art-/, '')
    .replace(/-/g, ' ');
  // Title case
  return name.replace(/\b\w/g, c => c.toUpperCase());
}

function generateResults(): { a: number; b: number } {
  // Generate simulated vote percentages in the 40-60% range
  const a = Math.floor(Math.random() * 21) + 40; // 40-60
  return { a, b: 100 - a };
}

export function BattleView() {
  ensureKeyframes();

  const { addXp, navigate } = useMuseumStore();

  const [currentBattle, setCurrentBattle] = useState<HistoricalBattle>(() => getDailyBattle());
  const [voted, setVoted] = useState<'a' | 'b' | null>(null);
  const [results, setResults] = useState<{ a: number; b: number } | null>(null);
  const [xpShown, setXpShown] = useState(false);
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set());

  const nameA = formatEntityName(currentBattle.entityA);
  const nameB = formatEntityName(currentBattle.entityB);
  const typeA = TYPE_LABELS[currentBattle.entityAType] ?? { label: 'ENTITY', color: '#888' };
  const typeB = TYPE_LABELS[currentBattle.entityBType] ?? { label: 'ENTITY', color: '#888' };

  const handleVote = useCallback((side: 'a' | 'b') => {
    if (voted) return;
    setVoted(side);
    setResults(generateResults());
    addXp(10);
    setXpShown(true);
    setTimeout(() => setXpShown(false), 1200);
  }, [voted, addXp]);

  const handleNext = useCallback(() => {
    const available = BATTLES.filter(b => b.id !== currentBattle.id && !usedIds.has(b.id));
    const pool = available.length > 0 ? available : BATTLES.filter(b => b.id !== currentBattle.id);
    const next = pool[Math.floor(Math.random() * pool.length)];

    setUsedIds(prev => {
      const n = new Set(prev);
      n.add(currentBattle.id);
      return n;
    });
    setCurrentBattle(next);
    setVoted(null);
    setResults(null);
  }, [currentBattle, usedIds]);

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.backBtn} onClick={() => navigate('timeline')}>
            ← Back
          </button>
          <div style={s.titleBlock}>
            <h1 style={s.title}>Daily Battle</h1>
            <p style={s.subtitle}>History's greatest matchups — you decide</p>
          </div>
        </div>
        <div style={s.categoryBadge}>{currentBattle.category}</div>
      </div>

      {/* Prompt */}
      <div style={s.promptCard}>
        <p style={s.prompt}>{currentBattle.prompt}</p>
      </div>

      {/* Battle Arena */}
      <div style={s.arena}>
        {/* Entity A */}
        <button
          style={{
            ...s.entityCard,
            ...(voted === 'a' ? s.entityCardSelectedA : {}),
            ...(voted === 'b' ? s.entityCardDimmed : {}),
            borderColor: voted === 'a' ? '#00e5ff' : 'rgba(255,255,255,0.08)',
            cursor: voted ? 'default' : 'pointer',
          }}
          onClick={() => handleVote('a')}
          disabled={!!voted}
          onMouseEnter={(e) => {
            if (!voted) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.4)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.04)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!voted) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }
          }}
        >
          <div style={{ ...s.typeBadge, background: `${typeA.color}18`, color: typeA.color, borderColor: `${typeA.color}40` }}>
            {typeA.label}
          </div>
          <h3 style={s.entityName}>{nameA}</h3>
          {voted === 'a' && (
            <div style={s.votedLabel}>YOUR VOTE</div>
          )}
        </button>

        {/* VS divider */}
        <div style={s.vsSection}>
          <div style={s.vsLine} />
          <div style={s.vsBadge}>VS</div>
          <div style={s.vsLine} />
        </div>

        {/* Entity B */}
        <button
          style={{
            ...s.entityCard,
            ...(voted === 'b' ? s.entityCardSelectedB : {}),
            ...(voted === 'a' ? s.entityCardDimmed : {}),
            borderColor: voted === 'b' ? '#ff6b6b' : 'rgba(255,255,255,0.08)',
            cursor: voted ? 'default' : 'pointer',
          }}
          onClick={() => handleVote('b')}
          disabled={!!voted}
          onMouseEnter={(e) => {
            if (!voted) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,107,107,0.4)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,107,107,0.04)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!voted) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }
          }}
        >
          <div style={{ ...s.typeBadge, background: `${typeB.color}18`, color: typeB.color, borderColor: `${typeB.color}40` }}>
            {typeB.label}
          </div>
          <h3 style={s.entityName}>{nameB}</h3>
          {voted === 'b' && (
            <div style={{ ...s.votedLabel, color: '#ff6b6b' }}>YOUR VOTE</div>
          )}
        </button>
      </div>

      {/* Results Panel — shown after voting */}
      {voted && results && (
        <div style={s.resultsPanel}>
          {/* XP notification */}
          {xpShown && (
            <div style={s.xpPop}>+10 XP</div>
          )}

          <div style={s.resultsHeader}>
            <span style={s.resultsTitle}>Community Results</span>
            <span style={s.voteConfirm}>Your vote has been recorded</span>
          </div>

          {/* Results bar */}
          <div style={s.resultsBarContainer}>
            <div style={s.resultsBarBg}>
              <div
                style={{
                  ...s.resultsBarA,
                  width: `${results.a}%`,
                  animation: 'battle-bar-fill 0.8s ease forwards',
                }}
              />
            </div>
            <div style={s.resultsLabels}>
              <span style={{ color: '#00e5ff', fontWeight: 700, fontSize: 14 }}>
                {nameA} — {results.a}%
              </span>
              <span style={{ color: '#ff6b6b', fontWeight: 700, fontSize: 14 }}>
                {results.b}% — {nameB}
              </span>
            </div>
          </div>

          {/* Next button */}
          <button style={s.nextBtn} onClick={handleNext}>
            Next Battle →
          </button>
        </div>
      )}
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
    background: 'radial-gradient(ellipse at 50% 0%, rgba(255,107,107,0.04) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(0,229,255,0.04) 0%, transparent 50%)',
  },
  header: {
    width: '100%',
    maxWidth: 800,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
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
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    background: 'linear-gradient(135deg, #ff6b6b, #00e5ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    margin: 0,
  },
  categoryBadge: {
    padding: '5px 14px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  promptCard: {
    width: '100%',
    maxWidth: 800,
    textAlign: 'center' as const,
    marginBottom: 32,
  },
  prompt: {
    fontSize: 20,
    fontWeight: 600,
    color: '#e8e6e3',
    lineHeight: 1.5,
    margin: 0,
    letterSpacing: '-0.01em',
  },
  arena: {
    width: '100%',
    maxWidth: 800,
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
  },
  entityCard: {
    flex: 1,
    padding: '36px 28px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 16,
    fontFamily: 'inherit',
    transition: 'all 0.3s ease',
    position: 'relative' as const,
  },
  entityCardSelectedA: {
    background: 'rgba(0,229,255,0.04)',
    animation: 'battle-pulse-a 2s ease infinite',
  },
  entityCardSelectedB: {
    background: 'rgba(255,107,107,0.04)',
    animation: 'battle-pulse-b 2s ease infinite',
  },
  entityCardDimmed: {
    opacity: 0.4,
  },
  typeBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  entityName: {
    fontSize: 20,
    fontWeight: 700,
    color: '#e8e6e3',
    textAlign: 'center' as const,
    margin: 0,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
  },
  votedLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#00e5ff',
    marginTop: 4,
  },
  vsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 16px',
    flexShrink: 0,
  },
  vsLine: {
    width: 1,
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
  },
  vsBadge: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.05em',
    margin: '12px 0',
    animation: 'battle-vs-pulse 3s ease infinite',
  },
  resultsPanel: {
    width: '100%',
    maxWidth: 800,
    marginTop: 32,
    padding: '28px 32px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    animation: 'battle-slide-in 0.4s ease',
    position: 'relative' as const,
  },
  xpPop: {
    position: 'absolute' as const,
    top: -16,
    right: 24,
    color: '#ffd700',
    fontWeight: 700,
    fontSize: 14,
    animation: 'battle-xp-pop 1.2s ease forwards',
  },
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
  },
  voteConfirm: {
    fontSize: 12,
    color: 'rgba(46,204,113,0.8)',
    fontWeight: 500,
  },
  resultsBarContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  resultsBarBg: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    background: 'rgba(255,107,107,0.15)',
    overflow: 'hidden',
  },
  resultsBarA: {
    height: '100%',
    borderRadius: 6,
    background: 'linear-gradient(90deg, #00e5ff, rgba(0,229,255,0.6))',
    transition: 'width 0.8s ease',
  },
  resultsLabels: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  nextBtn: {
    display: 'block',
    width: '100%',
    marginTop: 24,
    padding: '14px 24px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, rgba(255,107,107,0.2), rgba(0,229,255,0.15))',
    color: '#e8e6e3',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    letterSpacing: '-0.01em',
  },
};
