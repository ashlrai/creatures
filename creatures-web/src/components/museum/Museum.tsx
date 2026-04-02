// ============================================================================
// Museum — main shell for the "Night at the Museum" experiential encyclopedia
// Renders when appMode === 'museum'
// ============================================================================

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useMuseumStore, MuseumView } from '../../stores/museumStore';
import { MASTERY_LEVELS } from '../../data/knowledge-graph';
import { ERA_MAP, EVENT_MAP, PERSON_MAP, ARTIFACT_MAP, CONCEPT_MAP } from '../../data/halls/index';
import { TimelineLanding } from './TimelineLanding';
import { TimelineRiver } from './TimelineRiver';
import { EraView } from './EraView';
import { EventView } from './EventView';
import { PersonView } from './PersonView';
import { ArtifactView } from './ArtifactView';
import { ConceptView } from './ConceptView';
import { AlchemyWorkbench } from './AlchemyWorkbench';
import { QuestDashboard } from './QuestDashboard';
import { CharacterChat } from './CharacterChat';
import { SearchModal, useSearchModal } from './SearchModal';
import { HallOfLife } from './HallOfLife';
import { TriviaView } from './TriviaView';
import { BattleView } from './BattleView';
import { PathsView } from './PathsView';
import { TodayInHistory } from './TodayInHistory';
import { PageTransition } from './PageTransition';

// ── Resolve entity ID to human-readable name ──────────────────────────────

function resolveEntityName(view: MuseumView, id: string | null): string | null {
  if (!id) return null;
  switch (view) {
    case 'era':      return ERA_MAP.get(id)?.name ?? null;
    case 'event':    return EVENT_MAP.get(id)?.title ?? null;
    case 'person':   return PERSON_MAP.get(id)?.name ?? null;
    case 'artifact': return ARTIFACT_MAP.get(id)?.name ?? null;
    case 'concept':  return CONCEPT_MAP.get(id)?.name ?? null;
    default:         return null;
  }
}

// ── Nav items for secondary bar ────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'timeline', label: 'Timeline', icon: '\u23F3' },
  { key: 'alchemy', label: 'Alchemy', icon: '\u2697\uFE0F' },
  { key: 'quests', label: 'Quests', icon: '\u{1F5FA}\uFE0F' },
  { key: 'trivia', label: 'Trivia', icon: '\u{1F9E0}' },
  { key: 'battle', label: 'Battle', icon: '\u2694\uFE0F' },
  { key: 'paths', label: 'Paths', icon: '\u{1F6A9}' },
  { key: 'hall-of-life', label: 'Hall of Life', icon: '\u{1F331}' },
] as const;

// ── 3D Loading Fallback ─────────────────────────────────────────────────────

