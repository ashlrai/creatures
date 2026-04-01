// ============================================================================
// PersonView — detail view for a historical figure
// Features era-colored header block, large initial, and prominent talk button
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
import { getEraTheme } from '../../data/era-images';

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  outerWrap: {
    maxWidth: 900,
    margin: '0 auto',
  },
  // Hero header
  heroStrip: {
    position: 'relative' as const,
    overflow: 'hidden',
    borderRadius: '0 0 20px 20px',
    marginBottom: 36,
  },
  heroInner: {
    padding: '40px 44px 44px',
    position: 'relative' as const,
    zIndex: 1,
  },
  heroPattern: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none' as const,
  },
  heroFade: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    background: 'linear-gradient(to bottom, transparent, #0a0a0f)',
    zIndex: 1,
    pointerEvents: 'none' as const,
  },
  backBtn: {
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
    marginBottom: 24,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    position: 'relative' as const,
    zIndex: 2,
  },
  // Large initial monogram
  monogram: {
    width: 80,
    height: 80,
    borderRadius: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 42,
    fontWeight: 700,
    fontFamily: '"Georgia", "Times New Roman", serif',
    flexShrink: 0,
    position: 'relative' as const,
    zIndex: 2,
    border: '2px solid rgba(255,255,255,0.1)',
  },
  heroNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    marginBottom: 12,
    position: 'relative' as const,
    zIndex: 2,
  },
  name: {
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: '-0.04em',
    lineHeight: 1.05,
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  playableIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    background: 'rgba(124,77,255,0.15)',
    color: '#b388ff',
    border: '1px solid rgba(124,77,255,0.25)',
    backdropFilter: 'blur(4px)',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
    marginBottom: 16,
    position: 'relative' as const,
    zIndex: 2,
  },
  metaItem: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  roles: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    position: 'relative' as const,
    zIndex: 2,
  },
  rolePill: {
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(4px)',
  },
  // Content
  content: {
    padding: '0 40px 80px',
  },
  // Talk button — big and prominent
  talkBtnWrap: {
    marginBottom: 36,
  },
  talkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 28px',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'inherit',
    border: 'none',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  talkBtnShine: {
    position: 'absolute' as const,
    top: 0,
    left: '-100%',
    width: '50%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
    transition: 'left 0.5s',
    pointerEvents: 'none' as const,
  },
  description: {
    fontSize: 16,
    lineHeight: 1.85,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 36,
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  domainRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginBottom: 32,
  },
  domainTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.25)',
    marginBottom: 16,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 8,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  cardAccent: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
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
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 8,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  relationshipBadge: {
    padding: '3px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'capitalize' as const,
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.4)',
    border: '1px solid rgba(255,255,255,0.08)',
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
  const theme = getEraTheme(primaryEra?.id ?? '');
  const lifespan = person.diedYear
    ? `${person.born} \u2013 ${person.died}`
    : `b. ${person.born}`;

  return (
    <div style={s.outerWrap}>
      {/* ── Hero Header ── */}
      <div style={s.heroStrip}>
        <div style={{ ...s.heroInner, background: theme.gradient }}>
          {theme.pattern && (
            <div style={{ ...s.heroPattern, background: theme.pattern }} />
          )}

          <button
            style={s.backBtn}
            onClick={goBack}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.45)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.95)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.25)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
            }}
          >
            &larr; Back
          </button>

          <div style={s.heroNameRow}>
            {/* Large monogram initial */}
            <div
              style={{
                ...s.monogram,
                background: `rgba(0,0,0,0.3)`,
                color: theme.palette.accent,
              }}
            >
              {person.name.charAt(0)}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
                <div style={{ ...s.name, color: theme.palette.text }}>
                  {person.name}
                </div>
                {person.isPlayable && (
                  <span style={s.playableIndicator}>AI Character</span>
                )}
              </div>
              <div style={s.meta}>
                <span style={{ ...s.metaItem, color: theme.palette.accent, fontWeight: 600 }}>{lifespan}</span>
                <span style={{ ...s.metaItem, color: theme.palette.text, opacity: 0.6 }}>{person.nationality}</span>
                {eras.map(era => era && (
                  <span key={era.id} style={{ ...s.metaItem, color: theme.palette.text, opacity: 0.4 }}>{era.name}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Roles */}
          <div style={s.roles}>
            {person.roles.map((role, i) => (
              <span
                key={i}
                style={{
                  ...s.rolePill,
                  background: `rgba(0,0,0,0.2)`,
                  color: theme.palette.text,
                  borderColor: `${theme.palette.text}20`,
                }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
        <div style={s.heroFade} />
      </div>

      {/* ── Content ── */}
      <div style={s.content}>
        {/* Talk Button — big and prominent for playable characters */}
        {person.isPlayable && (
          <div style={s.talkBtnWrap}>
            <button
              style={{
                ...s.talkBtn,
                background: `linear-gradient(135deg, ${accentColor}35, ${theme.palette.secondary}30, ${theme.palette.accent}25)`,
                color: theme.palette.text,
                boxShadow: `0 4px 24px ${accentColor}20`,
              }}
              onClick={() => startConversation(person.id, 'default')}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = `linear-gradient(135deg, ${accentColor}50, ${theme.palette.secondary}45, ${theme.palette.accent}40)`;
                el.style.transform = 'translateY(-2px)';
                el.style.boxShadow = `0 8px 32px ${accentColor}30`;
                // Shine effect
                const shine = el.querySelector('[data-shine]') as HTMLElement;
                if (shine) shine.style.left = '100%';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = `linear-gradient(135deg, ${accentColor}35, ${theme.palette.secondary}30, ${theme.palette.accent}25)`;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = `0 4px 24px ${accentColor}20`;
                const shine = el.querySelector('[data-shine]') as HTMLElement;
                if (shine) shine.style.left = '-100%';
              }}
            >
              <span data-shine="" style={s.talkBtnShine} />
              Talk to {person.name}
            </button>
          </div>
        )}

        {/* Domain tags */}
        <div style={s.domainRow}>
          {person.domainIds.map(dId => {
            const d = DOMAINS.find(dd => dd.id === dId);
            if (!d) return null;
            return (
              <span
                key={dId}
                style={{
                  ...s.domainTag,
                  background: `${d.color}15`,
                  color: `${d.color}cc`,
                  border: `1px solid ${d.color}25`,
                }}
              >
                {d.icon} {d.name}
              </span>
            );
          })}
        </div>

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
                <div style={{ ...s.cardAccent, background: accentColor, opacity: 0.4 }} />
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
                <div style={{ ...s.cardAccent, background: theme.palette.secondary, opacity: 0.4 }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: `${RELATIONSHIP_COLORS[c.relationship] ?? accentColor}15`,
                      color: RELATIONSHIP_COLORS[c.relationship] ?? accentColor,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: '"Georgia", "Times New Roman", serif',
                      border: `1px solid ${RELATIONSHIP_COLORS[c.relationship] ?? accentColor}25`,
                      flexShrink: 0,
                    }}
                  >
                    {c.person.name.charAt(0)}
                  </span>
                  <div>
                    <div style={s.cardTitle}>{c.person.name}</div>
                    {c.description && <div style={s.cardSub}>{c.description}</div>}
                  </div>
                </div>
                <span
                  style={{
                    ...s.relationshipBadge,
                    color: RELATIONSHIP_COLORS[c.relationship] ?? 'rgba(255,255,255,0.4)',
                    borderColor: `${RELATIONSHIP_COLORS[c.relationship] ?? 'rgba(255,255,255,0.1)'}40`,
                    background: `${RELATIONSHIP_COLORS[c.relationship] ?? 'rgba(255,255,255,0.05)'}12`,
                  }}
                >
                  {c.relationship}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
