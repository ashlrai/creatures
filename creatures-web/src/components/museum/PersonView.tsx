// ============================================================================
// PersonView — detail view for a historical figure
// ============================================================================

import { useMemo } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import {
  PERSON_MAP,
  EVENT_MAP,
  ARTIFACT_MAP,
  ERA_MAP,
} from '../../data/halls/index';
import { DOMAINS } from '../../data/knowledge-graph';

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
  name: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    color: '#e8e6e3',
    marginBottom: 8,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
    marginBottom: 14,
  },
  metaItem: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  roles: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginBottom: 16,
  },
  rolePill: {
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
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
  card: {
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
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e8e6e3',
  },
  cardSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  connectionCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 8,
  },
  relationshipBadge: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'capitalize' as const,
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.4)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  talkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 24px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(0,229,255,0.15))',
    border: '1px solid rgba(124,77,255,0.3)',
    color: '#b388ff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s',
    fontFamily: 'inherit',
    marginBottom: 32,
  },
  playableIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: 'rgba(124,77,255,0.1)',
    color: '#b388ff',
    border: '1px solid rgba(124,77,255,0.2)',
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
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  mentor: '#feca57',
  student: '#48dbfb',
  rival: '#ff6b6b',
  patron: '#C9A84C',
  collaborator: '#2ed573',
  contemporary: 'rgba(255,255,255,0.35)',
  opponent: '#ff4757',
  family: '#dfe6e9',
};

// ── Component ───────────────────────────────────────────────────────────────

export function PersonView() {
  const { selectedPersonId, goBack, navigate, startConversation } = useMuseumStore();
  const person = selectedPersonId ? PERSON_MAP.get(selectedPersonId) : undefined;

  const eras = useMemo(() =>
    person ? person.eraIds.map(id => ERA_MAP.get(id)).filter(Boolean) : [], [person]);
  const connectedEvents = useMemo(() =>
    person ? person.eventIds.map(id => EVENT_MAP.get(id)).filter(Boolean) : [], [person]);
  const connectedArtifacts = useMemo(() =>
    person ? person.artifactIds.map(id => ARTIFACT_MAP.get(id)).filter(Boolean) : [], [person]);
  const connections = useMemo(() =>
    person ? person.connections.map(c => ({
      ...c,
      person: PERSON_MAP.get(c.personId),
    })).filter(c => c.person) : [], [person]);

  if (!person) {
    return (
      <div style={{ padding: 40, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
        Person not found.
      </div>
    );
  }

  const primaryEra = eras[0];
  const accentColor = primaryEra?.color ?? '#7c4dff';
  const lifespan = person.diedYear
    ? `${person.born} - ${person.died}`
    : `b. ${person.born}`;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          <div style={s.name}>{person.name}</div>
          {person.isPlayable && (
            <span style={s.playableIndicator}>AI Character</span>
          )}
        </div>
        <div style={s.meta}>
          <span style={{ ...s.metaItem, color: accentColor }}>{lifespan}</span>
          <span style={s.metaItem}>{person.nationality}</span>
          {eras.map(era => era && (
            <span key={era.id} style={{ ...s.metaItem, opacity: 0.5 }}>{era.name}</span>
          ))}
        </div>

        {/* Roles */}
        <div style={s.roles}>
          {person.roles.map((role, i) => (
            <span key={i} style={s.rolePill}>{role}</span>
          ))}
        </div>

        {/* Domain tags */}
        <div>
          {person.domainIds.map(dId => {
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

      {/* Talk Button (prominent if playable) */}
      {person.isPlayable && (
        <button
          style={s.talkBtn}
          onClick={() => startConversation(person.id, 'default')}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = 'linear-gradient(135deg, rgba(124,77,255,0.3), rgba(0,229,255,0.25))';
            el.style.transform = 'translateY(-1px)';
            el.style.boxShadow = '0 4px 20px rgba(124,77,255,0.2)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = 'linear-gradient(135deg, rgba(124,77,255,0.2), rgba(0,229,255,0.15))';
            el.style.transform = 'translateY(0)';
            el.style.boxShadow = 'none';
          }}
        >
          Talk to {person.name}
        </button>
      )}

      {/* Description */}
      <div style={s.description}>{person.description}</div>

      {/* Connected Events */}
      {connectedEvents.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Events</div>
          {connectedEvents.map(e => e && (
            <div
              key={e.id}
              style={s.card}
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
              <div>
                <div style={s.cardTitle}>{e.title}</div>
                <div style={s.cardSub}>{e.date} &middot; {e.location.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connected Artifacts */}
      {connectedArtifacts.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Created / Associated Artifacts</div>
          {connectedArtifacts.map(a => a && (
            <div
              key={a.id}
              style={s.card}
              onClick={() => navigate('artifact', a.id)}
              onMouseEnter={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (ev.currentTarget as HTMLElement).style.borderColor = `${accentColor}30`;
              }}
              onMouseLeave={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                (ev.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              }}
            >
              <div>
                <div style={s.cardTitle}>{a.name}</div>
                <div style={s.cardSub}>{a.date} &middot; {a.type.replace('-', ' ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connections to Other People */}
      {connections.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Connections</div>
          {connections.map((c, i) => c.person && (
            <div
              key={i}
              style={s.connectionCard}
              onClick={() => navigate('person', c.personId)}
              onMouseEnter={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (ev.currentTarget as HTMLElement).style.borderColor = `${accentColor}30`;
              }}
              onMouseLeave={(ev) => {
                (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                (ev.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              }}
            >
              <div>
                <div style={s.cardTitle}>{c.person.name}</div>
                {c.description && <div style={s.cardSub}>{c.description}</div>}
              </div>
              <span
                style={{
                  ...s.relationshipBadge,
                  color: RELATIONSHIP_COLORS[c.relationship] ?? 'rgba(255,255,255,0.4)',
                  borderColor: `${RELATIONSHIP_COLORS[c.relationship] ?? 'rgba(255,255,255,0.1)'}40`,
                }}
              >
                {c.relationship}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
