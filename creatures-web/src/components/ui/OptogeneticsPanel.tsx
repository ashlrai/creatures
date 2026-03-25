import { useState, useCallback, useMemo } from 'react';
import { useOptogeneticsStore, type OpsinType, type LightPattern } from '../../stores/optogeneticsStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { WaveformEditor } from './WaveformEditor';
import { ClosedLoopConfig } from './ClosedLoopConfig';

const OPSIN_META: Record<OpsinType, { label: string; sublabel: string; color: string }> = {
  ChR2:   { label: 'ChR2',   sublabel: 'Excitatory', color: '#00d4ff' },
  NpHR:   { label: 'NpHR',   sublabel: 'Inhibitory', color: '#ffaa22' },
  custom: { label: 'Custom', sublabel: 'User-defined', color: '#b366ff' },
};

const DEFAULT_PATTERN: LightPattern = {
  type: 'pulse',
  frequency: 20,
  dutyCycle: 0.5,
  duration: 2000,
  intensity: 0.7,
};

export function OptogeneticsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [opsin, setOpsin] = useState<OpsinType>('ChR2');
  const [targetNeurons, setTargetNeurons] = useState<string[]>([]);
  const [pattern, setPattern] = useState<LightPattern>(DEFAULT_PATTERN);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);

  const selectedNeurons = useCircuitModificationStore((s) => s.selectedNeurons);
  const configs = useOptogeneticsStore((s) => s.configs);
  const addConfig = useOptogeneticsStore((s) => s.addConfig);
  const activateConfig = useOptogeneticsStore((s) => s.activateConfig);
  const deactivateConfig = useOptogeneticsStore((s) => s.deactivateConfig);

  const isActive = useMemo(() => {
    if (!activeConfigId) return false;
    return configs.find((c) => c.id === activeConfigId)?.isActive ?? false;
  }, [activeConfigId, configs]);

  const opsinColor = OPSIN_META[opsin].color;

  const handleUseSelection = useCallback(() => {
    setTargetNeurons([...selectedNeurons]);
  }, [selectedNeurons]);

  const handleToggleActivation = useCallback(() => {
    if (isActive && activeConfigId) {
      deactivateConfig(activeConfigId);
      setActiveConfigId(null);
      return;
    }

    if (targetNeurons.length === 0) return;

    // Create a new config or reuse existing one
    const newConfig = {
      opsin,
      targetNeurons,
      pattern,
      isActive: false,
    };
    addConfig(newConfig);

    // The newest config will be the last one after state update
    // We need to get the ID after it's added — use a microtask to read the latest state
    setTimeout(() => {
      const latest = useOptogeneticsStore.getState().configs;
      const added = latest[latest.length - 1];
      if (added) {
        setActiveConfigId(added.id);
        activateConfig(added.id);
      }
    }, 0);
  }, [isActive, activeConfigId, targetNeurons, opsin, pattern, addConfig, activateConfig, deactivateConfig]);

  return (
    <div className="glass" style={{ borderColor: isActive ? `${opsinColor}33` : undefined }}>
      <button
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="glass-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          Optogenetics
          {isActive && (
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: opsinColor,
                boxShadow: `0 0 6px ${opsinColor}`,
                animation: 'optoPulse 1.2s ease-in-out infinite',
              }}
            />
          )}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-label)',
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        >
          &#9660;
        </span>
      </button>

      {/* Inline keyframes for the pulsing indicator */}
      <style>{`
        @keyframes optoPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
          50% { opacity: 0.4; box-shadow: 0 0 10px currentColor; }
        }
      `}</style>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {/* Opsin type selector */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: 4 }}>
              Opsin Type
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(Object.keys(OPSIN_META) as OpsinType[]).map((key) => {
                const meta = OPSIN_META[key];
                const selected = opsin === key;
                return (
                  <button
                    key={key}
                    onClick={() => setOpsin(key)}
                    style={{
                      flex: 1,
                      padding: '5px 4px',
                      borderRadius: 6,
                      border: `1px solid ${selected ? meta.color + '44' : 'var(--border-subtle)'}`,
                      background: selected ? meta.color + '15' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: selected ? meta.color : 'var(--text-secondary)' }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 8, color: selected ? meta.color + 'aa' : 'var(--text-label)' }}>
                      {meta.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target neurons */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: 4 }}>
              Target Neurons
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: targetNeurons.length > 0 ? 'var(--accent-green)' : 'var(--text-label)' }}>
                {targetNeurons.length > 0
                  ? `${targetNeurons.length} neuron${targetNeurons.length > 1 ? 's' : ''} targeted`
                  : 'No neurons targeted'}
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 9, padding: '2px 8px' }}
                onClick={handleUseSelection}
                disabled={selectedNeurons.length === 0}
              >
                Use Selection ({selectedNeurons.length})
              </button>
            </div>
            {targetNeurons.length > 0 && (
              <div
                style={{
                  maxHeight: 60,
                  overflowY: 'auto',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 3,
                  padding: 4,
                  borderRadius: 4,
                  background: 'rgba(0,0,0,0.2)',
                }}
              >
                {targetNeurons.map((nid) => (
                  <span
                    key={nid}
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: `${opsinColor}15`,
                      color: opsinColor,
                      border: `1px solid ${opsinColor}22`,
                    }}
                  >
                    {nid}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Waveform editor */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: 4 }}>
              Light Pattern
            </div>
            <WaveformEditor
              pattern={pattern}
              onChange={setPattern}
              opsinColor={opsinColor}
            />
          </div>

          {/* Activate / Deactivate button */}
          <button
            onClick={handleToggleActivation}
            disabled={!isActive && targetNeurons.length === 0}
            style={{
              width: '100%',
              padding: '8px 0',
              borderRadius: 7,
              border: isActive
                ? '1px solid rgba(255, 60, 60, 0.3)'
                : `1px solid ${opsinColor}33`,
              background: isActive
                ? 'rgba(255, 40, 40, 0.12)'
                : `linear-gradient(135deg, ${opsinColor}22, ${opsinColor}11)`,
              color: isActive ? '#ff6666' : opsinColor,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              cursor: targetNeurons.length === 0 && !isActive ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: (!isActive && targetNeurons.length === 0) ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isActive && (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ff4444',
                  animation: 'optoPulse 1s ease-in-out infinite',
                }}
              />
            )}
            {isActive ? 'Deactivate' : 'Activate'}
          </button>

          {/* Active status */}
          {isActive && (
            <div style={{ fontSize: 10, color: opsinColor, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: opsinColor,
                  animation: 'optoPulse 1.2s ease-in-out infinite',
                }}
              />
              Stimulating {targetNeurons.length} neuron{targetNeurons.length > 1 ? 's' : ''} via {OPSIN_META[opsin].label}
            </div>
          )}

          {/* Closed-loop control sub-panel */}
          <ClosedLoopConfig opsinColor={opsinColor} />
        </div>
      )}
    </div>
  );
}
