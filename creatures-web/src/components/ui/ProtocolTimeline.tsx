import { useState, useRef, useCallback, useMemo } from 'react';
import { useProtocolStore } from '../../stores/protocolStore';
import { ProtocolBlockEditor } from './ProtocolBlockEditor';
import { startProtocolExecution, stopProtocolExecution } from '../../utils/protocolRunner';
import type { BlockType, ProtocolBlock } from '../../stores/protocolStore';

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_TYPES: { type: BlockType; color: string; label: string }[] = [
  { type: 'baseline',    color: '#cccccc', label: 'BL' },
  { type: 'stimulus',    color: '#00d4ff', label: 'Stm' },
  { type: 'drug',        color: '#aa44ff', label: 'Drg' },
  { type: 'optogenetic', color: '#4488ff', label: 'Opto' },
  { type: 'lesion',      color: '#ff4444', label: 'Les' },
  { type: 'wait',        color: '#888888', label: 'Wait' },
  { type: 'measure',     color: '#44cc66', label: 'Meas' },
];

const LANE_HEIGHT = 38;
const LANE_COUNT = 3;
const RULER_HEIGHT = 22;
const MS_PER_PX = 2; // 1px = 2ms
const MIN_TIMELINE_WIDTH = 600;

const DEFAULT_DURATIONS: Record<BlockType, number> = {
  stimulus: 200,
  drug: 500,
  optogenetic: 300,
  lesion: 100,
  wait: 500,
  measure: 100,
  baseline: 500,
};

// ── Component ────────────────────────────────────────────────────────────────

