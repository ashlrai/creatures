import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

/**
 * FPS monitor that only appears when performance drops below 30fps.
 * Renders as an Html overlay inside the R3F canvas.
 */
export function PerformanceMonitor() {
  const [fps, setFps] = useState(60);
  const frameTimesRef = useRef<number[]>([]);
  const lastUpdateRef = useRef(0);

  useFrame((_, delta) => {
    // Collect frame times over a rolling window
    const frameTimes = frameTimesRef.current;
    frameTimes.push(delta);

    // Keep last 30 samples
    if (frameTimes.length > 30) {
      frameTimes.shift();
    }

    // Update the displayed FPS every 500ms to avoid excessive re-renders
    const now = performance.now();
    if (now - lastUpdateRef.current < 500) return;
    lastUpdateRef.current = now;

    // Calculate average FPS from recent frame deltas
    const avgDelta = frameTimes.reduce((sum, d) => sum + d, 0) / frameTimes.length;
    const currentFps = Math.round(1 / avgDelta);
    setFps(currentFps);
  });

  // Only visible when FPS drops below 30
  if (fps >= 30) return null;

  return (
    <Html
      position={[0, 0, 0]}
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        pointerEvents: 'none',
        zIndex: 50,
      }}
      // Prevent the Html element from following 3D position
      center={false}
      calculatePosition={() => [0, 0]}
    >
      <div
        style={{
          position: 'fixed',
          bottom: 88,
          right: 12,
          background: 'rgba(180, 30, 30, 0.75)',
          border: '1px solid rgba(255, 60, 60, 0.3)',
          borderRadius: 5,
          padding: '3px 8px',
          fontSize: 11,
          fontFamily: '"SF Mono", "Fira Code", monospace',
          fontWeight: 700,
          color: '#ff8888',
          pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
          whiteSpace: 'nowrap',
        }}
      >
        {fps}fps
      </div>
    </Html>
  );
}
