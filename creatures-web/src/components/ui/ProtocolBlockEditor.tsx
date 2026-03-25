import { useCallback } from 'react';
import { useProtocolStore } from '../../stores/protocolStore';
import type { ProtocolBlock } from '../../stores/protocolStore';

interface ProtocolBlockEditorProps {
  block: ProtocolBlock;
  onClose: () => void;
}

const COMPOUNDS = ['Picrotoxin', 'Aldicarb', 'Levamisole', 'Muscimol'] as const;
const OPSINS = ['ChR2', 'NpHR'] as const;
const METRICS = ['firing_rate', 'spike_count', 'synchrony', 'behavior'] as const;

const BLOCK_COLORS: Record<string, string> = {
  stimulus: '#00d4ff',
  drug: '#aa44ff',
  optogenetic: '#4488ff',
  lesion: '#ff4444',
  wait: '#888888',
  measure: '#44cc66',
  baseline: '#cccccc',
};

export function ProtocolBlockEditor({ block, onClose }: ProtocolBlockEditorProps) {
  const updateBlock = useProtocolStore((s) => s.updateBlock);
  const removeBlock = useProtocolStore((s) => s.removeBlock);

  const setParam = useCallback(
    (key: string, value: unknown) => {
      updateBlock(block.id, { params: { ...block.params, [key]: value } });
    },
    [block.id, block.params, updateBlock],
  );

  const handleDelete = useCallback(() => {
    removeBlock(block.id);
    onClose();
  }, [block.id, removeBlock, onClose]);

  const color = BLOCK_COLORS[block.type] ?? '#888';

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        width: 320,
        background: 'rgba(12, 16, 24, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: '#000',
            background: color,
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {block.type}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-label)' }}>Block Editor</span>
      </div>

      {/* Label */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={labelStyle}>Label</label>
        <input
          type="text"
          value={block.label}
          onChange={(e) => updateBlock(block.id, { label: e.target.value })}
          style={inputStyle}
        />
      </div>

      {/* Duration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={labelStyle}>Duration: {block.durationMs} ms</label>
        <input
          type="range"
          min={10}
          max={5000}
          step={10}
          value={block.durationMs}
          onChange={(e) => updateBlock(block.id, { durationMs: parseInt(e.target.value) })}
          style={{ accentColor: color, cursor: 'pointer' }}
        />
      </div>

      {/* Lane */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={labelStyle}>Lane</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map((l) => (
            <button
              key={l}
              onClick={() => updateBlock(block.id, { lane: l })}
              style={{
                flex: 1,
                padding: '3px 0',
                fontSize: 10,
                fontWeight: block.lane === l ? 700 : 400,
                background: block.lane === l ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: `1px solid ${block.lane === l ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 4,
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {l + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Type-specific params */}
      {block.type === 'stimulus' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Neuron IDs (comma-separated)</label>
            <input
              type="text"
              value={(block.params.neuronIds as string) ?? ''}
              onChange={(e) => setParam('neuronIds', e.target.value)}
              placeholder="AVAL, AVAR, AVBL..."
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Current: {(block.params.current as number) ?? 15} nA</label>
            <input
              type="range"
              min={1}
              max={100}
              value={(block.params.current as number) ?? 15}
              onChange={(e) => setParam('current', parseInt(e.target.value))}
              style={{ accentColor: color, cursor: 'pointer' }}
            />
          </div>
        </>
      )}

      {block.type === 'drug' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Compound</label>
            <select
              value={(block.params.compound as string) ?? 'Picrotoxin'}
              onChange={(e) => setParam('compound', e.target.value)}
              style={inputStyle}
            >
              {COMPOUNDS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>
              Dose: {((block.params.dose as number) ?? 1).toFixed(2)} uM
            </label>
            <input
              type="range"
              min={0.01}
              max={100}
              step={0.01}
              value={(block.params.dose as number) ?? 1}
              onChange={(e) => setParam('dose', parseFloat(e.target.value))}
              style={{ accentColor: color, cursor: 'pointer' }}
            />
          </div>
        </>
      )}

      {block.type === 'optogenetic' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Opsin</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {OPSINS.map((o) => (
                <button
                  key={o}
                  onClick={() => setParam('opsin', o)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: 10,
                    fontWeight: (block.params.opsin ?? 'ChR2') === o ? 700 : 400,
                    background:
                      (block.params.opsin ?? 'ChR2') === o
                        ? 'rgba(68,136,255,0.2)'
                        : 'transparent',
                    border: `1px solid ${(block.params.opsin ?? 'ChR2') === o ? 'rgba(68,136,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>
              Intensity: {(block.params.intensity as number) ?? 50}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={(block.params.intensity as number) ?? 50}
              onChange={(e) => setParam('intensity', parseInt(e.target.value))}
              style={{ accentColor: color, cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>
              Frequency: {(block.params.frequency as number) ?? 20} Hz
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={(block.params.frequency as number) ?? 20}
              onChange={(e) => setParam('frequency', parseInt(e.target.value))}
              style={{ accentColor: color, cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={labelStyle}>Target Neurons (comma-separated)</label>
            <input
              type="text"
              value={(block.params.targetNeurons as string) ?? ''}
              onChange={(e) => setParam('targetNeurons', e.target.value)}
              placeholder="AVAL, AVAR..."
              style={inputStyle}
            />
          </div>
        </>
      )}

      {block.type === 'lesion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={labelStyle}>Target Neurons (comma-separated)</label>
          <input
            type="text"
            value={(block.params.targetNeurons as string) ?? ''}
            onChange={(e) => setParam('targetNeurons', e.target.value)}
            placeholder="DD1, VD1, AVL..."
            style={inputStyle}
          />
        </div>
      )}

      {block.type === 'measure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={labelStyle}>Metric</label>
          <select
            value={(block.params.metric as string) ?? 'firing_rate'}
            onChange={(e) => setParam('metric', e.target.value)}
            style={inputStyle}
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={handleDelete}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(255, 68, 68, 0.15)',
            border: '1px solid rgba(255, 68, 68, 0.3)',
            borderRadius: 6,
            color: '#ff4444',
            cursor: 'pointer',
          }}
        >
          Delete Block
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: 'var(--text-label)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '5px 8px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'var(--font-mono)',
};
