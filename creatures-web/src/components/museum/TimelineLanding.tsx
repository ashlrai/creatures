// ============================================================================
// TimelineLanding — the museum entrance showing all exhibition halls
// Redesigned: atmospheric, editorial, museum-exhibition aesthetic
// ============================================================================

import React, { useState } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { ALL_ERAS, getEntityCountForEra, getVisitedCountForEra } from '../../data/halls/index';
import type { Era } from '../../data/knowledge-graph';

// ── Era visual accents ─────────────────────────────────────────────────────

const ERA_VISUALS: Record<string, { icon: string; gradient: string }> = {
  'ancient-egypt':       { icon: '\u{1F3DB}\uFE0F', gradient: 'linear-gradient(135deg, #b45309 0%, #78350f 60%, #1c1917 100%)' },
  'classical-greece':    { icon: '\u{1F3DB}\uFE0F', gradient: 'linear-gradient(135deg, #1d4ed8 0%, #312e81 60%, #0f0d1a 100%)' },
  'roman-empire':        { icon: '\u{1FA96}',        gradient: 'linear-gradient(135deg, #991b1b 0%, #581c87 60%, #0f0d1a 100%)' },
  'medieval':            { icon: '\u{1F3F0}',        gradient: 'linear-gradient(135deg, #4c1d95 0%, #1e1b4b 60%, #0f0d1a 100%)' },
  'renaissance':         { icon: '\u{1F3A8}',        gradient: 'linear-gradient(135deg, #b45309 0%, #7c2d12 60%, #0f0d1a 100%)' },
  'age-of-exploration':  { icon: '\u{1F6A2}',        gradient: 'linear-gradient(135deg, #0e7490 0%, #164e63 60%, #0f0d1a 100%)' },
  'enlightenment':       { icon: '\u{1F56F}\uFE0F',  gradient: 'linear-gradient(135deg, #a16207 0%, #713f12 60%, #0f0d1a 100%)' },
  'industrial':          { icon: '\u2699\uFE0F',      gradient: 'linear-gradient(135deg, #475569 0%, #1e293b 60%, #0f0d1a 100%)' },
  'modern':              { icon: '\u{1F30D}',        gradient: 'linear-gradient(135deg, #065f46 0%, #064e3b 60%, #0f0d1a 100%)' },
  'space-age':           { icon: '\u{1F680}',        gradient: 'linear-gradient(135deg, #1e3a5f 0%, #0c1929 60%, #0f0d1a 100%)' },
  // Science wing
  'atoms-elements':      { icon: '\u269B\uFE0F',      gradient: 'linear-gradient(135deg, #7c3aed 0%, #3b0764 60%, #0f0d1a 100%)' },
  'code-of-life':        { icon: '\u{1F9EC}',        gradient: 'linear-gradient(135deg, #059669 0%, #064e3b 60%, #0f0d1a 100%)' },
  'forces-motion':       { icon: '\u{1F30A}',        gradient: 'linear-gradient(135deg, #0284c7 0%, #0c4a6e 60%, #0f0d1a 100%)' },
  'cosmos':              { icon: '\u2728',            gradient: 'linear-gradient(135deg, #6d28d9 0%, #1e1b4b 60%, #0f0d1a 100%)' },
  'earth-systems':       { icon: '\u{1F30B}',        gradient: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 60%, #0f0d1a 100%)' },
};

function getVisual(eraId: string) {
  return ERA_VISUALS[eraId] || { icon: '\u{1F3DB}\uFE0F', gradient: 'linear-gradient(135deg, #374151 0%, #111827 100%)' };
}

// ── Hall Card ───────────────────────────────────────────────────────────────

function HallCard({ era, index }: { era: Era; index: number }) {
  const { navigate, visitedEntityIds } = useMuseumStore();
  const [hovered, setHovered] = useState(false);
  const totalEntities = getEntityCountForEra(era.id);
  const visitedCount = getVisitedCountForEra(era.id, visitedEntityIds);
  const progressPct = totalEntities > 0 ? (visitedCount / totalEntities) * 100 : 0;
  const visual = getVisual(era.id);

  const formatYears = (years: [number, number]) => {
    const fmt = (y: number) => (y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`);
    return `${fmt(years[0])}  \u2014  ${fmt(years[1])}`;
  };

  return (
    <div
      onClick={() => navigate('era', era.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative' as const,
        borderRadius: 20,
        border: `1px solid ${hovered ? `${era.color}40` : 'rgba(255,255,255,0.05)'}`,
        background: visual.gradient,
        padding: 0,
        cursor: 'pointer',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        transform: hovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        boxShadow: hovered
          ? `0 20px 60px ${era.color}20, 0 0 0 1px ${era.color}15, inset 0 1px 0 rgba(255,255,255,0.05)`
          : '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)',
        animationDelay: `${index * 60}ms`,
      }}
    >
      {/* Animated border glow on hover */}
      <div style={{
        position: 'absolute' as const,
        inset: -1,
        borderRadius: 21,
        background: `linear-gradient(135deg, ${era.color}30, transparent 40%, transparent 60%, ${era.color}20)`,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none' as const,
        zIndex: 0,
      }} />

      {/* Content area */}
      <div style={{
        position: 'relative' as const,
        zIndex: 1,
        padding: '32px 30px 28px',
      }}>
        {/* Top row: large icon + era name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
          <div style={{
            fontSize: 38,
            lineHeight: 1,
            filter: hovered ? 'none' : 'saturate(0.7)',
            transition: 'filter 0.3s',
            flexShrink: 0,
          }}>
            {visual.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontSize: 23,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              margin: 0,
              color: '#f1f0ee',
              fontFamily: "Georgia, 'Times New Roman', 'Noto Serif', serif",
            }}>
              {era.name}
            </h3>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: era.color,
              letterSpacing: '0.03em',
              marginTop: 4,
              fontFamily: "'Inter', sans-serif",
              opacity: 0.9,
            }}>
              {formatYears(era.years)}
            </div>
          </div>
        </div>

        {/* Theme tags */}
        <div style={{
          display: 'flex', flexWrap: 'wrap' as const, gap: 5,
          marginBottom: 14,
        }}>
          {era.themes.slice(0, 3).map((theme, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                padding: '3px 9px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 500,
                background: `${era.color}15`,
                color: `${era.color}cc`,
                border: `1px solid ${era.color}20`,
                letterSpacing: '0.02em',
              }}
            >
              {theme}
            </span>
          ))}
        </div>

        {/* Description */}
        <p style={{
          fontSize: 13.5,
          lineHeight: 1.65,
          color: 'rgba(255,255,255,0.5)',
          margin: '0 0 22px 0',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {era.description}
        </p>

        {/* Footer: progress + enter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 90, height: 4, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: `linear-gradient(90deg, ${era.color}, ${era.color}88)`,
                width: `${progressPct}%`,
                transition: 'width 0.6s ease',
                boxShadow: progressPct > 0 ? `0 0 8px ${era.color}40` : 'none',
              }} />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: 'rgba(255,255,255,0.3)',
            }}>
              {visitedCount}/{totalEntities} explored
            </span>
          </div>
          <button
            style={{
              padding: '7px 18px',
              borderRadius: 9,
              border: `1px solid ${hovered ? `${era.color}50` : 'rgba(255,255,255,0.08)'}`,
              background: hovered ? `${era.color}18` : 'rgba(255,255,255,0.03)',
              color: hovered ? era.color : 'rgba(255,255,255,0.6)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.25s',
              fontFamily: 'inherit',
              letterSpacing: '0.01em',
            }}
            onClick={(e) => {
              e.stopPropagation();
              navigate('era', era.id);
            }}
          >
            Enter Hall {'\u2192'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Wing Divider ────────────────────────────────────────────────────────────

function WingDivider({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      margin: '56px 0 32px',
      padding: '0 4px',
    }}>
      <div style={{
        flex: 1, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}25, transparent)`,
      }} />
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase' as const,
        color: `${color}80`,
        fontFamily: "'Inter', sans-serif",
        whiteSpace: 'nowrap' as const,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}25, transparent)`,
      }} />
    </div>
  );
}

// ── Timeline Landing ────────────────────────────────────────────────────────

export function TimelineLanding() {
  const historyHalls = ALL_ERAS.filter(e => e.wing === 'history');
  const scienceHalls = ALL_ERAS.filter(e => e.wing === 'science');

  return (
    <div style={{
      minHeight: '100%',
      background: '#08080d',
      position: 'relative' as const,
      overflow: 'hidden',
    }}>
      {/* ── Atmospheric background ────────────────────────────────────── */}
      <div style={{
        position: 'absolute' as const,
        inset: 0,
        background: `
          radial-gradient(ellipse 80% 50% at 50% 0%, rgba(88,28,135,0.15) 0%, transparent 70%),
          radial-gradient(ellipse 60% 40% at 80% 20%, rgba(30,58,138,0.1) 0%, transparent 60%),
          radial-gradient(ellipse 50% 30% at 20% 30%, rgba(124,58,237,0.06) 0%, transparent 50%)
        `,
        pointerEvents: 'none' as const,
        zIndex: 0,
      }} />

      {/* Subtle star-field dots */}
      <div style={{
        position: 'absolute' as const,
        inset: 0,
        backgroundImage: `
          radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.15) 0%, transparent 100%),
          radial-gradient(1px 1px at 25% 8%, rgba(255,255,255,0.1) 0%, transparent 100%),
          radial-gradient(1px 1px at 40% 22%, rgba(255,255,255,0.08) 0%, transparent 100%),
          radial-gradient(1px 1px at 55% 5%, rgba(255,255,255,0.12) 0%, transparent 100%),
          radial-gradient(1px 1px at 70% 18%, rgba(255,255,255,0.07) 0%, transparent 100%),
          radial-gradient(1px 1px at 85% 12%, rgba(255,255,255,0.1) 0%, transparent 100%),
          radial-gradient(1px 1px at 92% 25%, rgba(255,255,255,0.06) 0%, transparent 100%),
          radial-gradient(1.5px 1.5px at 15% 28%, rgba(167,139,250,0.12) 0%, transparent 100%),
          radial-gradient(1.5px 1.5px at 65% 10%, rgba(96,165,250,0.1) 0%, transparent 100%)
        `,
        pointerEvents: 'none' as const,
        zIndex: 0,
      }} />

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative' as const,
        zIndex: 1,
        padding: '0 40px 100px',
        maxWidth: 1240,
        margin: '0 auto',
      }}>
        {/* ── Hero Section ──────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center' as const,
          paddingTop: 80,
          paddingBottom: 20,
        }}>
          {/* Decorative line */}
          <div style={{
            width: 48, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(167,139,250,0.4), transparent)',
            margin: '0 auto 32px',
          }} />

          <h1 style={{
            fontSize: 56,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            margin: '0 0 20px 0',
            fontFamily: "Georgia, 'Times New Roman', 'Noto Serif', serif",
            color: '#f5f3f0',
            textShadow: '0 0 80px rgba(167,139,250,0.2), 0 2px 4px rgba(0,0,0,0.3)',
          }}>
            Night at the Museum
          </h1>

          <p style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: 'rgba(255,255,255,0.35)',
            maxWidth: 560,
            margin: '0 auto 16px',
            fontFamily: "Georgia, 'Times New Roman', 'Noto Serif', serif",
            fontStyle: 'italic' as const,
          }}>
            Ten thousand years of human wonder, arranged in halls of light and shadow.
            Walk through civilizations, unravel the laws of nature, and discover the
            threads that bind every era to the next.
          </p>

          {/* Decorative flourish */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, marginTop: 36, marginBottom: 8,
          }}>
            <div style={{
              width: 60, height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1))',
            }} />
            <span style={{
              fontSize: 14, color: 'rgba(255,255,255,0.12)',
              letterSpacing: '0.2em',
            }}>
              {'\u2726'}
            </span>
            <div style={{
              width: 60, height: 1,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)',
            }} />
          </div>
        </div>

        {/* ── History Wing ─────────────────────────────────────────────── */}
        <WingDivider label="History Wing" color="#a78bfa" />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 24,
        }}>
          {historyHalls.map((era, i) => (
            <HallCard key={era.id} era={era} index={i} />
          ))}
        </div>

        {/* ── Science Wing ─────────────────────────────────────────────── */}
        <WingDivider label="Science Wing" color="#60a5fa" />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 24,
        }}>
          {scienceHalls.map((era, i) => (
            <HallCard key={era.id} era={era} index={i + historyHalls.length} />
          ))}
        </div>
      </div>

      {/* Keyframes for card entrance animation */}
      <style>{`
        @keyframes museum-card-enter {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
