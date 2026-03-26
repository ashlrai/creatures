import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { useTransportStore } from '../../stores/transportStore';
import type { SimulationFrame, ExperimentInfo } from '../../types/simulation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrganismType = 'c_elegans' | 'drosophila' | 'zebrafish';

interface OrganismOption {
  value: OrganismType;
  label: string;
  demoFile: string;
}

const ORGANISM_OPTIONS: OrganismOption[] = [
  { value: 'c_elegans', label: 'C. elegans', demoFile: 'demo-frames.json' },
  { value: 'drosophila', label: 'Drosophila', demoFile: 'demo-frames-fly.json' },
  { value: 'zebrafish', label: 'Zebrafish', demoFile: 'demo-frames-zebrafish.json' },
];

// ---------------------------------------------------------------------------
// Frame context — lets right-viewport components read comparison frame data
// without touching the global simulationStore
// ---------------------------------------------------------------------------

interface ComparisonFrameCtx {
  frame: SimulationFrame | null;
  experiment: ExperimentInfo | null;
}

const ComparisonFrameContext = createContext<ComparisonFrameCtx>({
  frame: null,
  experiment: null,
});

function useComparisonFrame() {
  return useContext(ComparisonFrameContext);
}

// ---------------------------------------------------------------------------
// Demo data loader + playback for the comparison viewport
// ---------------------------------------------------------------------------

interface DemoData {
  experiment: ExperimentInfo;
  frames: SimulationFrame[];
}

const CROSSFADE_FRAMES = 30;

function lerpFrame(a: SimulationFrame, b: SimulationFrame, t: number): SimulationFrame {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    t_ms: lerp(a.t_ms, b.t_ms),
    n_active: Math.round(lerp(a.n_active, b.n_active)),
    spikes: t < 0.5 ? a.spikes : b.spikes,
    firing_rates: a.firing_rates.map((v, i) => lerp(v, b.firing_rates[i] ?? 0)),
    body_positions: a.body_positions.map((p, i) =>
      p.map((v, j) => lerp(v, b.body_positions[i]?.[j] ?? v))
    ),
    joint_angles: a.joint_angles.map((v, i) => lerp(v, b.joint_angles[i] ?? 0)),
    center_of_mass: a.center_of_mass.map((v, i) => lerp(v, b.center_of_mass[i] ?? v)),
    muscle_activations: { ...a.muscle_activations },
  };
}

