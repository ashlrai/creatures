import { useState, useCallback, useRef } from 'react';

const PRESETS: Record<string, { tau_m: number; tau_syn: number; weight_scale: number; label: string }> = {
  default: { tau_m: 15, tau_syn: 8, weight_scale: 3.0, label: 'Default' },
  excitable: { tau_m: 8, tau_syn: 4, weight_scale: 5.0, label: 'High Excitability' },
  slow: { tau_m: 35, tau_syn: 15, weight_scale: 2.0, label: 'Slow Dynamics' },
  chaotic: { tau_m: 5, tau_syn: 2, weight_scale: 8.0, label: 'Chaotic' },
};

interface Params {
  tau_m: number;
  tau_syn: number;
  weight_scale: number;
}

export function ParameterPanel() {
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Params>({ tau_m: 15, tau_syn: 8, weight_scale: 3.0 });
  const [status, setStatus] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendParams = useCallback((newParams: Params) => {
    // Debounce parameter sends
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('neurevo-command', {
        detail: { type: 'set_params', ...newParams },
      }));
      setStatus('Parameters sent');
      setTimeout(() => setStatus(null), 1500);
    }, 300);
  }, []);

  const updateParam = useCallback((key: keyof Params, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      sendParams(next);
      return next;
    });
  }, [sendParams]);

  const applyPreset = useCallback((presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (preset) {
      const next = { tau_m: preset.tau_m, tau_syn: preset.tau_syn, weight_scale: preset.weight_scale };
      setParams(next);
      sendParams(next);
    }
  }, [sendParams]);

  return (
    <div className="glass">
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
        <span className="glass-label" style={{ margin: 0 }}>Neural Parameters</span>
        <span style={{ fontSize: 10, color: 'var(--text-label)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {/* Presets */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                className="btn btn-ghost"
                style={{ flex: '1 1 45%', fontSize: 9, padding: '3px 6px' }}
                onClick={() => applyPreset(key)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* tau_m slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-label)' }}>Membrane tau (ms)</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{params.tau_m.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={params.tau_m}
              onChange={(e) => updateParam('tau_m', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {/* tau_syn slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-label)' }}>Synaptic tau (ms)</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{params.tau_syn.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={params.tau_syn}
              onChange={(e) => updateParam('tau_syn', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {/* weight_scale slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-label)' }}>Weight scale</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{params.weight_scale.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={params.weight_scale}
              onChange={(e) => updateParam('weight_scale', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {status && (
            <div style={{ fontSize: 10, color: 'var(--accent-green)', textAlign: 'center' }}>
              {status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
