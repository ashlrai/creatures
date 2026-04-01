// ============================================================================
// Museum — main shell for the "Night at the Museum" experiential encyclopedia
// Renders when appMode === 'museum'
// ============================================================================

import React, { useState, useRef, useEffect, Suspense } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { MASTERY_LEVELS } from '../../data/knowledge-graph';
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

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  shell: {
    position: 'fixed' as const,
    inset: 0,
    background: '#0a0a0f',
    color: '#e8e6e3',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: 56,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(10,10,15,0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    flexShrink: 0,
    zIndex: 10,
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    background: 'linear-gradient(135deg, #00e5ff, #7c4dff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    cursor: 'pointer',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  breadcrumb: {
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
    transition: 'all 0.15s',
    color: 'rgba(255,255,255,0.4)',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: 12,
  },
  breadcrumbActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  navButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  navBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
  },
  navBtnActive: {
    background: 'rgba(124,77,255,0.15)',
    borderColor: 'rgba(124,77,255,0.3)',
    color: '#b388ff',
    boxShadow: 'inset 0 -2px 0 0 #7c4dff',
  },
  xpSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 12,
  },
  xpBar: {
    width: 100,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #7c4dff, #00e5ff)',
    transition: 'width 0.5s ease',
  },
  levelBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 8,
    background: 'rgba(124,77,255,0.1)',
    border: '1px solid rgba(124,77,255,0.2)',
    fontSize: 11,
    fontWeight: 600,
    color: '#b388ff',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    position: 'relative' as const,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 16,
    color: 'rgba(255,255,255,0.3)',
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '-0.02em',
  },
  placeholderSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.2)',
  },
};

// ── Placeholder Component ───────────────────────────────────────────────────

function Placeholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={styles.placeholder}>
      <div style={styles.placeholderTitle}>{title}</div>
      {subtitle && <div style={styles.placeholderSub}>{subtitle}</div>}
    </div>
  );
}

// ── 3D Loading Fallback ─────────────────────────────────────────────────────

