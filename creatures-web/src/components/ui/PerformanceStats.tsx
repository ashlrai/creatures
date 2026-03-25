import { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useSimulationStore } from '../../stores/simulationStore';
import { useUIPreferencesStore } from '../../stores/uiPreferencesStore';

/**
 * Compact performance overlay showing FPS, frame time, neuron/synapse counts,
 * and draw calls. Only visible in research mode (or toggled with F3).
 *
 * Renders inside the R3F canvas via drei's Html component.
 */
export function PerformanceStats() {
  const researchMode = useUIPreferencesStore((s) => s.researchMode);
  const [forceVisible, setForceVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  const [drawCalls, setDrawCalls] = useState(0);

  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 0;
  const nSynapses = experiment?.n_synapses ?? 0;

  const frameTimesRef = useRef<number[]>([]);
  const lastUpdateRef = useRef(0);

  // F3 keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setForceVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const gl = useThree((s) => s.gl);

  useFrame((_, delta) => {
    const times = frameTimesRef.current;
    times.push(delta);
    if (times.length > 60) times.shift();

    const now = performance.now();
    if (now - lastUpdateRef.current < 500) return;
    lastUpdateRef.current = now;

    const avgDelta = times.reduce((s, d) => s + d, 0) / times.length;
    setFps(Math.round(1 / avgDelta));
    setFrameTime(+(avgDelta * 1000).toFixed(1));

    // Read renderer info
    if (gl?.info) {
      setDrawCalls(gl.info.render?.calls ?? 0);
    }
  });

  const visible = researchMode || forceVisible;
  if (!visible) return null;

  const opacity = hovered ? 0.9 : 0.3;

  return (
    <Html
      position={[0, 0, 0]}
      style={{
        position: 'fixed',
        top: 52,
        right: 12,
        pointerEvents: 'auto',
        zIndex: 40,
      }}
      center={false}
      calculatePosition={() => [0, 0]}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'fixed',
          top: 52,
          right: 12,
          background: 'rgba(6, 8, 18, 0.7)',
          border: '1px solid rgba(80, 130, 200, 0.1)',
          borderRadius: 6,
          padding: '5px 8px',
          fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
          fontSize: 9,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          opacity,
          transition: 'opacity 0.3s ease',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          minWidth: 100,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--text-label)' }}>FPS</span>
          <span style={{ color: fps < 30 ? '#ff6666' : fps < 50 ? '#ffaa44' : 'var(--accent-green)', fontWeight: 700 }}>
            {fps}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--text-label)' }}>frame</span>
          <span>{frameTime}ms</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--text-label)' }}>neurons</span>
          <span style={{ color: 'var(--accent-cyan)' }}>{nNeurons}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--text-label)' }}>synapses</span>
          <span style={{ color: 'var(--accent-cyan)' }}>{nSynapses}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--text-label)' }}>draws</span>
          <span>{drawCalls}</span>
        </div>
        {!researchMode && (
          <div style={{ fontSize: 8, color: 'var(--text-label)', marginTop: 2, textAlign: 'center' }}>
            F3 to hide
          </div>
        )}
      </div>
    </Html>
  );
}
