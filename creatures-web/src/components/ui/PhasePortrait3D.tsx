import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
// EffectComposer disabled due to postprocessing@6.39.0 bug
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { CollapsiblePanel } from './CollapsiblePanel';

/* ------------------------------------------------------------------ */
/*  PCA helpers (power iteration + deflation, matching existing style) */
/* ------------------------------------------------------------------ */

function powerIteration(matrix: number[][], dim: number, nIter = 50): { vec: number[]; eigenvalue: number } {
  let v = new Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.sin(i * 1.37 + 0.7);
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-12) { v[0] = 1; norm = 1; }
  for (let i = 0; i < dim; i++) v[i] /= norm;

  let eigenvalue = 0;
  for (let iter = 0; iter < nIter; iter++) {
    const mv = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      let sum = 0;
      for (let j = 0; j < dim; j++) sum += matrix[i][j] * v[j];
      mv[i] = sum;
    }
    norm = Math.sqrt(mv.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-12) break;
    eigenvalue = norm;
    for (let i = 0; i < dim; i++) v[i] = mv[i] / norm;
  }
  return { vec: v, eigenvalue };
}

function deflate(matrix: number[][], v: number[], dim: number): number[][] {
  let eigenvalue = 0;
  for (let i = 0; i < dim; i++) {
    let row = 0;
    for (let j = 0; j < dim; j++) row += matrix[i][j] * v[j];
    eigenvalue += v[i] * row;
  }
  const result: number[][] = [];
  for (let i = 0; i < dim; i++) {
    result[i] = new Array(dim);
    for (let j = 0; j < dim; j++) {
      result[i][j] = matrix[i][j] - eigenvalue * v[i] * v[j];
    }
  }
  return result;
}

interface PCAResult {
  projected: THREE.Vector3[];
  variance: [number, number, number]; // percentage for each PC
}

function computePCA3(buffer: number[][], maxD: number): PCAResult | null {
  const T = buffer.length;
  if (T < 5) return null;
  const D = Math.min(maxD, buffer[0].length);
  if (D < 3) return null;

  // Center data
  const means = new Array(D).fill(0);
  for (let t = 0; t < T; t++) {
    for (let d = 0; d < D; d++) means[d] += buffer[t][d] ?? 0;
  }
  for (let d = 0; d < D; d++) means[d] /= T;

  const centered: number[][] = [];
  for (let t = 0; t < T; t++) {
    centered[t] = new Array(D);
    for (let d = 0; d < D; d++) centered[t][d] = (buffer[t][d] ?? 0) - means[d];
  }

  // Covariance matrix
  const cov: number[][] = [];
  for (let i = 0; i < D; i++) cov[i] = new Array(D).fill(0);
  for (let i = 0; i < D; i++) {
    for (let j = i; j < D; j++) {
      let sum = 0;
      for (let t = 0; t < T; t++) sum += centered[t][i] * centered[t][j];
      cov[i][j] = sum / Math.max(T - 1, 1);
      if (j !== i) cov[j][i] = cov[i][j];
    }
  }

  // Top 3 eigenvectors
  const { vec: pc1, eigenvalue: ev1 } = powerIteration(cov, D);
  const d1 = deflate(cov, pc1, D);
  const { vec: pc2, eigenvalue: ev2 } = powerIteration(d1, D);
  const d2 = deflate(d1, pc2, D);
  const { vec: pc3, eigenvalue: ev3 } = powerIteration(d2, D);

  const totalVar = ev1 + ev2 + ev3;
  const variance: [number, number, number] = totalVar > 1e-12
    ? [(ev1 / totalVar) * 100, (ev2 / totalVar) * 100, (ev3 / totalVar) * 100]
    : [33.3, 33.3, 33.3];

  // Project
  const projected: THREE.Vector3[] = [];
  for (let t = 0; t < T; t++) {
    let x = 0, y = 0, z = 0;
    for (let d = 0; d < D; d++) {
      x += centered[t][d] * pc1[d];
      y += centered[t][d] * pc2[d];
      z += centered[t][d] * pc3[d];
    }
    projected.push(new THREE.Vector3(x, y, z));
  }

  // Auto-scale to unit cube
  const bbox = new THREE.Box3();
  for (const p of projected) bbox.expandByPoint(p);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const maxExtent = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.0 / maxExtent;
  for (const p of projected) {
    p.sub(center).multiplyScalar(scale);
  }

  return { projected, variance };
}

