// ============================================================================
// EraView — shows a specific era with events, people, artifacts, concepts
// Features a dramatic hero banner with era-specific theming
// ============================================================================

import { useState, useMemo } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import {
  ERA_MAP,
  getEventsForEra,
  getPeopleForEra,
  getArtifactsForEra,
  getConceptsForEra,
} from '../../data/halls/index';
import { DOMAINS } from '../../data/knowledge-graph';
import { getEraTheme } from '../../data/era-images';
import type { HistoricalEvent, HistoricalPerson, Artifact, Concept, Significance } from '../../data/knowledge-graph';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  outerWrap: {
    maxWidth: 1200,
    margin: '0 auto',
  },
  // Hero banner — full width, dramatic gradient
  heroBanner: {
    position: 'relative' as const,
    overflow: 'hidden',
    borderRadius: '0 0 24px 24px',
    marginBottom: 40,
  },
  heroGradient: {
    padding: '72px 48px 56px',
    position: 'relative' as const,
    zIndex: 1,
  },
  heroPattern: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none' as const,
  },
  heroSymbol: {
    position: 'absolute' as const,
    right: 48,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 180,
    opacity: 0.06,
    lineHeight: 1,
    pointerEvents: 'none' as const,
    zIndex: 0,
    userSelect: 'none' as const,
  },
  heroBackBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(0,0,0,0.25)',
    backdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: 28,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    position: 'relative' as const,
    zIndex: 2,
  },
  heroName: {
    fontSize: 48,
    fontWeight: 800,
    letterSpacing: '-0.04em',
    lineHeight: 1.05,
    marginBottom: 12,
    position: 'relative' as const,
    zIndex: 2,
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  heroYears: {
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '0.02em',
    marginBottom: 6,
    position: 'relative' as const,
    zIndex: 2,
  },
  heroTagline: {
    fontSize: 18,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    opacity: 0.7,
    marginBottom: 16,
    position: 'relative' as const,
    zIndex: 2,
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 1.75,
    maxWidth: 640,
    position: 'relative' as const,
    zIndex: 2,
    opacity: 0.75,
  },
  // Bottom fade from hero to dark bg
  heroFade: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    background: 'linear-gradient(to bottom, transparent, #0a0a0f)',
    zIndex: 1,
    pointerEvents: 'none' as const,
  },
  // Content area
  content: {
    padding: '0 40px 80px',
  },
  // Stat strip
  statStrip: {
    display: 'flex',
    gap: 24,
    marginBottom: 32,
    padding: '16px 20px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 4,
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'rgba(255,255,255,0.35)',
  },
  tabs: {
    display: 'flex',
    gap: 2,
    marginBottom: 28,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  tab: {
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    fontFamily: 'inherit',
    borderBottom: '2px solid transparent',
    transition: 'all 0.15s',
    position: 'relative' as const,
  },
  tabActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  tabCount: {
    marginLeft: 6,
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.3)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  // Event card
  eventCard: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    padding: '20px 22px',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  cardAccentBar: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    marginBottom: 6,
    color: '#e8e6e3',
  },
  eventDate: {
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 8,
  },
  eventDesc: {
    fontSize: 12,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.4)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    marginBottom: 12,
  },
  domainTag: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 500,
    marginRight: 4,
  },
  // Person card
  personCard: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    padding: '20px 22px',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  personInitial: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 700,
    fontFamily: '"Georgia", "Times New Roman", serif',
    flexShrink: 0,
  },
  personName: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 4,
    color: '#e8e6e3',
  },
  personDates: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 8,
  },
  personRoles: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    marginBottom: 10,
  },
  rolePill: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 500,
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  playableBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(124,77,255,0.12)',
    color: '#b388ff',
    border: '1px solid rgba(124,77,255,0.2)',
  },
  significanceBadge: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  // Concept card
  conceptCard: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    padding: '20px 22px',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
};

const SIGNIFICANCE_COLORS: Record<Significance, string> = {
  defining: '#ff6b6b',
  major: '#feca57',
  notable: '#48dbfb',
  minor: 'rgba(255,255,255,0.25)',
};

function getDomainById(id: string) {
  return DOMAINS.find(d => d.id === id);
}

