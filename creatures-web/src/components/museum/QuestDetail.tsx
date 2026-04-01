import React from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import type { Quest, QuestObjective } from '../../data/knowledge-graph';
import { QUESTS, EPOCHS } from '../../data/curriculum';

// ============================================================================
// QuestDetail — The quest briefing screen
// Shows narrative intro, objectives, rewards, and a start/continue button
// ============================================================================

interface QuestDetailProps {
  questId: string;
  onBack: () => void;
}

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

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#22C55E',
  medium: '#F59E0B',
  hard: '#EF4444',
  challenge: '#A855F7',
};

export const QuestDetail: React.FC<QuestDetailProps> = ({ questId, onBack }) => {
  const {
    completedObjectiveIds, completedQuestIds, activeQuestId,
    navigate, completeObjective, completeQuest,
  } = useMuseumStore();

  const quest = QUESTS.find(q => q.id === questId);
  if (!quest) return null;

  const isCompleted = completedQuestIds.has(quest.id);
  const isActive = activeQuestId === quest.id;
  const completedCount = quest.objectives.filter(o => completedObjectiveIds.has(o.id)).length;
  const requiredCount = quest.objectives.filter(o => !o.optional).length;
  const requiredCompleted = quest.objectives.filter(o => !o.optional && completedObjectiveIds.has(o.id)).length;
  const totalXpFromObjectives = quest.objectives.reduce((sum, o) => sum + o.xpReward, 0);

  const handleStart = () => {
    navigate('quest-active', quest.id);
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back
        </button>
        <div style={styles.headerMeta}>
          <span
            style={{
              ...styles.difficultyBadge,
              background: `${DIFFICULTY_COLORS[quest.difficulty]}20`,
              color: DIFFICULTY_COLORS[quest.difficulty],
              border: `1px solid ${DIFFICULTY_COLORS[quest.difficulty]}40`,
            }}
          >
            {quest.difficulty.toUpperCase()}
          </span>
          <span style={styles.timeBadge}>
            ⏱ ~{quest.estimatedMinutes} min
          </span>
          <span style={styles.xpBadge}>
            ✦ {quest.xpReward} XP
          </span>
        </div>
      </div>

      {/* Title */}
      <h1 style={styles.title}>{quest.title}</h1>
      <p style={styles.subtitle}>{quest.subtitle}</p>

      {/* Narrator intro — the immersive hook */}
      <div style={styles.narratorBox}>
        <div style={styles.narratorQuote}>"</div>
        <p style={styles.narratorText}>{quest.narratorIntro}</p>
      </div>

      {/* Description */}
      <p style={styles.description}>{quest.description}</p>

      {/* Objectives */}
      <div style={styles.objectivesSection}>
        <h2 style={styles.sectionTitle}>
          Objectives
          <span style={styles.objectiveCount}>
            {completedCount}/{quest.objectives.length}
          </span>
        </h2>

        <div style={styles.objectivesList}>
          {quest.objectives.map(obj => (
            <ObjectiveRow
              key={obj.id}
              objective={obj}
              completed={completedObjectiveIds.has(obj.id)}
            />
          ))}
        </div>
      </div>

      {/* Rewards */}
      {quest.unlocks.length > 0 && (
        <div style={styles.rewardsSection}>
          <h2 style={styles.sectionTitle}>Rewards</h2>
          <div style={styles.rewardsList}>
            {quest.unlocks.map((reward, i) => (
              <div key={i} style={styles.rewardItem}>
                <span style={styles.rewardIcon}>
                  {reward.type === 'character' ? '👤' :
                   reward.type === 'epoch' ? '🗺️' :
                   reward.type === 'alchemy_element' ? '🧪' :
                   reward.type === 'badge' ? '🏅' :
                   reward.type === 'title' ? '👑' :
                   reward.type === 'simulation' ? '🔬' : '🎁'}
                </span>
                <span style={styles.rewardText}>{reward.description}</span>
              </div>
            ))}
            <div style={styles.rewardItem}>
              <span style={styles.rewardIcon}>✦</span>
              <span style={styles.rewardText}>{quest.xpReward} XP for completion</span>
            </div>
          </div>
        </div>
      )}

      {/* Action button */}
      <div style={styles.actionRow}>
        {isCompleted ? (
          <div style={styles.completedBanner}>
            <span style={styles.completedCheck}>✓</span>
            Quest Complete
          </div>
        ) : (
          <button
            onClick={handleStart}
            style={styles.startBtn}
          >
            {isActive ? 'Continue Quest' : 'Start Quest'}
            <span style={styles.startArrow}>→</span>
          </button>
        )}
      </div>
    </div>
  );
};