/* ------------------------------------------------------------------ */
/*  Attractor detection: find looping regions                          */
/* ------------------------------------------------------------------ */

function detectAttractors(points: THREE.Vector3[], threshold = 0.08): THREE.Vector3[] {
  const attractors: THREE.Vector3[] = [];
  const T = points.length;
  // Look for points where trajectory returns close to a previous position
  // with a gap of at least 30 frames (to detect actual loops, not local jitter)
  const minGap = 30;
  const checked = new Set<number>();

  for (let i = minGap; i < T; i++) {
    if (checked.has(i)) continue;
    for (let j = 0; j < i - minGap; j++) {
      const dist = points[i].distanceTo(points[j]);
      if (dist < threshold) {
        // Midpoint of the loop region
        const mid = new THREE.Vector3().addVectors(points[i], points[j]).multiplyScalar(0.5);
        // Check not too close to an existing attractor
        const tooClose = attractors.some((a) => a.distanceTo(mid) < threshold * 2);
        if (!tooClose) {
          attractors.push(mid);
        }
        checked.add(i);
        break;
      }
    }
  }

  return attractors;
}

/* ------------------------------------------------------------------ */
/*  Inner 3D scene components                                          */
/* ------------------------------------------------------------------ */

interface TrajectoryProps {
  points: THREE.Vector3[];
  thickness: number;
  showVelocity: boolean;
  showAttractors: boolean;
}

const _tempColor = new THREE.Color();

