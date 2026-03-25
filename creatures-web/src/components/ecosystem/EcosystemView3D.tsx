import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
// EffectComposer disabled due to postprocessing@6.39.0 bug
import * as THREE from 'three';
import type {
  MassiveOrganism,
  MassiveNeuralStats,
  EmergentEvent,
} from './EcosystemView';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARENA_RADIUS = 25; // world units (matches backend arena_size)
const MAX_ORGANISMS = 2048;
const MAX_FOOD = 256;
const GRID_DIVISIONS = 20;

// World-type ground colors
const GROUND_COLORS: Record<string, string> = {
  soil: '#1a0f08',
  pond: '#061828',
  lab_plate: '#1a1a1a',
  abstract: '#080810',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EcosystemView3DProps {
  ecosystemId?: string | null;
  massiveId?: string | null;
  massiveOrganisms?: MassiveOrganism[];
  massiveNeuralStats?: MassiveNeuralStats | null;
  emergentEvents?: EmergentEvent[];
  worldType?: string;
}

// ---------------------------------------------------------------------------
// Instanced Organisms
// ---------------------------------------------------------------------------

/** Shared temp objects to avoid per-frame allocation */
const _obj = new THREE.Object3D();
const _color = new THREE.Color();

function OrganismInstances({
  organisms,
  neuralStats,
}: {
  organisms: MassiveOrganism[];
  neuralStats: MassiveNeuralStats | null;
}) {
  const elegansRef = useRef<THREE.InstancedMesh>(null);
  const drosophilaRef = useRef<THREE.InstancedMesh>(null);

  // Pre-allocate color attribute buffers
  const elegansColors = useMemo(
    () => new Float32Array(MAX_ORGANISMS * 3),
    [],
  );
  const drosophilaColors = useMemo(
    () => new Float32Array(MAX_ORGANISMS * 3),
    [],
  );

  useFrame(({ clock }) => {
    const eMesh = elegansRef.current;
    const dMesh = drosophilaRef.current;
    if (!eMesh || !dMesh) return;

    const t = clock.getElapsedTime();
    const firingGlow = neuralStats
      ? Math.min(1, neuralStats.mean_firing_rate / 0.3)
      : 0;

    let eIdx = 0;
    let dIdx = 0;

    for (let i = 0; i < organisms.length; i++) {
      const org = organisms[i];
      const isCelegans = org.species === 0;

      // Energy-based color: green (high) -> red (low), plus neural glow boost
      const glowBoost =
        firingGlow *
        0.3 *
        (0.7 + 0.3 * Math.sin(t * 6 + org.x * 0.4 + org.y * 0.4));
      const e = Math.min(1, org.energy + glowBoost);

      // Size scales with energy
      const baseScale = isCelegans ? 0.25 : 0.2;
      const scale = baseScale * (0.6 + e * 0.6);

      // Heading from position hash (deterministic per-organism wobble)
      const heading =
        Math.atan2(org.y, org.x + 0.001) + Math.sin(t * 2 + i * 1.7) * 0.3;

      _obj.position.set(org.x, org.y, 0.05);
      if (isCelegans) {
        // Elongated: scale X more than Y/Z
        _obj.scale.set(scale * 2.5, scale, scale);
      } else {
        _obj.scale.set(scale, scale, scale);
      }
      _obj.rotation.set(0, 0, heading);
      _obj.updateMatrix();

      if (isCelegans) {
        eMesh.setMatrixAt(eIdx, _obj.matrix);
        // Cyan base, lerp toward green/red by energy
        _color.setRGB(
          0.1 * (1 - e) + 0.0 * e,
          0.5 * (1 - e) + 0.85 * e,
          0.6 + 0.4 * e,
        );
        elegansColors[eIdx * 3] = _color.r;
        elegansColors[eIdx * 3 + 1] = _color.g;
        elegansColors[eIdx * 3 + 2] = _color.b;
        eIdx++;
      } else {
        dMesh.setMatrixAt(dIdx, _obj.matrix);
        // Amber base, lerp by energy
        _color.setRGB(
          0.8 + 0.2 * e,
          0.35 + 0.35 * e,
          0.05 + 0.1 * (1 - e),
        );
        drosophilaColors[dIdx * 3] = _color.r;
        drosophilaColors[dIdx * 3 + 1] = _color.g;
        drosophilaColors[dIdx * 3 + 2] = _color.b;
        dIdx++;
      }
    }

    // Hide unused instances by zeroing scale
    _obj.scale.set(0, 0, 0);
    _obj.updateMatrix();
    for (let j = eIdx; j < MAX_ORGANISMS; j++) {
      eMesh.setMatrixAt(j, _obj.matrix);
    }
    for (let j = dIdx; j < MAX_ORGANISMS; j++) {
      dMesh.setMatrixAt(j, _obj.matrix);
    }

    eMesh.count = eIdx;
    dMesh.count = dIdx;

    eMesh.instanceMatrix.needsUpdate = true;
    dMesh.instanceMatrix.needsUpdate = true;

    // Update instance colors
    const eColorAttr = eMesh.geometry.getAttribute(
      'color',
    ) as THREE.InstancedBufferAttribute | null;
    if (eColorAttr) {
      (eColorAttr.array as Float32Array).set(elegansColors);
      eColorAttr.needsUpdate = true;
    }

    const dColorAttr = dMesh.geometry.getAttribute(
      'color',
    ) as THREE.InstancedBufferAttribute | null;
    if (dColorAttr) {
      (dColorAttr.array as Float32Array).set(drosophilaColors);
      dColorAttr.needsUpdate = true;
    }
  });

  // Capsule-ish geometry for C. elegans (elongated sphere)
  const elegansGeom = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const drosophilaGeom = useMemo(
    () => new THREE.SphereGeometry(1, 8, 6),
    [],
  );

  // Attach instanced color attributes after mount
  useEffect(() => {
    const attach = (
      mesh: THREE.InstancedMesh | null,
      buf: Float32Array,
    ) => {
      if (!mesh) return;
      const attr = new THREE.InstancedBufferAttribute(buf, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('color', attr);
    };
    attach(elegansRef.current, elegansColors);
    attach(drosophilaRef.current, drosophilaColors);
  }, [elegansColors, drosophilaColors]);

  const elegansMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0x00d4ff),
        emissiveIntensity: 0.6,
        roughness: 0.5,
        metalness: 0.1,
        toneMapped: false,
      }),
    [],
  );

  const drosophilaMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0xffaa22),
        emissiveIntensity: 0.6,
        roughness: 0.5,
        metalness: 0.1,
        toneMapped: false,
      }),
    [],
  );

  return (
    <>
      <instancedMesh
        ref={elegansRef}
        args={[elegansGeom, elegansMat, MAX_ORGANISMS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={drosophilaRef}
        args={[drosophilaGeom, drosophilaMat, MAX_ORGANISMS]}
        frustumCulled={false}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Food Instances
// ---------------------------------------------------------------------------

function FoodInstances({ organismCount }: { organismCount: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const foodCount = useMemo(
    () => Math.min(MAX_FOOD, Math.max(12, Math.floor(organismCount * 0.15))),
    [organismCount],
  );

  // Deterministic food positions seeded from count
  const positions = useMemo(() => {
    const pos: [number, number][] = [];
    for (let i = 0; i < foodCount; i++) {
      const angle = (i / foodCount) * Math.PI * 2 + i * 2.39996; // golden angle
      const r = Math.sqrt((i + 1) / (foodCount + 1)) * ARENA_RADIUS * 0.85;
      pos.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    return pos;
  }, [foodCount]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < foodCount; i++) {
      const pulse = 0.12 + 0.04 * Math.sin(t * 2.5 + i * 1.3);
      _obj.position.set(positions[i][0], positions[i][1], 0.02);
      _obj.scale.set(pulse, pulse, pulse);
      _obj.rotation.set(0, 0, 0);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
    }
    // hide unused
    _obj.scale.set(0, 0, 0);
    _obj.updateMatrix();
    for (let j = foodCount; j < MAX_FOOD; j++) {
      mesh.setMatrixAt(j, _obj.matrix);
    }
    mesh.count = foodCount;
    mesh.instanceMatrix.needsUpdate = true;
  });

  const geom = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        emissive: new THREE.Color(0x00ff88),
        emissiveIntensity: 1.2,
        roughness: 0.3,
        toneMapped: false,
      }),
    [],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, mat, MAX_FOOD]}
      frustumCulled={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Arena Environment
// ---------------------------------------------------------------------------

function Arena({ worldType }: { worldType: string }) {
  const groundColor = GROUND_COLORS[worldType] ?? GROUND_COLORS.abstract;

  return (
    <>
      {/* Ground plane */}
      <mesh rotation={[0, 0, 0]} position={[0, 0, -0.01]}>
        <circleGeometry args={[ARENA_RADIUS, 64]} />
        <meshStandardMaterial color={groundColor} roughness={1} />
      </mesh>

      {/* Subtle grid */}
      <gridHelper
        args={[
          ARENA_RADIUS * 2,
          GRID_DIVISIONS,
          0x1e3250,
          0x1e3250,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.001]}
      >
        <meshBasicMaterial
          attach="material"
          color={0x1e3250}
          opacity={0.08}
          transparent
          depthWrite={false}
        />
      </gridHelper>

      {/* Arena boundary ring */}
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[ARENA_RADIUS - 0.08, ARENA_RADIUS, 64]} />
        <meshBasicMaterial
          color={0x284678}
          opacity={0.25}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fallback text when empty
// ---------------------------------------------------------------------------

function EmptyFallback() {
  return (
    <Text
      position={[0, 0, 0.5]}
      fontSize={1.2}
      color="#4a6080"
      anchorX="center"
      anchorY="middle"
      font={undefined}
    >
      Create a brain-world to begin
    </Text>
  );
}

// ---------------------------------------------------------------------------
// HUD Overlay (HTML, not 3D) for stats and events
// ---------------------------------------------------------------------------

function HudOverlay({
  organisms,
  neuralStats,
  emergentEvents,
  worldType,
}: {
  organisms: MassiveOrganism[];
  neuralStats: MassiveNeuralStats | null;
  emergentEvents: EmergentEvent[];
  worldType: string;
}) {
  const worldLabels: Record<string, string> = {
    soil: 'SOIL',
    pond: 'POND',
    lab_plate: 'LAB PLATE',
    abstract: 'ABSTRACT',
  };

  const badgeColors: Record<string, string> = {
    aggregation: 'rgba(255, 100, 100, 0.7)',
    trail_following: 'rgba(100, 200, 255, 0.7)',
    avoidance_learning: 'rgba(255, 200, 100, 0.7)',
  };

  // Deduplicate recent events
  const recentEvents = useMemo(() => {
    const seen = new Set<string>();
    const recent: EmergentEvent[] = [];
    for (let i = emergentEvents.length - 1; i >= 0 && recent.length < 3; i--) {
      if (!seen.has(emergentEvents[i].behavior_type)) {
        seen.add(emergentEvents[i].behavior_type);
        recent.push(emergentEvents[i]);
      }
    }
    return recent.reverse();
  }, [emergentEvents]);

  const fontFamily = '"SF Mono", "Fira Code", monospace';

  return (
    <>
      {/* Stats (top-left) */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 10px',
          borderRadius: 4,
          fontFamily,
          fontSize: 10,
          lineHeight: '14px',
          pointerEvents: 'none',
        }}
      >
        <div style={{ color: 'rgba(140,170,200,0.5)' }}>
          MASSIVE BRAIN-WORLD
        </div>
        <div style={{ color: 'rgba(0,212,255,0.7)' }}>
          Organisms: {organisms.length}
        </div>
        {neuralStats && (
          <>
            <div style={{ color: 'rgba(180,140,255,0.7)' }}>
              Neurons: {neuralStats.total_neurons.toLocaleString()}
            </div>
            <div style={{ color: 'rgba(0,255,136,0.7)' }}>
              Fired: {neuralStats.total_fired.toLocaleString()}
            </div>
            <div style={{ color: 'rgba(255,200,100,0.6)' }}>
              Rate: {neuralStats.mean_firing_rate.toFixed(3)}
            </div>
          </>
        )}
      </div>

      {/* World type (bottom-left) */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          fontFamily,
          fontSize: 9,
          color: 'rgba(100,130,170,0.35)',
          pointerEvents: 'none',
        }}
      >
        {worldLabels[worldType] ?? worldType.toUpperCase()}
      </div>

      {/* Emergent badges + LIVE (top-right) */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          textAlign: 'right',
          fontFamily,
          fontSize: 9,
          pointerEvents: 'none',
        }}
      >
        {recentEvents.map((ev, i) => (
          <div
            key={ev.behavior_type + i}
            style={{
              color:
                badgeColors[ev.behavior_type] ?? 'rgba(180,180,220,0.7)',
              marginBottom: 4,
            }}
          >
            {ev.behavior_type.replace(/_/g, ' ').toUpperCase()} DETECTED
          </div>
        ))}
        <div style={{ color: 'rgba(0,255,136,0.5)', marginTop: 4 }}>
          LIVE
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Camera auto-fit on mount
// ---------------------------------------------------------------------------

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.position.set(0, 0, 50);
      camera.lookAt(0, 0, 0);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    }
  }, [camera]);
  return null;
}