// -- Objective Row ------------------------------------------------------------

const ObjectiveRow: React.FC<{ objective: QuestObjective; completed: boolean }> = ({
  objective, completed,
}) => {
  const icon = OBJECTIVE_ICONS[objective.type] ?? '•';

  return (
    <div
      style={{
        ...styles.objectiveRow,
        opacity: completed ? 0.5 : 1,
      }}
    >
      <div style={styles.objectiveCheck}>
        {completed ? (
          <span style={styles.checkmark}>✓</span>
        ) : (
          <span style={styles.checkEmpty} />
        )}
      </div>
      <span style={styles.objectiveIcon}>{icon}</span>
      <div style={styles.objectiveInfo}>
        <span
          style={{
            ...styles.objectiveDesc,
            textDecoration: completed ? 'line-through' : 'none',
          }}
        >
          {objective.description}
        </span>
        <div style={styles.objectiveMeta}>
          <span style={styles.objectiveXp}>+{objective.xpReward} XP</span>
          {objective.optional && (
            <span style={styles.optionalBadge}>
              ⭐ BONUS
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// -- Styles -------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '24px 20px',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  backBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.7)',
    padding: '6px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: 'all 0.2s',
  },

  headerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  difficultyBadge: {
    fontSize: 10,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 4,
    letterSpacing: '0.08em',
  },

  timeBadge: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },

  xpBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: '#F59E0B',
  },

  title: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F5F5F5',
    margin: '0 0 4px',
    letterSpacing: '-0.01em',
  },

  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    margin: '0 0 20px',
    lineHeight: 1.4,
  },

  // Narrator callout
  narratorBox: {
    position: 'relative',
    padding: '20px 24px 20px 36px',
    background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.03) 100%)',
    borderRadius: 12,
    borderLeft: '3px solid rgba(245,158,11,0.4)',
    marginBottom: 20,
  },

  narratorQuote: {
    position: 'absolute',
    top: 8,
    left: 12,
    fontSize: 32,
    fontWeight: 800,
    color: 'rgba(245,158,11,0.3)',
    lineHeight: 1,
    fontFamily: 'Georgia, serif',
  },

  narratorText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(255,255,255,0.75)',
    fontStyle: 'italic',
  },

  description: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(255,255,255,0.6)',
    margin: '0 0 28px',
  },

  // Objectives section
  objectivesSection: {
    marginBottom: 28,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    margin: '0 0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  objectiveCount: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'none',
    letterSpacing: 0,
  },

  objectivesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  objectiveRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.05)',
    transition: 'opacity 0.3s',
  },

  objectiveCheck: {
    flexShrink: 0,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },

  checkmark: {
    fontSize: 14,
    fontWeight: 800,
    color: '#22C55E',
  },

  checkEmpty: {
    display: 'block',
    width: 14,
    height: 14,
    borderRadius: 3,
    border: '2px solid rgba(255,255,255,0.2)',
  },

  objectiveIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 1,
  },

  objectiveInfo: {
    flex: 1,
    minWidth: 0,
  },

  objectiveDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.4,
  },

  objectiveMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },

  objectiveXp: {
    fontSize: 11,
    fontWeight: 700,
    color: '#F59E0B',
  },

  optionalBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#A78BFA',
    padding: '1px 6px',
    borderRadius: 3,
    background: 'rgba(167,139,250,0.12)',
    border: '1px solid rgba(167,139,250,0.2)',
  },

  // Rewards section
  rewardsSection: {
    marginBottom: 28,
    padding: 16,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(34,197,94,0.02) 100%)',
    border: '1px solid rgba(34,197,94,0.12)',
  },

  rewardsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  rewardItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  rewardIcon: {
    fontSize: 16,
    flexShrink: 0,
  },

  rewardText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },

  // Action
  actionRow: {
    display: 'flex',
    justifyContent: 'center',
  },

  startBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 36px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    color: '#fff',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
    letterSpacing: '0.02em',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },

  startArrow: {
    fontSize: 18,
    opacity: 0.8,
  },

  completedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 36px',
    borderRadius: 12,
    background: 'rgba(34,197,94,0.1)',
    border: '2px solid rgba(34,197,94,0.3)',
    color: '#22C55E',
    fontSize: 16,
    fontWeight: 800,
  },

  completedCheck: {
    fontSize: 20,
  },
};

export default QuestDetail;