export function ProtocolTimeline() {
  const blocks = useProtocolStore((s) => s.blocks);
  const totalDurationMs = useProtocolStore((s) => s.totalDurationMs);
  const nTrials = useProtocolStore((s) => s.nTrials);
  const interTrialIntervalMs = useProtocolStore((s) => s.interTrialIntervalMs);
  const isRunning = useProtocolStore((s) => s.isRunning);
  const currentBlockIndex = useProtocolStore((s) => s.currentBlockIndex);
  const currentTrialIndex = useProtocolStore((s) => s.currentTrialIndex);

  const addBlock = useProtocolStore((s) => s.addBlock);
  const moveBlock = useProtocolStore((s) => s.moveBlock);
  const updateBlock = useProtocolStore((s) => s.updateBlock);
  const setTrials = useProtocolStore((s) => s.setTrials);
  const setInterTrialInterval = useProtocolStore((s) => s.setInterTrialInterval);
  const reset = useProtocolStore((s) => s.reset);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    blockId: string;
    mode: 'move' | 'resize';
    startMouseX: number;
    startBlockMs: number;
    startDuration: number;
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  // Timeline dimensions
  const timelineWidth = Math.max(MIN_TIMELINE_WIDTH, (totalDurationMs + 500) / MS_PER_PX);
  const timelineHeight = RULER_HEIGHT + LANE_COUNT * LANE_HEIGHT;

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );

  // ── Palette: add block ─────────────────────────────────────────────────

  const handleAddBlock = useCallback(
    (type: BlockType) => {
      const startMs = totalDurationMs;
      addBlock({
        type,
        startMs,
        durationMs: DEFAULT_DURATIONS[type],
        lane: 0,
        params: {},
        label: type.charAt(0).toUpperCase() + type.slice(1),
      });
    },
    [totalDurationMs, addBlock],
  );

  // ── Drag handling ──────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, block: ProtocolBlock, mode: 'move' | 'resize') => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragState({
        blockId: block.id,
        mode,
        startMouseX: e.clientX,
        startBlockMs: block.startMs,
        startDuration: block.durationMs,
      });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startMouseX;
      const deltaMs = dx * MS_PER_PX;

      if (dragState.mode === 'move') {
        moveBlock(dragState.blockId, Math.max(0, dragState.startBlockMs + deltaMs));
      } else {
        const newDuration = Math.max(10, dragState.startDuration + deltaMs);
        updateBlock(dragState.blockId, { durationMs: Math.round(newDuration) });
      }
    },
    [dragState, moveBlock, updateBlock],
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  // ── Run / Stop ─────────────────────────────────────────────────────────

  const handleRun = useCallback(() => {
    if (isRunning) {
      stopProtocolExecution();
    } else {
      startProtocolExecution();
      window.dispatchEvent(new CustomEvent('neurevo-run-protocol'));
    }
  }, [isRunning]);

  const handleClear = useCallback(() => {
    if (isRunning) stopProtocolExecution();
    reset();
    setSelectedBlockId(null);
  }, [isRunning, reset]);

  // ── Ruler ticks ────────────────────────────────────────────────────────

  const rulerTicks = useMemo(() => {
    const ticks: { x: number; ms: number; major: boolean }[] = [];
    const maxMs = Math.max(totalDurationMs + 500, MIN_TIMELINE_WIDTH * MS_PER_PX);
    for (let ms = 0; ms <= maxMs; ms += 100) {
      ticks.push({ x: ms / MS_PER_PX, ms, major: ms % 500 === 0 });
    }
    return ticks;
  }, [totalDurationMs]);

  // ── Progress ───────────────────────────────────────────────────────────

  const progress = isRunning && blocks.length > 0
    ? ((currentBlockIndex + 1) / blocks.length) * 100
    : 0;

  return (
    <div
      style={{
        width: '100%',
        background: 'rgba(12, 16, 24, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Top bar: palette + controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {/* Block palette */}
        <div style={{ display: 'flex', gap: 3 }}>
          {BLOCK_TYPES.map(({ type, color, label }) => (
            <button
              key={type}
              title={`Add ${type} block`}
              onClick={() => handleAddBlock(type)}
              disabled={isRunning}
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '3px 7px',
                borderRadius: 4,
                border: `1px solid ${color}44`,
                background: `${color}18`,
                color,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                opacity: isRunning ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Trial controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-label)' }}>
          <span>Trials:</span>
          <input
            type="number"
            min={1}
            max={100}
            value={nTrials}
            onChange={(e) => setTrials(parseInt(e.target.value) || 1)}
            disabled={isRunning}
            style={{ ...numInputStyle, width: 40 }}
          />
          <span>ITI:</span>
          <input
            type="number"
            min={0}
            max={30000}
            step={100}
            value={interTrialIntervalMs}
            onChange={(e) => setInterTrialInterval(parseInt(e.target.value) || 0)}
            disabled={isRunning}
            style={{ ...numInputStyle, width: 56 }}
          />
          <span>ms</span>
        </div>

        {/* Run + Clear */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleRun}
            disabled={blocks.length === 0}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 14px',
              borderRadius: 5,
              border: 'none',
              background: isRunning
                ? 'rgba(255, 68, 68, 0.8)'
                : blocks.length === 0
                  ? 'rgba(68, 204, 102, 0.2)'
                  : 'rgba(68, 204, 102, 0.8)',
              color: '#fff',
              cursor: blocks.length === 0 ? 'not-allowed' : 'pointer',
              letterSpacing: 0.5,
            }}
          >
            {isRunning ? 'Stop' : 'Run Protocol'}
          </button>
          <button
            onClick={handleClear}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 5,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: 'var(--text-label)',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Progress bar (visible when running) */}
      {isRunning && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.03)' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #00d4ff, #44cc66)',
              transition: 'width 0.3s ease',
              borderRadius: 2,
            }}
          />
        </div>
      )}

      {/* Timeline area */}
      <div
        ref={timelineRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          cursor: dragState ? 'grabbing' : 'default',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={{ position: 'relative', width: timelineWidth, height: timelineHeight, minWidth: '100%' }}>
          {/* Ruler */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: RULER_HEIGHT }}>
            {rulerTicks.map(({ x, ms, major }) => (
              <div key={ms} style={{ position: 'absolute', left: x, top: 0, height: RULER_HEIGHT }}>
                <div
                  style={{
                    width: 1,
                    height: major ? 14 : 8,
                    background: major ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                    position: 'absolute',
                    bottom: 0,
                  }}
                />
                {major && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 1,
                      left: 2,
                      fontSize: 8,
                      color: 'rgba(255,255,255,0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ms}ms
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Lane dividers */}
          {Array.from({ length: LANE_COUNT }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: RULER_HEIGHT + i * LANE_HEIGHT,
                left: 0,
                width: '100%',
                height: 1,
                background: 'rgba(255,255,255,0.03)',
              }}
            />
          ))}

          {/* Blocks */}
          {blocks.map((block, idx) => {
            const bt = BLOCK_TYPES.find((t) => t.type === block.type);
            const color = bt?.color ?? '#888';
            const x = block.startMs / MS_PER_PX;
            const w = Math.max(20, block.durationMs / MS_PER_PX);
            const y = RULER_HEIGHT + block.lane * LANE_HEIGHT + 3;
            const isSelected = selectedBlockId === block.id;
            const isCurrent = isRunning && idx === currentBlockIndex;

            return (
              <div
                key={block.id}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: w,
                  height: LANE_HEIGHT - 6,
                  background: `${color}${isSelected ? '44' : '22'}`,
                  border: `1px solid ${color}${isSelected ? 'aa' : '55'}`,
                  borderRadius: 5,
                  cursor: dragState?.blockId === block.id ? 'grabbing' : 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  userSelect: 'none',
                  boxShadow: isCurrent ? `0 0 12px ${color}66` : 'none',
                  transition: 'box-shadow 0.2s',
                }}
                onClick={() => setSelectedBlockId(block.id)}
                onPointerDown={(e) => handlePointerDown(e, block, 'move')}
              >
                {/* Label text */}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color,
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    padding: '0 4px',
                    pointerEvents: 'none',
                  }}
                >
                  {block.label}
                </span>

                {/* Resize handle (right edge) */}
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    width: 6,
                    height: '100%',
                    cursor: 'ew-resize',
                    background: `${color}33`,
                    borderRadius: '0 5px 5px 0',
                  }}
                  onPointerDown={(e) => handlePointerDown(e, block, 'resize')}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          fontSize: 9,
          color: 'var(--text-label)',
        }}
      >
        <span>{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
        <span>Total: {totalDurationMs} ms</span>
        {isRunning && (
          <span style={{ color: '#44cc66' }}>
            Trial {currentTrialIndex + 1}/{nTrials} | Block {currentBlockIndex + 1}/{blocks.length}
          </span>
        )}
      </div>

      {/* Block editor modal */}
      {selectedBlock && !isRunning && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 9999,
            }}
            onClick={() => setSelectedBlockId(null)}
          />
          <ProtocolBlockEditor
            block={selectedBlock}
            onClose={() => setSelectedBlockId(null)}
          />
        </>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const numInputStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 4px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  textAlign: 'center',
  outline: 'none',
};