// ---------------------------------------------------------------------------
// Scene contents (inside Canvas)
// ---------------------------------------------------------------------------

function SceneContents({
  organisms,
  neuralStats,
  worldType,
}: {
  organisms: MassiveOrganism[];
  neuralStats: MassiveNeuralStats | null;
  worldType: string;
}) {
  const isEmpty = organisms.length === 0;

  return (
    <>
      <CameraSetup />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[0, 0, 30]} intensity={0.5} />

      {/* Controls */}
      <OrbitControls
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        maxPolarAngle={Math.PI / 2}
        minZoom={0.3}
        maxZoom={8}
        makeDefault
      />

      {/* Environment */}
      <Arena worldType={worldType} />

      {isEmpty ? (
        <EmptyFallback />
      ) : (
        <>
          <OrganismInstances
            organisms={organisms}
            neuralStats={neuralStats}
          />
          <FoodInstances organismCount={organisms.length} />
        </>
      )}

      {/* Bloom disabled — postprocessing@6.39.0 bug */}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function EcosystemView3D({
  massiveOrganisms,
  massiveNeuralStats,
  emergentEvents,
  worldType,
}: EcosystemView3DProps) {
  const organisms = massiveOrganisms ?? [];
  const stats = massiveNeuralStats ?? null;
  const events = emergentEvents ?? [];
  const wt = worldType ?? 'soil';

  // Frustum size for orthographic camera (~arena fits on screen)
  const frustum = ARENA_RADIUS * 1.3;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#030308',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <Canvas
        orthographic
        camera={{
          zoom: 1,
          near: 0.1,
          far: 200,
          position: [0, 0, 50],
          left: -frustum,
          right: frustum,
          top: frustum,
          bottom: -frustum,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#030308']} />
        <SceneContents
          organisms={organisms}
          neuralStats={stats}
          worldType={wt}
        />
      </Canvas>

      {/* HTML HUD overlay */}
      <HudOverlay
        organisms={organisms}
        neuralStats={stats}
        emergentEvents={events}
        worldType={wt}
      />
    </div>
  );
}
