import React, { useState, useCallback } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { getDailyTrivia, TRIVIA } from '../../data/engagement';
import type { TriviaQuestion } from '../../data/knowledge-graph';

// ============================================================================
// TriviaView — Daily quiz show with dramatic reveals
// Quiz-show dark theme with XP rewards for correct/attempted answers
// ============================================================================

const STYLE_ID = 'trivia-view-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes trivia-reveal {
      0% { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes trivia-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(124,77,255,0); }
      50% { box-shadow: 0 0 24px 4px rgba(124,77,255,0.2); }
    }
    @keyframes trivia-correct-flash {
      0% { background: rgba(46,204,113,0.3); }
      50% { background: rgba(46,204,113,0.15); }
      100% { background: rgba(46,204,113,0.08); }
    }
    @keyframes trivia-wrong-flash {
      0% { background: rgba(231,76,60,0.3); }
      50% { background: rgba(231,76,60,0.15); }
      100% { background: rgba(231,76,60,0.08); }
    }
    @keyframes trivia-xp-float {
      0% { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-40px) scale(1.3); }
    }
    @keyframes trivia-streak-glow {
      0%, 100% { text-shadow: 0 0 4px rgba(255,215,0,0.3); }
      50% { text-shadow: 0 0 16px rgba(255,215,0,0.6); }
    }
  `;
  document.head.appendChild(style);
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#2ecc71',
  medium: '#f39c12',
  hard: '#e74c3c',
};

export function TriviaView() {
  ensureKeyframes();

  const { addXp, navigate } = useMuseumStore();

  const [currentQuestion, setCurrentQuestion] = useState<TriviaQuestion>(() => getDailyTrivia());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [xpFloating, setXpFloating] = useState<number | null>(null);
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set());

  const isCorrect = selectedIndex === currentQuestion.correctIndex;

  const handleAnswer = useCallback((index: number) => {
    if (revealed) return;
    setSelectedIndex(index);
    setRevealed(true);
    setSessionTotal(t => t + 1);

    const correct = index === currentQuestion.correctIndex;
    const xpReward = correct ? 25 : 5;

    if (correct) {
      setSessionScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }

    addXp(xpReward);
    setXpFloating(xpReward);
    setTimeout(() => setXpFloating(null), 1200);
  }, [revealed, currentQuestion.correctIndex, addXp]);

  const handleNext = useCallback(() => {
    // Pick a random question we haven't used this session
    const available = TRIVIA.filter(q => q.id !== currentQuestion.id && !usedIds.has(q.id));
    const pool = available.length > 0 ? available : TRIVIA.filter(q => q.id !== currentQuestion.id);
    const next = pool[Math.floor(Math.random() * pool.length)];

    setUsedIds(prev => {
      const n = new Set(prev);
      n.add(currentQuestion.id);
      return n;
    });
    setCurrentQuestion(next);
    setSelectedIndex(null);
    setRevealed(false);
  }, [currentQuestion, usedIds]);

  const diffColor = DIFFICULTY_COLORS[currentQuestion.difficulty] ?? '#888';

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.backBtn} onClick={() => navigate('timeline')}>
            ← Back
          </button>
          <div style={s.titleBlock}>
            <h1 style={s.title}>Daily Trivia</h1>
            <p style={s.subtitle}>Test your knowledge of history and science</p>
          </div>
        </div>
        <div style={s.scoreBoard}>
          {streak >= 3 && (
            <div style={s.streakBadge}>
              {streak} streak
            </div>
          )}
          <div style={s.scoreBox}>
            <span style={s.scoreLabel}>Score</span>
            <span style={s.scoreValue}>{sessionScore}/{sessionTotal}</span>
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div style={s.cardWrapper}>
        <div style={s.card}>
          {/* Difficulty badge */}
          <div style={{ ...s.diffBadge, background: `${diffColor}22`, color: diffColor, borderColor: `${diffColor}44` }}>
            {currentQuestion.difficulty.toUpperCase()}
          </div>

          {/* Question text */}
          <h2 style={s.question}>{currentQuestion.question}</h2>

          {/* Options */}
          <div style={s.optionsGrid}>
            {currentQuestion.options.map((option, i) => {
              const isSelected = selectedIndex === i;
              const isAnswer = i === currentQuestion.correctIndex;
              let optionStyle: React.CSSProperties = { ...s.option };

              if (revealed) {
                if (isAnswer) {
                  optionStyle = {
                    ...optionStyle,
                    borderColor: '#2ecc71',
                    background: 'rgba(46,204,113,0.08)',
                    color: '#2ecc71',
                    animation: 'trivia-correct-flash 0.6s ease',
                  };
                } else if (isSelected && !isAnswer) {
                  optionStyle = {
                    ...optionStyle,
                    borderColor: '#e74c3c',
                    background: 'rgba(231,76,60,0.08)',
                    color: '#e74c3c',
                    animation: 'trivia-wrong-flash 0.6s ease',
                  };
                } else {
                  optionStyle = {
                    ...optionStyle,
                    opacity: 0.35,
                  };
                }
              }

              const labels = ['A', 'B', 'C', 'D'];

              return (
                <button
                  key={i}
                  style={optionStyle}
                  onClick={() => handleAnswer(i)}
                  disabled={revealed}
                  onMouseEnter={(e) => {
                    if (!revealed) {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,77,255,0.5)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(124,77,255,0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!revealed) {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                    }
                  }}
                >
                  <span style={s.optionLabel}>{labels[i]}</span>
                  <span style={s.optionText}>{option}</span>
                  {revealed && isAnswer && (
                    <span style={s.checkmark}>&#10003;</span>
                  )}
                  {revealed && isSelected && !isAnswer && (
                    <span style={s.crossmark}>&#10007;</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation — revealed after answering */}
          {revealed && (
            <div style={s.explanation}>
              <div style={s.explanationHeader}>
                <span style={{ color: isCorrect ? '#2ecc71' : '#e74c3c', fontWeight: 700, fontSize: 16 }}>
                  {isCorrect ? 'Correct!' : 'Not quite!'}
                </span>
                {xpFloating !== null && (
                  <span style={s.xpFloat}>+{xpFloating} XP</span>
                )}
              </div>
              <p style={s.explanationText}>{currentQuestion.explanation}</p>

              {/* Related entity link */}
              {currentQuestion.relatedEntityId && currentQuestion.relatedEntityType && (
                <button
                  style={s.entityLink}
                  onClick={() => {
                    const type = currentQuestion.relatedEntityType!;
                    const viewMap: Record<string, string> = {
                      event: 'event',
                      person: 'person',
                      artifact: 'artifact',
                      concept: 'concept',
                    };
                    const view = viewMap[type];
                    if (view) navigate(view as any, currentQuestion.relatedEntityId);
                  }}
                >
                  Learn more about this →
                </button>
              )}

              <button style={s.nextBtn} onClick={handleNext}>
                Next Question →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100%',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'radial-gradient(ellipse at 50% 0%, rgba(124,77,255,0.06) 0%, transparent 60%)',
  },
  header: {
    width: '100%',
    maxWidth: 720,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
  },
  backBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: 4,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    background: 'linear-gradient(135deg, #00e5ff, #7c4dff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    margin: 0,
  },
  scoreBoard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  streakBadge: {
    padding: '4px 12px',
    borderRadius: 12,
    background: 'rgba(255,215,0,0.1)',
    border: '1px solid rgba(255,215,0,0.25)',
    color: '#ffd700',
    fontSize: 12,
    fontWeight: 700,
    animation: 'trivia-streak-glow 2s ease infinite',
  },
  scoreBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  scoreLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e8e6e3',
    letterSpacing: '-0.02em',
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 720,
  },
  card: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: '36px 32px',
    position: 'relative' as const,
  },
  diffBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    marginBottom: 16,
  },
  question: {
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.45,
    color: '#e8e6e3',
    margin: '0 0 28px 0',
    letterSpacing: '-0.01em',
  },
  optionsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    color: '#e8e6e3',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    transition: 'all 0.2s',
    position: 'relative' as const,
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 7,
    background: 'rgba(124,77,255,0.1)',
    color: '#b388ff',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  optionText: {
    flex: 1,
  },
  checkmark: {
    fontSize: 18,
    color: '#2ecc71',
    fontWeight: 700,
    marginLeft: 'auto',
  },
  crossmark: {
    fontSize: 18,
    color: '#e74c3c',
    fontWeight: 700,
    marginLeft: 'auto',
  },
  explanation: {
    marginTop: 28,
    padding: '24px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    animation: 'trivia-reveal 0.4s ease',
  },
  explanationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  xpFloat: {
    color: '#ffd700',
    fontWeight: 700,
    fontSize: 14,
    animation: 'trivia-xp-float 1.2s ease forwards',
  },
  explanationText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(255,255,255,0.6)',
    margin: 0,
  },
  entityLink: {
    display: 'inline-block',
    marginTop: 14,
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(0,229,255,0.2)',
    background: 'rgba(0,229,255,0.05)',
    color: '#00e5ff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  nextBtn: {
    display: 'block',
    width: '100%',
    marginTop: 20,
    padding: '14px 24px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, rgba(124,77,255,0.25), rgba(0,229,255,0.15))',
    color: '#e8e6e3',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    letterSpacing: '-0.01em',
  },
};