function Trajectory({ points, thickness, showVelocity, showAttractors }: TrajectoryProps) {
  const tubeRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);

  // Pulse the current-state marker
  useFrame(({ clock }) => {
    if (markerRef.current) {
      const s = 0.03 + 0.012 * Math.sin(clock.getElapsedTime() * 4);
      markerRef.current.scale.setScalar(s / 0.03);
    }
  });

  const T = points.length;
  if (T < 3) return null;

  // Build tube geometry from CatmullRomCurve3
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const segments = Math.min(T * 2, 600);
  const radialSegments = 5;
  const tubeGeo = new THREE.TubeGeometry(curve, segments, thickness * 0.01, radialSegments, false);

  // Vertex colors: time gradient old=dim blue -> recent=bright cyan -> current=white
  const posAttr = tubeGeo.attributes.position;
  const vertCount = posAttr.count;
  const colors = new Float32Array(vertCount * 3);

  // For each vertex, estimate its parametric t along the tube
  // TubeGeometry lays out (segments+1) rings of (radialSegments+1) verts each
  const ringsCount = segments + 1;
  const vertsPerRing = radialSegments + 1;

  for (let vi = 0; vi < vertCount; vi++) {
    const ringIdx = Math.floor(vi / vertsPerRing);
    const t = ringIdx / (ringsCount - 1); // 0=oldest, 1=newest

    // Fade oldest 20%
    const fadeMul = t < 0.2 ? t / 0.2 : 1.0;

    // Color ramp: dim blue(0.1,0.15,0.4) -> bright cyan(0,0.9,1) -> white(1,1,1)
    if (t < 0.9) {
      const u = t / 0.9;
      _tempColor.setRGB(
        0.1 * (1 - u) + 0 * u,
        0.15 * (1 - u) + 0.9 * u,
        0.4 * (1 - u) + 1.0 * u,
      );
    } else {
      const u = (t - 0.9) / 0.1;
      _tempColor.setRGB(
        0 + u,
        0.9 + 0.1 * u,
        1.0,
      );
    }

    colors[vi * 3] = _tempColor.r * fadeMul;
    colors[vi * 3 + 1] = _tempColor.g * fadeMul;
    colors[vi * 3 + 2] = _tempColor.b * fadeMul;
  }

  tubeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Velocity arrows every 20th point
  const arrows: { pos: THREE.Vector3; dir: THREE.Vector3; speed: number }[] = [];
  if (showVelocity && T > 20) {
    for (let i = 0; i < T - 1; i += 20) {
      const dir = new THREE.Vector3().subVectors(points[Math.min(i + 1, T - 1)], points[i]);
      const speed = dir.length();
      if (speed > 1e-6) {
        dir.normalize();
        arrows.push({ pos: points[i].clone(), dir, speed });
      }
    }
  }

  // Attractor regions
  const attractors = showAttractors ? detectAttractors(points) : [];

  const lastPoint = points[T - 1];

  return (
    <group>
      {/* Trajectory tube */}
      <mesh ref={tubeRef} geometry={tubeGeo}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>

      {/* Current state glowing sphere */}
      <mesh ref={markerRef} position={lastPoint}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>

      {/* Velocity arrows */}
      {arrows.map((a, idx) => {
        const arrowLen = Math.min(a.speed * 8, 0.1);
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
        return (
          <group key={idx} position={a.pos} quaternion={q}>
            {/* shaft */}
            <mesh position={[0, arrowLen * 0.4, 0]}>
              <cylinderGeometry args={[0.003, 0.003, arrowLen * 0.8, 4]} />
              <meshBasicMaterial color="#00ccff" opacity={0.5} transparent toneMapped={false} />
            </mesh>
            {/* head */}
            <mesh position={[0, arrowLen * 0.85, 0]}>
              <coneGeometry args={[0.008, arrowLen * 0.3, 4]} />
              <meshBasicMaterial color="#00ccff" opacity={0.6} transparent toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* Attractor basins */}
      {attractors.map((a, idx) => (
        <mesh key={`attr-${idx}`} position={a}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#ff4488" opacity={0.12} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* Axis indicators + grid */
function AxisIndicators() {
  const axisLength = 0.6;
  const axes = [
    { dir: new THREE.Vector3(axisLength, 0, 0), color: '#ff4444', label: 'PC1' },
    { dir: new THREE.Vector3(0, axisLength, 0), color: '#44ff44', label: 'PC2' },
    { dir: new THREE.Vector3(0, 0, axisLength), color: '#4488ff', label: 'PC3' },
  ];

  // Build a single lineSegments geometry for all 3 axes (pairs of points)
  const axisGeo = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const _c = new THREE.Color();
    for (const ax of axes) {
      _c.set(ax.color);
      // start
      positions.push(0, 0, 0);
      colors.push(_c.r, _c.g, _c.b);
      // end
      positions.push(ax.dir.x, ax.dir.y, ax.dir.z);
      colors.push(_c.r, _c.g, _c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, []);

  return (
    <group>
      <lineSegments geometry={axisGeo}>
        <lineBasicMaterial vertexColors opacity={0.3} transparent />
      </lineSegments>

      {/* Grid on PC1-PC2 plane */}
      <gridHelper
        args={[1.2, 12, '#1a2040', '#1a2040']}
        rotation={[0, 0, 0]}
        position={[0, 0, 0]}
      />
    </group>
  );
}

/* Camera auto-fit */
function CameraRig({ points }: { points: THREE.Vector3[] }) {
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    if (points.length < 3) return;
    if (initialized.current) return;
    initialized.current = true;

    const bbox = new THREE.Box3();
    for (const p of points) bbox.expandByPoint(p);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 2.2;

    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.7);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [points, camera]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  Main exported component                                            */
/* ------------------------------------------------------------------ */

export function PhasePortrait3D() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 0;

  // Controls state
  const [windowSize, setWindowSize] = useState(300);
  const [trailThickness, setTrailThickness] = useState(0.5);
  const [showVelocity, setShowVelocity] = useState(true);
  const [showAttractors, setShowAttractors] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  // Data accumulation
  const bufferRef = useRef<number[][]>([]);
  const lastTRef = useRef(-1);
  const pcaRef = useRef<PCAResult | null>(null);
  const frameCountRef = useRef(0);
  const pcaCountRef = useRef(0);

  // Points for rendering (updated periodically)
  const [renderedPoints, setRenderedPoints] = useState<THREE.Vector3[]>([]);
  const [variance, setVariance] = useState<[number, number, number]>([0, 0, 0]);

  // Accumulate firing rates
  useEffect(() => {
    if (!frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    bufferRef.current.push([...frame.firing_rates]);
    if (bufferRef.current.length > windowSize) {
      bufferRef.current = bufferRef.current.slice(-windowSize);
    }

    frameCountRef.current++;
    pcaCountRef.current++;

    // Recompute PCA every 30 frames
    if (pcaCountRef.current >= 30 || pcaRef.current === null) {
      pcaCountRef.current = 0;
      const maxD = Math.min(nNeurons, 60);
      const result = computePCA3(bufferRef.current, maxD);
      if (result) {
        pcaRef.current = result;
      }
    }

    // Update rendered geometry every 5 frames
    if (frameCountRef.current % 5 === 0 && pcaRef.current) {
      // If PCA was not recomputed this frame, re-project with existing eigenvectors
      // But since we recomputed the full PCA above, just use the result
      const maxD = Math.min(nNeurons, 60);
      const result = computePCA3(bufferRef.current, maxD);
      if (result) {
        setRenderedPoints(result.projected);
        setVariance(result.variance);
      }
    }
  }, [frame, windowSize, nNeurons]);

  const handleReset = useCallback(() => {
    setResetKey((k) => k + 1);
  }, []);

  const hasData = renderedPoints.length >= 5;

  return (
    <CollapsiblePanel id="phase-portrait-3d" label="Phase Portrait 3D" badge="PCA">
      {/* 3D Canvas */}
      <div style={{ width: '100%', height: 280, borderRadius: 6, overflow: 'hidden', background: '#05050d' }}>
        {hasData ? (
          <Canvas
            key={resetKey}
            camera={{ fov: 50, near: 0.01, far: 100, position: [1.2, 0.8, 1.4] }}
            dpr={[1, 1.5]}
            style={{ width: '100%', height: '100%' }}
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={['#05050d']} />

            <CameraRig points={renderedPoints} />
            <OrbitControls
              autoRotate
              autoRotateSpeed={0.4}
              enableDamping
              dampingFactor={0.12}
              minDistance={0.3}
              maxDistance={5}
            />

            <AxisIndicators />
            <Trajectory
              points={renderedPoints}
              thickness={trailThickness}
              showVelocity={showVelocity}
              showAttractors={showAttractors}
            />

            {/* Bloom disabled — postprocessing@6.39.0 bug */}
          </Canvas>
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(140,170,200,0.4)',
            fontFamily: 'monospace',
            fontSize: 11,
          }}>
            Accumulating neural state data...
          </div>
        )}
      </div>

      {/* Variance labels */}
      {hasData && (
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 6,
          fontFamily: 'monospace',
          fontSize: 9,
          color: 'rgba(140,170,200,0.6)',
        }}>
          <span style={{ color: '#ff6666' }}>PC1: {variance[0].toFixed(1)}%</span>
          <span style={{ color: '#66ff66' }}>PC2: {variance[1].toFixed(1)}%</span>
          <span style={{ color: '#6699ff' }}>PC3: {variance[2].toFixed(1)}%</span>
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 8,
        alignItems: 'center',
      }}>
        {/* Window slider */}
        <label style={sliderLabelStyle}>
          <span>Window</span>
          <input
            type="range"
            min={100}
            max={500}
            step={10}
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={sliderValueStyle}>{windowSize}</span>
        </label>

        {/* Trail thickness slider */}
        <label style={sliderLabelStyle}>
          <span>Trail</span>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            value={trailThickness}
            onChange={(e) => setTrailThickness(Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={sliderValueStyle}>{trailThickness.toFixed(1)}</span>
        </label>

        {/* Toggles */}
        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={showVelocity}
            onChange={(e) => setShowVelocity(e.target.checked)}
            style={{ accentColor: '#0cf' }}
          />
          <span>Velocity</span>
        </label>

        <label style={toggleLabelStyle}>
          <input
            type="checkbox"
            checked={showAttractors}
            onChange={(e) => setShowAttractors(e.target.checked)}
            style={{ accentColor: '#f48' }}
          />
          <span>Attractors</span>
        </label>

        {/* Reset button */}
        <button
          onClick={handleReset}
          style={{
            padding: '3px 10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: 'rgba(200,210,230,0.7)',
            fontSize: 10,
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          Reset view
        </button>
      </div>
    </CollapsiblePanel>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline styles                                                      */
/* ------------------------------------------------------------------ */

const sliderLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'monospace',
  fontSize: 10,
  color: 'rgba(180,195,220,0.7)',
};

const sliderStyle: React.CSSProperties = {
  width: 60,
  height: 3,
  accentColor: '#0cf',
  cursor: 'pointer',
};

const sliderValueStyle: React.CSSProperties = {
  minWidth: 24,
  textAlign: 'right' as const,
  fontSize: 9,
  color: 'rgba(140,170,200,0.5)',
  fontFamily: 'monospace',
};

const toggleLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'monospace',
  fontSize: 10,
  color: 'rgba(180,195,220,0.7)',
  cursor: 'pointer',
};
