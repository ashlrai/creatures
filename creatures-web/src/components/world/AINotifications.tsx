import { useState, useEffect, useRef } from 'react';
import { useWorldStore } from '../../stores/worldStore';

// ---------------------------------------------------------------------------
// AINotifications — Toast-style notifications for significant events
//
// Watches for high-signal events and displays prominent, auto-dismissing
// notifications. Only speaks up when something genuinely interesting
// happens — speciation, extinction risk, fitness breakthroughs, anomalies.
// ---------------------------------------------------------------------------

interface Notification {
  id: number;
  title: string;
  body: string;
  priority: 'critical' | 'high' | 'normal';
  timestamp: number;
}

let nextNotifId = 0;

/** Auto-dismiss durations by priority */
const DISMISS_MS: Record<string, number> = {
  critical: 8000,
  high: 5000,
  normal: 3500,
};

export function AINotifications() {
  const organisms = useWorldStore((s) => s.organisms);
  const emergentEvents = useWorldStore((s) => s.emergentEvents);
  const populationStats = useWorldStore((s) => s.populationStats);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const prevPopulation = useRef(0);
  const prevGeneration = useRef(0);
  const prevLineages = useRef(0);
  const prevEventsLen = useRef(0);

  const addNotification = (
    title: string,
    body: string,
    priority: Notification['priority'] = 'normal',
  ) => {
    const id = nextNotifId++;
    const notif: Notification = { id, title, body, priority, timestamp: Date.now() };
    setNotifications((prev) => [notif, ...prev].slice(0, 5));

    // Auto-dismiss
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, DISMISS_MS[priority]);
  };

  // Population events
  useEffect(() => {
    const pop = organisms.length;
    const prev = prevPopulation.current;
    prevPopulation.current = pop;

    if (prev === 0) return;

    // Extinction
    if (pop === 0 && prev > 0) {
      addNotification(
        'EXTINCTION EVENT',
        `All ${prev} organisms have perished. The ecosystem is empty.`,
        'critical',
      );
      return;
    }

    // Mass die-off (>30% population loss)
    const loss = prev - pop;
    if (loss > 0 && loss / prev > 0.3 && loss >= 10) {
      addNotification(
        'Mass Die-off',
        `Population dropped ${((loss / prev) * 100).toFixed(0)}% (${prev} \u2192 ${pop})`,
        'high',
      );
    }

    // Population boom (>50% growth)
    const gain = pop - prev;
    if (gain > 0 && gain / prev > 0.5 && gain >= 10) {
      addNotification(
        'Population Boom',
        `Population surged ${((gain / prev) * 100).toFixed(0)}% (${prev} \u2192 ${pop})`,
        'normal',
      );
    }
  }, [organisms.length]);

  // Generation milestones
  useEffect(() => {
    const gen = populationStats?.max_generation ?? 0;
    const prev = prevGeneration.current;
    prevGeneration.current = gen;

    // Every 25 generations
    if (gen > prev && gen >= 25 && gen % 25 === 0) {
      addNotification(
        `Generation ${gen}`,
        `${populationStats?.n_lineages ?? '?'} lineages | Mean energy: ${(populationStats?.mean_energy ?? 0).toFixed(1)}`,
        'normal',
      );
    }
  }, [populationStats?.max_generation]);

  // Lineage changes (speciation / extinction of lineages)
  useEffect(() => {
    const lineages = populationStats?.n_lineages ?? 0;
    const prev = prevLineages.current;
    prevLineages.current = lineages;

    if (prev === 0) return;

    if (lineages > prev && lineages - prev >= 3) {
      addNotification(
        'Speciation Event',
        `${lineages - prev} new lineages emerged (${prev} \u2192 ${lineages} total)`,
        'high',
      );
    }

    if (lineages < prev && prev - lineages >= 3) {
      addNotification(
        'Lineage Extinction',
        `${prev - lineages} lineages went extinct (${prev} \u2192 ${lineages} remaining)`,
        'high',
      );
    }

    // Monoculture warning
    if (lineages === 1 && prev > 1) {
      addNotification(
        'Monoculture',
        'Only one lineage survives. Genetic diversity is gone.',
        'critical',
      );
    }
  }, [populationStats?.n_lineages]);

  // High-confidence emergent behaviors
  useEffect(() => {
    if (emergentEvents.length <= prevEventsLen.current) {
      prevEventsLen.current = emergentEvents.length;
      return;
    }

    const newEvents = emergentEvents.slice(prevEventsLen.current);
    prevEventsLen.current = emergentEvents.length;

    for (const ev of newEvents) {
      if (ev.confidence >= 0.85) {
        addNotification(
          ev.behavior_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          ev.description,
          ev.confidence >= 0.95 ? 'high' : 'normal',
        );
      }
    }
  }, [emergentEvents]);

  if (notifications.length === 0) return null;

  const priorityStyles: Record<string, { bg: string; border: string; glow: string }> = {
    critical: {
      bg: 'rgba(180, 30, 30, 0.15)',
      border: 'rgba(255, 80, 80, 0.3)',
      glow: '0 0 20px rgba(255, 60, 60, 0.15)',
    },
    high: {
      bg: 'rgba(30, 60, 120, 0.15)',
      border: 'rgba(80, 160, 255, 0.25)',
      glow: '0 0 16px rgba(80, 160, 255, 0.1)',
    },
    normal: {
      bg: 'rgba(6, 8, 18, 0.92)',
      border: 'rgba(80, 130, 200, 0.15)',
      glow: 'none',
    },
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        right: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 340,
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      {notifications.map((notif, i) => {
        const style = priorityStyles[notif.priority] ?? priorityStyles.normal;
        return (
          <div
            key={notif.id}
            style={{
              background: style.bg,
              backdropFilter: 'blur(20px)',
              border: `1px solid ${style.border}`,
              borderRadius: 10,
              padding: '10px 16px',
              boxShadow: style.glow,
              opacity: 1 - i * 0.15,
              transition: 'opacity 0.3s, transform 0.3s',
              animation: 'notif-slide-in 0.3s ease-out',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  notif.priority === 'critical'
                    ? '#ff6666'
                    : notif.priority === 'high'
                      ? '#6699ff'
                      : 'rgba(220, 235, 255, 0.9)',
                fontFamily: '"SF Mono", "Fira Code", monospace',
                marginBottom: 4,
              }}
            >
              {notif.title}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(180, 200, 220, 0.7)',
                fontFamily: '"SF Mono", "Fira Code", monospace',
                lineHeight: 1.4,
              }}
            >
              {notif.body}
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes notif-slide-in {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
