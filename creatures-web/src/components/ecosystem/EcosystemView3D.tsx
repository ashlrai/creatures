import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type {
  MassiveOrganism,
  MassiveNeuralStats,
  EmergentEvent,
} from './EcosystemView';
import { EvolutionTimeline } from '../ui/EvolutionTimeline';

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
  godNarratives?: any[];
  populationStats?: any;
  sendEcoCommand?: (cmd: Record<string, unknown>) => void;
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

      // Normalize energy: raw value can be 0-5000+, map to 0-1
      const normalizedEnergy = Math.min(1, Math.max(0, org.energy / 200));

      // Neural glow boost (subtle shimmer when neurons fire)
      const glowBoost =
        firingGlow *
        0.15 *
        (0.7 + 0.3 * Math.sin(t * 6 + org.x * 0.4 + org.y * 0.4));
      const e = Math.min(1, normalizedEnergy + glowBoost);

      // Dead organisms: scale to 0 (skip rendering)
      if (e < 0.01) {
        _obj.scale.set(0, 0, 0);
        _obj.updateMatrix();
        if (isCelegans) {
          eMesh.setMatrixAt(eIdx, _obj.matrix);
          elegansColors[eIdx * 3] = 0;
          elegansColors[eIdx * 3 + 1] = 0;
          elegansColors[eIdx * 3 + 2] = 0;
          eIdx++;
        } else {
          dMesh.setMatrixAt(dIdx, _obj.matrix);
          drosophilaColors[dIdx * 3] = 0;
          drosophilaColors[dIdx * 3 + 1] = 0;
          drosophilaColors[dIdx * 3 + 2] = 0;
          dIdx++;
        }
        continue;
      }

      // Size scales with energy — dying organisms shrink, thriving organisms grow
      const baseScale = isCelegans ? 0.3 : 0.25;
      const scale = baseScale * (0.4 + e * 0.8);

      // Heading from position hash (deterministic per-organism wobble)
      const heading =
        Math.atan2(org.y, org.x + 0.001) + Math.sin(t * 2 + i * 1.7) * 0.3;

      _obj.position.set(org.x, org.y, 0.05);
      if (isCelegans) {
        // Elongated capsule points in heading direction
        _obj.scale.set(scale * 2.8, scale, scale);
      } else {
        // Drosophila slightly elongated in heading direction too
        _obj.scale.set(scale * 1.4, scale, scale);
      }
      _obj.rotation.set(0, 0, heading);
      _obj.updateMatrix();

      // Energy-based color: red (dying) -> species color (mid) -> bright white/gold (thriving)
      // e < 0.3: red/dark -> species color
      // e 0.3-0.7: species color
      // e > 0.7: species color -> bright white/gold
      const generation = org.generation ?? 0;
      const genFactor = Math.min(generation / 50, 1);

      // Dying color (dark red)
      const dyingR = 0.7, dyingG = 0.08, dyingB = 0.05;
      // Thriving color (bright white-gold)
      const thriveR = 1.4, thriveG = 1.3, thriveB = 0.9;

      if (isCelegans) {
        eMesh.setMatrixAt(eIdx, _obj.matrix);
        // Species base: cyan (0.15, 0.75, 1.0)
        let r: number, g: number, b: number;
        if (e < 0.3) {
          // Dying -> species: blend from red to cyan
          const f = e / 0.3;
          r = dyingR * (1 - f) + 0.15 * f;
          g = dyingG * (1 - f) + 0.75 * f;
          b = dyingB * (1 - f) + 1.0 * f;
        } else if (e > 0.7) {
          // Species -> thriving: blend from cyan to bright white-gold
          const f = (e - 0.7) / 0.3;
          r = 0.15 * (1 - f) + thriveR * f;
          g = 0.75 * (1 - f) + thriveG * f;
          b = 1.0 * (1 - f) + thriveB * f;
        } else {
          // Mid range: species cyan
          r = 0.15;
          g = 0.75;
          b = 1.0;
        }
        // Mix species color with gold based on generation
        r = r * (1 - genFactor * 0.3) + 1.0 * genFactor * 0.3;
        g = g * (1 - genFactor * 0.3) + 0.85 * genFactor * 0.3;
        b = b * (1 - genFactor * 0.3) + 0.15 * genFactor * 0.3;
        _color.setRGB(r, g, b);
        elegansColors[eIdx * 3] = _color.r;
        elegansColors[eIdx * 3 + 1] = _color.g;
        elegansColors[eIdx * 3 + 2] = _color.b;
        eIdx++;
      } else {
        dMesh.setMatrixAt(dIdx, _obj.matrix);
        // Species base: amber (0.9, 0.55, 0.1)
        let r: number, g: number, b: number;
        if (e < 0.3) {
          const f = e / 0.3;
          r = dyingR * (1 - f) + 0.9 * f;
          g = dyingG * (1 - f) + 0.55 * f;
          b = dyingB * (1 - f) + 0.1 * f;
        } else if (e > 0.7) {
          const f = (e - 0.7) / 0.3;
          r = 0.9 * (1 - f) + thriveR * f;
          g = 0.55 * (1 - f) + thriveG * f;
          b = 0.1 * (1 - f) + thriveB * f;
        } else {
          r = 0.9;
          g = 0.55;
          b = 0.1;
        }
        // Mix species color with gold based on generation
        r = r * (1 - genFactor * 0.3) + 1.0 * genFactor * 0.3;
        g = g * (1 - genFactor * 0.3) + 0.85 * genFactor * 0.3;
        b = b * (1 - genFactor * 0.3) + 0.15 * genFactor * 0.3;
        _color.setRGB(r, g, b);
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

  // Geometry with instanced color attribute attached at creation time
  // (MeshStandardMaterial with vertexColors needs the attribute before first render)
  const elegansGeom = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.8, 1.2, 4, 8);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', attr);
    return g;
  }, []);

  const drosophilaGeom = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 8, 6);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', attr);
    return g;
  }, []);

  const elegansMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0x88ccff),
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.15,
        toneMapped: false,
      }),
    [],
  );

  const drosophilaMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0xffcc66),
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.15,
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
      const pulse = 0.3 + 0.1 * Math.sin(t * 2.5 + i * 1.3);
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
        color: 0x44ff88,
        emissive: new THREE.Color(0x44ff88),
        emissiveIntensity: 2.0,
        roughness: 0.2,
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

