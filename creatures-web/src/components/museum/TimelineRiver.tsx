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

// ── Layout helpers ──────────────────────────────────────────────────────────

// Sort eras by start year, then separate by wing
function layoutEras(eras: Era[]) {
  const sorted = [...eras].sort((a, b) => a.years[0] - b.years[0]);
  const history = sorted.filter(e => e.wing === 'history');
  const science = sorted.filter(e => e.wing === 'science');
  return { history, science, sorted };
}

// Map a year to an X coordinate along the river
function yearToX(year: number, minYear: number, maxYear: number): number {
  const range = maxYear - minYear || 1;
  return ((year - minYear) / range) * 50 - 25; // spread across -25..+25
}

// Compute positions for all era nodes
function computePositions(eras: Era[]) {
  const { history, science } = layoutEras(eras);
  const allYears = eras.flatMap(e => e.years);
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);

  const positions = new Map<string, [number, number, number]>();

  // History wing — upper branch (y > 0)
  history.forEach((era, i) => {
    const midYear = (era.years[0] + era.years[1]) / 2;
    const x = yearToX(midYear, minYear, maxYear);
    const y = 4 + (i % 2) * 1.5; // stagger vertically
    positions.set(era.id, [x, y, 0]);
  });

  // Science wing — lower branch (y < 0)
  science.forEach((era, i) => {
    const midYear = (era.years[0] + era.years[1]) / 2;
    const x = yearToX(midYear, minYear, maxYear);
    const y = -4 - (i % 2) * 1.5;
    positions.set(era.id, [x, y, 0]);
  });

  return { positions, minYear, maxYear };
}

// ── River Path ──────────────────────────────────────────────────────────────

function RiverPath({ minYear, maxYear, wing, yBase }: {
  minYear: number;
  maxYear: number;
  wing: 'history' | 'science';
  yBase: number;
}) {
  const lineRef = useRef<any>(null);
  const SEGMENTS = 80;

  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    // Start from trunk (center-left)
    pts.push([-30, 0, 0]);
    pts.push([-27, 0, 0]);

    // Branch towards the wing
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const x = -25 + t * 55; // -25 to 30
      // Smooth transition from y=0 at trunk to yBase along the branch
      const branchT = Math.min(1, t * 4); // reach full offset by t=0.25
      const y = yBase * easeInOutCubic(branchT) + Math.sin(t * Math.PI * 3) * 0.3;
      pts.push([x, y, 0]);
    }
    return pts;
  }, [yBase]);

  const color = wing === 'history' ? '#7c4dff' : '#00e5ff';

  // Animated opacity via useFrame
  useFrame(() => {
    if (lineRef.current?.material) {
      const mat = lineRef.current.material as THREE.Material;
      mat.opacity = 0.3 + Math.sin(Date.now() * 0.001) * 0.08;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={2.5}
      transparent
      opacity={0.35}
    />
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Central trunk — the shared origin of all eras
function TrunkPath() {
  const points: [number, number, number][] = [
    [-35, 0, 0],
    [-30, 0, 0],
    [-25, 0, 0],
  ];

  return (
    <Line
      points={points}
      color="#ffffff"
      lineWidth={3}
      transparent
      opacity={0.2}
    />
  );
}

// ── Connection Lines between eras ───────────────────────────────────────────

function EraConnections({ eras, positions }: {
  eras: Era[];
  positions: Map<string, [number, number, number]>;
}) {
  const lines = useMemo(() => {
    const result: { from: [number, number, number]; to: [number, number, number]; color: string }[] = [];
    for (const era of eras) {
      const fromPos = positions.get(era.id);
      if (!fromPos) continue;
      for (const followId of era.followedBy) {
        const toPos = positions.get(followId);
        if (!toPos) continue;
        result.push({ from: fromPos, to: toPos, color: era.color });
      }
    }
    return result;
  }, [eras, positions]);

  return (
    <>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[line.from, line.to]}
          color={line.color}
          lineWidth={1}
          transparent
          opacity={0.12}
          dashed
          dashSize={0.3}
          gapSize={0.2}
        />
      ))}
    </>
  );
}

// ── River Glow — additive plane beneath the river ───────────────────────────

