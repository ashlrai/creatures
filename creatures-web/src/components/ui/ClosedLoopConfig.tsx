import { useState, useEffect, useRef, useCallback } from 'react';
import { useOptogeneticsStore } from '../../stores/optogeneticsStore';
import { useSimulationStore } from '../../stores/simulationStore';

interface ClosedLoopConfigProps {
  opsinColor?: string;
}

export function ClosedLoopConfig({ opsinColor = 'var(--accent-cyan)' }: ClosedLoopConfigProps) {
  const [expanded, setExpanded] = useState(false);
  const [triggerNeuronId, setTriggerNeuronId] = useState('');
  const [comparison, setComparison] = useState<'>' | '<'>('>');
  const [threshold, setThreshold] = useState(30);
  const [actionDuration, setActionDuration] = useState(500);
  const [cooldown, setCooldown] = useState(2000);
  const [flashVisible, setFlashVisible] = useState(false);

  const rules = useOptogeneticsStore((s) => s.closedLoopRules);
  const configs = useOptogeneticsStore((s) => s.configs);
  const addRule = useOptogeneticsStore((s) => s.addClosedLoopRule);
  const removeRule = useOptogeneticsStore((s) => s.removeClosedLoopRule);
  const toggleRule = useOptogeneticsStore((s) => s.toggleClosedLoopRule);
  const updateLastTriggered = useOptogeneticsStore((s) => s.updateClosedLoopLastTriggered);
  const frame = useSimulationStore((s) => s.frame);

  const rafRef = useRef<number>(0);
  const lastCheckRef = useRef<number>(0);

  // Closed-loop evaluation: check firing rates each frame
  const evaluateRules = useCallback(() => {
    const now = Date.now();
    const currentFrame = useSimulationStore.getState().frame;
    if (!currentFrame) return;

    const currentRules = useOptogeneticsStore.getState().closedLoopRules;
    const currentConfigs = useOptogeneticsStore.getState().configs;

    for (const rule of currentRules) {
      if (!rule.enabled) continue;
      if (now - rule.lastTriggered < rule.cooldownMs) continue;

      // Find the neuron index — try parsing numeric ID or searching by string
      const neuronIdx = parseInt(rule.triggerNeuronId, 10);
      if (isNaN(neuronIdx) || neuronIdx < 0 || neuronIdx >= currentFrame.firing_rates.length) continue;

      const rate = currentFrame.firing_rates[neuronIdx];
      const triggered =
        rule.triggerComparison === '>'
          ? rate > rule.triggerThreshold
          : rate < rule.triggerThreshold;

      if (triggered) {
        // Find the config to activate
        const config = currentConfigs.find((c) => c.id === rule.actionConfigId);
        if (config && !config.isActive) {
          useOptogeneticsStore.getState().activateConfig(config.id);
          updateLastTriggered(rule.id, now);

          // Visual flash
          setFlashVisible(true);
          setTimeout(() => setFlashVisible(false), 300);

          // Auto-deactivate after the action duration built into the config's pattern
        }
      }
    }
  }, [updateLastTriggered]);

  // Run evaluation loop when any rules are enabled
  useEffect(() => {
    const hasEnabledRules = rules.some((r) => r.enabled);
    if (!hasEnabledRules) return;

    let running = true;
    const tick = () => {
      if (!running) return;
      const now = Date.now();
      // Evaluate at ~30Hz to avoid excessive checks
      if (now - lastCheckRef.current > 33) {
        lastCheckRef.current = now;
        evaluateRules();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [rules, evaluateRules]);

  const handleAddRule = useCallback(() => {
    if (!triggerNeuronId || configs.length === 0) return;

    // Default to the most recently created config
    const latestConfig = configs[configs.length - 1];

    addRule({
      triggerNeuronId,
      triggerMetric: 'firing_rate',
      triggerThreshold: threshold,
      triggerComparison: comparison,
      actionConfigId: latestConfig.id,
      cooldownMs: cooldown,
      enabled: true,
    });
  }, [triggerNeuronId, threshold, comparison, cooldown, configs, addRule]);

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-label)',
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 5,
    border: '1px solid var(--border-subtle)',
    background: 'rgba(255,255,255,0.03)',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 8,
        position: 'relative',
      }}
    >
      {/* Flash overlay on trigger */}
      {flashVisible && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `${opsinColor}15`,
            borderRadius: 'var(--radius)',
            pointerEvents: 'none',
            animation: 'clFlash 0.3s ease-out forwards',
            zIndex: 1,
          }}
        />
      )}
      <style>{`
        @keyframes clFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

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
        <span style={{ ...sectionLabelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          Closed-Loop Control
          {rules.some((r) => r.enabled) && (
            <span
              style={{
                display: 'inline-block',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent-green)',
                boxShadow: '0 0 4px var(--accent-green)',
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

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {/* Trigger condition builder */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              Trigger condition:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-label)' }}>When neuron</span>
              <input
                type="text"
                placeholder="ID"
                value={triggerNeuronId}
                onChange={(e) => setTriggerNeuronId(e.target.value)}
                style={{ ...inputStyle, width: 48 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-label)' }}>firing rate</span>
              <select
                value={comparison}
                onChange={(e) => setComparison(e.target.value as '>' | '<')}
                style={{
                  ...inputStyle,
                  width: 36,
                  padding: '3px 4px',
                  cursor: 'pointer',
                  appearance: 'none',
                  textAlign: 'center',
                }}
              >
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
              </select>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                style={{ ...inputStyle, width: 48 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-label)' }}>Hz</span>
            </div>
          </div>

          {/* Action duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-label)' }}>Activate config for</span>
            <input
              type="number"
              value={actionDuration}
              onChange={(e) => setActionDuration(Number(e.target.value))}
              style={{ ...inputStyle, width: 60 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-label)' }}>ms</span>
          </div>

          {/* Cooldown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-label)' }}>Cooldown</span>
            <input
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
              style={{ ...inputStyle, width: 60 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-label)' }}>ms between triggers</span>
          </div>

          {/* Add rule button */}
          <button
            className="btn btn-ghost"
            style={{ fontSize: 10, padding: '4px 10px', alignSelf: 'flex-start' }}
            onClick={handleAddRule}
            disabled={!triggerNeuronId || configs.length === 0}
          >
            + Add Rule
          </button>

          {/* Active rules list */}
          {rules.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={sectionLabelStyle}>Active Rules</div>
              {rules.map((rule) => {
                const timeSinceTriggered = rule.lastTriggered > 0
                  ? Math.round((Date.now() - rule.lastTriggered) / 1000)
                  : null;

                return (
                  <div
                    key={rule.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      borderRadius: 5,
                      background: rule.enabled ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${rule.enabled ? 'rgba(0,255,136,0.12)' : 'var(--border-subtle)'}`,
                      gap: 6,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        N{rule.triggerNeuronId} rate {rule.triggerComparison} {rule.triggerThreshold}Hz
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-label)' }}>
                        {timeSinceTriggered !== null
                          ? `Last triggered: ${timeSinceTriggered}s ago`
                          : 'Waiting for trigger...'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleRule(rule.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 10,
                          color: rule.enabled ? 'var(--accent-green)' : 'var(--text-label)',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 4px',
                        }}
                      >
                        {rule.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => removeRule(rule.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: 'var(--text-label)',
                          padding: '0 4px',
                          lineHeight: 1,
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