// Grid colors and opacity vary by world type for distinct visual identity
const GRID_STYLES: Record<string, { color: number; opacity: number; divisions: number }> = {
  soil: { color: 0x3a2510, opacity: 0.06, divisions: GRID_DIVISIONS },
  pond: { color: 0x1e3260, opacity: 0.1, divisions: GRID_DIVISIONS },
  lab_plate: { color: 0x404040, opacity: 0.15, divisions: GRID_DIVISIONS * 2 },
  abstract: { color: 0x1e3250, opacity: 0.08, divisions: GRID_DIVISIONS },
};

const BOUNDARY_COLORS: Record<string, number> = {
  soil: 0x5a3820,
  pond: 0x2848a0,
  lab_plate: 0x606060,
  abstract: 0x284678,
};

function Arena({ worldType }: { worldType: string }) {
  const groundColor = GROUND_COLORS[worldType] ?? GROUND_COLORS.abstract;
  const gridStyle = GRID_STYLES[worldType] ?? GRID_STYLES.abstract;
  const boundaryColor = BOUNDARY_COLORS[worldType] ?? BOUNDARY_COLORS.abstract;

  return (
    <>
      {/* Ground plane */}
      <mesh rotation={[0, 0, 0]} position={[0, 0, -0.01]}>
        <circleGeometry args={[ARENA_RADIUS, 64]} />
        <meshStandardMaterial color={groundColor} roughness={1} />
      </mesh>

      {/* Grid — denser for lab_plate, tinted by world type */}
      <gridHelper
        args={[
          ARENA_RADIUS * 2,
          gridStyle.divisions,
          gridStyle.color,
          gridStyle.color,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.001]}
      >
        <meshBasicMaterial
          attach="material"
          color={gridStyle.color}
          opacity={gridStyle.opacity}
          transparent
          depthWrite={false}
        />
      </gridHelper>

      {/* Arena boundary ring */}
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[ARENA_RADIUS - 0.08, ARENA_RADIUS, 64]} />
        <meshBasicMaterial
          color={boundaryColor}
          opacity={0.35}
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
  populationTrend,
  populationStats,
  speed,
  birthCount,
  deathCount,
  elapsedSeconds,
}: {
  organisms: MassiveOrganism[];
  neuralStats: MassiveNeuralStats | null;
  emergentEvents: EmergentEvent[];
  worldType: string;
  populationTrend: 'up' | 'down' | 'stable';
  populationStats?: any;
  speed: number;
  birthCount: number;
  deathCount: number;
  elapsedSeconds: number;
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
        {/* Speed indicator — prominent */}
        <div style={{
          color: speed > 5 ? 'rgba(255,180,80,0.9)' : 'rgba(0,255,136,0.8)',
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 4,
        }}>
          {speed.toFixed(1)}x SPEED
        </div>
        <div style={{ color: 'rgba(0,212,255,0.7)' }}>
          Organisms: {organisms.length}
          {populationTrend === 'up' && (
            <span style={{ color: 'rgba(0,255,136,0.8)', marginLeft: 4 }}>{'\u2191'}</span>
          )}
          {populationTrend === 'down' && (
            <span style={{ color: 'rgba(255,100,100,0.8)', marginLeft: 4 }}>{'\u2193'}</span>
          )}
        </div>
        <div style={{ color: 'rgba(0,255,136,0.65)' }}>
          Births: {birthCount}
        </div>
        <div style={{ color: 'rgba(255,100,100,0.65)' }}>
          Deaths: {deathCount}
        </div>
        <div style={{ color: 'rgba(160,160,200,0.5)', fontSize: 9 }}>
          Elapsed: {Math.floor(elapsedSeconds / 60)}m {Math.floor(elapsedSeconds % 60)}s
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
        {/* Evolution stats — show when available */}
        {populationStats?.max_generation > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(80,130,200,0.1)', paddingTop: 6 }}>
            <div style={{ fontSize: 8, color: 'rgba(140,170,200,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Evolution</div>
            <div>Generation: <span style={{ color: '#ffcc88' }}>{populationStats.max_generation}</span></div>
            <div>Lineages: <span style={{ color: '#88ffcc' }}>{populationStats.n_lineages}</span></div>
            <div>Avg food: <span style={{ color: '#ff8888' }}>{populationStats.mean_lifetime_food?.toFixed(1)}</span></div>
          </div>
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

      {/* EffectComposer/Bloom disabled — @react-three/postprocessing v3.0.4
          crashes with "Cannot read properties of undefined (reading 'length')"
          when the scene changes. Using emissive materials for glow instead. */}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Narrative event type
// ---------------------------------------------------------------------------

interface NarrativeEvent {
  text: string;
  icon: string;
  time: number;
}

// ---------------------------------------------------------------------------
// Center announcement type
// ---------------------------------------------------------------------------

interface CenterAnnouncement {
  text: string;
  icon: string;
  time: number;
}

export function EcosystemView3D({
  massiveOrganisms,
  massiveNeuralStats,
  emergentEvents,
  worldType,
  godNarratives,
  populationStats,
  sendEcoCommand,
}: EcosystemView3DProps) {
  const organisms = massiveOrganisms ?? [];
  const stats = massiveNeuralStats ?? null;
  const events = emergentEvents ?? [];
  const wt = worldType ?? 'soil';

  // Speed control state
  const [speed, setSpeed] = useState(1.0);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setSpeed(value);
    sendEcoCommand?.({ type: 'speed', value });
  }, [sendEcoCommand]);

  // Birth / death tracking
  const [birthCount, setBirthCount] = useState(0);
  const [deathCount, setDeathCount] = useState(0);
  const prevOrgCountRef = useRef<number>(organisms.length);
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Track births and deaths from population changes
  useEffect(() => {
    const prev = prevOrgCountRef.current;
    const curr = organisms.length;
    prevOrgCountRef.current = curr;
    if (prev === 0 && curr === 0) return;
    const delta = curr - prev;
    if (delta > 0) {
      setBirthCount((c) => c + delta);
    } else if (delta < 0) {
      setDeathCount((c) => c + Math.abs(delta));
    }
  }, [organisms.length]);

  // Elapsed time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Frustum size for orthographic camera (~arena fits on screen)
  const frustum = ARENA_RADIUS * 1.3;

  // -------------------------------------------------------------------------
  // Narrative overlay state
  // -------------------------------------------------------------------------
  const [narratives, setNarratives] = useState<NarrativeEvent[]>([]);
  const [centerAnnouncement, setCenterAnnouncement] = useState<CenterAnnouncement | null>(null);
  const prevPopulationRef = useRef<number>(organisms.length);
  const prevEventsLenRef = useRef<number>(events.length);
  const centerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addNarrative = useCallback((text: string, icon: string) => {
    setNarratives((prev) => {
      const next = [{ text, icon, time: Date.now() }, ...prev];
      return next.slice(0, 8);
    });
  }, []);

  // Generate narrative events from emergentEvents changes
  useEffect(() => {
    if (events.length <= prevEventsLenRef.current) {
      prevEventsLenRef.current = events.length;
      return;
    }
    // Process new events
    const newEvents = events.slice(prevEventsLenRef.current);
    prevEventsLenRef.current = events.length;

    for (const ev of newEvents) {
      const label = ev.behavior_type.replace(/_/g, ' ');
      const conf = (ev.confidence * 100).toFixed(0);
      addNarrative(
        `${label} detected (confidence: ${conf}%)`,
        ev.behavior_type === 'aggregation' ? '\u{1F331}' : // seedling
        ev.behavior_type === 'trail_following' ? '\u{1F43E}' : // paw prints
        ev.behavior_type === 'avoidance_learning' ? '\u{26A0}\u{FE0F}' : // warning
        '\u{1F52C}', // microscope
      );

      // Major event: high confidence center announcement
      if (ev.confidence > 0.9) {
        const majorLabel = label.toUpperCase();
        setCenterAnnouncement({
          text: `${majorLabel} — ${ev.description}`,
          icon: '\u{2728}', // sparkles
          time: Date.now(),
        });
        if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
        centerTimeoutRef.current = setTimeout(() => setCenterAnnouncement(null), 3000);
      }
    }
  }, [events, addNarrative]);

  // Generate narrative events from population changes
  useEffect(() => {
    const prev = prevPopulationRef.current;
    const curr = organisms.length;
    prevPopulationRef.current = curr;

    if (prev === 0 && curr === 0) return;
    const delta = curr - prev;
    const pctChange = prev > 0 ? Math.abs(delta) / prev : (curr > 0 ? 1 : 0);

    if (pctChange >= 0.1 && Math.abs(delta) >= 2) {
      if (delta > 0) {
        addNarrative(`Population growing: ${curr} organisms (+${delta})`, '\u{1F4C8}');
      } else {
        addNarrative(`Population declining: ${curr} organisms (${delta})`, '\u{1F4C9}');

        // Extinction event — center announcement
        if (curr === 0) {
          setCenterAnnouncement({
            text: 'EXTINCTION — All organisms perished',
            icon: '\u{1F480}', // skull
            time: Date.now(),
          });
          if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
          centerTimeoutRef.current = setTimeout(() => setCenterAnnouncement(null), 3000);
        }
      }
    }
  }, [organisms.length, addNarrative]);

  // Auto-remove stale narratives (older than 15s)
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 15000;
      setNarratives((prev) => {
        const filtered = prev.filter((n) => n.time > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup center timeout on unmount
  useEffect(() => {
    return () => {
      if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
    };
  }, []);

  // Population trend for HUD
  const populationTrend = useMemo(() => {
    const prev = prevPopulationRef.current;
    const curr = organisms.length;
    if (curr > prev) return 'up';
    if (curr < prev) return 'down';
    return 'stable';
  }, [organisms.length]);

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
        populationTrend={populationTrend}
        populationStats={populationStats}
        speed={speed}
        birthCount={birthCount}
        deathCount={deathCount}
        elapsedSeconds={elapsedSeconds}
      />

      {/* Narrative overlay — large and prominent */}
      <div style={{
        position: 'absolute', bottom: 150, left: 16,
        maxWidth: 420, maxHeight: 320, overflow: 'hidden',
        display: 'flex', flexDirection: 'column-reverse', gap: 8,
        pointerEvents: 'none', zIndex: 10,
      }}>
        {narratives.slice(0, 3).map((n, i) => (
          <div key={n.time} style={{
            background: 'rgba(6, 8, 18, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(100, 160, 255, 0.2)',
            borderRadius: 10, padding: '10px 16px',
            fontSize: i === 0 ? 14 : 12,
            fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? 'rgba(220, 235, 255, 0.95)' : 'rgba(180, 200, 220, 0.75)',
            fontFamily: 'var(--font-mono)',
            opacity: 1 - (i * 0.2),
            transition: 'opacity 0.5s',
            textShadow: i === 0 ? '0 0 8px rgba(100,160,255,0.3)' : 'none',
          }}>
            <span style={{ marginRight: 8, fontSize: i === 0 ? 16 : 13 }}>{n.icon}</span>
            {n.text}
          </div>
        ))}
      </div>

      {/* Major event announcement (center, dramatic) */}
      {centerAnnouncement && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 20,
        }}>
          <div style={{
            background: 'rgba(6, 8, 18, 0.9)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(120, 160, 255, 0.2)',
            borderRadius: 16, padding: '20px 40px',
            textAlign: 'center',
            animation: 'fadeInScale 0.4s ease-out',
          }}>
            <div style={{
              fontSize: 32, marginBottom: 8,
            }}>
              {centerAnnouncement.icon}
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'rgba(200, 220, 255, 0.9)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
            }}>
              {centerAnnouncement.text}
            </div>
          </div>
        </div>
      )}

      {/* God Agent narratives panel (bottom-right) */}
      {godNarratives && godNarratives.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          maxWidth: 340,
          maxHeight: 260,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <div style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color: 'rgba(180, 140, 255, 0.5)',
            letterSpacing: '0.1em',
            marginBottom: 2,
          }}>
            GOD AGENT
          </div>
          {godNarratives.slice(0, 5).map((n: any, i: number) => (
            <div key={`god-${i}-${n.timestamp ?? i}`} style={{
              background: 'rgba(6, 8, 18, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(180, 140, 255, 0.15)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 10,
              color: 'rgba(200, 180, 255, 0.8)',
              fontFamily: 'var(--font-mono)',
              opacity: 1 - i * 0.15,
              transition: 'opacity 0.5s',
            }}>
              {n.action && (
                <span style={{
                  color: 'rgba(255, 200, 100, 0.9)',
                  fontWeight: 600,
                  marginRight: 6,
                  textTransform: 'uppercase',
                  fontSize: 9,
                }}>
                  {n.action}
                </span>
              )}
              {n.analysis || n.text || n.message || JSON.stringify(n)}
            </div>
          ))}
        </div>
      )}

      {/* Speed control slider (bottom-center, above timeline) */}
      <div style={{
        position: 'absolute',
        bottom: 140,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(6,8,18,0.8)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(80,130,200,0.12)',
        borderRadius: 8,
        padding: '4px 12px',
        zIndex: 10,
      }}>
        <span style={{ fontSize: 9, color: 'rgba(140,170,200,0.4)', fontFamily: 'var(--font-mono)' }}>0.1x</span>
        <input
          type="range"
          min={0.1}
          max={20}
          step={0.1}
          value={speed}
          onChange={handleSpeedChange}
          style={{ width: 120, accentColor: '#00d4ff', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 9, color: 'rgba(140,170,200,0.4)', fontFamily: 'var(--font-mono)' }}>20x</span>
        <span style={{
          fontSize: 10,
          color: speed > 5 ? 'rgba(255,180,80,0.8)' : 'rgba(0,212,255,0.7)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          minWidth: 32,
          textAlign: 'right',
        }}>
          {speed.toFixed(1)}x
        </span>
      </div>

      {/* Evolution timeline graph (bottom-center) */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <EvolutionTimeline width={300} height={120} />
      </div>
    </div>
  );
}
