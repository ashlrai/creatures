import { useState, useEffect, useCallback, useRef } from 'react';

interface TutorialProps {
  onComplete: () => void;
  onPoke: (segment: string) => void;
  onSetSidebarTab: (tab: 'brain' | 'tools' | 'science') => void;
  onSetAppMode: (mode: 'sim' | 'evo' | 'eco') => void;
}

interface TutorialStep {
  title: string;
  text: string;
  highlight: 'viewport' | 'sidebar-right' | 'sidebar' | 'viewport';
  action?: { label: string; onClick: () => void };
  autoAdvanceMs?: number;
}

const STORAGE_KEY = 'neurevo:tutorial_complete';

export function Tutorial({ onComplete, onPoke, onSetSidebarTab, onSetAppMode }: TutorialProps) {
  const [step, setStep] = useState(0);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* ignore */ }
    onComplete();
  }, [onComplete]);

  const steps: TutorialStep[] = [
    {
      title: 'This is a real brain',
      text: "You're looking at a C. elegans worm with 299 real neurons and 3,363 synapses from the OpenWorm project. Every spike you see is a real neural signal.",
      highlight: 'viewport',
      action: {
        label: 'Poke it!',
        onClick: () => {
          onPoke('seg_8');
          setStep(1);
        },
      },
    },
    {
      title: 'Watch the cascade',
      text: 'Touch activates sensory neurons (green in the connectome). The signal cascades through interneurons (blue) to motor neurons (red), producing movement.',
      highlight: 'sidebar-right',
      autoAdvanceMs: 3000,
    },
    {
      title: 'Test a drug',
      text: "Try applying Picrotoxin \u2014 it blocks GABA inhibition, causing hyperactivity. Watch how the neural dynamics change.",
      highlight: 'sidebar',
      action: {
        label: 'Open Drug Panel',
        onClick: () => {
          onSetSidebarTab('tools');
          setStep(3);
        },
      },
    },
    {
      title: 'Evolve brains',
      text: "Click 'Start Evolution' to watch natural selection reshape the neural architecture. The God Agent will narrate what happens.",
      highlight: 'viewport',
      action: {
        label: 'Start Evolution',
        onClick: () => {
          onSetAppMode('evo');
          setStep(4);
        },
      },
    },
    {
      title: 'Explore the ecosystem',
      text: 'Create a world where multiple species coexist. Add chemical gradients, trigger environmental events, and watch emergent behaviors arise.',
      highlight: 'viewport',
      action: {
        label: 'Finish Tutorial',
        onClick: () => {
          onSetAppMode('eco');
          finish();
        },
      },
    },
  ];

  const currentStep = steps[step];

  // Auto-advance for steps that specify it
  useEffect(() => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    if (currentStep?.autoAdvanceMs) {
      autoAdvanceTimer.current = setTimeout(() => {
        setStep((s) => Math.min(s + 1, steps.length - 1));
      }, currentStep.autoAdvanceMs);
    }
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, [step, currentStep?.autoAdvanceMs, steps.length]);

  // Prepare step 2: switch to tools tab
  useEffect(() => {
    if (step === 2) {
      onSetAppMode('sim');
      onSetSidebarTab('tools');
    }
  }, [step, onSetAppMode, onSetSidebarTab]);

  // Determine which element to highlight
  const getSpotlightSelector = (): string => {
    switch (currentStep?.highlight) {
      case 'viewport': return '.viewport';
      case 'sidebar-right': return '.sidebar-right';
      case 'sidebar': return '.sidebar';
      default: return '.viewport';
    }
  };

  const [spotlightRect, setSpotlightRect] = useState({ top: 0, left: 0, width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      const selector = getSpotlightSelector();
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setSpotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [step]);

  if (!currentStep) return null;

  const { top, left, width, height } = spotlightRect;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      pointerEvents: 'auto',
    }}>
      {/* Semi-transparent overlay with spotlight cutout via box-shadow */}
      <div style={{
        position: 'absolute',
        top: top,
        left: left,
        width: width,
        height: height,
        borderRadius: 8,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
        pointerEvents: 'none',
        transition: 'all 0.4s ease',
      }} />

      {/* Tutorial card */}
      <div style={{
        position: 'absolute',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, rgba(12, 18, 40, 0.97), rgba(8, 12, 28, 0.97))',
        border: '1px solid rgba(100, 160, 255, 0.2)',
        borderRadius: 12,
        padding: '24px 32px',
        maxWidth: 520,
        width: '90vw',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(60,120,255,0.08)',
      }}>
        {/* Step counter */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11,
            color: 'rgba(136, 204, 255, 0.7)',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '0.5px',
          }}>
            {step + 1} / {steps.length}
          </div>
          <button
            onClick={finish}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.35)',
              fontSize: 11,
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 4,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >
            Skip tutorial
          </button>
        </div>

        {/* Title */}
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#e0eaf0',
          marginBottom: 8,
          letterSpacing: '-0.3px',
        }}>
          {currentStep.title}
        </div>

        {/* Body text */}
        <div style={{
          fontSize: 13,
          color: 'rgba(200, 215, 230, 0.85)',
          lineHeight: 1.65,
          marginBottom: 20,
        }}>
          {currentStep.text}
        </div>

        {/* Progress dots */}
        <div style={{
          display: 'flex',
          gap: 6,
          marginBottom: currentStep.action ? 16 : 0,
          justifyContent: 'center',
        }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step
                  ? 'rgba(136, 204, 255, 0.8)'
                  : i < step
                    ? 'rgba(136, 204, 255, 0.3)'
                    : 'rgba(255, 255, 255, 0.1)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Action button */}
        {currentStep.action && (
          <button
            onClick={currentStep.action.onClick}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 0',
              background: 'linear-gradient(135deg, rgba(60, 130, 255, 0.25), rgba(60, 130, 255, 0.15))',
              border: '1px solid rgba(100, 160, 255, 0.3)',
              borderRadius: 8,
              color: '#88ccff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.2px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(60, 130, 255, 0.35), rgba(60, 130, 255, 0.25))';
              e.currentTarget.style.borderColor = 'rgba(100, 160, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(60, 130, 255, 0.25), rgba(60, 130, 255, 0.15))';
              e.currentTarget.style.borderColor = 'rgba(100, 160, 255, 0.3)';
            }}
          >
            {currentStep.action.label}
          </button>
        )}

        {/* Auto-advance indicator */}
        {currentStep.autoAdvanceMs && (
          <div style={{
            marginTop: 12,
            height: 2,
            borderRadius: 1,
            background: 'rgba(255,255,255,0.05)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: 'rgba(136, 204, 255, 0.5)',
              borderRadius: 1,
              animation: `tutorialProgress ${currentStep.autoAdvanceMs}ms linear forwards`,
            }} />
          </div>
        )}
      </div>

      {/* Inject keyframe animation for auto-advance progress bar */}
      <style>{`
        @keyframes tutorialProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}

/** Check if the tutorial has been completed */
Tutorial.isComplete = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};
