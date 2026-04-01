// ============================================================================
// EraView — shows a specific era with events, people, artifacts, concepts
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
import type { HistoricalEvent, HistoricalPerson, Artifact, Concept, Significance } from '../../data/knowledge-graph';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  container: {
    padding: '0 40px 80px',
    maxWidth: 1200,
    margin: '0 auto',
  },
  header: {
    padding: '48px 0 36px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 32,
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    cursor: 'pointer',
    marginBottom: 20,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  eraName: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    marginBottom: 6,
  },
  eraYears: {
    fontSize: 15,
    fontWeight: 500,
    marginBottom: 12,
  },
  eraDesc: {
    fontSize: 14,
    lineHeight: 1.7,
    color: 'rgba(255,255,255,0.5)',
    maxWidth: 700,
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
  return `${fmt(years[0])} - ${fmt(years[1])}`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EventCard({ event, accentColor }: { event: HistoricalEvent; accentColor: string }) {
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

function PersonCard({ person, accentColor }: { person: HistoricalPerson; accentColor: string }) {
  const { navigate } = useMuseumStore();
  const lifespan = person.diedYear
    ? `${person.born} - ${person.died}`
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={styles.personName}>{person.name}</div>
        {person.isPlayable && (
          <span style={styles.playableBadge}>Chat Available</span>
        )}
      </div>
      <div style={styles.personDates}>{lifespan} · {person.nationality}</div>
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

function ArtifactCard({ artifact, accentColor }: { artifact: Artifact; accentColor: string }) {
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

function ConceptCard({ concept, accentColor }: { concept: Concept; accentColor: string }) {
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

  const accentColor = era.color;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'events', label: 'Events', count: events.length },
    { key: 'people', label: 'People', count: people.length },
    { key: 'artifacts', label: 'Artifacts', count: artifacts.length },
    { key: 'concepts', label: 'Concepts', count: concepts.length },
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button
          style={styles.backBtn}
          onClick={goBack}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          &larr; Back
        </button>
        <div style={{ ...styles.eraName, color: '#e8e6e3' }}>{era.name}</div>
        <div style={{ ...styles.eraYears, color: accentColor }}>{formatYears(era.years)} &middot; {era.region}</div>
        <div style={styles.eraDesc}>{era.description}</div>
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
        {activeTab === 'events' && events.map(e => <EventCard key={e.id} event={e} accentColor={accentColor} />)}
        {activeTab === 'people' && people.map(p => <PersonCard key={p.id} person={p} accentColor={accentColor} />)}
        {activeTab === 'artifacts' && artifacts.map(a => <ArtifactCard key={a.id} artifact={a} accentColor={accentColor} />)}
        {activeTab === 'concepts' && concepts.map(c => <ConceptCard key={c.id} concept={c} accentColor={accentColor} />)}
      </div>
    </div>
  );
}
