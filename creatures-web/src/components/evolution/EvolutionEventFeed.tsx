import { useRef, useEffect } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';
import type { EvolutionEventType } from '../../types/evolution';

const typeColors: Record<EvolutionEventType, string> = {
  breakthrough: '#00cc66',
  species_emerged: '#00ccff',
  species_extinct: '#cc44aa',
  convergence: '#ffaa22',
  stagnation: '#ff6644',
  god_intervention: '#c084fc',
  divergence: '#00ccff',
  run_start: 'rgba(140, 170, 200, 0.4)',
  run_complete: '#00ccff',
};

export function EvolutionEventFeed() {
  const eventLog = useEvolutionStore((s) => s.eventLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [eventLog.length]);

  if (eventLog.length === 0) {
    return (
      <div style={{
        padding: '12px 4px', textAlign: 'center',
        color: 'rgba(140, 170, 200, 0.3)', fontSize: 10, fontFamily: 'monospace',
      }}>
        Events will appear as evolution progresses...
      </div>
    );
  }

  // Show most recent 50
  const visible = eventLog.slice(-50);

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        scrollbarWidth: 'thin',
      }}
    >
      {visible.map((event) => {
        const color = typeColors[event.type] ?? 'rgba(140, 170, 200, 0.4)';
        return (
          <div
            key={event.id}
            style={{
              display: 'flex', gap: 6, padding: '4px 2px',
              borderLeft: `2px solid ${color}`,
              paddingLeft: 6, marginBottom: 2,
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <span style={{ fontSize: 12, lineHeight: '16px', flexShrink: 0 }}>
              {event.icon}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1,
              }}>
                <span style={{
                  fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
                  color: 'rgba(200, 215, 240, 0.85)',
                }}>
                  {event.title}
                </span>
                <span style={{
                  fontSize: 8, fontFamily: 'monospace',
                  color: 'rgba(140, 170, 200, 0.35)',
                }}>
                  Gen {event.generation}
                </span>
              </div>
              <div style={{
                fontSize: 9, fontFamily: 'monospace',
                color: 'rgba(140, 170, 200, 0.45)',
                lineHeight: '1.3',
              }}>
                {event.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
