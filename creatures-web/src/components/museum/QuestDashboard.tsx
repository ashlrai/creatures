import React, { useState } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { EPOCHS, QUESTS } from '../../data/curriculum';
import type { Epoch, Quest } from '../../data/knowledge-graph';
import { PlayerStats } from './PlayerStats';
import { QuestDetail } from './QuestDetail';

// ============================================================================
// QuestDashboard — The main campaign/curriculum page
// Shows player progression through epochs and quests
// ============================================================================

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#22C55E',
  easy: '#22C55E',
  intermediate: '#3B82F6',
  medium: '#F59E0B',
  advanced: '#EF4444',
  hard: '#EF4444',
  master: '#A855F7',
  challenge: '#A855F7',
};

export const QuestDashboard: React.FC = () => {
  const [expandedEpochId, setExpandedEpochId] = useState<string | null>(null);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  // If a quest is selected, show its detail view
  if (selectedQuestId) {
    return (
      <QuestDetail
        questId={selectedQuestId}
        onBack={() => setSelectedQuestId(null)}
      />
    );
  }

  return (
    <div style={styles.root}>
      {/* Player stats bar */}
      <div style={styles.statsBar}>
        <PlayerStats />
      </div>

      {/* Campaign header */}
      <div style={styles.campaignHeader}>
        <h1 style={styles.campaignTitle}>The Campaign</h1>
        <p style={styles.campaignSubtitle}>
          Journey through the greatest moments in human history
        </p>
      </div>

      {/* Epoch progression path */}
      <div style={styles.epochList}>
        {EPOCHS.map((epoch, index) => (
          <EpochCard
            key={epoch.id}
            epoch={epoch}
            index={index}
            expanded={expandedEpochId === epoch.id}
            onToggle={() =>
              setExpandedEpochId(
                expandedEpochId === epoch.id ? null : epoch.id
              )
            }
            onSelectQuest={setSelectedQuestId}
          />
        ))}
      </div>

      {/* Connecting line decoration */}
      <div style={styles.lineDecoration} />
    </div>
  );
};

// -- Epoch Card ---------------------------------------------------------------

interface EpochCardProps {
  epoch: Epoch;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onSelectQuest: (questId: string) => void;
}

