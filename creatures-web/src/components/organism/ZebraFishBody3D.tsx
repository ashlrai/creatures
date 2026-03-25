import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { createOrganismMaterial } from '../../shaders/OrganismMaterial';
import { createNeuralInteriorMaterial } from '../../shaders/NeuralInteriorMaterial';

/**
 * Anatomical zebrafish body with semi-transparent skin and visible neural
 * circuits inside.  The body is a streamlined NACA-profile tube; fins are
 * animated plane lobes; the neural interior shows brain regions, spinal cord,
 * Mauthner cells, and motor neurons driven by live firing_rates / spikes.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BODY_SEGMENTS = 80;
const BODY_LENGTH = 0.45;         // total nose-to-tail in world units
const MAX_RADIUS = 0.038;         // widest point (brain bulge)
const SPINAL_RADIUS = 0.003;
const EYE_RADIUS = 0.007;
const NEURON_BASE_SIZE = 0.003;
const MAUTHNER_SIZE = NEURON_BASE_SIZE * 4;

// Brain region neuron counts (fraction of total neuron pool)
const FOREBRAIN_FRAC = 0.08;
const MIDBRAIN_FRAC = 0.10;
const HINDBRAIN_FRAC = 0.12;
const MOTOR_FRAC = 0.70;          // distributed along spinal cord

// Colors
const BODY_COLOR = new THREE.Color('#445566');
const FIN_COLOR = new THREE.Color('#556677');

const FOREBRAIN_COLOR = new THREE.Color(0.6, 0.85, 0.2);   // yellow-green
const MIDBRAIN_COLOR = new THREE.Color(0.1, 0.85, 0.9);     // cyan
const HINDBRAIN_COLOR = new THREE.Color(0.2, 0.35, 0.95);   // blue
const MOTOR_COLOR = new THREE.Color(1.0, 0.3, 0.45);        // red-pink
const MAUTHNER_COLOR = new THREE.Color(1.0, 0.85, 0.15);    // gold
const SPIKE_COLOR = new THREE.Color(1.0, 1.0, 1.0);
const SPINAL_COLOR = new THREE.Color(0.15, 0.6, 0.95);

// ---------------------------------------------------------------------------
// NACA-ish radius profile
// ---------------------------------------------------------------------------
function fishRadius(t: number): number {
  // t in [0,1] from nose to tail
  // Sharper nose, bulge at t~0.15, taper to caudal peduncle
  const a = 0.2969, b = 0.1260, c = 0.3516, d = 0.2843, e = 0.1015;
  const raw = a * Math.sqrt(t + 0.001) - b * t - c * t * t + d * t * t * t - e * t * t * t * t;
  // Scale so peak is at MAX_RADIUS, add extra bulge at brain region
  const brainBulge = Math.exp(-Math.pow((t - 0.15) / 0.06, 2)) * 0.35;
  // Thin caudal peduncle
  const caudalThin = t > 0.8 ? (1 - t) / 0.2 : 1.0;
  return MAX_RADIUS * Math.max(raw + brainBulge, 0.02) * caudalThin;
}

// ---------------------------------------------------------------------------
// Build the spine curve (rest pose, straight)
// ---------------------------------------------------------------------------
function buildRestSpine(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= BODY_SEGMENTS; i++) {
    const t = i / BODY_SEGMENTS;
    pts.push(new THREE.Vector3(t * BODY_LENGTH, 0, 0));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Build tube geometry with variable radius
// ---------------------------------------------------------------------------
function buildFishTube(curve: THREE.CatmullRomCurve3): THREE.BufferGeometry {
  const radialSegs = 16;
  const lengthSegs = BODY_SEGMENTS;
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const frames = curve.computeFrenetFrames(lengthSegs, false);
  const pts = curve.getSpacedPoints(lengthSegs);

  for (let i = 0; i <= lengthSegs; i++) {
    const t = i / lengthSegs;
    const r = fishRadius(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const P = pts[i];

    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);

      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;

      vertices.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      normals.push(nx, ny, nz);
      uvs.push(t, j / radialSegs);
    }
  }

  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = a + radialSegs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

// ---------------------------------------------------------------------------
// Layout helpers for neural positions
// ---------------------------------------------------------------------------

/** Place N neurons in a 3D cluster around a center */
function clusterPositions(
  center: THREE.Vector3,
  n: number,
  spread: number,
  seed: number,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    // Deterministic pseudo-random via golden angle spiral
    const angle1 = (i + seed) * 2.399963;
    const angle2 = (i + seed) * 1.533;
    const r = spread * Math.cbrt((i + 0.5) / n); // uniform volume distribution
    pts.push(new THREE.Vector3(
      center.x + r * Math.cos(angle1) * Math.sin(angle2),
      center.y + r * Math.sin(angle1) * Math.sin(angle2),
      center.z + r * Math.cos(angle2),
    ));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ZebraFishBody3D() {
  const frame = useSimulationStore((s) => s.frame);
  const lesionedNeurons = useCircuitModificationStore((s) => s.lesionedNeurons);
  const stimulatedNeurons = useCircuitModificationStore((s) => s.stimulatedNeurons);
  const recordedNeurons = useCircuitModificationStore((s) => s.recordedNeurons);

  // Refs for animated elements
  const bodyMeshRef = useRef<THREE.Mesh>(null);
  const caudalUpperRef = useRef<THREE.Mesh>(null);
  const caudalLowerRef = useRef<THREE.Mesh>(null);
  const dorsalRef = useRef<THREE.Mesh>(null);
  const pectoralLeftRef = useRef<THREE.Mesh>(null);
  const pectoralRightRef = useRef<THREE.Mesh>(null);
  const neuronPointsRef = useRef<THREE.Points>(null);
  const mauthnerLeftRef = useRef<THREE.Mesh>(null);
  const mauthnerRightRef = useRef<THREE.Mesh>(null);
  const mauthnerLinesRef = useRef<THREE.LineSegments>(null);
  const spinalCordRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);
  const lastFrameId = useRef(-1);

  // Smooth spine for swimming animation
  const smoothSpine = useRef<THREE.Vector3[]>(buildRestSpine());

  const nNeurons = frame?.firing_rates?.length || 80;

  // Click target geometry for neuron selection
  const clickTargetGeo = useMemo(() => new THREE.SphereGeometry(0.004, 6, 4), []);
  const clickTargetMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);

  const handleNeuronClick = (neuronIndex: number, e: React.PointerEvent) => {
    e.stopPropagation();
    useCircuitModificationStore.getState().toggleNeuronSelection(`neuron_${neuronIndex}`, e.shiftKey);
  };

  // ---- Neuron layout -------------------------------------------------------
  const { neuronPositions, neuronColors, neuronSizes, neuronRegions, motorIndices, mauthnerWorldPos } = useMemo(() => {
    const nFore = Math.max(2, Math.round(nNeurons * FOREBRAIN_FRAC));
    const nMid = Math.max(2, Math.round(nNeurons * MIDBRAIN_FRAC));
    const nHind = Math.max(2, Math.round(nNeurons * HINDBRAIN_FRAC));
    const nMotor = Math.max(2, nNeurons - nFore - nMid - nHind);

    // Brain centers along the body
    const foreCenter = new THREE.Vector3(0.04 * BODY_LENGTH, 0.01, 0);
    const midCenter = new THREE.Vector3(0.10 * BODY_LENGTH, 0.005, 0);
    const hindCenter = new THREE.Vector3(0.17 * BODY_LENGTH, 0.0, 0);

    const forePts = clusterPositions(foreCenter, nFore, 0.012, 0);
    const midPts = clusterPositions(midCenter, nMid, 0.014, 100);
    const hindPts = clusterPositions(hindCenter, nHind, 0.015, 200);

    // Motor neurons along spinal cord from t~0.2 to t~0.9
    const motorPts: THREE.Vector3[] = [];
    for (let i = 0; i < nMotor; i++) {
      const t = 0.2 + (i / Math.max(nMotor - 1, 1)) * 0.7;
      const x = t * BODY_LENGTH;
      const jitter = ((i * 2.399) % 1 - 0.5) * 0.006;
      const yJitter = ((i * 1.733) % 1 - 0.5) * 0.004;
      motorPts.push(new THREE.Vector3(x, -0.005 + yJitter, jitter));
    }

    const allPts = [...forePts, ...midPts, ...hindPts, ...motorPts];
    const total = allPts.length;

    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const regions: string[] = [];
    const mIndices: number[] = [];

    let idx = 0;
    const writeNeurons = (pts: THREE.Vector3[], color: THREE.Color, size: number, region: string) => {
      for (const p of pts) {
        positions[idx * 3] = p.x;
        positions[idx * 3 + 1] = p.y;
        positions[idx * 3 + 2] = p.z;
        colors[idx * 3] = color.r;
        colors[idx * 3 + 1] = color.g;
        colors[idx * 3 + 2] = color.b;
        sizes[idx] = size;
        regions.push(region);
        if (region === 'motor') mIndices.push(idx);
        idx++;
      }
    };

    writeNeurons(forePts, FOREBRAIN_COLOR, NEURON_BASE_SIZE, 'forebrain');
    writeNeurons(midPts, MIDBRAIN_COLOR, NEURON_BASE_SIZE, 'midbrain');
    writeNeurons(hindPts, HINDBRAIN_COLOR, NEURON_BASE_SIZE, 'hindbrain');
    writeNeurons(motorPts, MOTOR_COLOR, NEURON_BASE_SIZE, 'motor');

    // Mauthner cells: two large neurons in the hindbrain
    const mL = new THREE.Vector3(hindCenter.x + 0.005, hindCenter.y + 0.004, 0.008);
    const mR = new THREE.Vector3(hindCenter.x + 0.005, hindCenter.y + 0.004, -0.008);

    return {
      neuronPositions: positions,
      neuronColors: colors,
      neuronSizes: sizes,
      neuronRegions: regions,
      motorIndices: mIndices,
      mauthnerWorldPos: [mL, mR] as [THREE.Vector3, THREE.Vector3],
    };
  }, [nNeurons]);

  // Mutable copies for animation
  const animColors = useMemo(() => new Float32Array(neuronColors), [neuronColors]);
  const animSizes = useMemo(() => new Float32Array(neuronSizes), [neuronSizes]);

  // ---- Mauthner -> motor neuron connection lines ----------------------------
  const mauthnerLinePositions = useMemo(() => {
    // Each Mauthner cell connects to every motor neuron: 2 lines per motor neuron
    const lineCount = motorIndices.length * 2;
    const arr = new Float32Array(lineCount * 2 * 3); // 2 vertices per line
    let vi = 0;
    for (const mPos of mauthnerWorldPos) {
      for (const mIdx of motorIndices) {
        arr[vi++] = mPos.x; arr[vi++] = mPos.y; arr[vi++] = mPos.z;
        arr[vi++] = neuronPositions[mIdx * 3];
        arr[vi++] = neuronPositions[mIdx * 3 + 1];
        arr[vi++] = neuronPositions[mIdx * 3 + 2];
      }
    }
    return arr;
  }, [motorIndices, mauthnerWorldPos, neuronPositions]);

  // ---- Body geometry (built once, vertex-deformed in useFrame) ---------------
  const { bodyGeometry, restPositions } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(buildRestSpine());
    const geo = buildFishTube(curve);
    const rest = new Float32Array(geo.getAttribute('position').array);
    return { bodyGeometry: geo, restPositions: rest };
  }, []);

  // ---- Materials (memoized) -------------------------------------------------
  const bodyMaterial = useMemo(() => createOrganismMaterial({
    baseColor: new THREE.Color('#445566'),
    transmission: 0.35,
    clearcoat: 0.5,
    iridescence: 0.3,
  }), []);

  const finMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: FIN_COLOR,
    roughness: 0.3,
    metalness: 0.05,
    transmission: 0.4,
    thickness: 0.3,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  const eyeMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#111122',
    roughness: 0.1,
    metalness: 0.3,
  }), []);

  const mauthnerMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: MAUTHNER_COLOR,
    emissive: MAUTHNER_COLOR,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9,
  }), []);

  const mauthnerLineMaterial = useMemo(() => {
    const mat = createNeuralInteriorMaterial();
    // Gold-tinted base color to match Mauthner cell identity
    mat.uniforms.u_baseColor.value.set(1.0, 0.85, 0.15);
    return mat;
  }, []);

  const spinalMaterial = useMemo(() => {
    const mat = createNeuralInteriorMaterial();
    // Spinal cord blue tint
    mat.uniforms.u_baseColor.value.set(SPINAL_COLOR.r, SPINAL_COLOR.g, SPINAL_COLOR.b);
    return mat;
  }, []);

  // ---- Geometries -----------------------------------------------------------
  const eyeGeometry = useMemo(() => new THREE.SphereGeometry(EYE_RADIUS, 12, 8), []);
  const mauthnerGeometry = useMemo(() => new THREE.SphereGeometry(MAUTHNER_SIZE, 16, 12), []);

  const caudalGeometry = useMemo(() => new THREE.PlaneGeometry(0.04, 0.035, 8, 6), []);
  const dorsalGeometry = useMemo(() => new THREE.PlaneGeometry(BODY_LENGTH * 0.3, 0.018, 12, 4), []);
  const pectoralGeometry = useMemo(() => new THREE.PlaneGeometry(0.025, 0.012, 6, 4), []);

  const spinalGeometry = useMemo(() => {
    const spinePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = 0.05 + (i / 40) * 0.85;
      spinePts.push(new THREE.Vector3(t * BODY_LENGTH, -0.006, 0));
    }
    const curve = new THREE.CatmullRomCurve3(spinePts);
    return new THREE.TubeGeometry(curve, 40, SPINAL_RADIUS, 8, false);
  }, []);

  // ---- useFrame: swimming + neural activity ---------------------------------
  useFrame(({ clock }) => {
    frameCount.current++;
    const t = clock.getElapsedTime();

    const rates = frame?.firing_rates ?? [];
    const spikes = new Set(frame?.spikes ?? []);
    const bodyPos = frame?.body_positions;

    // --- Swimming wave: displace spine laterally ---
    const spine = smoothSpine.current;
    for (let i = 0; i <= BODY_SEGMENTS; i++) {
      const frac = i / BODY_SEGMENTS;
      let targetX = frac * BODY_LENGTH;
      let targetY = 0;
      let targetZ = 0;

      if (bodyPos && bodyPos.length > 2) {
        // Map body_positions onto our spine
        const bIdx = frac * (bodyPos.length - 1);
        const lo = Math.floor(bIdx);
        const hi = Math.min(lo + 1, bodyPos.length - 1);
        const blend = bIdx - lo;
        if (bodyPos[lo] && bodyPos[hi]) {
          targetX = bodyPos[lo][0] + (bodyPos[hi][0] - bodyPos[lo][0]) * blend;
          targetY = bodyPos[lo][2] + (bodyPos[hi][2] - bodyPos[lo][2]) * blend;  // z -> y in 3D
          targetZ = -(bodyPos[lo][1] + (bodyPos[hi][1] - bodyPos[lo][1]) * blend);
        }
      } else {
        // Procedural traveling wave
        const amp = 0.015 * Math.pow(frac, 1.5);
        targetZ = amp * Math.sin(t * 5.0 - frac * Math.PI * 2.5);
      }

      spine[i].x += (targetX - spine[i].x) * 0.25;
      spine[i].y += (targetY - spine[i].y) * 0.25;
      spine[i].z += (targetZ - spine[i].z) * 0.25;
    }

    // --- Deform body mesh vertices ---
    if (bodyMeshRef.current) {
      const posAttr = bodyMeshRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const radialSegs = 16;

      for (let i = 0; i <= BODY_SEGMENTS; i++) {
        const frac = i / BODY_SEGMENTS;
        // Compute local displacement from rest to current spine
        const dx = spine[i].x - frac * BODY_LENGTH;
        const dy = spine[i].y;
        const dz = spine[i].z;

        for (let j = 0; j <= radialSegs; j++) {
          const vi = (i * (radialSegs + 1) + j) * 3;
          arr[vi] = restPositions[vi] + dx;
          arr[vi + 1] = restPositions[vi + 1] + dy;
          arr[vi + 2] = restPositions[vi + 2] + dz;
        }
      }
      posAttr.needsUpdate = true;
    }

    // --- Tail fin animation ---
    const tailWave = spine[BODY_SEGMENTS].z - spine[BODY_SEGMENTS - 5].z;
    const tailAngle = Math.atan2(tailWave, 0.02);
    const tailPos = spine[BODY_SEGMENTS];

    if (caudalUpperRef.current) {
      caudalUpperRef.current.position.set(tailPos.x + 0.015, tailPos.y + 0.01, tailPos.z);
      caudalUpperRef.current.rotation.set(-0.3, 0, tailAngle * 0.8);
    }
    if (caudalLowerRef.current) {
      caudalLowerRef.current.position.set(tailPos.x + 0.015, tailPos.y - 0.01, tailPos.z);
      caudalLowerRef.current.rotation.set(0.3, 0, tailAngle * 0.8);
    }

    // --- Dorsal fin follows body mid ---
    if (dorsalRef.current) {
      const midIdx = Math.round(BODY_SEGMENTS * 0.45);
      const midPt = spine[midIdx];
      const r = fishRadius(0.45);
      dorsalRef.current.position.set(midPt.x, midPt.y + r + 0.005, midPt.z);
      dorsalRef.current.rotation.set(0, 0, Math.PI * 0.5);
    }

    // --- Pectoral fins ---
    const pectIdx = Math.round(BODY_SEGMENTS * 0.2);
    const pectPt = spine[pectIdx];
    const pectR = fishRadius(0.2);
    const pectWave = Math.sin(t * 3.0) * 0.2;
    if (pectoralLeftRef.current) {
      pectoralLeftRef.current.position.set(pectPt.x, pectPt.y - 0.005, pectPt.z + pectR * 0.9);
      pectoralLeftRef.current.rotation.set(0.1 + pectWave, -0.3, 0);
    }
    if (pectoralRightRef.current) {
      pectoralRightRef.current.position.set(pectPt.x, pectPt.y - 0.005, pectPt.z - pectR * 0.9);
      pectoralRightRef.current.rotation.set(-0.1 - pectWave, 0.3, 0);
    }

    // --- Spinal cord shader pulse ---
    if (spinalCordRef.current) {
      const mat = spinalCordRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.u_time.value = t;
      // Average motor neuron activity
      let motorAct = 0;
      let cnt = 0;
      for (const mi of motorIndices) {
        if (mi < rates.length) { motorAct += rates[mi]; cnt++; }
      }
      motorAct = cnt > 0 ? Math.min(motorAct / cnt / 60, 1) : 0.2;
      mat.uniforms.u_activity.value += (motorAct - mat.uniforms.u_activity.value) * 0.1;
    }

    // --- Drive organism shader uniforms on body material ---
    {
      let avgActivity = 0;
      const nRates = rates.length;
      for (let i = 0; i < nRates; i++) avgActivity += rates[i];
      avgActivity = nRates > 0 ? Math.min(avgActivity / nRates / 80, 1) : 0;
      if (bodyMaterial.userData.uniforms) {
        bodyMaterial.userData.uniforms.u_avgActivity.value = avgActivity;
        bodyMaterial.userData.uniforms.u_time.value = t;
      }
    }

    // --- Neural activity: update colors/sizes (only when frame changes) ---
    const frameId = frame?.t_ms ?? -1;
    const frameChanged = frameId !== lastFrameId.current;
    if (frameChanged) lastFrameId.current = frameId;

    if (frameChanged && neuronPointsRef.current) {
      const total = neuronSizes.length;
      for (let i = 0; i < total; i++) {
        const rate = i < rates.length ? rates[i] : 0;
        const activity = Math.min(rate / 60, 1);
        const isSpiking = spikes.has(i);

        if (isSpiking) {
          animColors[i * 3] = SPIKE_COLOR.r;
          animColors[i * 3 + 1] = SPIKE_COLOR.g;
          animColors[i * 3 + 2] = SPIKE_COLOR.b;
          animSizes[i] = neuronSizes[i] * 4;
        } else if (activity > 0.05) {
          const blend = activity;
          animColors[i * 3] = neuronColors[i * 3] + (1 - neuronColors[i * 3]) * blend * 0.6;
          animColors[i * 3 + 1] = neuronColors[i * 3 + 1] + (1 - neuronColors[i * 3 + 1]) * blend * 0.6;
          animColors[i * 3 + 2] = neuronColors[i * 3 + 2] + (1 - neuronColors[i * 3 + 2]) * blend * 0.6;
          animSizes[i] = neuronSizes[i] * (1 + activity * 2);
        } else {
          // Decay toward base
          animColors[i * 3] += (neuronColors[i * 3] - animColors[i * 3]) * 0.15;
          animColors[i * 3 + 1] += (neuronColors[i * 3 + 1] - animColors[i * 3 + 1]) * 0.15;
          animColors[i * 3 + 2] += (neuronColors[i * 3 + 2] - animColors[i * 3 + 2]) * 0.15;
          animSizes[i] += (neuronSizes[i] - animSizes[i]) * 0.15;
        }
      }

      // Circuit modification visual state overrides
      for (let i = 0; i < total; i++) {
        const neuronId = `neuron_${i}`;
        if (lesionedNeurons.has(neuronId)) {
          animColors[i * 3] = 0.1;
          animColors[i * 3 + 1] = 0.1;
          animColors[i * 3 + 2] = 0.1;
          animSizes[i] = neuronSizes[i] * 0.6;
        } else if (stimulatedNeurons.has(neuronId)) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 8);
          animColors[i * 3] = 0.1 + pulse * 0.3;
          animColors[i * 3 + 1] = 0.5 + pulse * 0.3;
          animColors[i * 3 + 2] = 0.8 + pulse * 0.2;
          animSizes[i] = neuronSizes[i] * (2.0 + pulse * 2.0);
        } else if (recordedNeurons.has(neuronId)) {
          // Keep computed colors but add red tint for recording indicator
          animColors[i * 3] = Math.min(1, animColors[i * 3] + 0.15);
          animSizes[i] = Math.max(animSizes[i], neuronSizes[i] * 1.5);
        }
      }

      const cAttr = neuronPointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
      (cAttr.array as Float32Array).set(animColors);
      cAttr.needsUpdate = true;

      const sAttr = neuronPointsRef.current.geometry.getAttribute('size') as THREE.BufferAttribute;
      (sAttr.array as Float32Array).set(animSizes);
      sAttr.needsUpdate = true;
    }

    // --- Mauthner cells glow when firing ---
    // Mauthner cells are roughly in the hindbrain region
    const nFore = Math.max(2, Math.round(nNeurons * FOREBRAIN_FRAC));
    const nMid = Math.max(2, Math.round(nNeurons * MIDBRAIN_FRAC));
    const nHind = Math.max(2, Math.round(nNeurons * HINDBRAIN_FRAC));
    // Pick two prominent hindbrain neurons as Mauthner proxies
    const mauthner0 = nFore + nMid;
    const mauthner1 = nFore + nMid + 1;
    const m0Firing = spikes.has(mauthner0) || (mauthner0 < rates.length && rates[mauthner0] > 30);
    const m1Firing = spikes.has(mauthner1) || (mauthner1 < rates.length && rates[mauthner1] > 30);
    const mauthnerActive = m0Firing || m1Firing;

    if (mauthnerLeftRef.current) {
      const s = m0Firing ? 2.0 + Math.sin(t * 20) * 0.5 : 1.0;
      mauthnerLeftRef.current.scale.setScalar(s);
      (mauthnerLeftRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = m0Firing ? 3.0 : 0.5;
    }
    if (mauthnerRightRef.current) {
      const s = m1Firing ? 2.0 + Math.sin(t * 20) * 0.5 : 1.0;
      mauthnerRightRef.current.scale.setScalar(s);
      (mauthnerRightRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = m1Firing ? 3.0 : 0.5;
    }

    // Mauthner connection lines: drive shader uniforms
    if (mauthnerLinesRef.current) {
      const mat = mauthnerLinesRef.current.material as THREE.ShaderMaterial;
      if (mat.uniforms) {
        mat.uniforms.u_time.value = t;
        mat.uniforms.u_activity.value = mauthnerActive ? 0.9 : 0.05;
      }
    }
  });

  // ---- Eye positions --------------------------------------------------------
  const eyeT = 0.05;
  const eyeX = eyeT * BODY_LENGTH;
  const eyeR = fishRadius(eyeT);

  // ---- Render ---------------------------------------------------------------
  return (
    <group position={[0.2, 0.03, 0]}>
      {/* ===== BODY (semi-transparent tube) ===== */}
      <mesh
        ref={bodyMeshRef}
        geometry={bodyGeometry}
        material={bodyMaterial}
        renderOrder={10}
      />

      {/* ===== CAUDAL (TAIL) FIN ===== */}
      <mesh ref={caudalUpperRef} geometry={caudalGeometry} material={finMaterial} renderOrder={9} />
      <mesh ref={caudalLowerRef} geometry={caudalGeometry} material={finMaterial} renderOrder={9} />

      {/* ===== DORSAL FIN ===== */}
      <mesh ref={dorsalRef} geometry={dorsalGeometry} material={finMaterial} renderOrder={9} />

      {/* ===== PECTORAL FINS ===== */}
      <mesh ref={pectoralLeftRef} geometry={pectoralGeometry} material={finMaterial} renderOrder={9} />
      <mesh ref={pectoralRightRef} geometry={pectoralGeometry} material={finMaterial} renderOrder={9} />

      {/* ===== EYES ===== */}
      <mesh geometry={eyeGeometry} material={eyeMaterial} position={[eyeX, eyeR * 0.5, eyeR * 0.75]} />
      <mesh geometry={eyeGeometry} material={eyeMaterial} position={[eyeX, eyeR * 0.5, -eyeR * 0.75]} />

      {/* ===== NEURAL INTERIOR ===== */}

      {/* Brain region neurons + motor neurons as point cloud */}
      <points ref={neuronPointsRef} renderOrder={5}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={neuronPositions}
            count={neuronSizes.length}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={animColors}
            count={neuronSizes.length}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-size"
            array={animSizes}
            count={neuronSizes.length}
            itemSize={1}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.004}
          sizeAttenuation
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Neuron glow layer (larger, dimmer points for bloom effect) */}
      <points renderOrder={4}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={neuronPositions}
            count={neuronSizes.length}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={animColors}
            count={neuronSizes.length}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.012}
          sizeAttenuation
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Neuron click targets (invisible spheres for selection) */}
      {Array.from({ length: neuronSizes.length }, (_, i) => (
        <mesh
          key={`click-${i}`}
          geometry={clickTargetGeo}
          material={clickTargetMat}
          position={[
            neuronPositions[i * 3],
            neuronPositions[i * 3 + 1],
            neuronPositions[i * 3 + 2],
          ]}
          onPointerDown={(e) => handleNeuronClick(i, e as unknown as React.PointerEvent)}
        />
      ))}

      {/* Spinal cord (glowing tube along ventral axis) */}
      <mesh
        ref={spinalCordRef}
        geometry={spinalGeometry}
        material={spinalMaterial}
        renderOrder={6}
      />

      {/* Mauthner cells (giant neurons in hindbrain) */}
      <mesh
        ref={mauthnerLeftRef}
        geometry={mauthnerGeometry}
        material={mauthnerMaterial}
        position={[mauthnerWorldPos[0].x, mauthnerWorldPos[0].y, mauthnerWorldPos[0].z]}
        renderOrder={7}
      />
      <mesh
        ref={mauthnerRightRef}
        geometry={mauthnerGeometry}
        material={mauthnerMaterial}
        position={[mauthnerWorldPos[1].x, mauthnerWorldPos[1].y, mauthnerWorldPos[1].z]}
        renderOrder={7}
      />

      {/* Mauthner -> motor neuron connection lines */}
      <lineSegments ref={mauthnerLinesRef} renderOrder={3}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={mauthnerLinePositions}
            count={mauthnerLinePositions.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <primitive object={mauthnerLineMaterial} attach="material" />
      </lineSegments>
    </group>
  );
}
