import { useRef, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useFrame, invalidate } from '@react-three/fiber';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COUNT = 120;
const LINE_COUNT = 200;
const ROTATION_SPEED = 0.1; // rad/s
const PULSE_INTERVAL_MS = 100;
const PULSE_DECAY = 0.04; // brightness decay per frame (~30fps)
const CONNECTION_MAX_DIST = 1.6;

// Teal/blue palette endpoints
const COLOR_A = new THREE.Color('#0891b2');
const COLOR_B = new THREE.Color('#0066cc');

// ---------------------------------------------------------------------------
// Geometry helpers (pure functions, no side-effects)
// ---------------------------------------------------------------------------

/** Golden-angle spiral distributed within an ellipsoidal volume. */
function buildNodePositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    // Distribute along y in [-1, 1]
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    // Ellipsoidal radii: wider on x/z, shorter on y (brain-like)
    const scaleX = 2.2;
    const scaleY = 1.4;
    const scaleZ = 1.8;

    // Add slight randomness for organic feel
    const jitter = 0.15;
    const rx = (Math.random() - 0.5) * jitter;
    const ry = (Math.random() - 0.5) * jitter;
    const rz = (Math.random() - 0.5) * jitter;

    positions[i * 3] = (Math.cos(theta) * radiusAtY * scaleX + rx);
    positions[i * 3 + 1] = (y * scaleY + ry);
    positions[i * 3 + 2] = (Math.sin(theta) * radiusAtY * scaleZ + rz);
  }

  return positions;
}

function buildNodeColors(count: number): Float32Array {
  const colors = new Float32Array(count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const t = Math.random();
    tmp.copy(COLOR_A).lerp(COLOR_B, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  return colors;
}

/** Find nearby node pairs and return line segment positions + colors. */
function buildConnections(
  nodePositions: Float32Array,
  nodeCount: number,
  maxLines: number,
  maxDist: number,
): { positions: Float32Array; colors: Float32Array; count: number } {
  const candidates: { i: number; j: number; dist: number }[] = [];

  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      const dx = nodePositions[i * 3] - nodePositions[j * 3];
      const dy = nodePositions[i * 3 + 1] - nodePositions[j * 3 + 1];
      const dz = nodePositions[i * 3 + 2] - nodePositions[j * 3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < maxDist) {
        candidates.push({ i, j, dist });
      }
    }
  }

  // Sort by distance and take the closest ones
  candidates.sort((a, b) => a.dist - b.dist);
  const selected = candidates.slice(0, maxLines);
  const count = selected.length;

  const positions = new Float32Array(count * 6); // 2 vertices * 3 components
  const colors = new Float32Array(count * 6);
  const tmp = new THREE.Color();

  for (let k = 0; k < count; k++) {
    const { i, j, dist } = selected[k];
    // Positions: two endpoints per segment
    positions[k * 6] = nodePositions[i * 3];
    positions[k * 6 + 1] = nodePositions[i * 3 + 1];
    positions[k * 6 + 2] = nodePositions[i * 3 + 2];
    positions[k * 6 + 3] = nodePositions[j * 3];
    positions[k * 6 + 4] = nodePositions[j * 3 + 1];
    positions[k * 6 + 5] = nodePositions[j * 3 + 2];

    // Fade opacity with distance via color brightness
    const brightness = 0.35 * (1 - dist / maxDist);
    tmp.copy(COLOR_A).multiplyScalar(brightness);
    colors[k * 6] = tmp.r;
    colors[k * 6 + 1] = tmp.g;
    colors[k * 6 + 2] = tmp.b;
    colors[k * 6 + 3] = tmp.r;
    colors[k * 6 + 4] = tmp.g;
    colors[k * 6 + 5] = tmp.b;
  }

  return { positions, colors, count };
}

// ---------------------------------------------------------------------------
// Inner scene components (must be children of Canvas)
// ---------------------------------------------------------------------------

function NeuralCloud() {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const pulseTimerRef = useRef(0);

  // Base colors stored separately so we can brighten per-node for pulses
  const { nodePositions, baseColors, currentColors, lineData } = useMemo(() => {
    const nodePositions = buildNodePositions(NODE_COUNT);
    const baseColors = buildNodeColors(NODE_COUNT);
    const currentColors = new Float32Array(baseColors);
    const lineData = buildConnections(nodePositions, NODE_COUNT, LINE_COUNT, CONNECTION_MAX_DIST);
    return { nodePositions, baseColors, currentColors, lineData };
  }, []);

  // Track active pulses: array of { nodeIndex, brightness }
  const pulsesRef = useRef<{ idx: number; extra: number }[]>([]);

  useFrame((_, delta) => {
    if (!groupRef.current || !pointsRef.current) return;

    // --- Ambient rotation ---
    groupRef.current.rotation.y += ROTATION_SPEED * delta;

    // --- Pulse timer ---
    pulseTimerRef.current += delta * 1000;
    if (pulseTimerRef.current >= PULSE_INTERVAL_MS) {
      pulseTimerRef.current -= PULSE_INTERVAL_MS;
      const idx = Math.floor(Math.random() * NODE_COUNT);
      pulsesRef.current.push({ idx, extra: 1.0 });
    }

    // --- Update vertex colors ---
    const colAttr = pointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = colAttr.array as Float32Array;

    // Reset to base
    arr.set(baseColors);

    // Apply and decay pulses
    const active = pulsesRef.current;
    for (let p = active.length - 1; p >= 0; p--) {
      const pulse = active[p];
      pulse.extra -= PULSE_DECAY;
      if (pulse.extra <= 0) {
        active.splice(p, 1);
        continue;
      }
      const i3 = pulse.idx * 3;
      arr[i3] = Math.min(1, arr[i3] + pulse.extra);
      arr[i3 + 1] = Math.min(1, arr[i3 + 1] + pulse.extra * 0.9);
      arr[i3 + 2] = Math.min(1, arr[i3 + 2] + pulse.extra * 0.7);
    }

    colAttr.needsUpdate = true;
    invalidate();
  });

  return (
    <group ref={groupRef}>
      {/* Nodes */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={nodePositions}
            count={NODE_COUNT}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={currentColors}
            count={NODE_COUNT}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.14}
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Connection lines */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={lineData.positions}
            count={lineData.count * 2}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={lineData.colors}
            count={lineData.count * 2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/** Throttled invalidation loop to cap rendering at ~30fps in demand mode. */
function FrameThrottle() {
  const lastRef = useRef(0);

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    if (now - lastRef.current > 1 / 30) {
      lastRef.current = now;
      invalidate();
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export function HeroVisualization() {
  return (
    <Canvas
      frameloop="always"
      gl={{ alpha: false, antialias: true }}
      camera={{ position: [0, -0.8, 3.2], fov: 55 }}
      style={{ background: '#040810' }}
    >
      <FrameThrottle />
      <NeuralCloud />
    </Canvas>
  );
}
