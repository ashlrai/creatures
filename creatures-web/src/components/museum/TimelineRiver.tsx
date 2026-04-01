// ============================================================================
// TimelineRiver — 3D "river of time" scene using R3F
//
// A cinematic visualization where eras appear as glowing orbs along a flowing
// luminous river. The river forks into History (upper branch) and Science
// (lower branch) from a shared trunk. Camera animates smoothly to clicked
// era nodes before navigating into the era view.
// ============================================================================

import { useRef, useMemo, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ALL_ERAS } from '../../data/halls/index';
import { useMuseumStore } from '../../stores/museumStore';
import { EraNode } from './EraNode';
import { TimelineParticles } from './TimelineParticles';
import type { Era } from '../../data/knowledge-graph';

// ── Constants ───────────────────────────────────────────────────────────────

const X_MIN = -30;
const X_MAX = 30;
const X_RANGE = X_MAX - X_MIN;

// History wing Y positions — staggered to avoid overlap
const HISTORY_Y_BASE = 4;
const HISTORY_Y_OFFSETS = [3.5, 5.5, 3.5, 6.5, 3.5, 5.5]; // alternating, with extra push for overlapping eras

// Science wing Y positions — staggered
const SCIENCE_Y_BASE = -4;
const SCIENCE_Y_OFFSETS = [-3.5, -5.5, -3.5, -5.5];

// ── Layout helpers ──────────────────────────────────────────────────────────

function layoutEras(eras: Era[]) {
  const sorted = [...eras].sort((a, b) => {
    const midA = (a.years[0] + a.years[1]) / 2;
    const midB = (b.years[0] + b.years[1]) / 2;
    return midA - midB;
  });
  const history = sorted.filter(e => e.wing === 'history');
  const science = sorted.filter(e => e.wing === 'science');
  return { history, science, sorted };
}

// Map a midpoint year to an X coordinate using the FULL axis range.
// We use the earliest and latest midpoints from each wing separately so
// both wings span the full X range independently.
function yearToX(year: number, minMid: number, maxMid: number): number {
  if (maxMid === minMid) return 0;
  const t = (year - minMid) / (maxMid - minMid);
  return X_MIN + t * X_RANGE;
}

// Compute positions for all era nodes
function computePositions(eras: Era[]) {
  const { history, science } = layoutEras(eras);

  // Compute midpoints per wing
  const historyMids = history.map(e => (e.years[0] + e.years[1]) / 2);
  const scienceMids = science.map(e => (e.years[0] + e.years[1]) / 2);

  // Use global min/max midpoints across ALL eras for consistent X mapping
  const allMids = [...historyMids, ...scienceMids];
  const globalMinMid = Math.min(...allMids);
  const globalMaxMid = Math.max(...allMids);

  const positions = new Map<string, [number, number, number]>();

  // History wing — upper branch
  // Sort by midpoint, then place with staggered Y
  history.forEach((era, i) => {
    const midYear = (era.years[0] + era.years[1]) / 2;
    let x = yearToX(midYear, globalMinMid, globalMaxMid);

    // Check for near-overlap with previous era in the same wing
    // Renaissance (mid 1475) and Age of Exploration (mid 1500) are very close
    if (i > 0) {
      const prevPos = positions.get(history[i - 1].id);
      if (prevPos && Math.abs(x - prevPos[0]) < 4) {
        // Push this one to the right a bit
        x = prevPos[0] + 4;
      }
    }

    const y = HISTORY_Y_OFFSETS[i % HISTORY_Y_OFFSETS.length];
    positions.set(era.id, [x, y, 0]);
  });

  // Science wing — lower branch
  science.forEach((era, i) => {
    const midYear = (era.years[0] + era.years[1]) / 2;
    let x = yearToX(midYear, globalMinMid, globalMaxMid);

    if (i > 0) {
      const prevPos = positions.get(science[i - 1].id);
      if (prevPos && Math.abs(x - prevPos[0]) < 5) {
        x = prevPos[0] + 5;
      }
    }

    const y = SCIENCE_Y_OFFSETS[i % SCIENCE_Y_OFFSETS.length];
    positions.set(era.id, [x, y, 0]);
  });

  // Return overall year range for river drawing
  const allYears = eras.flatMap(e => e.years);
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);

  return { positions, minYear, maxYear };
}