function TimelineLoadingFallback() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0f', gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '2px solid rgba(124,77,255,0.15)',
        borderTopColor: '#7c4dff',
        animation: 'museum-spinner 0.8s linear infinite',
      }} />
      <div style={{
        fontSize: 13, color: 'rgba(255,255,255,0.3)',
        fontFamily: "'Inter', sans-serif", letterSpacing: '0.05em',
      }}>
        Initializing timeline...
      </div>
      <style>{`@keyframes museum-spinner { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Museum Shell ────────────────────────────────────────────────────────────

export function Museum() {
  const { view, breadcrumbs, xp, level, title, navigate, goBack, activeConversation,
    selectedEraId, selectedEventId, selectedPersonId, selectedArtifactId } = useMuseumStore();
  const [timeline3D, setTimeline3D] = useState(true);
  const { open: searchOpen, setOpen: setSearchOpen } = useSearchModal();
  const contentRef = useRef<HTMLDivElement>(null);

  // Derive a stable transition key from current view + entity
  const selectedId = selectedEraId || selectedEventId || selectedPersonId || selectedArtifactId || '';
  const transitionKey = `${view}::${selectedId}::${timeline3D}`;

  // Scroll content area to top on navigation
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view, selectedId]);

  // Calculate XP progress to next level
  const currentLevelInfo = MASTERY_LEVELS.find(m => m.level === level) ?? MASTERY_LEVELS[0];
  const nextLevelInfo = MASTERY_LEVELS.find(m => m.level === level + 1);
  const xpIntoLevel = xp - currentLevelInfo.xpRequired;
  const xpForLevel = nextLevelInfo
    ? nextLevelInfo.xpRequired - currentLevelInfo.xpRequired
    : 1;
  const xpPercent = nextLevelInfo
    ? Math.min(100, (xpIntoLevel / xpForLevel) * 100)
    : 100;

  const navItems = [
    { key: 'timeline', label: 'Timeline' },
    { key: 'alchemy', label: 'Alchemy' },
    { key: 'quests', label: 'Quests' },
    { key: 'trivia', label: 'Trivia' },
    { key: 'battle', label: 'Battle' },
    { key: 'paths', label: 'Paths' },
    { key: 'hall-of-life', label: 'Hall of Life' },
  ] as const;

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
    <div style={styles.shell}>
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <div style={styles.topBar}>
        <div style={styles.logoSection}>
          <div style={styles.logo} onClick={() => navigate('timeline')}>
            NEUREVO
          </div>

          {/* Mode Switcher — escape hatch back to other app modes */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'rgba(255,255,255,0.04)', borderRadius: 6,
            padding: '2px 3px', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {(['sim', 'evo', 'eco'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => window.dispatchEvent(new CustomEvent('neurevo-mode', { detail: { mode } }))}
                style={{
                  padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: 'transparent', color: 'rgba(255,255,255,0.35)',
                  fontSize: 10, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.03em',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {{ sim: 'Sim', evo: 'Evolve', eco: 'World' }[mode]}
              </button>
            ))}
          </div>

          {/* Breadcrumbs */}
          <div style={styles.breadcrumbs}>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ opacity: 0.3 }}>/</span>}
                <button
                  style={{
                    ...styles.breadcrumb,
                    ...(i === breadcrumbs.length - 1 ? styles.breadcrumbActive : {}),
                  }}
                  onClick={() => {
                    if (i < breadcrumbs.length - 1) {
                      // Navigate back to this crumb
                      navigate(crumb.view, crumb.id);
                    }
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.color =
                      i === breadcrumbs.length - 1
                        ? 'rgba(255,255,255,0.8)'
                        : 'rgba(255,255,255,0.4)';
                  }}
                >
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Nav Buttons */}
        <div style={styles.navButtons}>
          {navItems.map(item => (
            <button
              key={item.key}
              style={{
                ...styles.navBtn,
                ...(view === item.key ? styles.navBtnActive : {}),
              }}
              onClick={() => navigate(item.key)}
              onMouseEnter={(e) => {
                if (view !== item.key) {
                  (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.8)';
                }
              }}
              onMouseLeave={(e) => {
                if (view !== item.key) {
                  (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                  (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.6)';
                }
              }}
            >
              {item.label}
            </button>
          ))}

          {/* 3D / Card toggle — only when on timeline view */}
          {view === 'timeline' && (
            <button
              style={{
                ...styles.navBtn,
                marginLeft: 8,
                background: 'rgba(124,77,255,0.1)',
                borderColor: 'rgba(124,77,255,0.25)',
                color: '#b388ff',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={() => setTimeline3D(prev => !prev)}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = 'rgba(124,77,255,0.2)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = 'rgba(124,77,255,0.1)';
              }}
            >
              {timeline3D ? 'Card View' : '3D View'}
            </button>
          )}
        </div>

        {/* Search button */}
        <button
          onClick={() => setSearchOpen(true)}
          style={{
            ...styles.navBtn,
            display: 'flex', alignItems: 'center', gap: 6,
            marginLeft: 'auto',
          }}
        >
          {'\u{1F50D}'} <span style={{ opacity: 0.5, fontSize: 10 }}>Cmd+K</span>
        </button>

        {/* XP / Level Display */}
        <div style={styles.xpSection}>
          <div style={styles.levelBadge}>
            <span>{currentLevelInfo.badge}</span>
            <span>Lv.{level}</span>
            <span style={{ fontWeight: 400, opacity: 0.7 }}>{title}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={styles.xpBar}>
              <div style={{ ...styles.xpFill, width: `${xpPercent}%` }} />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'right' as const }}>
              {xp} XP
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Area ──────────────────────────────────────────────── */}
      <div ref={contentRef} style={styles.content}>
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
