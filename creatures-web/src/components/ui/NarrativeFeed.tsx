import { useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeEvent {
  icon: string;
  event_type: string;
  title: string;
  description: string;
  generation: number;
}

interface NarrativeFeedProps {
  events: NarrativeEvent[];
}

// ---------------------------------------------------------------------------
// Event-type color mapping
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  breakthrough: 'var(--accent-green)',
  speciation: 'var(--accent-cyan)',
  extinction: 'var(--accent-magenta)',
  plateau: 'var(--text-label)',
  convergence: 'var(--accent-amber)',
  divergence: 'var(--accent-cyan)',
  intervention: '#c084fc',
  origin: 'var(--accent-green)',
};

function colorForType(eventType: string): string {
  return TYPE_COLORS[eventType] ?? 'var(--text-label)';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_EVENTS = 50;

export function NarrativeFeed({ events }: NarrativeFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest event
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length]);

  const visibleEvents = events.slice(-MAX_EVENTS);

  if (visibleEvents.length === 0) {
    return (
      <div style={{
        padding: '16px 12px',
        textAlign: 'center',
        color: 'var(--text-label)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
      }}>
        <div style={{ fontSize: 18, marginBottom: 6, opacity: 0.4 }}>
          {'//'}
        </div>
        <div>Awaiting evolutionary events...</div>
        <div style={{ marginTop: 4, fontSize: 9, opacity: 0.6 }}>
          Run evolution to populate this feed
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: 260,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        paddingRight: 2,
      }}
    >
      {visibleEvents.map((evt, i) => {
        const color = colorForType(evt.event_type);
        return (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderLeft: `3px solid ${color}`,
              animation: 'narrativeFadeIn 0.4s ease-out',
            }}
          >
            {/* Header: icon + badge + generation */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 3,
            }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{evt.icon}</span>
              <span style={{
                fontSize: 8,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '1px 5px',
                borderRadius: 3,
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                color,
                fontFamily: 'var(--font-mono)',
              }}>
                {evt.event_type}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: 9,
                color: 'var(--text-label)',
                fontFamily: 'var(--font-mono)',
              }}>
                GEN {evt.generation}
              </span>
            </div>

            {/* Title */}
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              marginBottom: 2,
            }}>
              {evt.title}
            </div>

            {/* Description */}
            <div style={{
              fontSize: 10,
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}>
              {evt.description}
            </div>
          </div>
        );
      })}

      {/* Inject keyframes via a style tag once */}
      <style>{`
        @keyframes narrativeFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