// ── Smooth cubic easing ─────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Catmull-Rom spline helper ───────────────────────────────────────────────
// Generates smooth curves through a set of control points.

function catmullRomSpline(
  controlPoints: [number, number, number][],
  segmentsPerSpan: number = 20,
): [number, number, number][] {
  if (controlPoints.length < 2) return controlPoints;

  const result: [number, number, number][] = [];
  // Pad with duplicated endpoints for open spline
  const pts = [controlPoints[0], ...controlPoints, controlPoints[controlPoints.length - 1]];

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 * (
          (2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
        );
      const y =
        0.5 * (
          (2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
        );
      const z =
        0.5 * (
          (2 * p1[2]) +
          (-p0[2] + p2[2]) * t +
          (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
          (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3
        );

      result.push([x, y, z]);
    }
  }
  // Add the last point
  result.push(controlPoints[controlPoints.length - 1]);
  return result;
}

// ── River Path ──────────────────────────────────────────────────────────────

function RiverPath({
  positions,
  eras,
  wing,
}: {
  positions: Map<string, [number, number, number]>;
  eras: Era[];
  wing: 'history' | 'science';
}) {
  const lineRef = useRef<any>(null);

  const wingEras = useMemo(() => {
    return [...eras]
      .filter(e => e.wing === wing)
      .sort((a, b) => {
        const midA = (a.years[0] + a.years[1]) / 2;
        const midB = (b.years[0] + b.years[1]) / 2;
        return midA - midB;
      });
  }, [eras, wing]);

  const points = useMemo(() => {
    // Build control points: start from trunk, go through each era, extend past the end
    const controlPts: [number, number, number][] = [];

    // Trunk origin
    controlPts.push([X_MIN - 5, 0, 0]);

    // First era — approach point
    const firstPos = positions.get(wingEras[0]?.id);
    if (firstPos) {
      controlPts.push([firstPos[0] - 3, firstPos[1] * 0.4, 0]);
    }

    // Each era position
    for (const era of wingEras) {
      const pos = positions.get(era.id);
      if (pos) {
        controlPts.push([pos[0], pos[1], 0]);
      }
    }

    // Extend past last era
    const lastPos = positions.get(wingEras[wingEras.length - 1]?.id);
    if (lastPos) {
      controlPts.push([lastPos[0] + 5, lastPos[1], 0]);
      controlPts.push([X_MAX + 5, lastPos[1] * 0.7, 0]);
    }

    if (controlPts.length < 2) return [];
    return catmullRomSpline(controlPts, 24);
  }, [positions, wingEras]);

  const color = wing === 'history' ? '#9c6dff' : '#00e5ff';

  useFrame(() => {
    if (lineRef.current?.material) {
      const mat = lineRef.current.material as THREE.Material;
      mat.opacity = 0.45 + Math.sin(Date.now() * 0.001) * 0.1;
    }
  });

  if (points.length < 2) return null;

  return (
    <>
      {/* Main bright line */}
      <Line
        ref={lineRef}
        points={points}
        color={color}
        lineWidth={4}
        transparent
        opacity={0.5}
      />
      {/* Glow halo line — wider, more transparent */}
      <Line
        points={points}
        color={color}
        lineWidth={12}
        transparent
        opacity={0.08}
      />
    </>
  );
}

// Central trunk — the shared origin
function TrunkPath() {
  const points = useMemo(() => {
    return catmullRomSpline([
      [X_MIN - 10, 0, 0],
      [X_MIN - 5, 0, 0],
      [X_MIN - 2, 0, 0],
    ], 12);
  }, []);

  return (
    <>
      <Line
        points={points}
        color="#ffffff"
        lineWidth={4}
        transparent
        opacity={0.3}
      />
      <Line
        points={points}
        color="#ffffff"
        lineWidth={14}
        transparent
        opacity={0.05}
      />
    </>
  );
}

// ── Connection Lines between eras ───────────────────────────────────────────

function EraConnections({ eras, positions }: {
  eras: Era[];
  positions: Map<string, [number, number, number]>;
}) {
  const lines = useMemo(() => {
    const result: { points: [number, number, number][]; color: string }[] = [];
    for (const era of eras) {
      const fromPos = positions.get(era.id);
      if (!fromPos) continue;
      for (const followId of era.followedBy) {
        const toPos = positions.get(followId);
        if (!toPos) continue;
        // Smooth curve between connected eras
        const midX = (fromPos[0] + toPos[0]) / 2;
        const midY = (fromPos[1] + toPos[1]) / 2;
        const curvePoints = catmullRomSpline([
          fromPos,
          [midX, midY + 1.5, 0],
          toPos,
        ], 16);
        result.push({ points: curvePoints, color: era.color });
      }
    }
    return result;
  }, [eras, positions]);

  return (
    <>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={line.points}
          color={line.color}
          lineWidth={1.5}
          transparent
          opacity={0.15}
          dashed
          dashSize={0.4}
          gapSize={0.25}
        />
      ))}
    </>
  );
}