function RiverGlow() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.04 + Math.sin(Date.now() * 0.0008) * 0.015;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}>
      <planeGeometry args={[70, 20]} />
      <meshBasicMaterial
        color="#4a3aff"
        transparent
        opacity={0.04}
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
        position={[-32, 6, 0]}
        fontSize={0.6}
        color="#7c4dff"
        anchorX="left"
        anchorY="middle"
        font={undefined}
        outlineWidth={0.02}
        outlineColor="black"
      >
        HISTORY WING
      </Text>
      <Text
        position={[-32, -6, 0]}
        fontSize={0.6}
        color="#00e5ff"
        anchorX="left"
        anchorY="middle"
        font={undefined}
        outlineWidth={0.02}
        outlineColor="black"
      >
        SCIENCE WING
      </Text>
      {/* Title at the trunk origin */}
      <Text
        position={[-35, 1.2, 0]}
        fontSize={0.4}
        color="rgba(255,255,255,0.25)"
        anchorX="left"
        anchorY="middle"
        font={undefined}
      >
        THE RIVER OF TIME
      </Text>
    </>
  );
}

// ── Camera Controller ───────────────────────────────────────────────────────

function CameraController({ focusTarget }: {
  focusTarget: [number, number, number] | null;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const posRef = useRef(new THREE.Vector3(0, 5, 35));

  useFrame((_, delta) => {
    const clampedDelta = Math.min(delta, 0.05);

    if (focusTarget) {
      // Animate towards focus target
      targetRef.current.lerp(
        new THREE.Vector3(focusTarget[0], focusTarget[1], focusTarget[2]),
        clampedDelta * 2,
      );
      const desiredPos = new THREE.Vector3(
        focusTarget[0],
        focusTarget[1] + 3,
        focusTarget[2] + 12,
      );
      posRef.current.lerp(desiredPos, clampedDelta * 2);
    } else {
      // Default overview
      targetRef.current.lerp(new THREE.Vector3(0, 0, 0), clampedDelta * 1.5);
      posRef.current.lerp(new THREE.Vector3(0, 5, 35), clampedDelta * 1.5);
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
      <ambientLight intensity={0.15} color="#8888cc" />
      <directionalLight position={[20, 15, 10]} intensity={0.3} color="#ccccff" />
      <pointLight position={[0, 10, 5]} intensity={0.4} color="#7c4dff" distance={60} />
      <pointLight position={[0, -10, 5]} intensity={0.4} color="#00e5ff" distance={60} />

      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[100, 32, 16]} />
        <meshBasicMaterial color="#0a0a0f" side={THREE.BackSide} />
      </mesh>

      {/* Fog */}
      <fog attach="fog" args={['#0a0a0f', 30, 80]} />

      {/* Orbit controls — user can still pan/rotate */}
      <OrbitControls
        enableRotate
        enablePan
        enableZoom
        maxDistance={55}
        minDistance={5}
        maxPolarAngle={Math.PI * 0.75}
        minPolarAngle={Math.PI * 0.15}
        enableDamping
        dampingFactor={0.05}
        makeDefault
      />

      {/* River paths */}
      <TrunkPath />
      <RiverPath minYear={minYear} maxYear={maxYear} wing="history" yBase={4.5} />
      <RiverPath minYear={minYear} maxYear={maxYear} wing="science" yBase={-4.5} />
      <RiverGlow />

      {/* Connection lines */}
      <EraConnections eras={ALL_ERAS} positions={positions} />

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

      {/* Ground reference — subtle grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]}>
        <planeGeometry args={[100, 40]} />
        <meshBasicMaterial
          color="#0f0f1a"
          transparent
          opacity={0.5}
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
      background: '#0a0a0f',
    }}>
      <Canvas
        camera={{
          position: [0, 5, 35],
          fov: 50,
          near: 0.1,
          far: 200,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <TimelineScene />
      </Canvas>

      {/* Overlay: cinematic vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(10,10,15,0.7) 100%)',
      }} />

      {/* Overlay: hint text */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        textAlign: 'center',
      }}>
        Scroll to zoom / Drag to orbit / Click an era to explore
      </div>
    </div>
  );
}