function TimelineLoadingFallback() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#050510',
      gap: 24,
    }}>
      {/* Title */}
      <div style={{
        fontSize: 15, fontWeight: 600,
        letterSpacing: '0.25em',
        color: 'rgba(167,139,250,0.7)',
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase' as const,
      }}>
        The River of Time
      </div>

      {/* Pulsing dot cluster */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'rgba(167,139,250,0.5)',
            animation: `museum-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      {/* Subtle subtitle */}
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.2)',
        fontFamily: "'Inter', sans-serif", letterSpacing: '0.04em',
        fontWeight: 400,
      }}>
        Preparing 3D environment
      </div>

      <style>{`
        @keyframes museum-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Museum Shell ────────────────────────────────────────────────────────────

export function Museum() {
  const { view, breadcrumbs, xp, level, title, navigate, goBack, activeConversation,
    selectedEraId, selectedEventId, selectedPersonId, selectedArtifactId } = useMuseumStore();
  const [timeline3D, setTimeline3D] = useState(true);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const { open: searchOpen, setOpen: setSearchOpen } = useSearchModal();
  const contentRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  const selectedId = selectedEraId || selectedEventId || selectedPersonId || selectedArtifactId || '';
  const transitionKey = `${view}::${selectedId}::${timeline3D}`;

  // Scroll content area to top on navigation
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view, selectedId]);

  // Close mode menu on outside click
  useEffect(() => {
    if (!modeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modeMenuOpen]);

  // Calculate XP progress
  const currentLevelInfo = MASTERY_LEVELS.find(m => m.level === level) ?? MASTERY_LEVELS[0];
  const nextLevelInfo = MASTERY_LEVELS.find(m => m.level === level + 1);
  const xpIntoLevel = xp - currentLevelInfo.xpRequired;
  const xpForLevel = nextLevelInfo
    ? nextLevelInfo.xpRequired - currentLevelInfo.xpRequired
    : 1;
  const xpPercent = nextLevelInfo
    ? Math.min(100, (xpIntoLevel / xpForLevel) * 100)
    : 100;

  function renderContent() {
    let content: React.ReactNode;
    switch (view) {
      case 'timeline':
        content = timeline3D
          ? <Suspense fallback={<TimelineLoadingFallback />}><TimelineRiver /></Suspense>
          : <TimelineLanding />;
        break;
      case 'era':
        content = <EraView />; break;
      case 'event':
        content = <EventView />; break;
      case 'person':
        content = <PersonView />; break;
      case 'artifact':
        content = <ArtifactView />; break;
      case 'concept':
        content = <ConceptView />; break;
      case 'alchemy':
        content = <AlchemyWorkbench />; break;
      case 'quests':
        content = <QuestDashboard />; break;
      case 'hall-of-life':
        content = <HallOfLife />; break;
      case 'trivia':
        content = <TriviaView />; break;
      case 'battle':
        content = <BattleView />; break;
      case 'paths':
        content = <PathsView />; break;
      default:
        content = <TimelineLanding />;
    }
    return (
      <PageTransition transitionKey={transitionKey}>
        {content}
      </PageTransition>
    );
  }

  return (
    <div style={{
      position: 'fixed' as const,
      inset: 0,
      background: '#08080d',
      color: '#e8e6e3',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    }}>
      {/* ── Primary Top Bar ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: 52,
        background: 'linear-gradient(180deg, rgba(18,16,28,0.98) 0%, rgba(12,11,20,0.96) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        flexShrink: 0,
        zIndex: 20,
        gap: 16,
      }}>
        {/* Logo + Mode menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
          <div
            onClick={() => navigate('timeline')}
            style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '0.06em',
              background: 'linear-gradient(135deg, #a78bfa 0%, #60a5fa 50%, #34d399 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              userSelect: 'none' as const,
            }}
          >
            NEUREVO
          </div>

          {/* Tiny mode switcher dropdown */}
          <div ref={modeMenuRef} style={{ position: 'relative' as const }}>
            <button
              onClick={() => setModeMenuOpen(prev => !prev)}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
                background: modeMenuOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
              }}
              onMouseLeave={e => {
                if (!modeMenuOpen) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                }
              }}
              title="Switch mode"
            >
              {'\u2630'}
            </button>
            {modeMenuOpen && (
              <div style={{
                position: 'absolute' as const,
                top: 34, left: 0,
                background: 'rgba(22,20,36,0.98)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: 4,
                minWidth: 130,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(20px)',
                zIndex: 100,
              }}>
                {([
                  { mode: 'sim', label: 'Simulation', icon: '\u{1F9EA}' },
                  { mode: 'evo', label: 'Evolution', icon: '\u{1F9EC}' },
                  { mode: 'eco', label: 'World', icon: '\u{1F30D}' },
                ] as const).map(item => (
                  <button
                    key={item.mode}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('neurevo-mode', { detail: { mode: item.mode } }));
                      setModeMenuOpen(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 12px', borderRadius: 7,
                      border: 'none', background: 'transparent',
                      color: 'rgba(255,255,255,0.65)', fontSize: 12.5,
                      fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.12s', textAlign: 'left' as const,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(167,139,250,0.12)';
                      e.currentTarget.style.color = '#e8e6e3';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Breadcrumbs — center-left */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12.5, color: 'rgba(255,255,255,0.35)',
          flex: 1,
        }}>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span style={{ opacity: 0.25, fontSize: 10, margin: '0 2px' }}>
                  {'\u203A'}
                </span>
              )}
              <button
                style={{
                  cursor: i < breadcrumbs.length - 1 ? 'pointer' : 'default',
                  padding: '3px 7px',
                  borderRadius: 5,
                  transition: 'all 0.15s',
                  color: i === breadcrumbs.length - 1
                    ? 'rgba(255,255,255,0.75)'
                    : 'rgba(255,255,255,0.35)',
                  fontWeight: i === breadcrumbs.length - 1 ? 500 : 400,
                  background: 'none',
                  border: 'none',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                }}
                onClick={() => {
                  if (i < breadcrumbs.length - 1) navigate(crumb.view, crumb.id);
                }}
                onMouseEnter={(e) => {
                  if (i < breadcrumbs.length - 1) {
                    (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
                    (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'none';
                  (e.target as HTMLElement).style.color =
                    i === breadcrumbs.length - 1
                      ? 'rgba(255,255,255,0.75)'
                      : 'rgba(255,255,255,0.35)';
                }}
              >
                {resolveEntityName(crumb.view, crumb.id) ?? crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Right section: search + view toggle + XP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 3D/Card icon toggle */}
          {view === 'timeline' && (
            <button
              onClick={() => setTimeline3D(prev => !prev)}
              title={timeline3D ? 'Switch to card view' : 'Switch to 3D view'}
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid rgba(167,139,250,0.2)',
                background: 'rgba(167,139,250,0.08)',
                color: '#c4b5fd',
                fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(167,139,250,0.18)';
                e.currentTarget.style.borderColor = 'rgba(167,139,250,0.35)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(167,139,250,0.08)';
                e.currentTarget.style.borderColor = 'rgba(167,139,250,0.2)';
              }}
            >
              {timeline3D ? '\u{1F4CB}' : '\u{1F30C}'}
            </button>
          )}

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: 400,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
            }}
          >
            <span style={{ fontSize: 12.5 }}>{'\u{1F50D}'}</span>
            Search
            <span style={{
              fontSize: 10, opacity: 0.4,
              padding: '1px 5px', borderRadius: 3,
              background: 'rgba(255,255,255,0.06)',
              fontWeight: 500,
            }}>
              {'\u2318'}K
            </span>
          </button>

          {/* Divider */}
          <div style={{
            width: 1, height: 24,
            background: 'rgba(255,255,255,0.06)',
          }} />

          {/* Level + XP */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(167,139,250,0.1) 0%, rgba(96,165,250,0.08) 100%)',
              border: '1px solid rgba(167,139,250,0.15)',
            }}>
              <span style={{ fontSize: 13 }}>{currentLevelInfo.badge}</span>
              <span style={{
                fontSize: 11.5, fontWeight: 700,
                color: '#c4b5fd', letterSpacing: '0.01em',
              }}>
                Lv.{level}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 400,
                color: 'rgba(196,181,253,0.6)',
              }}>
                {title}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <div style={{
                width: 80, height: 3, borderRadius: 2,
                background: 'rgba(255,255,255,0.05)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
                  width: `${xpPercent}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{
                fontSize: 9.5, color: 'rgba(255,255,255,0.25)',
                textAlign: 'right' as const, fontWeight: 500,
              }}>
                {xp} XP
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Secondary Navigation Bar ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: 40,
        background: 'rgba(12,11,20,0.6)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        flexShrink: 0,
        gap: 2,
        zIndex: 15,
      }}>
        {NAV_ITEMS.map(item => {
          const isActive = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 14px',
                borderRadius: 6,
                border: 'none',
                background: isActive
                  ? 'rgba(167,139,250,0.12)'
                  : 'transparent',
                color: isActive
                  ? '#c4b5fd'
                  : 'rgba(255,255,255,0.4)',
                fontSize: 12,
                fontWeight: isActive ? 600 : 450,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.18s',
                position: 'relative' as const,
                letterSpacing: '0.005em',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                }
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>{item.icon}</span>
              {item.label}
              {/* Active indicator bar */}
              {isActive && (
                <div style={{
                  position: 'absolute' as const,
                  bottom: -1, left: 10, right: 10, height: 2,
                  borderRadius: 1,
                  background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content Area ──────────────────────────────────────────────── */}
      <div ref={contentRef} style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative' as const,
      }}>
        {renderContent()}
      </div>

      {/* ── Today in History (timeline views only) ────────────────────── */}
      {view === 'timeline' && <TodayInHistory />}

      {/* ── Character Chat Panel (overlay) ────────────────────────────── */}
      {activeConversation && <CharacterChat />}

      {/* ── Search Modal (Cmd+K) ────────────────────────────────────── */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
