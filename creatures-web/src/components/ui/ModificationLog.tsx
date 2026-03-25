import { useState, useMemo } from 'react';
import { useCircuitModificationStore, type ModificationType } from '../../stores/circuitModificationStore';

// --- Helpers ---

const TYPE_COLORS: Record<ModificationType, string> = {
  lesion: '#ff4466',
  stimulate: 'var(--accent-cyan)',
  silence: 'var(--accent-amber)',
  record: 'var(--accent-green)',
};

const TYPE_BG: Record<ModificationType, string> = {
  lesion: 'rgba(255,68,102,0.12)',
  stimulate: 'rgba(0,212,255,0.1)',
  silence: 'rgba(255,170,34,0.1)',
  record: 'rgba(0,255,136,0.1)',
};

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatNeuronIds(ids: string[]): string {
  if (ids.length <= 3) return ids.join(', ');
  return `${ids.slice(0, 3).join(', ')} +${ids.length - 3} more`;
}

// --- Inline SVG icons ---

const UndoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 8h7a4 4 0 010 8H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M8 5L5 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const RedoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 8H8a4 4 0 000 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M12 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// --- Component ---

export function ModificationLog() {
  const modifications = useCircuitModificationStore((s) => s.modifications);
  const undoStack = useCircuitModificationStore((s) => s.undoStack);
  const redoStack = useCircuitModificationStore((s) => s.redoStack);
  const undo = useCircuitModificationStore((s) => s.undo);
  const redo = useCircuitModificationStore((s) => s.redo);

  const [expanded, setExpanded] = useState(false);

  // Force re-render every 10s so relative times stay fresh
  const [, setTick] = useState(0);
  useMemo(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reversed = useMemo(() => [...modifications].reverse(), [modifications]);

  // The most recent modification is the only one with a direct "revert" (undo)
  const mostRecentId = undoStack.length > 0 ? undoStack[undoStack.length - 1].id : null;

  return (
    <div className="glass">
      <button
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="glass-label" style={{ margin: 0 }}>
          Circuit Log
          {modifications.length > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-cyan)',
                fontWeight: 700,
              }}
            >
              ({modifications.length})
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-label)',
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {/* Undo / Redo row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button
              className="btn btn-ghost"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                fontSize: 10,
                padding: '4px 0',
              }}
              disabled={undoStack.length === 0}
              onClick={undo}
            >
              <UndoIcon /> Undo
            </button>
            <button
              className="btn btn-ghost"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                fontSize: 10,
                padding: '4px 0',
              }}
              disabled={redoStack.length === 0}
              onClick={redo}
            >
              <RedoIcon /> Redo
            </button>
          </div>

          {/* Modification list */}
          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {reversed.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-label)',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '12px 0',
                }}
              >
                No modifications yet
              </div>
            ) : (
              reversed.map((mod) => (
                <div
                  key={mod.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-subtle)',
                    transition: 'border-color 0.15s',
                  }}
                >
                  {/* Left: type badge + details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {/* Type badge */}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: TYPE_BG[mod.type],
                          color: TYPE_COLORS[mod.type],
                          flexShrink: 0,
                        }}
                      >
                        {mod.type}
                      </span>
                      {/* Relative time */}
                      <span
                        style={{
                          fontSize: 9,
                          color: 'var(--text-label)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {relativeTime(mod.timestamp)}
                      </span>
                    </div>
                    {/* Neuron IDs */}
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatNeuronIds(mod.neuronIds)}
                    </div>
                  </div>

                  {/* Revert button — only for the most recent undoable modification */}
                  {mod.id === mostRecentId && (
                    <button
                      title="Revert this modification"
                      onClick={undo}
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 5,
                        cursor: 'pointer',
                        color: 'var(--text-label)',
                        transition: 'all 0.15s',
                        padding: 0,
                        marginTop: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,68,102,0.12)';
                        e.currentTarget.style.borderColor = 'rgba(255,68,102,0.3)';
                        e.currentTarget.style.color = '#ff4466';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        e.currentTarget.style.borderColor = 'var(--border-subtle)';
                        e.currentTarget.style.color = 'var(--text-label)';
                      }}
                    >
                      <UndoIcon />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