function useComparisonDemo(organism: OrganismType) {
  const [frame, setFrame] = useState<SimulationFrame | null>(null);
  const [experiment, setExperiment] = useState<ExperimentInfo | null>(null);
  const dataRef = useRef<DemoData | null>(null);
  const idxRef = useRef(30);
  const intervalRef = useRef<number | null>(null);
  const tickRef = useRef<(() => void) | null>(null);

  // Load demo data whenever organism changes
  useEffect(() => {
    let cancelled = false;

    const opt = ORGANISM_OPTIONS.find((o) => o.value === organism)!;
    const base = import.meta.env.BASE_URL || '/';

    (async () => {
      try {
        const res = await fetch(`${base}${opt.demoFile}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        let data: DemoData;
        if (!contentType.includes('json') && !contentType.includes('octet')) {
          const text = await res.text();
          if (text.startsWith('<!')) throw new Error('Got HTML instead of JSON');
          data = JSON.parse(text);
        } else {
          data = await res.json();
        }
        if (cancelled) return;

        dataRef.current = data;
        setExperiment(data.experiment);
        idxRef.current = 30;
      } catch (err) {
        console.error(`SplitView comparison load failed (${organism}):`, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organism]);

  // Playback tick synchronized with transport
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const tick = (tickRef.current = () => {
      const d = dataRef.current;
      if (!d) return;

      const transport = useTransportStore.getState();
      if (!transport.isPlaying) return;

      const total = d.frames.length;
      const idx = idxRef.current % total;

      let outputFrame: SimulationFrame;
      const distFromEnd = total - idx;
      if (distFromEnd <= CROSSFADE_FRAMES && total > CROSSFADE_FRAMES * 2) {
        const blendIdx = CROSSFADE_FRAMES - distFromEnd;
        const t = blendIdx / CROSSFADE_FRAMES;
        outputFrame = lerpFrame(d.frames[idx], d.frames[blendIdx], t);
      } else {
        outputFrame = d.frames[idx];
      }

      setFrame(outputFrame);
      idxRef.current++;
    });

    const baseInterval = 33;
    const currentSpeed = useTransportStore.getState().speed;
    intervalRef.current = window.setInterval(tick, baseInterval / currentSpeed);

    // Sync interval with transport speed changes
    const unsub = useTransportStore.subscribe((state) => {
      if (!tickRef.current) return;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(
        tickRef.current,
        baseInterval / state.speed
      );
    });

    return () => {
      unsub();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [organism]);

  return { frame, experiment };
}

// ---------------------------------------------------------------------------
// Lightweight organism renderers for the comparison viewport
// These read from ComparisonFrameContext instead of the global store.
// They render simplified geometry — no circuit modifications, no surgery, etc.
// ---------------------------------------------------------------------------

const SPIKE_MAX = 500; // reduced particle budget for split view

/** Simplified worm body for comparison viewport */
function ComparisonWormBody() {
  const { frame } = useComparisonFrame();
  const tubeRef = useRef<THREE.Mesh>(null);
  const smoothPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: 88 }, () => new THREE.Vector3())
  );

  const tubeGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 12 }, (_, i) => new THREE.Vector3(i * 0.09, 0.012, 0))
    );
    return new THREE.TubeGeometry(curve, 128, 0.012, 12, false);
  }, []);

  const tubeMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.04, 0.18, 0.28),
        transparent: true,
        opacity: 0.7,
        transmission: 0.3,
        thickness: 0.8,
        roughness: 0.3,
        metalness: 0.1,
        clearcoat: 0.5,
        ior: 1.4,
      }),
    []
  );

  useFrame(() => {
    if (!frame?.body_positions || !tubeRef.current) return;
    const positions = frame.body_positions;
    const n = Math.min(positions.length, 88);

    for (let i = 0; i < n; i++) {
      const p = positions[i];
      if (!p || p.length < 3) continue;
      const target = new THREE.Vector3(p[0], p[2] + 0.012, -p[1]);
      smoothPositions.current[i].lerp(target, 0.15);
    }

    // Rebuild tube curve from smoothed positions — sample every 8th
    const curvePoints: THREE.Vector3[] = [];
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 12))) {
      curvePoints.push(smoothPositions.current[i].clone());
    }
    if (curvePoints.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(curvePoints);
      const newGeo = new THREE.TubeGeometry(curve, 128, 0.012, 12, false);
      tubeRef.current.geometry.dispose();
      tubeRef.current.geometry = newGeo;
    }
  });

  return <mesh ref={tubeRef} geometry={tubeGeometry} material={tubeMaterial} />;
}

/** Simplified fly body for comparison viewport */
function ComparisonFlyBody() {
  const { frame } = useComparisonFrame();
  const groupRef = useRef<THREE.Group>(null);
  const smoothPos = useRef([0, 0, 0]);
  const smoothYaw = useRef(0);

  useFrame(() => {
    if (!frame?.center_of_mass || !groupRef.current) return;
    const com = frame.center_of_mass;
    smoothPos.current[0] += (com[0] - smoothPos.current[0]) * 0.1;
    smoothPos.current[1] += ((com[2] ?? 0) - smoothPos.current[1]) * 0.1;
    smoothPos.current[2] += (-(com[1] ?? 0) - smoothPos.current[2]) * 0.1;

    groupRef.current.position.set(
      smoothPos.current[0],
      smoothPos.current[1] + 0.025,
      smoothPos.current[2]
    );
  });

  const thoraxGeo = useMemo(() => new THREE.SphereGeometry(0.02, 16, 12), []);
  const abdomenGeo = useMemo(() => new THREE.SphereGeometry(0.025, 16, 12), []);
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.012, 12, 8), []);
  const bodyMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#1a0800',
        roughness: 0.4,
        metalness: 0.2,
        clearcoat: 0.6,
      }),
    []
  );

  return (
    <group ref={groupRef}>
      {/* Thorax */}
      <mesh geometry={thoraxGeo} material={bodyMat} />
      {/* Abdomen */}
      <mesh geometry={abdomenGeo} material={bodyMat} position={[-0.035, -0.005, 0]} />
      {/* Head */}
      <mesh geometry={headGeo} material={bodyMat} position={[0.025, 0.005, 0]} />
    </group>
  );
}

/** Simplified zebrafish body for comparison viewport */
function ComparisonZebraFishBody() {
  const { frame } = useComparisonFrame();
  const groupRef = useRef<THREE.Group>(null);
  const smoothPos = useRef([0, 0, 0]);

  useFrame(() => {
    if (!frame?.center_of_mass || !groupRef.current) return;
    const com = frame.center_of_mass;
    smoothPos.current[0] += (com[0] - smoothPos.current[0]) * 0.1;
    smoothPos.current[1] += ((com[2] ?? 0) - smoothPos.current[1]) * 0.1;
    smoothPos.current[2] += (-(com[1] ?? 0) - smoothPos.current[2]) * 0.1;

    groupRef.current.position.set(
      smoothPos.current[0],
      smoothPos.current[1] + 0.015,
      smoothPos.current[2]
    );
  });

  const bodyGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.04, 0.012, 0.08, 0);
    shape.quadraticCurveTo(0.04, -0.012, 0, 0);
    const extrudeSettings = { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 4 };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, []);

  const bodyMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#304060',
        roughness: 0.3,
        metalness: 0.15,
        transparent: true,
        opacity: 0.8,
        clearcoat: 0.7,
      }),
    []
  );

  return (
    <group ref={groupRef}>
      <mesh geometry={bodyGeo} material={bodyMat} rotation={[Math.PI / 2, 0, 0]} position={[-0.04, 0, -0.004]} />
    </group>
  );
}

/** Renders the right organism based on type */
function ComparisonOrganismBody({ organism }: { organism: OrganismType }) {
  if (organism === 'drosophila') return <ComparisonFlyBody />;
  if (organism === 'zebrafish') return <ComparisonZebraFishBody />;
  return <ComparisonWormBody />;
}

/** Simplified spike sparkles for comparison viewport — capped at SPIKE_MAX */
function ComparisonSparkles() {
  const { frame } = useComparisonFrame();
  const pointsRef = useRef<THREE.Points>(null);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPIKE_MAX * 3), 3));
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#00d4ff',
        size: 0.004,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    []
  );

  useFrame(() => {
    if (!frame || !pointsRef.current) return;
    const positions = geo.attributes.position as THREE.BufferAttribute;
    const arr = positions.array as Float32Array;
    const bodyPos = frame.body_positions;
    const spikes = frame.spikes;
    const n = Math.min(spikes.length, SPIKE_MAX);

    for (let i = 0; i < SPIKE_MAX; i++) {
      if (i < n) {
        const spikeIdx = spikes[i];
        // Map spike index to a body position
        const bpIdx = Math.min(spikeIdx, bodyPos.length - 1);
        const bp = bodyPos[bpIdx];
        if (bp && bp.length >= 3) {
          arr[i * 3] = bp[0] + (Math.random() - 0.5) * 0.015;
          arr[i * 3 + 1] = (bp[2] ?? 0) + 0.012 + (Math.random() - 0.5) * 0.01;
          arr[i * 3 + 2] = -(bp[1] ?? 0) + (Math.random() - 0.5) * 0.015;
        }
      } else {
        // hide unused
        arr[i * 3] = 0;
        arr[i * 3 + 1] = -10;
        arr[i * 3 + 2] = 0;
      }
    }
    positions.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geo} material={mat} />;
}

/** Camera that tracks comparison organism center_of_mass */
function ComparisonCamera() {
  const { frame } = useComparisonFrame();
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.3, 0.02, 0));
  const hasSnapped = useRef(false);

  useFrame(({ camera }) => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, (z ?? 0) + 0.02, -(y ?? 0));

    if (!hasSnapped.current) {
      targetRef.current.copy(desired);
      controlsRef.current.target.copy(desired);
      camera.position.set(desired.x, desired.y + 0.12, desired.z + 0.35);
      hasSnapped.current = true;
    } else {
      targetRef.current.lerp(desired, 0.05);
      controlsRef.current.target.copy(targetRef.current);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.3, 0.02, 0]}
      minDistance={0.08}
      maxDistance={5}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      enablePan
      panSpeed={0.3}
      autoRotate={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Comparison metrics strip
// ---------------------------------------------------------------------------

function computeMetrics(frame: SimulationFrame | null) {
  if (!frame) return { active: 0, meanRate: 0, synchrony: 0, displacement: 0 };
  const rates = frame.firing_rates;
  const active = frame.n_active;
  const meanRate =
    rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  // Rough synchrony: coefficient of variation of firing rates (inverted — higher = more sync)
  const std =
    rates.length > 1
      ? Math.sqrt(
          rates.reduce((s, r) => s + (r - meanRate) ** 2, 0) / rates.length
        )
      : 0;
  const synchrony = meanRate > 0.1 ? Math.max(0, 1 - std / (meanRate * 2)) : 0;

  // Displacement from origin
  const com = frame.center_of_mass;
  const displacement =
    com && com.length >= 3
      ? Math.sqrt(com[0] ** 2 + com[1] ** 2 + (com[2] ?? 0) ** 2)
      : 0;

  return { active, meanRate, synchrony, displacement };
}

interface MetricBarProps {
  label: string;
  leftVal: number;
  rightVal: number;
  unit?: string;
  maxVal?: number;
}

function MetricBar({ label, leftVal, rightVal, unit = '', maxVal }: MetricBarProps) {
  const max = maxVal ?? Math.max(leftVal, rightVal, 1);
  const leftPct = Math.min((leftVal / max) * 100, 100);
  const rightPct = Math.min((rightVal / max) * 100, 100);

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 8,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-label)',
          marginBottom: 3,
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {/* Left bar (grows right-to-left) */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: `${leftPct}%`,
              height: 6,
              background: 'var(--accent-cyan)',
              borderRadius: 3,
              minWidth: leftPct > 0 ? 2 : 0,
              opacity: 0.8,
              transition: 'width 0.15s ease',
            }}
          />
        </div>
        {/* Right bar (grows left-to-right) */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: `${rightPct}%`,
              height: 6,
              background: 'var(--accent-magenta)',
              borderRadius: 3,
              minWidth: rightPct > 0 ? 2 : 0,
              opacity: 0.8,
              transition: 'width 0.15s ease',
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          marginTop: 1,
        }}
      >
        <span style={{ color: 'var(--accent-cyan)' }}>
          {leftVal.toFixed(1)}
          {unit}
        </span>
        <span style={{ color: 'var(--accent-magenta)' }}>
          {rightVal.toFixed(1)}
          {unit}
        </span>
      </div>
    </div>
  );
}

function ComparisonMetrics({
  leftFrame,
  rightFrame,
}: {
  leftFrame: SimulationFrame | null;
  rightFrame: SimulationFrame | null;
}) {
  const left = computeMetrics(leftFrame);
  const right = computeMetrics(rightFrame);

  return (
    <div
      style={{
        width: 100,
        minWidth: 100,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        borderRight: '1px solid var(--border-subtle)',
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 8,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-label)',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        Comparison
      </div>
      <MetricBar
        label="Active Neurons"
        leftVal={left.active}
        rightVal={right.active}
      />
      <MetricBar
        label="Mean Firing Rate"
        leftVal={left.meanRate}
        rightVal={right.meanRate}
        unit=" Hz"
      />
      <MetricBar
        label="Synchrony"
        leftVal={left.synchrony}
        rightVal={right.synchrony}
        maxVal={1}
      />
      <MetricBar
        label="Displacement"
        leftVal={left.displacement}
        rightVal={right.displacement}
        unit=" mm"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organism selector dropdown
// ---------------------------------------------------------------------------

function OrganismSelector({
  value,
  onChange,
  side,
}: {
  value: OrganismType;
  onChange: (v: OrganismType) => void;
  side: 'left' | 'right';
}) {
  const accentColor = side === 'left' ? 'var(--accent-cyan)' : 'var(--accent-magenta)';
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: side === 'left' ? 8 : undefined,
        right: side === 'right' ? 8 : undefined,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: accentColor,
          boxShadow: `0 0 8px ${accentColor}`,
        }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as OrganismType)}
        style={{
          background: 'rgba(6, 8, 18, 0.85)',
          color: 'var(--text-primary)',
          border: `1px solid ${accentColor}33`,
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          outline: 'none',
          backdropFilter: 'blur(12px)',
        }}
      >
        {ORGANISM_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viewport label
// ---------------------------------------------------------------------------

function ViewportLabel({ text, side }: { text: string; side: 'left' | 'right' }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: side === 'left' ? 8 : undefined,
        right: side === 'right' ? 8 : undefined,
        zIndex: 10,
        fontSize: 9,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-label)',
        background: 'rgba(6, 8, 18, 0.6)',
        padding: '3px 8px',
        borderRadius: 4,
        backdropFilter: 'blur(8px)',
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas background style (shared)
// ---------------------------------------------------------------------------

const CANVAS_BG =
  'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)';

// ---------------------------------------------------------------------------
// Shared lighting rig for both viewports
// ---------------------------------------------------------------------------

function BasicLighting() {
  return (
    <>
      <ambientLight intensity={0.15} color="#1a2a40" />
      <directionalLight
        position={[2, 3, 1]}
        intensity={1.2}
        color="#c8d8ff"
      />
      <directionalLight position={[-1, 2, -2]} intensity={0.4} color="#4488cc" />
      <pointLight
        position={[0, -0.5, 0]}
        intensity={0.3}
        color="#0066ff"
        distance={2}
        decay={2}
      />
      <hemisphereLight args={['#1a2a40', '#000510', 0.5]} />
      <gridHelper
        args={[4, 40, '#0a1525', '#060c18']}
        position={[0.4, -0.01, 0]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Left viewport — uses the full Scene content from the global store
// Rendered inline so we avoid importing Scene (which has PostProcessing).
// We replicate the Scene internals minus PostProcessing for performance.
// ---------------------------------------------------------------------------

function LeftViewportScene() {
  // Dynamically import and render the organism bodies from the global store
  const experiment = useSimulationStore((s) => s.experiment);
  const organism = experiment?.organism ?? 'c_elegans';

  return (
    <>
      <BasicLighting />
      <LeftOrganismBody organism={organism} />
      <LeftSmoothCamera />
    </>
  );
}

/** Left viewport organism — uses global store frames via lazy imports */
function LeftOrganismBody({ organism }: { organism: string }) {
  // These components read from useSimulationStore internally
  const [Bodies, setBodies] = useState<{
    WormBody: React.ComponentType;
    FlyBody3D: React.ComponentType;
    ZebraFishBody3D: React.ComponentType;
    SpikeParticles: React.ComponentType;
  } | null>(null);

  useEffect(() => {
    // Dynamic import to avoid circular deps and keep this file self-contained
    Promise.all([
      import('../organism/WormBody'),
      import('../organism/FlyBody3D'),
      import('../organism/ZebraFishBody3D'),
      import('../organism/SpikeParticles'),
    ]).then(([worm, fly, zebrafish, spikes]) => {
      setBodies({
        WormBody: worm.WormBody,
        FlyBody3D: fly.FlyBody3D,
        ZebraFishBody3D: zebrafish.ZebraFishBody3D,
        SpikeParticles: spikes.SpikeParticles,
      });
    });
  }, []);

  if (!Bodies) return null;

  const BodyComponent =
    organism === 'drosophila'
      ? Bodies.FlyBody3D
      : organism === 'zebrafish'
        ? Bodies.ZebraFishBody3D
        : Bodies.WormBody;

  return (
    <>
      <BodyComponent />
      <Bodies.SpikeParticles />
    </>
  );
}

/** Left viewport smooth camera — reads from global store */
function LeftSmoothCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.3, 0.02, 0));
  const hasSnapped = useRef(false);

  useFrame(({ camera }) => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, (z ?? 0) + 0.02, -(y ?? 0));

    if (!hasSnapped.current) {
      targetRef.current.copy(desired);
      controlsRef.current.target.copy(desired);
      camera.position.set(desired.x, desired.y + 0.12, desired.z + 0.35);
      hasSnapped.current = true;
    } else {
      targetRef.current.lerp(desired, 0.05);
      controlsRef.current.target.copy(targetRef.current);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.3, 0.02, 0]}
      minDistance={0.08}
      maxDistance={5}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      enablePan
      panSpeed={0.3}
      autoRotate={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Right viewport — comparison scene with its own frame context
// ---------------------------------------------------------------------------

function RightViewportScene({ organism }: { organism: OrganismType }) {
  return (
    <>
      <BasicLighting />
      <ComparisonOrganismBody organism={organism} />
      <ComparisonSparkles />
      <ComparisonCamera />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main SplitView component
// ---------------------------------------------------------------------------

export function SplitView() {
  const experiment = useSimulationStore((s) => s.experiment);
  const leftFrame = useSimulationStore((s) => s.frame);

  // Determine default organisms
  const currentOrganism = (experiment?.organism ?? 'c_elegans') as OrganismType;
  const defaultRight: OrganismType =
    currentOrganism === 'c_elegans'
      ? 'drosophila'
      : currentOrganism === 'drosophila'
        ? 'zebrafish'
        : 'c_elegans';

  const [leftOrganism, setLeftOrganism] = useState<OrganismType>(currentOrganism);
  const [rightOrganism, setRightOrganism] = useState<OrganismType>(defaultRight);

  // Sync left organism with current experiment
  useEffect(() => {
    setLeftOrganism(currentOrganism);
  }, [currentOrganism]);

  // Run comparison demo for right viewport
  const { frame: rightFrame, experiment: rightExperiment } =
    useComparisonDemo(rightOrganism);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        background: '#020206',
        position: 'relative',
      }}
    >
      {/* Left viewport */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OrganismSelector
          value={leftOrganism}
          onChange={setLeftOrganism}
          side="left"
        />
        <ViewportLabel text="Primary" side="left" />
        <Canvas
          camera={{
            position: [0.44, 0.06, 0.35],
            fov: 42,
            near: 0.005,
            far: 15,
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          dpr={[1, 1]}
          flat={false}
          style={{ background: CANVAS_BG }}
        >
          <LeftViewportScene />
        </Canvas>
      </div>

      {/* Comparison metrics strip */}
      <ComparisonMetrics leftFrame={leftFrame} rightFrame={rightFrame} />

      {/* Right viewport */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OrganismSelector
          value={rightOrganism}
          onChange={setRightOrganism}
          side="right"
        />
        <ViewportLabel text="Comparison" side="right" />
        <Canvas
          camera={{
            position: [0.44, 0.06, 0.35],
            fov: 42,
            near: 0.005,
            far: 15,
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          dpr={[1, 1]}
          flat={false}
          style={{ background: CANVAS_BG }}
        >
          <ComparisonFrameContext.Provider
            value={{ frame: rightFrame, experiment: rightExperiment }}
          >
            <RightViewportScene organism={rightOrganism} />
          </ComparisonFrameContext.Provider>
        </Canvas>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle button for the app header
// ---------------------------------------------------------------------------

export function SplitViewToggle() {
  const [active, setActive] = useState(false);

  // Dispatch custom event so App.tsx can listen
  const toggle = useCallback(() => {
    const next = !active;
    setActive(next);
    window.dispatchEvent(
      new CustomEvent('neurevo-split-view', { detail: { active: next } })
    );
  }, [active]);

  // Listen for external deactivation
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.active === 'boolean') {
        setActive(detail.active);
      }
    };
    window.addEventListener('neurevo-split-view', handler);
    return () => window.removeEventListener('neurevo-split-view', handler);
  }, []);

  return (
    <button
      onClick={toggle}
      title={active ? 'Exit comparison mode' : 'Compare organisms side-by-side'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: active
          ? 'rgba(0, 212, 255, 0.12)'
          : 'rgba(255, 255, 255, 0.04)',
        border: active
          ? '1px solid rgba(0, 212, 255, 0.3)'
          : '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: '4px 10px',
        cursor: 'pointer',
        color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
        fontSize: 11,
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Split icon — two rectangles side by side */}
      <svg
        width="14"
        height="12"
        viewBox="0 0 14 12"
        fill="none"
        style={{ flexShrink: 0 }}
      >
        <rect
          x="0.5"
          y="0.5"
          width="5"
          height="11"
          rx="1"
          stroke="currentColor"
          strokeWidth="1"
          fill={active ? 'rgba(0, 212, 255, 0.15)' : 'none'}
        />
        <rect
          x="8.5"
          y="0.5"
          width="5"
          height="11"
          rx="1"
          stroke="currentColor"
          strokeWidth="1"
          fill={active ? 'rgba(255, 34, 136, 0.15)' : 'none'}
        />
      </svg>
      Compare
    </button>
  );
}