// ── Starfield Background ────────────────────────────────────────────────────

function Starfield() {
  const COUNT = 2000;

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const sz = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      // Distribute stars in a large sphere around the scene
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 50 + Math.random() * 50;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.3 + Math.random() * 0.7;
    }
    return [pos, sz];
  }, []);

  const ref = useRef<THREE.Points>(null!);

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.00003;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={0.15}
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── River Glow — additive plane beneath the river ───────────────────────────

function RiverGlow() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.05 + Math.sin(Date.now() * 0.0008) * 0.02;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -1]}>
      <planeGeometry args={[80, 25]} />
      <meshBasicMaterial
        color="#3a2aff"
        transparent
        opacity={0.05}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Wing Labels ─────────────────────────────────────────────────────────────

function WingLabels() {
  return (
    <>
      <Text
        position={[X_MIN - 3, 7, 0]}
        fontSize={0.8}
        color="#9c6dff"
        anchorX="left"
        anchorY="middle"
        font={undefined}
        outlineWidth={0.03}
        outlineColor="black"
        letterSpacing={0.15}
      >
        HISTORY WING
      </Text>
      <Text
        position={[X_MIN - 3, -7, 0]}
        fontSize={0.8}
        color="#00e5ff"
        anchorX="left"
        anchorY="middle"
        font={undefined}
        outlineWidth={0.03}
        outlineColor="black"
        letterSpacing={0.15}
      >
        SCIENCE WING
      </Text>
    </>
  );
}

// ── Title Text ──────────────────────────────────────────────────────────────

function TitleText() {
  const ref = useRef<any>(null);

  useFrame(() => {
    if (ref.current?.material) {
      ref.current.material.opacity = 0.35 + Math.sin(Date.now() * 0.0005) * 0.1;
    }
  });

  return (
    <Text
      ref={ref}
      position={[0, 9, -2]}
      fontSize={1.8}
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
      font={undefined}
      outlineWidth={0.04}
      outlineColor="#1a1a3a"
      letterSpacing={0.3}
      material-transparent
      material-opacity={0.4}
    >
      THE RIVER OF TIME
    </Text>
  );
}

// ── Camera Controller ───────────────────────────────────────────────────────