function formatYears(years: [number, number]) {
  const fmt = (y: number) => (y < 0 ? `${Math.abs(y)} BCE` : `${y}`);
  return `${fmt(years[0])} \u2014 ${fmt(years[1])}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EventCard({ event, accentColor, accentGradient }: { event: HistoricalEvent; accentColor: string; accentGradient: string }) {
  const { navigate } = useMuseumStore();
  return (
    <div
      style={styles.eventCard}
      onClick={() => navigate('event', event.id)}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderColor = `${accentColor}50`;
        el.style.transform = 'translateY(-2px) scale(1.02)';
        el.style.boxShadow = `0 4px 20px ${accentColor}15`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderColor = 'rgba(255,255,255,0.06)';
        el.style.transform = 'translateY(0) scale(1)';
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ ...styles.cardAccentBar, background: accentGradient }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span
          style={{
            ...styles.significanceBadge,
            background: `${SIGNIFICANCE_COLORS[event.significance]}18`,
            color: SIGNIFICANCE_COLORS[event.significance],
            border: `1px solid ${SIGNIFICANCE_COLORS[event.significance]}25`,
          }}
        >
          {event.significance}
        </span>
        <span style={{ ...styles.eventDate, color: accentColor }}>{event.date}</span>
      </div>
      <div style={styles.eventTitle}>{event.title}</div>
      <div style={styles.eventDesc}>{event.description}</div>
      <div>
        {event.domainIds.slice(0, 3).map(dId => {
          const d = getDomainById(dId);
          if (!d) return null;
          return (
            <span
              key={dId}
              style={{
                ...styles.domainTag,
                background: `${d.color}15`,
                color: `${d.color}bb`,
                border: `1px solid ${d.color}20`,
              }}
            >
              {d.icon} {d.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PersonCard({ person, accentColor, accentGradient }: { person: HistoricalPerson; accentColor: string; accentGradient: string }) {
  const { navigate } = useMuseumStore();
  const lifespan = person.diedYear
    ? `${person.born} \u2013 ${person.died}`
    : `b. ${person.born}`;

  return (
    <div
      style={styles.personCard}
      onClick={() => navigate('person', person.id)}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderColor = `${accentColor}50`;
        el.style.transform = 'translateY(-2px) scale(1.02)';
        el.style.boxShadow = `0 4px 20px ${accentColor}15`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderColor = 'rgba(255,255,255,0.06)';
        el.style.transform = 'translateY(0) scale(1)';
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ ...styles.cardAccentBar, background: accentGradient }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <div
          style={{
            ...styles.personInitial,
            background: `${accentColor}18`,
            color: accentColor,
            border: `1px solid ${accentColor}30`,
          }}
        >
          {person.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={styles.personName}>{person.name}</div>
            {person.isPlayable && (
              <span style={styles.playableBadge}>Chat Available</span>
            )}
          </div>
          <div style={styles.personDates}>{lifespan} \u00B7 {person.nationality}</div>
        </div>
      </div>
      <div style={styles.personRoles}>
        {person.roles.map((role, i) => (
          <span key={i} style={styles.rolePill}>{role}</span>
        ))}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.4)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
        {person.description}
      </div>
    </div>
  );
}

function ArtifactCard({ artifact, accentColor, accentGradient }: { artifact: Artifact; accentColor: string; accentGradient: string }) {
  const { navigate } = useMuseumStore();
  return (
    <div
      style={styles.eventCard}
      onClick={() => navigate('artifact', artifact.id)}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderColor = `${accentColor}50`;
        el.style.transform = 'translateY(-2px) scale(1.02)';
        el.style.boxShadow = `0 4px 20px ${accentColor}15`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderColor = 'rgba(255,255,255,0.06)';
        el.style.transform = 'translateY(0) scale(1)';
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ ...styles.cardAccentBar, background: accentGradient }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: accentColor, opacity: 0.7 }}>
          {artifact.type.replace('-', ' ')}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{artifact.date}</span>
      </div>
      <div style={styles.eventTitle}>{artifact.name}</div>
      <div style={styles.eventDesc}>{artifact.description}</div>
      {artifact.currentLocation && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          {artifact.currentLocation}
        </div>
      )}
    </div>
  );
}

function ConceptCard({ concept, accentColor, accentGradient }: { concept: Concept; accentColor: string; accentGradient: string }) {
  return (
    <div
      style={styles.conceptCard}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderColor = `${accentColor}50`;
        el.style.transform = 'translateY(-2px) scale(1.02)';
        el.style.boxShadow = `0 4px 20px ${accentColor}15`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderColor = 'rgba(255,255,255,0.06)';
        el.style.transform = 'translateY(0) scale(1)';
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ ...styles.cardAccentBar, background: accentGradient }} />
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#e8e6e3' }}>{concept.name}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' }}>{concept.description}</div>
      <div style={{ marginTop: 10 }}>
        {concept.domainIds.slice(0, 3).map(dId => {
          const d = getDomainById(dId);
          if (!d) return null;
          return (
            <span
              key={dId}
              style={{
                ...styles.domainTag,
                background: `${d.color}15`,
                color: `${d.color}bb`,
                border: `1px solid ${d.color}20`,
              }}
            >
              {d.icon} {d.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

type TabKey = 'events' | 'people' | 'artifacts' | 'concepts';

export function EraView() {
  const { selectedEraId, goBack } = useMuseumStore();
  const [activeTab, setActiveTab] = useState<TabKey>('events');

  const era = selectedEraId ? ERA_MAP.get(selectedEraId) : undefined;

  const events = useMemo(() => era ? getEventsForEra(era.id).sort((a, b) => a.dateYear - b.dateYear) : [], [era]);
  const people = useMemo(() => era ? getPeopleForEra(era.id).sort((a, b) => a.bornYear - b.bornYear) : [], [era]);
  const artifacts = useMemo(() => era ? getArtifactsForEra(era.id).sort((a, b) => a.dateYear - b.dateYear) : [], [era]);
  const concepts = useMemo(() => era ? getConceptsForEra(era.id) : [], [era]);

  if (!era) {
    return (
      <div style={{ padding: 40, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
        Era not found.
      </div>
    );
  }

  const theme = getEraTheme(era.id);
  const accentColor = era.color;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'events', label: 'Events', count: events.length },
    { key: 'people', label: 'People', count: people.length },
    { key: 'artifacts', label: 'Artifacts', count: artifacts.length },
    { key: 'concepts', label: 'Concepts', count: concepts.length },
  ];

  return (
    <div style={styles.outerWrap}>
      {/* ── Hero Banner ── */}
      <div style={styles.heroBanner}>
        <div style={{ ...styles.heroGradient, background: theme.gradient }}>
          {/* Decorative pattern overlay */}
          {theme.pattern && (
            <div style={{ ...styles.heroPattern, background: theme.pattern }} />
          )}
          {/* Large decorative symbol */}
          <div style={{ ...styles.heroSymbol, color: theme.palette.text }}>
            {theme.symbol}
          </div>

          <button
            style={styles.heroBackBtn}
            onClick={goBack}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.45)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.95)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.25)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
            }}
          >
            &larr; Back to Museum
          </button>

          <div style={{ ...styles.heroName, color: theme.palette.text }}>
            {era.name}
          </div>
          <div style={{ ...styles.heroYears, color: theme.palette.accent }}>
            {formatYears(era.years)} &middot; {era.region}
          </div>
          <div style={{ ...styles.heroTagline, color: theme.palette.text }}>
            {theme.tagline}
          </div>
          <div style={{ ...styles.heroDesc, color: theme.palette.text }}>
            {era.description}
          </div>
        </div>
        <div style={styles.heroFade} />
      </div>

      {/* ── Content ── */}
      <div style={styles.content}>
        {/* Stat strip */}
        <div style={styles.statStrip}>
          {tabs.map(t => (
            <div key={t.key} style={styles.statItem}>
              <div style={{ ...styles.statNumber, color: accentColor }}>{t.count}</div>
              <div style={styles.statLabel}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {tabs.map(t => (
            <button
              key={t.key}
              style={{
                ...styles.tab,
                ...(activeTab === t.key ? styles.tabActive : {}),
                borderBottomColor: activeTab === t.key ? accentColor : 'transparent',
              }}
              onClick={() => setActiveTab(t.key)}
              onMouseEnter={(e) => {
                if (activeTab !== t.key) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
              }}
              onMouseLeave={(e) => {
                if (activeTab !== t.key) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)';
              }}
            >
              {t.label}
              <span style={styles.tabCount}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div style={styles.grid}>
          {activeTab === 'events' && events.map(e => <EventCard key={e.id} event={e} accentColor={accentColor} accentGradient={theme.accentGradient} />)}
          {activeTab === 'people' && people.map(p => <PersonCard key={p.id} person={p} accentColor={accentColor} accentGradient={theme.accentGradient} />)}
          {activeTab === 'artifacts' && artifacts.map(a => <ArtifactCard key={a.id} artifact={a} accentColor={accentColor} accentGradient={theme.accentGradient} />)}
          {activeTab === 'concepts' && concepts.map(c => <ConceptCard key={c.id} concept={c} accentColor={accentColor} accentGradient={theme.accentGradient} />)}
        </div>
      </div>
    </div>
  );
}
