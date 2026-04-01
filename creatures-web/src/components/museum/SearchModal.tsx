import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { ALL_EVENTS, ALL_PEOPLE, ALL_ARTIFACTS, ALL_CONCEPTS, ERA_MAP } from '../../data/halls/index';
import type { HistoricalEvent, HistoricalPerson, Artifact, Concept } from '../../data/knowledge-graph';

// ============================================================================
// SearchModal — Cmd+K global search across all 1,500+ entities
// ============================================================================

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'event' | 'person' | 'artifact' | 'concept';
  eraId?: string;
  score: number;
}

function searchEntities(query: string): SearchResult[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const e of ALL_EVENTS) {
    const titleMatch = e.title.toLowerCase().includes(q);
    const descMatch = e.description.toLowerCase().includes(q);
    if (titleMatch || descMatch) {
      results.push({
        id: e.id, title: e.title,
        subtitle: `${e.date} · ${ERA_MAP.get(e.eraId)?.name ?? e.eraId}`,
        type: 'event', eraId: e.eraId,
        score: titleMatch ? 2 : 1,
      });
    }
  }

  for (const p of ALL_PEOPLE) {
    const nameMatch = p.name.toLowerCase().includes(q);
    const descMatch = p.description.toLowerCase().includes(q);
    const roleMatch = p.roles.some(r => r.toLowerCase().includes(q));
    if (nameMatch || descMatch || roleMatch) {
      results.push({
        id: p.id, title: p.name,
        subtitle: `${p.roles.slice(0, 2).join(', ')} · ${p.born}–${p.died ?? '?'}`,
        type: 'person', eraId: p.eraIds[0],
        score: nameMatch ? 3 : roleMatch ? 2 : 1,
      });
    }
  }

  for (const a of ALL_ARTIFACTS) {
    const nameMatch = a.name.toLowerCase().includes(q);
    const descMatch = a.description.toLowerCase().includes(q);
    if (nameMatch || descMatch) {
      results.push({
        id: a.id, title: a.name,
        subtitle: `${a.type} · ${a.date}`,
        type: 'artifact', eraId: a.eraId,
        score: nameMatch ? 2 : 1,
      });
    }
  }

  for (const c of ALL_CONCEPTS) {
    const nameMatch = c.name.toLowerCase().includes(q);
    const descMatch = c.description.toLowerCase().includes(q);
    if (nameMatch || descMatch) {
      results.push({
        id: c.id, title: c.name,
        subtitle: `Concept · ${c.domainIds.join(', ')}`,
        type: 'concept',
        score: nameMatch ? 2 : 1,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

const TYPE_ICONS: Record<string, string> = {
  event: '\u{1F4C5}',
  person: '\u{1F464}',
  artifact: '\u{1F3FA}',
  concept: '\u{1F4A1}',
};

const TYPE_COLORS: Record<string, string> = {
  event: '#3498db',
  person: '#e74c3c',
  artifact: '#1abc9c',
  concept: '#9b59b6',
};

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useMuseumStore(s => s.navigate);

  const results = useMemo(() => searchEntities(query), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback((result: SearchResult) => {
    const viewMap: Record<string, 'event' | 'person' | 'artifact'> = {
      event: 'event', person: 'person', artifact: 'artifact',
    };
    const view = viewMap[result.type];
    if (view) {
      navigate(view, result.id);
    }
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && results[selectedIndex]) { handleSelect(results[selectedIndex]); return; }
  }, [results, selectedIndex, handleSelect, onClose]);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={styles.inputRow}>
          <span style={{ fontSize: 18, opacity: 0.4 }}>{'\u{1F50D}'}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search events, people, artifacts, concepts..."
            style={styles.input}
          />
          <kbd style={styles.kbd}>esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={styles.resultsList}>
            {results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  ...styles.resultItem,
                  background: i === selectedIndex ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderLeft: i === selectedIndex ? `2px solid ${TYPE_COLORS[r.type]}` : '2px solid transparent',
                }}
              >
                <span style={{ fontSize: 16, minWidth: 24 }}>{TYPE_ICONS[r.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#778', marginTop: 1 }}>{r.subtitle}</div>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: `${TYPE_COLORS[r.type]}15`, color: TYPE_COLORS[r.type],
                  textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em',
                }}>
                  {r.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.length >= 2 && results.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#556' }}>
            No results for "{query}"
          </div>
        )}

        {/* Hint */}
        {query.length < 2 && (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: '#445', fontSize: 12 }}>
            Search across 1,500+ historical events, figures, artifacts, and concepts
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <span><kbd style={styles.kbdSmall}>{'\u2191'}</kbd> <kbd style={styles.kbdSmall}>{'\u2193'}</kbd> navigate</span>
          <span><kbd style={styles.kbdSmall}>{'\u23CE'}</kbd> open</span>
          <span><kbd style={styles.kbdSmall}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// Hook to manage search modal visibility globally
export function useSearchModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return { open, setOpen };
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)', zIndex: 200,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: 120,
  },
  modal: {
    width: 560, maxHeight: 480, background: 'rgba(15, 13, 22, 0.98)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: '#e8e6e3', fontSize: 15, fontFamily: 'inherit',
  },
  kbd: {
    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: 'rgba(255,255,255,0.06)', color: '#667',
    border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit',
  },
  resultsList: {
    flex: 1, overflowY: 'auto', padding: '4px 0',
  },
  resultItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '10px 16px', border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    transition: 'background 0.1s',
  },
  footer: {
    display: 'flex', gap: 16, padding: '10px 18px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    fontSize: 11, color: '#445',
  },
  kbdSmall: {
    padding: '1px 5px', borderRadius: 3, fontSize: 10,
    background: 'rgba(255,255,255,0.05)', color: '#556',
    border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit',
  },
};