function CameraController({ focusTarget }: {
  focusTarget: [number, number, number] | null;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const posRef = useRef(new THREE.Vector3(0, 4, 40));

  useFrame((_, delta) => {
    const clampedDelta = Math.min(delta, 0.05);

    if (focusTarget) {
      targetRef.current.lerp(
        new THREE.Vector3(focusTarget[0], focusTarget[1], focusTarget[2]),
        clampedDelta * 2,
      );
      const desiredPos = new THREE.Vector3(
        focusTarget[0],
        focusTarget[1] + 3,
        focusTarget[2] + 14,
      );
      posRef.current.lerp(desiredPos, clampedDelta * 2);
    } else {
      // Default overview — pulled back to see everything
      targetRef.current.lerp(new THREE.Vector3(0, 0, 0), clampedDelta * 1.5);
      posRef.current.lerp(new THREE.Vector3(0, 4, 40), clampedDelta * 1.5);
    }

    camera.position.lerp(posRef.current, clampedDelta * 3);
    camera.lookAt(targetRef.current);
  });

  return null;
}

// ── Scene Contents ──────────────────────────────────────────────────────────

function TimelineScene() {
  const navigate = useMuseumStore(s => s.navigate);
  const [focusTarget, setFocusTarget] = useState<[number, number, number] | null>(null);

  const { positions, minYear, maxYear } = useMemo(
    () => computePositions(ALL_ERAS),
    [],
  );

  const handleNavigate = useCallback((eraId: string) => {
    navigate('era', eraId);
  }, [navigate]);

  const handleFocus = useCallback((pos: [number, number, number]) => {
    setFocusTarget(pos);
  }, []);

  const eraPositions = useMemo(() => {
    return ALL_ERAS.map(era => ({
      position: positions.get(era.id) || [0, 0, 0] as [number, number, number],
      color: era.color,
    }));
  }, [positions]);

  return (
    <>
      {/* Camera */}
      <CameraController focusTarget={focusTarget} />

      {/* Lighting */}
      <ambientLight intensity={0.12} color="#8888cc" />
      <directionalLight position={[20, 15, 10]} intensity={0.25} color="#ccccff" />
      <pointLight position={[-10, 12, 8]} intensity={0.5} color="#9c6dff" distance={80} />
      <pointLight position={[-10, -12, 8]} intensity={0.5} color="#00e5ff" distance={80} />
      <pointLight position={[20, 8, 8]} intensity={0.3} color="#ff6dff" distance={60} />
      <pointLight position={[20, -8, 8]} intensity={0.3} color="#00ffaa" distance={60} />

      {/* Starfield background */}
      <Starfield />

      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[120, 32, 16]} />
        <meshBasicMaterial color="#050510" side={THREE.BackSide} />
      </mesh>

      {/* Fog — pushed further out */}
      <fog attach="fog" args={['#050510', 50, 110]} />

      {/* Orbit controls */}
      <OrbitControls
        enableRotate
        enablePan
        enableZoom
        maxDistance={70}
        minDistance={8}
        maxPolarAngle={Math.PI * 0.75}
        minPolarAngle={Math.PI * 0.15}
        enableDamping
        dampingFactor={0.05}
        makeDefault
      />

      {/* River paths — smooth curves through era positions */}
      <TrunkPath />
      <RiverPath positions={positions} eras={ALL_ERAS} wing="history" />
      <RiverPath positions={positions} eras={ALL_ERAS} wing="science" />
      <RiverGlow />

      {/* Connection lines */}
      <EraConnections eras={ALL_ERAS} positions={positions} />

      {/* Title */}
      <TitleText />

      {/* Wing labels */}
      <WingLabels />

      {/* Era nodes */}
      {ALL_ERAS.map(era => {
        const pos = positions.get(era.id);
        if (!pos) return null;
        return (
          <EraNode
            key={era.id}
            era={era}
            position={pos}
            onNavigate={handleNavigate}
            onFocus={handleFocus}
          />
        );
      })}

      {/* Ambient particles */}
      <TimelineParticles eraPositions={eraPositions} />

      {/* Ground reference */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -12, 0]}>
        <planeGeometry args={[120, 50]} />
        <meshBasicMaterial
          color="#080818"
          transparent
          opacity={0.4}
        />
      </mesh>
    </>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function TimelineRiver() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#050510',
    }}>
      <Canvas
        camera={{
          position: [0, 4, 40],
          fov: 50,
          near: 0.1,
          far: 250,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.4,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <TimelineScene />
      </Canvas>

      {/* Vignette overlay — cinematic dark edges */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5,5,16,0.85) 100%)',
      }} />

      {/* Subtle top/bottom bars for cinematic feel */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(5,5,16,0.6), transparent)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(5,5,16,0.7), transparent)',
      }} />

      {/* Hint text */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.25)',
        fontSize: 11,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        textAlign: 'center',
      }}>
        Scroll to zoom &middot; Drag to orbit &middot; Click an era to explore
      </div>
    </div>
  );
}
