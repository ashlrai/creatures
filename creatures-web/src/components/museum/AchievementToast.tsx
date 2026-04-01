import React, { useEffect, useState, useCallback } from 'react';
import type { Achievement } from '../../data/knowledge-graph';
import { ACHIEVEMENTS } from '../../data/knowledge-graph';

// ============================================================================
// AchievementToast — Slides in from the top when an achievement is unlocked
// Gold/amber scheme, auto-dismisses after 5 seconds
// ============================================================================

interface AchievementToastProps {
  achievementId: string;
  onDismiss: () => void;
}

export const AchievementToast: React.FC<AchievementToastProps> = ({
  achievementId,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering');

  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);

  const dismiss = useCallback(() => {
    setPhase('exiting');
    setTimeout(onDismiss, 400);
  }, [onDismiss]);

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setPhase('visible'), 50);
    // Auto-dismiss after 5 seconds
    const dismissTimer = setTimeout(dismiss, 5000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [dismiss]);

  if (!achievement) return null;

  const translateY = phase === 'entering' ? -120 : phase === 'exiting' ? -120 : 0;
  const opacity = phase === 'entering' ? 0 : phase === 'exiting' ? 0 : 1;

  return (
    <div
      style={{
        ...styles.root,
        transform: `translateX(-50%) translateY(${translateY}px)`,
        opacity,
      }}
      onClick={dismiss}
    >
      {/* Glow effect */}
      <div style={styles.glow} />

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>{achievement.icon}</span>
        </div>

        <div style={styles.textContainer}>
          <div style={styles.label}>ACHIEVEMENT UNLOCKED</div>
          <div style={styles.name}>{achievement.name}</div>
          <div style={styles.description}>{achievement.description}</div>
        </div>

        <div style={styles.xpContainer}>
          <span style={styles.xpValue}>+{achievement.xpReward}</span>
          <span style={styles.xpLabel}>XP</span>
        </div>
      </div>

      {/* Progress bar (auto-dismiss timer) */}
      <div style={styles.timerOuter}>
        <div
          style={{
            ...styles.timerInner,
            animation: phase === 'visible' ? 'shrink 5s linear forwards' : 'none',
          }}
        />
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes toast-sparkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};

// -- Toast Manager (manages a queue of toasts) --------------------------------

interface ToastEntry {
  id: string;
  achievementId: string;
}

let toastIdCounter = 0;

export const useAchievementToasts = () => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showAchievement = useCallback((achievementId: string) => {
    const id = `toast-${++toastIdCounter}`;
    setToasts(prev => [...prev, { id, achievementId }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ToastContainer: React.FC = () => (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            position: 'fixed',
            top: 20 + index * 90,
            left: '50%',
            zIndex: 10000 - index,
            pointerEvents: 'auto',
          }}
        >
          <AchievementToast
            achievementId={toast.achievementId}
            onDismiss={() => dismissToast(toast.id)}
          />
        </div>
      ))}
    </>
  );

  return { showAchievement, ToastContainer };
};

// -- Styles -------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    top: 20,
    left: '50%',
    zIndex: 10000,
    width: 400,
    maxWidth: 'calc(100vw - 40px)',
    borderRadius: 14,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 60px rgba(245,158,11,0.15)',
  },

  glow: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.08) 50%, rgba(245,158,11,0.15) 100%)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 14,
    pointerEvents: 'none',
  },

  content: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    background: 'rgba(20,15,10,0.95)',
    backdropFilter: 'blur(20px)',
  },

  iconContainer: {
    flexShrink: 0,
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.1))',
    border: '1px solid rgba(245,158,11,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  icon: {
    fontSize: 24,
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
  },

  textContainer: {
    flex: 1,
    minWidth: 0,
  },

  label: {
    fontSize: 9,
    fontWeight: 800,
    color: '#F59E0B',
    letterSpacing: '0.15em',
    marginBottom: 2,
  },

  name: {
    fontSize: 15,
    fontWeight: 800,
    color: '#FDE68A',
    lineHeight: 1.2,
    marginBottom: 2,
  },

  description: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  xpContainer: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 8px',
  },

  xpValue: {
    fontSize: 18,
    fontWeight: 900,
    color: '#F59E0B',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },

  xpLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: 'rgba(245,158,11,0.6)',
    letterSpacing: '0.1em',
  },

  timerOuter: {
    height: 3,
    background: 'rgba(0,0,0,0.3)',
  },

  timerInner: {
    height: '100%',
    background: 'linear-gradient(90deg, #F59E0B, #FDE68A)',
  },
};

export default AchievementToast;
