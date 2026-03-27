import { useState, useEffect, useCallback, useRef } from 'react';
import type { GuidedExperimentDef, ExperimentStep } from '../../data/experiments';

interface Props {
  experiment: GuidedExperimentDef;
  onComplete: () => void;
  onPoke: (segment: string) => void;
  onLesion: (neuronId: string) => void;
  onDrug?: (drug: string, dose: number) => void;
}

export function GuidedExperiment({ experiment, onComplete, onPoke, onLesion, onDrug }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [autoProgress, setAutoProgress] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = experiment.steps[stepIndex];
  const isLast = stepIndex === experiment.steps.length - 1;

  // Execute action for current step
  useEffect(() => {
    if (!step) return;

    if (step.action === 'poke' && step.actionParams?.segment) {
      onPoke(step.actionParams.segment);
    } else if (step.action === 'lesion' && step.actionParams?.neuronId) {
      onLesion(step.actionParams.neuronId);
    } else if (step.action === 'apply_drug' && step.actionParams?.drug && onDrug) {
      onDrug(step.actionParams.drug, step.actionParams.dose ?? 0.5);
    }

    // Auto-progress
    if (autoProgress) {
      timerRef.current = setTimeout(() => {
        if (!isLast) setStepIndex(i => i + 1);
        else onComplete();
      }, step.durationMs);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [stepIndex]);

  const handleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isLast) onComplete();
    else setStepIndex(i => i + 1);
  }, [isLast, onComplete]);

  if (!step) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 480, maxWidth: '90vw',
      background: 'rgba(6, 8, 18, 0.92)', backdropFilter: 'blur(24px)',
      border: '1px solid rgba(80, 130, 200, 0.15)', borderRadius: 14,
      padding: '16px 20px', zIndex: 50,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {experiment.steps.map((_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i === stepIndex ? '#00d4ff' : i < stepIndex ? 'rgba(0, 212, 255, 0.3)' : 'rgba(80, 130, 200, 0.15)',
            transition: 'background 0.3s',
          }} />
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)' }}>
          {stepIndex + 1}/{experiment.steps.length}
        </span>
      </div>

      {/* Step content */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#dce4ec', marginBottom: 6 }}>
        {step.title}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(180, 200, 220, 0.7)', lineHeight: 1.5, marginBottom: 12 }}>
        {step.explanation}
      </div>

      {/* Highlighted neurons */}
      {step.highlightNeurons && step.highlightNeurons.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {step.highlightNeurons.map(n => (
            <span key={n} style={{
              background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.2)',
              borderRadius: 4, padding: '2px 8px', fontSize: 10,
              color: '#00d4ff', fontFamily: 'var(--font-mono)',
            }}>{n}</span>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onComplete} style={{
          background: 'none', border: 'none', color: 'var(--text-label)',
          fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }}>Exit</button>
        <button onClick={handleNext} style={{
          background: 'rgba(0, 180, 255, 0.15)', border: '1px solid rgba(0, 180, 255, 0.3)',
          borderRadius: 6, padding: '6px 16px', color: '#00d4ff',
          fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 500,
        }}>
          {isLast ? 'Finish' : 'Next \u2192'}
        </button>
      </div>
    </div>
  );
}
