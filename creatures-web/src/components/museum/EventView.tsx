// ============================================================================
// EventView — detail view for a specific historical event
// ============================================================================

import { useMemo } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import {
  EVENT_MAP,
  PERSON_MAP,
  ARTIFACT_MAP,
  CONCEPT_MAP,
  ERA_MAP,
} from '../../data/halls/index';
import { DOMAINS } from '../../data/knowledge-graph';
import type { Significance } from '../../data/knowledge-graph';

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  container: {
    padding: '0 40px 80px',
    maxWidth: 900,
    margin: '0 auto',
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
    marginTop: 32,
    marginBottom: 24,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  header: {
    marginBottom: 36,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.15,
    color: '#e8e6e3',
    marginBottom: 12,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  },
  metaItem: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  significanceBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  description: {
    fontSize: 15,
    lineHeight: 1.8,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.25)',
    marginBottom: 14,
  },
  whyItMatters: {
    padding: '20px 24px',
    borderRadius: 12,
    background: 'rgba(124,77,255,0.06)',
    border: '1px solid rgba(124,77,255,0.15)',
    fontSize: 14,
    lineHeight: 1.7,
    color: 'rgba(255,255,255,0.6)',
  },
  entityChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    marginRight: 8,
    marginBottom: 8,
  },
  causalCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 8,
  },
  causalArrow: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  domainTag: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 500,
    marginRight: 6,
    marginBottom: 6,
  },
  talkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 8,
    background: 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(0,229,255,0.15))',
    border: '1px solid rgba(124,77,255,0.3)',
    color: '#b388ff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    marginTop: 4,
  },
};

const SIG_COLORS: Record<Significance, string> = {
  defining: '#ff6b6b',
  major: '#feca57',
  notable: '#48dbfb',
  minor: 'rgba(255,255,255,0.25)',
};

// ── Component ───────────────────────────────────────────────────────────────

export function EventView() {
  const { selectedEventId, goBack, navigate, startConversation } = useMuseumStore();
  const event = selectedEventId ? EVENT_MAP.get(selectedEventId) : undefined;

  const era = useMemo(() => event ? ERA_MAP.get(event.eraId) : undefined, [event]);
  const connectedPeople = useMemo(() =>
    event ? event.personIds.map(id => PERSON_MAP.get(id)).filter(Boolean) : [], [event]);
  const connectedArtifacts = useMemo(() =>
    event ? event.artifactIds.map(id => ARTIFACT_MAP.get(id)).filter(Boolean) : [], [event]);
  const connectedConcepts = useMemo(() =>
    event ? event.conceptIds.map(id => CONCEPT_MAP.get(id)).filter(Boolean) : [], [event]);
  const causedByEvents = useMemo(() =>
    event ? event.causedBy.map(id => EVENT_MAP.get(id)).filter(Boolean) : [], [event]);
  const ledToEvents = useMemo(() =>
    event ? event.ledTo.map(id => EVENT_MAP.get(id)).filter(Boolean) : [], [event]);

  if (!event) {
    return (
      <div style={{ padding: 40, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
        Event not found.
      </div>
    );
  }

  const accentColor = era?.color ?? '#7c4dff';

  return (
    <div style={s.container}>
      <button
        style={s.backBtn}
        onClick={goBack}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
        }}
      >
        &larr; Back
      </button>

      {/* Header */}
      <div style={s.header}>
        <div style={s.title}>{event.title}</div>
        <div style={s.meta}>
          <span
            style={{
              ...s.significanceBadge,
              background: `${SIG_COLORS[event.significance]}15`,
              color: SIG_COLORS[event.significance],
              border: `1px solid ${SIG_COLORS[event.significance]}30`,
            }}
          >
            {event.significance}
          </span>
          <span style={{ ...s.metaItem, color: accentColor }}>{event.date}</span>
          <span style={s.metaItem}>{event.location.name}</span>
          {era && <span style={{ ...s.metaItem, opacity: 0.5 }}>{era.name}</span>}
        </div>

        {/* Domain tags */}
        <div>
          {event.domainIds.map(dId => {
            const d = DOMAINS.find(dd => dd.id === dId);
            if (!d) return null;
            return (
              <span
                key={dId}
                style={{
                  ...s.domainTag,
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

      {/* Description */}
      <div style={s.description}>{event.description}</div>

      {/* Why It Matters */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Why It Matters</div>
        <div style={s.whyItMatters}>{event.whyItMatters}</div>
      </div>

      {/* Causal Chain */}
      {causedByEvents.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Caused By</div>
          {causedByEvents.map(e => e && (
            <div
              key={e.id}
              style={s.causalCard}
              onClick={() => navigate('event', e.id)}
              onMouseEnter={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (ev.currentTarget as HTMLElement).style.borderColor = `${accentColor}30`;
              }}
              onMouseLeave={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                (ev.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              }}
            >
              <span style={s.causalArrow}>&rarr;</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e3' }}>{e.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{e.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ledToEvents.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Led To</div>
          {ledToEvents.map(e => e && (
            <div
              key={e.id}
              style={s.causalCard}
              onClick={() => navigate('event', e.id)}
              onMouseEnter={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (ev.currentTarget as HTMLElement).style.borderColor = `${accentColor}30`;
              }}
              onMouseLeave={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                (ev.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              }}
            >
              <span style={s.causalArrow}>&rarr;</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e3' }}>{e.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{e.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connected People */}
      {connectedPeople.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>People Involved</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {connectedPeople.map(p => p && (
              <button
                key={p.id}
                style={s.entityChip}
                onClick={() => navigate('person', p.id)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLElement).style.borderColor = `${accentColor}30`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                }}
              >
                <span>{p.name}</span>
                {p.isPlayable && <span style={{ fontSize: 10, color: '#b388ff' }}>(Chat)</span>}
              </button>
            ))}
          </div>

          {/* Talk button for playable characters */}
          {connectedPeople.filter(p => p?.isPlayable).map(p => p && (
            <button
              key={`talk-${p.id}`}
              style={s.talkBtn}
              onClick={() => startConversation(p.id, 'default')}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(124,77,255,0.3), rgba(0,229,255,0.25))';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(0,229,255,0.15))';
              }}
            >
              Talk to {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Connected Artifacts */}
      {connectedArtifacts.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Related Artifacts</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {connectedArtifacts.map(a => a && (
              <button
                key={a.id}
                style={s.entityChip}
                onClick={() => navigate('artifact', a.id)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                }}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Connected Concepts */}
      {connectedConcepts.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Related Concepts</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {connectedConcepts.map(c => c && (
              <span
                key={c.id}
                style={{
                  ...s.entityChip,
                  cursor: 'default',
                  background: 'rgba(124,77,255,0.06)',
                  borderColor: 'rgba(124,77,255,0.12)',
                }}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
