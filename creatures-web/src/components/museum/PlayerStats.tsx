import React from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { MASTERY_LEVELS } from '../../data/knowledge-graph';

// ============================================================================
// PlayerStats — Reusable player progression display
// Shows level, title, XP bar, and quick summary stats
// ============================================================================

interface PlayerStatsProps {
  compact?: boolean;
}

export const PlayerStats: React.FC<PlayerStatsProps> = ({ compact = false }) => {
  const {
    xp, level, title,
    completedQuestIds, visitedEntityIds, discoveredAlchemyIds, achievementIds,
  } = useMuseumStore();

  const currentLevel = MASTERY_LEVELS.find(m => m.level === level) ?? MASTERY_LEVELS[0];
  const nextLevel = MASTERY_LEVELS.find(m => m.level === level + 1);
  const xpIntoLevel = xp - currentLevel.xpRequired;
  const xpForNext = nextLevel ? nextLevel.xpRequired - currentLevel.xpRequired : 1;
  const progress = nextLevel ? Math.min(xpIntoLevel / xpForNext, 1) : 1;

  if (compact) {
    return (
      <div style={styles.compactRoot}>
        <span style={styles.compactBadge}>{currentLevel.badge}</span>
        <span style={styles.compactLevel}>Lv.{level}</span>
        <div style={styles.compactBarOuter}>
          <div style={{ ...styles.compactBarInner, width: `${progress * 100}%` }} />
        </div>
        <span style={styles.compactXp}>{xp} XP</span>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Level badge */}
      <div style={styles.badgeContainer}>
        <div style={styles.levelCircle}>
          <span style={styles.levelNumber}>{level}</span>
        </div>
        <span style={styles.badgeEmoji}>{currentLevel.badge}</span>
      </div>

      {/* Title and XP */}
      <div style={styles.info}>
        <div style={styles.titleRow}>
          <span style={styles.title}>{title}</span>
          {nextLevel && (
            <span style={styles.xpText}>
              {xpIntoLevel} / {xpForNext} XP
            </span>
          )}
          {!nextLevel && (
            <span style={styles.xpText}>MAX LEVEL</span>
          )}
        </div>

        {/* XP progress bar */}
        <div style={styles.barOuter}>
          <div
            style={{
              ...styles.barInner,
              width: `${progress * 100}%`,
            }}
          />
          <div style={styles.barShine} />
        </div>

        {/* Quick stats */}
        <div style={styles.statsRow}>
          <StatPill label="Quests" value={completedQuestIds.size} icon="📜" />
          <StatPill label="Discovered" value={discoveredAlchemyIds.size} icon="🧪" />
          <StatPill label="Visited" value={visitedEntityIds.size} icon="📍" />
          <StatPill label="Achievements" value={achievementIds.size} icon="🏆" />
        </div>
      </div>
    </div>
  );
};

const StatPill: React.FC<{ label: string; value: number; icon: string }> = ({ label, value, icon }) => (
  <div style={styles.statPill}>
    <span style={styles.statIcon}>{icon}</span>
    <span style={styles.statValue}>{value}</span>
    <span style={styles.statLabel}>{label}</span>
  </div>
);

// -- Styles -------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 20px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
  },

  badgeContainer: {
    position: 'relative',
    flexShrink: 0,
  },

  levelCircle: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(245,158,11,0.3)',
    border: '2px solid rgba(255,255,255,0.2)',
  },

  levelNumber: {
    fontSize: 22,
    fontWeight: 800,
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },

  badgeEmoji: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    fontSize: 20,
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
  },

  info: {
    flex: 1,
    minWidth: 0,
  },

  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#F5F5F5',
    letterSpacing: '0.02em',
  },

  xpText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontVariantNumeric: 'tabular-nums',
  },

  barOuter: {
    position: 'relative',
    height: 10,
    borderRadius: 5,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 10,
  },

  barInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 5,
    background: 'linear-gradient(90deg, #F59E0B 0%, #EAB308 100%)',
    transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
    boxShadow: '0 0 8px rgba(245,158,11,0.4)',
  },

  barShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '50%',
    borderRadius: '5px 5px 0 0',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)',
    pointerEvents: 'none',
  },

  statsRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },

  statPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
  },

  statIcon: {
    fontSize: 12,
  },

  statValue: {
    fontSize: 13,
    fontWeight: 700,
    color: '#F5F5F5',
    fontVariantNumeric: 'tabular-nums',
  },

  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },

  // Compact variants
  compactRoot: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  compactBadge: {
    fontSize: 16,
  },

  compactLevel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#F5F5F5',
  },

  compactBarOuter: {
    width: 60,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },

  compactBarInner: {
    height: '100%',
    borderRadius: 2,
    background: 'linear-gradient(90deg, #F59E0B, #EAB308)',
    transition: 'width 0.4s ease',
  },

  compactXp: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontVariantNumeric: 'tabular-nums',
  },
};

export default PlayerStats;
