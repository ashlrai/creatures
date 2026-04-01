// ============================================================================
// EventView — detail view for a specific historical event
// Features era-themed header strip and dramatic "Why It Matters" callout
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
import { getEraTheme } from '../../data/era-images';
import type { Significance } from '../../data/knowledge-graph';

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  outerWrap: {
    maxWidth: 900,
    margin: '0 auto',
  },
  // Hero header strip
  heroStrip: {
    position: 'relative' as const,
    overflow: 'hidden',
    borderRadius: '0 0 20px 20px',
    marginBottom: 36,
  },
  heroInner: {
    padding: '40px 44px 36px',
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
    right: 40,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 120,
    opacity: 0.05,
    lineHeight: 1,
    pointerEvents: 'none' as const,
    zIndex: 0,
    userSelect: 'none' as const,
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
    marginBottom: 20,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    position: 'relative' as const,
    zIndex: 2,
  },
  title: {
    fontSize: 36,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
    marginBottom: 14,
    fontFamily: '"Georgia", "Times New Roman", serif',
    position: 'relative' as const,
    zIndex: 2,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap' as const,
    position: 'relative' as const,
    zIndex: 2,
  },
  significanceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  metaItem: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  // Content
  content: {
    padding: '0 40px 80px',
  },
  description: {
    fontSize: 16,
    lineHeight: 1.85,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 36,
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  // Domain tags row
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
  // "Why It Matters" callout
  whyItMatters: {
    position: 'relative' as const,
    padding: '28px 32px',
    borderRadius: 16,
    fontSize: 15,
    lineHeight: 1.8,
    color: 'rgba(255,255,255,0.7)',
    overflow: 'hidden' as const,
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  whyItMattersLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    marginBottom: 12,
    opacity: 0.6,
  },
  whyItMattersBg: {
    position: 'absolute' as const,
    inset: 0,
    opacity: 0.08,
    zIndex: 0,
    pointerEvents: 'none' as const,
  },
  whyItMattersContent: {
    position: 'relative' as const,
    zIndex: 1,
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
  causalAccent: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  causalArrow: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  talkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.25s',
    fontFamily: 'inherit',
    marginTop: 6,
    border: 'none',
  },
};

const SIG_COLORS: Record<Significance, string> = {
  defining: '#ff6b6b',
  major: '#feca57',
  notable: '#48dbfb',
  minor: 'rgba(255,255,255,0.25)',
};

const SIG_LABELS: Record<Significance, string> = {
  defining: 'Defining Moment',
  major: 'Major Event',
  notable: 'Notable',
  minor: 'Minor',
};

// ── Component ───────────────────────────────────────────────────────────────

export function EventView() {
  const { selectedEventId, goBack, navigate, startConversation } = useMuseumStore();
  const event = selectedEventId ? EVENT_MAP.get(selectedEventId) : undefined;

  const era = useMemo(() => event ? ERA_MAP.get(event.eraId) : undefined, [event]);
  const theme = useMemo(() => era ? getEraTheme(era.id) : getEraTheme(''), [era]);
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
    <div style={s.outerWrap}>
      {/* ── Hero Header Strip ── */}
      <div style={s.heroStrip}>
        <div style={{ ...s.heroInner, background: theme.gradient }}>
          {theme.pattern && (
            <div style={{ ...s.heroPattern, background: theme.pattern }} />
          )}
          <div style={{ ...s.heroSymbol, color: theme.palette.text }}>
            {theme.symbol}
          </div>

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

          <div style={{ ...s.title, color: theme.palette.text }}>
            {event.title}
          </div>

          <div style={s.meta}>
            <span
              style={{
                ...s.significanceBadge,
                background: `${SIG_COLORS[event.significance]}20`,
                color: SIG_COLORS[event.significance],
                border: `1px solid ${SIG_COLORS[event.significance]}40`,
              }}
            >
              {SIG_LABELS[event.significance]}
            </span>
            <span style={{ ...s.metaItem, color: theme.palette.accent, fontWeight: 600 }}>{event.date}</span>
            <span style={{ ...s.metaItem, color: theme.palette.text, opacity: 0.6 }}>{event.location.name}</span>
            {era && (
              <span style={{ ...s.metaItem, color: theme.palette.text, opacity: 0.4 }}>{era.name}</span>
            )}
          </div>
        </div>
        <div style={s.heroFade} />
      </div>

      {/* ── Content ── */}
      <div style={s.content}>
        {/* Domain tags */}
        <div style={s.domainRow}>
          {event.domainIds.map(dId => {
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
        <div style={s.description}>{event.description}</div>

        {/* Why It Matters — dramatic callout */}
        <div style={s.section}>
          <div
            style={{
              ...s.whyItMatters,
              border: `1px solid ${accentColor}25`,
            }}
          >
            <div style={{ ...s.whyItMattersBg, background: theme.gradient }} />
            <div style={s.whyItMattersContent}>
              <div style={{ ...s.whyItMattersLabel, color: accentColor }}>
                Why It Matters
              </div>
              {event.whyItMatters}
            </div>
          </div>
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
                <div style={{ ...s.causalAccent, background: accentColor, opacity: 0.5 }} />
                <span style={s.causalArrow}>&larr;</span>
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
                <div style={{ ...s.causalAccent, background: theme.palette.secondary, opacity: 0.5 }} />
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
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: `${accentColor}18`,
                      color: accentColor,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: '"Georgia", "Times New Roman", serif',
                    }}
                  >
                    {p.name.charAt(0)}
                  </span>
                  <span>{p.name}</span>
                  {p.isPlayable && <span style={{ fontSize: 10, color: '#b388ff' }}>(Chat)</span>}
                </button>
              ))}
            </div>

            {/* Talk buttons for playable characters */}
            {connectedPeople.filter(p => p?.isPlayable).map(p => p && (
              <button
                key={`talk-${p.id}`}
                style={{
                  ...s.talkBtn,
                  background: `linear-gradient(135deg, ${accentColor}30, ${theme.palette.secondary}25)`,
                  color: theme.palette.accent,
                }}
                onClick={() => startConversation(p.id, 'default')}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${accentColor}45, ${theme.palette.secondary}40)`;
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${accentColor}20`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${accentColor}30, ${theme.palette.secondary}25)`;
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
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
                    background: `${accentColor}08`,
                    borderColor: `${accentColor}15`,
                  }}
                >
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
