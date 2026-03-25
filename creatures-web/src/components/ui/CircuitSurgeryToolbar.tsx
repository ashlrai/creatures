import { useCallback } from 'react';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';

// --- Inline SVG icons (20x20) ---

const ScissorsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="5" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="7.2" y1="7.2" x2="16" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="7.2" y1="12.8" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const LightningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
);

const MuteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 8v4h3l4 4V4L6 8H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    <line x1="14" y1="7" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="18" y1="7" x2="14" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const RecordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="10" cy="10" r="2.5" fill="currentColor" />
  </svg>
);

const UndoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 8h7a4 4 0 010 8H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M8 5L5 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const RedoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 8H8a4 4 0 000 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M12 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="6" y1="6" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="6" x2="6" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// --- Styles ---

const toolbarContainer: React.CSSProperties = {
  position: 'fixed',
  bottom: 68,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--bg-panel)',
  backdropFilter: 'blur(var(--blur))',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: '6px 8px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  animation: 'toolbarFadeIn 0.2s ease-out',
};

const iconBtnBase: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid transparent',
  borderRadius: 7,
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  transition: 'all 0.15s',
  padding: 0,
  flexShrink: 0,
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 24,
  background: 'var(--border-subtle)',
  margin: '0 4px',
  flexShrink: 0,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  fontFamily: 'var(--font-mono)',
  color: 'var(--accent-cyan)',
  background: 'rgba(0,212,255,0.1)',
  borderRadius: 4,
  padding: '2px 7px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

// --- Component ---

export function CircuitSurgeryToolbar() {
  const selectedNeurons = useCircuitModificationStore((s) => s.selectedNeurons);
  const undoStack = useCircuitModificationStore((s) => s.undoStack);
  const redoStack = useCircuitModificationStore((s) => s.redoStack);
  const addModification = useCircuitModificationStore((s) => s.addModification);
  const clearSelection = useCircuitModificationStore((s) => s.clearSelection);
  const undo = useCircuitModificationStore((s) => s.undo);
  const redo = useCircuitModificationStore((s) => s.redo);

  const handleLesion = useCallback(() => {
    if (selectedNeurons.length === 0) return;
    for (const nid of selectedNeurons) {
      window.dispatchEvent(
        new CustomEvent('neurevo-command', {
          detail: { type: 'lesion_neuron', neuron_id: nid },
        }),
      );
    }
    addModification({ type: 'lesion', neuronIds: [...selectedNeurons], params: {} });
  }, [selectedNeurons, addModification]);

  const handleStimulate = useCallback(() => {
    if (selectedNeurons.length === 0) return;
    window.dispatchEvent(
      new CustomEvent('neurevo-command', {
        detail: { type: 'stimulate', neuron_ids: selectedNeurons, current: 25 },
      }),
    );
    addModification({ type: 'stimulate', neuronIds: [...selectedNeurons], params: { current: 25 } });
  }, [selectedNeurons, addModification]);

  const handleSilence = useCallback(() => {
    if (selectedNeurons.length === 0) return;
    for (const nid of selectedNeurons) {
      window.dispatchEvent(
        new CustomEvent('neurevo-command', {
          detail: { type: 'silence_neuron', neuron_id: nid },
        }),
      );
    }
    addModification({ type: 'silence', neuronIds: [...selectedNeurons], params: {} });
  }, [selectedNeurons, addModification]);

  const handleRecord = useCallback(() => {
    if (selectedNeurons.length === 0) return;
    addModification({ type: 'record', neuronIds: [...selectedNeurons], params: {} });
  }, [selectedNeurons, addModification]);

  if (selectedNeurons.length === 0) return null;

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes toolbarFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .surgery-btn:hover {
          background: rgba(255,255,255,0.08) !important;
          border-color: var(--border-active) !important;
          color: var(--text-primary) !important;
        }
        .surgery-btn:active {
          transform: scale(0.93);
        }
        .surgery-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .surgery-btn:disabled:hover {
          background: rgba(255,255,255,0.04) !important;
          border-color: transparent !important;
          color: var(--text-secondary) !important;
        }
      `}</style>

      <div style={toolbarContainer}>
        {/* Undo / Redo */}
        <button
          className="surgery-btn"
          style={iconBtnBase}
          title="Undo (Ctrl+Z)"
          disabled={undoStack.length === 0}
          onClick={undo}
        >
          <UndoIcon />
        </button>
        <button
          className="surgery-btn"
          style={iconBtnBase}
          title="Redo (Ctrl+Shift+Z)"
          disabled={redoStack.length === 0}
          onClick={redo}
        >
          <RedoIcon />
        </button>

        <div style={dividerStyle} />

        {/* Batch count badge */}
        {selectedNeurons.length > 1 && (
          <span style={badgeStyle}>{selectedNeurons.length} neurons</span>
        )}

        {/* Surgery actions */}
        <button
          className="surgery-btn"
          style={{ ...iconBtnBase, color: '#ff4466' }}
          title="Lesion selected neurons"
          onClick={handleLesion}
        >
          <ScissorsIcon />
        </button>
        <button
          className="surgery-btn"
          style={{ ...iconBtnBase, color: 'var(--accent-cyan)' }}
          title="Stimulate selected neurons"
          onClick={handleStimulate}
        >
          <LightningIcon />
        </button>
        <button
          className="surgery-btn"
          style={{ ...iconBtnBase, color: 'var(--accent-amber)' }}
          title="Silence selected neurons"
          onClick={handleSilence}
        >
          <MuteIcon />
        </button>
        <button
          className="surgery-btn"
          style={{ ...iconBtnBase, color: 'var(--accent-green)' }}
          title="Record selected neurons"
          onClick={handleRecord}
        >
          <RecordIcon />
        </button>

        <div style={dividerStyle} />

        {/* Clear selection */}
        <button
          className="surgery-btn"
          style={iconBtnBase}
          title="Clear selection"
          onClick={clearSelection}
        >
          <CloseIcon />
        </button>
      </div>
    </>
  );
}
