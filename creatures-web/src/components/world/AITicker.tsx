import { useState, useEffect, useRef, useCallback } from 'react';
import { useWorldStore } from '../../stores/worldStore';

// ---------------------------------------------------------------------------
// AITicker — Live commentary bar at the bottom of the world view
//
// Displays a scrolling feed of AI observations from the god agent
// narratives and emergent behavior events. Always visible, never blocks
// interaction. Like a nature documentary narrator.
// ---------------------------------------------------------------------------

interface TickerItem {
  id: number;
  text: string;
  type: 'narrative' | 'event' | 'milestone' | 'insight';
  timestamp: number;
}

let nextId = 0;

export function AITicker() {
  const narratives = useWorldStore((s) => s.narratives);
  const emergentEvents = useWorldStore((s) => s.emergentEvents);
  const organisms = useWorldStore((s) => s.organisms);
  const populationStats = useWorldStore((s) => s.populationStats);
  const step = useWorldStore((s) => s.step);

  const [items, setItems] = useState<TickerItem[]>([]);
  const prevNarrativesLen = useRef(0);
  const prevEventsLen = useRef(0);
  const prevPopulation = useRef(0);
  const prevGeneration = useRef(0);

  // Process new narratives from god agent
  useEffect(() => {
    if (narratives.length <= prevNarrativesLen.current) {
      prevNarrativesLen.current = narratives.length;
      return;
    }

    const newNarratives = narratives.slice(prevNarrativesLen.current);
    prevNarrativesLen.current = narratives.length;

    const newItems: TickerItem[] = newNarratives.map((n: any) => ({
      id: nextId++,
      text: n.analysis || n.text || n.message || (typeof n === 'string' ? n : JSON.stringify(n)),
      type: 'narrative' as const,
      timestamp: Date.now(),
    }));

    setItems((prev) => [...newItems, ...prev].slice(0, 20));
  }, [narratives]);

  // Process emergent behavior events
  useEffect(() => {
    if (emergentEvents.length <= prevEventsLen.current) {
      prevEventsLen.current = emergentEvents.length;
      return;
    }

    const newEvents = emergentEvents.slice(prevEventsLen.current);
    prevEventsLen.current = emergentEvents.length;

    const newItems: TickerItem[] = newEvents.map((ev) => ({
      id: nextId++,
      text: `${ev.behavior_type.replace(/_/g, ' ')} detected (${(ev.confidence * 100).toFixed(0)}% confidence) \u2014 ${ev.description}`,
      type: 'event' as const,
      timestamp: Date.now(),
    }));

    setItems((prev) => [...newItems, ...prev].slice(0, 20));
  }, [emergentEvents]);

  // Generate milestone observations from population changes
  useEffect(() => {
    const pop = organisms.length;
    const prev = prevPopulation.current;
    prevPopulation.current = pop;

    if (prev === 0) return;

    const delta = pop - prev;
    const pctChange = prev > 0 ? Math.abs(delta) / prev : 0;

    // Only report significant changes
    if (pctChange >= 0.15 && Math.abs(delta) >= 5) {
      const item: TickerItem = {
        id: nextId++,
        text: delta > 0
          ? `Population surge: ${pop} organisms (+${delta}, ${(pctChange * 100).toFixed(0)}% growth)`
          : `Population decline: ${pop} organisms (${delta}, ${(pctChange * 100).toFixed(0)}% loss)`,
        type: 'milestone' as const,
        timestamp: Date.now(),
      };
      setItems((prev) => [item, ...prev].slice(0, 20));
    }

    // Extinction warning
    if (pop === 0 && prev > 0) {
      setItems((prev) => [{
        id: nextId++,
        text: 'EXTINCTION \u2014 All organisms have perished. The brain-world is silent.',
        type: 'milestone' as const,
        timestamp: Date.now(),
      }, ...prev].slice(0, 20));
    }
  }, [organisms.length]);

  // Generation milestones
  useEffect(() => {
    const gen = populationStats?.max_generation ?? 0;
    const prev = prevGeneration.current;
    prevGeneration.current = gen;

    if (gen > prev && gen > 0 && gen % 10 === 0) {
      setItems((prevItems) => [{
        id: nextId++,
        text: `Generation ${gen} reached \u2014 ${populationStats?.n_lineages ?? '?'} lineages competing`,
        type: 'milestone' as const,
        timestamp: Date.now(),
      }, ...prevItems].slice(0, 20));
    }
  }, [populationStats?.max_generation]);

  // Auto-remove stale items (older than 30s)
  useEffect(() => {
    const iv = setInterval(() => {
      const cutoff = Date.now() - 30000;
      setItems((prev) => {
        const filtered = prev.filter((item) => item.timestamp > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  if (items.length === 0) return null;

  const typeColors: Record<string, string> = {
    narrative: 'rgba(180, 140, 255, 0.85)',
    event: 'rgba(0, 212, 255, 0.85)',
    milestone: 'rgba(255, 200, 100, 0.85)',
    insight: 'rgba(0, 255, 136, 0.85)',
  };

  const typeIcons: Record<string, string> = {
    narrative: '\u{1F9E0}', // brain
    event: '\u{1F52C}',     // microscope
    milestone: '\u{1F4CA}', // chart
    insight: '\u{2728}',    // sparkles
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 28,
        left: 0,
        right: 0,
        height: 32,
        background: 'rgba(3, 3, 8, 0.85)',
        borderTop: '1px solid rgba(80, 130, 200, 0.08)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        zIndex: 15,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          animation: items.length > 1 ? 'ticker-scroll 20s linear infinite' : 'none',
          paddingLeft: 16,
          whiteSpace: 'nowrap',
        }}
      >
        {/* AI label */}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(180, 140, 255, 0.5)',
            letterSpacing: 1,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          AI OBSERVER
        </span>

        {/* Latest items */}
        {items.slice(0, 5).map((item) => (
          <span
            key={item.id}
            style={{
              fontSize: 11,
              fontFamily: '"SF Mono", "Fira Code", monospace',
              color: typeColors[item.type] ?? 'rgba(200, 220, 240, 0.7)',
              flexShrink: 0,
            }}
          >
            <span style={{ marginRight: 6 }}>{typeIcons[item.type] ?? '\u2022'}</span>
            {item.text}
          </span>
        ))}
      </div>

      {/* CSS animation for scrolling */}
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