const EpochCard: React.FC<EpochCardProps> = ({
  epoch, index, expanded, onToggle, onSelectQuest,
}) => {
  const { completedEpochIds, completedQuestIds, completedObjectiveIds } = useMuseumStore();

  const isCompleted = completedEpochIds.has(epoch.id);
  const isLocked = epoch.prerequisiteEpochIds.length > 0 &&
    !epoch.prerequisiteEpochIds.every(id => completedEpochIds.has(id));
  const isAvailable = !isLocked;

  // Calculate quest completion stats
  const epochQuests = QUESTS.filter(q => q.epochId === epoch.id);
  const completedQuestCount = epochQuests.filter(q => completedQuestIds.has(q.id)).length;
  const completionPct = epochQuests.length > 0
    ? Math.round((completedQuestCount / epochQuests.length) * 100)
    : 0;

  const cardStyle: React.CSSProperties = {
    ...styles.epochCard,
    opacity: isLocked ? 0.45 : 1,
    borderColor: isCompleted
      ? 'rgba(245,158,11,0.4)'
      : `${epoch.color}30`,
    background: isCompleted
      ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)'
      : isLocked
        ? 'rgba(255,255,255,0.02)'
        : `linear-gradient(135deg, ${epoch.color}10 0%, ${epoch.color}05 100%)`,
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Connector dot */}
      <div
        style={{
          ...styles.connectorDot,
          background: isCompleted ? '#F59E0B' : isAvailable ? epoch.color : 'rgba(255,255,255,0.15)',
          boxShadow: isCompleted
            ? '0 0 12px rgba(245,158,11,0.4)'
            : isAvailable
              ? `0 0 10px ${epoch.color}40`
              : 'none',
        }}
      />

      <div style={cardStyle}>
        {/* Epoch header */}
        <div
          style={styles.epochHeader}
          onClick={isAvailable ? onToggle : undefined}
          role={isAvailable ? 'button' : undefined}
        >
          <div style={styles.epochLeft}>
            <span style={styles.epochIcon}>{epoch.icon}</span>
            <div style={styles.epochInfo}>
              <div style={styles.epochTitleRow}>
                <span style={styles.epochTitle}>{epoch.title}</span>
                {isCompleted && <span style={styles.completedCheck}>✓</span>}
                {isLocked && <span style={styles.lockIcon}>🔒</span>}
              </div>
              <span style={styles.epochSubtitle}>{epoch.subtitle}</span>
            </div>
          </div>

          <div style={styles.epochRight}>
            <span
              style={{
                ...styles.diffBadge,
                color: DIFFICULTY_COLORS[epoch.difficulty],
                background: `${DIFFICULTY_COLORS[epoch.difficulty]}15`,
                border: `1px solid ${DIFFICULTY_COLORS[epoch.difficulty]}30`,
              }}
            >
              {epoch.difficulty.toUpperCase()}
            </span>
            <div style={styles.epochMeta}>
              <span style={styles.metaText}>⏱ ~{epoch.estimatedHours}h</span>
              <span style={styles.metaText}>{epochQuests.length} quests</span>
            </div>
          </div>
        </div>

        {/* Completion bar */}
        {isAvailable && (
          <div style={styles.epochProgressOuter}>
            <div
              style={{
                ...styles.epochProgressInner,
                width: `${completionPct}%`,
                background: isCompleted
                  ? 'linear-gradient(90deg, #F59E0B, #22C55E)'
                  : `linear-gradient(90deg, ${epoch.color}, ${epoch.color}CC)`,
              }}
            />
          </div>
        )}

        {/* Locked message */}
        {isLocked && (
          <div style={styles.lockedMsg}>
            Complete{' '}
            {epoch.prerequisiteEpochIds
              .map(id => EPOCHS.find(e => e.id === id)?.title ?? id)
              .join(' and ')}{' '}
            to unlock
          </div>
        )}

        {/* Enter / expand area */}
        {isAvailable && !expanded && (
          <div style={styles.enterRow}>
            <button
              onClick={onToggle}
              style={{
                ...styles.enterBtn,
                background: `linear-gradient(135deg, ${epoch.color}, ${epoch.color}CC)`,
              }}
            >
              {completionPct > 0 ? 'Continue' : 'Enter'}
              <span style={{ marginLeft: 6, opacity: 0.7 }}>→</span>
            </button>
            {completionPct > 0 && (
              <span style={styles.pctText}>{completionPct}% complete</span>
            )}
          </div>
        )}

        {/* Expanded: show quests */}
        {expanded && isAvailable && (
          <div style={styles.questsList}>
            {epochQuests.map((quest, qi) => (
              <QuestRow
                key={quest.id}
                quest={quest}
                index={qi}
                onSelect={() => onSelectQuest(quest.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// -- Quest Row (within an expanded epoch) -------------------------------------

interface QuestRowProps {
  quest: Quest;
  index: number;
  onSelect: () => void;
}

const QuestRow: React.FC<QuestRowProps> = ({ quest, index, onSelect }) => {
  const { completedQuestIds, completedObjectiveIds } = useMuseumStore();

  const isCompleted = completedQuestIds.has(quest.id);
  const isLocked = quest.prerequisiteQuestIds.length > 0 &&
    !quest.prerequisiteQuestIds.every(id => completedQuestIds.has(id));
  const isAvailable = !isLocked && !isCompleted;

  const completedObjs = quest.objectives.filter(o => completedObjectiveIds.has(o.id)).length;
  const hasProgress = completedObjs > 0 && !isCompleted;

  return (
    <div
      style={{
        ...styles.questRow,
        opacity: isLocked ? 0.4 : isCompleted ? 0.6 : 1,
        cursor: isLocked ? 'default' : 'pointer',
      }}
      onClick={!isLocked ? onSelect : undefined}
    >
      {/* Quest number / status */}
      <div
        style={{
          ...styles.questNumber,
          background: isCompleted
            ? 'rgba(34,197,94,0.2)'
            : isLocked
              ? 'rgba(255,255,255,0.05)'
              : hasProgress
                ? 'rgba(245,158,11,0.15)'
                : 'rgba(255,255,255,0.08)',
          color: isCompleted
            ? '#22C55E'
            : isLocked
              ? 'rgba(255,255,255,0.2)'
              : hasProgress
                ? '#F59E0B'
                : 'rgba(255,255,255,0.5)',
          border: isCompleted
            ? '1px solid rgba(34,197,94,0.3)'
            : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {isCompleted ? '✓' : isLocked ? '🔒' : index + 1}
      </div>

      {/* Quest info */}
      <div style={styles.questInfo}>
        <span
          style={{
            ...styles.questTitle,
            color: isCompleted ? 'rgba(255,255,255,0.5)' : '#F5F5F5',
          }}
        >
          {quest.title}
        </span>
        <span style={styles.questSubtitle}>{quest.subtitle}</span>
        {hasProgress && (
          <span style={styles.questProgress}>
            {completedObjs}/{quest.objectives.length} objectives
          </span>
        )}
      </div>

      {/* Right side meta */}
      <div style={styles.questMeta}>
        <span
          style={{
            ...styles.questDiff,
            color: DIFFICULTY_COLORS[quest.difficulty],
          }}
        >
          {quest.difficulty}
        </span>
        <span style={styles.questXp}>✦ {quest.xpReward}</span>
      </div>
    </div>
  );
};

// -- Styles -------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    maxWidth: 720,
    margin: '0 auto',
    padding: '24px 20px 60px',
  },

  statsBar: {
    marginBottom: 28,
  },

  campaignHeader: {
    textAlign: 'center',
    marginBottom: 32,
  },

  campaignTitle: {
    fontSize: 32,
    fontWeight: 900,
    color: '#F5F5F5',
    margin: '0 0 6px',
    letterSpacing: '-0.02em',
  },

  campaignSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    margin: 0,
  },

  // Vertical connecting line
  lineDecoration: {
    position: 'absolute',
    left: 40,
    top: 180,
    bottom: 80,
    width: 2,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
    borderRadius: 1,
    zIndex: 0,
    pointerEvents: 'none',
  },

  connectorDot: {
    position: 'absolute',
    left: -8,
    top: 28,
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.1)',
    zIndex: 2,
  },

  epochList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    position: 'relative',
    paddingLeft: 28,
  },

  epochCard: {
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
  },

  epochHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    cursor: 'pointer',
    gap: 12,
  },

  epochLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },

  epochIcon: {
    fontSize: 28,
    flexShrink: 0,
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
  },

  epochInfo: {
    flex: 1,
    minWidth: 0,
  },

  epochTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  epochTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: '#F5F5F5',
    lineHeight: 1.2,
  },

  completedCheck: {
    fontSize: 14,
    fontWeight: 800,
    color: '#22C55E',
  },

  lockIcon: {
    fontSize: 14,
  },

  epochSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 1.3,
    marginTop: 2,
    display: 'block',
  },

  epochRight: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },

  diffBadge: {
    fontSize: 9,
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: 4,
    letterSpacing: '0.08em',
  },

  epochMeta: {
    display: 'flex',
    gap: 8,
  },

  metaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },

  epochProgressOuter: {
    height: 3,
    margin: '0 18px 12px',
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  epochProgressInner: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.6s ease',
  },

  lockedMsg: {
    padding: '8px 18px 14px',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    fontStyle: 'italic',
  },

  enterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 18px 14px',
  },

  enterBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    transition: 'transform 0.15s',
  },

  pctText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },

  // Quest list (expanded epoch)
  questsList: {
    padding: '4px 12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  questRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
    transition: 'background 0.2s',
  },

  questNumber: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 800,
    flexShrink: 0,
  },

  questInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },

  questTitle: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.2,
  },

  questSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  questProgress: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: 600,
    marginTop: 2,
  },

  questMeta: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },

  questDiff: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'capitalize',
  },

  questXp: {
    fontSize: 11,
    fontWeight: 700,
    color: '#F59E0B',
  },
};

export default QuestDashboard;
