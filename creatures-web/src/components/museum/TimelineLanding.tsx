// ============================================================================
// TimelineLanding — the museum entrance showing all 6 exhibition halls
// ============================================================================

import { useMuseumStore } from '../../stores/museumStore';
import { ALL_ERAS, getEntityCountForEra, getVisitedCountForEra } from '../../data/halls/index';
import type { Era } from '../../data/knowledge-graph';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  container: {
    padding: '48px 40px 80px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  heroSection: {
    textAlign: 'center' as const,
    marginBottom: 56,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
    background: 'linear-gradient(135deg, #e8e6e3 0%, rgba(255,255,255,0.5) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 12,
  },
  heroSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    maxWidth: 500,
    margin: '0 auto',
    lineHeight: 1.5,
  },
  wingSection: {
    marginBottom: 48,
  },
  wingLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.25)',
    marginBottom: 20,
    paddingLeft: 4,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))',
    gap: 20,
  },
  card: {
    position: 'relative' as const,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    padding: '28px 28px 24px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  },
  cardGlow: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: '16px 16px 0 0',
  },
  cardEraName: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: 4,
    color: '#e8e6e3',
  },
  cardYears: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 12,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 20,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    width: 80,
    height: 3,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.5s ease',
  },
  progressLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  enterBtn: {
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
  },
  themeTag: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 500,
    marginRight: 4,
    marginBottom: 4,
  },
  themesRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  },
};

// ── Hall Card ───────────────────────────────────────────────────────────────

function HallCard({ era }: { era: Era }) {
  const { navigate, visitedEntityIds } = useMuseumStore();
  const totalEntities = getEntityCountForEra(era.id);
  const visitedCount = getVisitedCountForEra(era.id, visitedEntityIds);
  const progressPct = totalEntities > 0 ? (visitedCount / totalEntities) * 100 : 0;

  const formatYears = (years: [number, number]) => {
    const fmt = (y: number) => (y < 0 ? `${Math.abs(y)} BCE` : `${y}`);
    return `${fmt(years[0])} - ${fmt(years[1])}`;
  };

  return (
    <div
      style={styles.card}
      onClick={() => navigate('era', era.id)}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderColor = `${era.color}33`;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = `0 8px 32px ${era.color}15, 0 0 0 1px ${era.color}22`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderColor = 'rgba(255,255,255,0.06)';
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Accent glow line */}
      <div style={{ ...styles.cardGlow, background: `linear-gradient(90deg, ${era.color}, transparent)` }} />

      <div style={styles.cardEraName}>{era.name}</div>
      <div style={{ ...styles.cardYears, color: era.color }}>{formatYears(era.years)}</div>

      {/* Theme tags — show first 3 */}
      <div style={styles.themesRow}>
        {era.themes.slice(0, 3).map((theme, i) => (
          <span
            key={i}
            style={{
              ...styles.themeTag,
              background: `${era.color}12`,
              color: `${era.color}cc`,
              border: `1px solid ${era.color}20`,
            }}
          >
            {theme}
          </span>
        ))}
      </div>

      <div style={styles.cardDesc}>{era.description}</div>

      <div style={styles.cardFooter}>
        <div style={styles.progressWrap}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPct}%`,
                background: era.color,
              }}
            />
          </div>
          <span style={styles.progressLabel}>
            {visitedCount}/{totalEntities} explored
          </span>
        </div>
        <button
          style={styles.enterBtn}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = `${era.color}20`;
            (e.target as HTMLElement).style.borderColor = `${era.color}40`;
            (e.target as HTMLElement).style.color = era.color;
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
            (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
            (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
          }}
          onClick={(e) => {
            e.stopPropagation();
            navigate('era', era.id);
          }}
        >
          Enter Hall
        </button>
      </div>
    </div>
  );
}

// ── Timeline Landing ────────────────────────────────────────────────────────

export function TimelineLanding() {
  const historyHalls = ALL_ERAS.filter(e => e.wing === 'history');
  const scienceHalls = ALL_ERAS.filter(e => e.wing === 'science');

  return (
    <div style={styles.container}>
      {/* Hero */}
      <div style={styles.heroSection}>
        <h1 style={styles.heroTitle}>Night at the Museum</h1>
        <p style={styles.heroSub}>
          Walk through ten exhibition halls spanning the entire story of human
          civilization — from ancient Egypt to the moon landing, from the first atoms to the code of life.
        </p>
      </div>

      {/* History Wing */}
      <div style={styles.wingSection}>
        <div style={styles.wingLabel}>History Wing</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {historyHalls.map(era => (
            <HallCard key={era.id} era={era} />
          ))}
        </div>
      </div>

      {/* Science Wing */}
      <div style={styles.wingSection}>
        <div style={styles.wingLabel}>Science Wing</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {scienceHalls.map(era => (
            <HallCard key={era.id} era={era} />
          ))}
        </div>
      </div>
    </div>
  );
}
