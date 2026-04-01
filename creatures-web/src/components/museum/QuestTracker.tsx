import React, { useState } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { QUESTS } from '../../data/curriculum';

// ============================================================================
// QuestTracker — Floating overlay showing current quest progress
// Fixed bottom-right, collapsible, always visible during active quests
// ============================================================================

const OBJECTIVE_ICONS: Record<string, string> = {
  visit_event: '📍',
  talk_to_character: '💬',
  answer_question: '❓',
  discover_alchemy: '🧪',
  complete_path: '🗺️',
  find_connection: '🔗',
  watch_simulation: '🔬',
  solve_challenge: '🧩',
  cast_battle_vote: '⚔️',
  explore_era: '🌐',
  debate_character: '🗣️',
};

export const QuestTracker: React.FC = () => {
  const { activeQuestId, completedObjectiveIds, xp } = useMuseumStore();
  const [collapsed, setCollapsed] = useState(false);

  const quest = QUESTS.find(q => q.id === activeQuestId);
  if (!quest) return null;

  const completedCount = quest.objectives.filter(o => completedObjectiveIds.has(o.id)).length;
  const totalCount = quest.objectives.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  if (collapsed) {
    return (
      <div
        style={styles.collapsedRoot}
        onClick={() => setCollapsed(false)}
        title="Expand quest tracker"
      >
        <div style={styles.collapsedPulse} />
        <span style={styles.collapsedIcon}>📜</span>
        <span style={styles.collapsedCount}>{completedCount}/{totalCount}</span>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.questIcon}>📜</span>
          <span style={styles.questLabel}>ACTIVE QUEST</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={styles.collapseBtn}
          title="Minimize"
        >
          ▾
        </button>
      </div>

      {/* Quest title */}
      <div style={styles.titleRow}>
        <span style={styles.title}>{quest.title}</span>
      </div>

      {/* Progress bar */}
      <div style={styles.progressOuter}>
        <div style={{ ...styles.progressInner, width: `${progress * 100}%` }} />
      </div>

      {/* Objectives list (compact) */}
      <div style={styles.objectivesList}>
        {quest.objectives.map(obj => {
          const done = completedObjectiveIds.has(obj.id);
          const icon = OBJECTIVE_ICONS[obj.type] ?? '•';

          return (
            <div
              key={obj.id}
              style={{
                ...styles.objectiveRow,
                opacity: done ? 0.4 : 1,
              }}
            >
              <span style={styles.objCheck}>
                {done ? '✓' : icon}
              </span>
              <span
                style={{
                  ...styles.objText,
                  textDecoration: done ? 'line-through' : 'none',
                }}
              >
                {obj.description}
              </span>
              {obj.optional && !done && (
                <span style={styles.optionalStar}>⭐</span>
              )}
            </div>
          );
        })}
      </div>

      {/* XP counter */}
      <div style={styles.footer}>
        <span style={styles.xpCounter}>✦ {xp} XP</span>
        <span style={styles.progressText}>
          {completedCount}/{totalCount} objectives
        </span>
      </div>
    </div>
  );
};

// -- Styles -------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    width: 300,
    maxHeight: 420,
    background: 'rgba(15,15,20,0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
    zIndex: 1000,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(245,158,11,0.06)',
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },

  questIcon: {
    fontSize: 14,
  },

  questLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: '#F59E0B',
    letterSpacing: '0.12em',
  },

  collapseBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
  },

  titleRow: {
    padding: '10px 14px 6px',
  },

  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F5F5F5',
    lineHeight: 1.3,
  },

  progressOuter: {
    height: 3,
    margin: '0 14px 8px',
    borderRadius: 2,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },

  progressInner: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #F59E0B, #22C55E)',
    transition: 'width 0.5s ease',
  },

  objectivesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },

  objectiveRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    padding: '4px 0',
    transition: 'opacity 0.3s',
  },

  objCheck: {
    fontSize: 11,
    flexShrink: 0,
    marginTop: 1,
    width: 16,
    textAlign: 'center',
    color: '#22C55E',
  },

  objText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.4,
    flex: 1,
  },

  optionalStar: {
    fontSize: 10,
    flexShrink: 0,
  },

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },

  xpCounter: {
    fontSize: 13,
    fontWeight: 800,
    color: '#F59E0B',
    fontVariantNumeric: 'tabular-nums',
  },

  progressText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },

  // Collapsed state
  collapsedRoot: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: 'rgba(15,15,20,0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: 24,
    border: '1px solid rgba(245,158,11,0.25)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    cursor: 'pointer',
    zIndex: 1000,
    transition: 'transform 0.15s',
  },

  collapsedPulse: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#F59E0B',
    boxShadow: '0 0 8px rgba(245,158,11,0.5)',
    animation: 'pulse 2s infinite',
  },

  collapsedIcon: {
    fontSize: 16,
  },

  collapsedCount: {
    fontSize: 12,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.7)',
    fontVariantNumeric: 'tabular-nums',
  },
};

export default QuestTracker;
