import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { createOrganismMaterial } from '../../shaders/OrganismMaterial';
import { createNeuralInteriorMaterial } from '../../shaders/NeuralInteriorMaterial';

const MAX_SEGMENTS = 88;
const NODE_RADIUS = 0.005;
const TUBE_RADIAL_SEGMENTS = 16;
const TUBE_LENGTH_MULTIPLIER = 4;

// Variable radius along body: pharyngeal bulge at t~0.1, taper at head/tail
function bodyRadius(t: number): number {
  const base = 0.012;
  // Pharyngeal bulge near head
  const pharynx = Math.exp(-((t - 0.1) ** 2) / 0.003) * 0.004;
  // Taper at head and tail
  const headTaper = Math.min(1, t / 0.06);
  const tailTaper = Math.min(1, (1 - t) / 0.1);
  return base * headTaper * tailTaper + pharynx;
}

// Color gradient along body: head (green/sensory) -> middle (deep cyan) -> tail (magenta/motor)
const HEAD_COLOR = new THREE.Color(0.05, 0.3, 0.2);
const MID_COLOR = new THREE.Color(0.03, 0.18, 0.3);
const TAIL_COLOR = new THREE.Color(0.25, 0.05, 0.2);
const HEAD_EMISSIVE = new THREE.Color(0.02, 0.12, 0.06);
const MID_EMISSIVE = new THREE.Color(0.01, 0.06, 0.12);
const TAIL_EMISSIVE = new THREE.Color(0.1, 0.02, 0.08);

const ACTIVE_CYAN = new THREE.Color(0.1, 0.7, 0.95);
const HOT_WHITE = new THREE.Color(0.5, 0.95, 1.0);
const ACTIVE_EMISSIVE = new THREE.Color(0.08, 0.4, 0.65);
const HOT_EMISSIVE = new THREE.Color(0.3, 0.7, 0.9);

// Nerve ring colors (bright at head region)
const NERVE_RING_COLOR = new THREE.Color(0.0, 0.7, 1.0);

function bodyGradient(t: number, target: THREE.Color, head: THREE.Color, mid: THREE.Color, tail: THREE.Color) {
  if (t < 0.5) {
    target.copy(head).lerp(mid, t * 2);
  } else {
    target.copy(mid).lerp(tail, (t - 0.5) * 2);
  }
  return target;
}

// Build connectome interior lines — nerve ring + ventral cord
function buildInteriorLines(spinePoints: THREE.Vector3[], n: number): Float32Array {
  // Generate simplified connectome lines running through the body
  const lines: number[] = [];

  // Nerve ring: dense connections in head region (indices 0-8)
  const headEnd = Math.min(8, n - 1);
  for (let i = 0; i < headEnd; i++) {
    for (let j = i + 2; j <= headEnd; j += 2) {
      if (spinePoints[i] && spinePoints[j]) {
        const pi = spinePoints[i];
        const pj = spinePoints[j];
        lines.push(pi.x, pi.y + 0.003, pi.z);
        lines.push(pj.x, pj.y + 0.003, pj.z);
      }
    }
  }

  // Ventral cord: longitudinal connections every 3rd segment
  for (let i = 0; i < n - 3; i += 3) {
    const j = i + 3;
    if (spinePoints[i] && spinePoints[j]) {
      const pi = spinePoints[i];
      const pj = spinePoints[j];
      // Offset slightly ventral (below center)
      lines.push(pi.x, pi.y - 0.004, pi.z);
      lines.push(pj.x, pj.y - 0.004, pj.z);
    }
  }

  // Lateral connections (commissures)
  for (let i = 2; i < n - 2; i += 5) {
    if (spinePoints[i]) {
      const p = spinePoints[i];
      lines.push(p.x, p.y - 0.004, p.z - 0.005);
      lines.push(p.x, p.y - 0.004, p.z + 0.005);
    }
  }

  return new Float32Array(lines);
}

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const lastPoke = useSimulationStore((s) => s.lastPoke);
  const lesionedNeurons = useCircuitModificationStore((s) => s.lesionedNeurons);
  const stimulatedNeurons = useCircuitModificationStore((s) => s.stimulatedNeurons);
  const recordedNeurons = useCircuitModificationStore((s) => s.recordedNeurons);

  const tubeRef = useRef<THREE.Mesh>(null);
  const nodeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const interiorLinesRef = useRef<THREE.LineSegments>(null);
  const nerveRingRef = useRef<THREE.Points>(null);
  const frameCount = useRef(0);

  // Smooth positions for each segment
  const smoothPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: MAX_SEGMENTS }, () => new THREE.Vector3())
  );

  // Shared node sphere geometry
  const nodeGeometry = useMemo(
    () => new THREE.SphereGeometry(NODE_RADIUS, 10, 6),
    []
  );

  // Initial tube geometry
  const tubeGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 12 }, (_, i) => new THREE.Vector3(i * 0.09, 0.012, 0))
    );
    return new THREE.TubeGeometry(curve, 128, 0.012, TUBE_RADIAL_SEGMENTS, false);
  }, []);

  // Primary tube material — semi-transparent see-through body (organism shader)
  const tubeMaterial = useMemo(
    () => createOrganismMaterial({
      baseColor: new THREE.Color(0.04, 0.18, 0.28),
      transmission: 0.45,
      thickness: 0.8,
      clearcoat: 0.7,
      ior: 1.4,
      iridescence: 0.35,
    }),
    []
  );

  // Interior line material — neural circuit shader for connectome
  const interiorLineMaterial = useMemo(
    () => createNeuralInteriorMaterial(),
    []
  );

  // Nerve ring point material — bright glow at head
  const nerveRingMaterial = useMemo(
    () => new THREE.PointsMaterial({
      color: NERVE_RING_COLOR,
      size: 0.008,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
    []
  );

  // Pre-allocate nerve ring geometry (ring of points at head)
  const nerveRingGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(12 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Interior lines geometry (pre-allocated, updated in-place)
  const interiorLinesGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(600); // up to 100 line segments
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Per-node materials (for neural activity glow)
  const nodeMaterials = useMemo(
    () => Array.from({ length: MAX_SEGMENTS }, (_, i) => {
      const t = i / Math.max(MAX_SEGMENTS - 1, 1);
      const col = new THREE.Color();
      bodyGradient(t, col, HEAD_COLOR, MID_COLOR, TAIL_COLOR);
      const emis = new THREE.Color();
      bodyGradient(t, emis, HEAD_EMISSIVE, MID_EMISSIVE, TAIL_EMISSIVE);

      return new THREE.MeshPhysicalMaterial({
        color: col,
        emissive: emis,
        emissiveIntensity: 1.0,
        roughness: 0.3,
        metalness: 0.15,
        transmission: 0.12,
        thickness: 0.3,
        clearcoat: 0.4,
        iridescence: 0.25,
        transparent: true,
        opacity: 0.9,
      });
    }),
    []
  );

  // Temp colors to avoid per-frame allocation
  const _tmpColor = useMemo(() => new THREE.Color(), []);
  const _tmpEmissive = useMemo(() => new THREE.Color(), []);
  const _restColor = useMemo(() => new THREE.Color(), []);
  const _restEmissive = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    frameCount.current++;
    const t = clock.getElapsedTime();

    // Generate default positions if no body data yet
    let positions = frame?.body_positions;
    if (!positions?.length) {
      positions = Array.from({ length: 12 }, (_, i) => [
        i * 0.07 + 0.05,
        Math.sin(t * 2 + i * 0.5) * 0.003,
        0.015 + Math.sin(t * 1.5 + i * 0.3) * 0.001,
      ]);
    }
    const n = Math.min(positions.length, MAX_SEGMENTS);
    const rates = frame?.firing_rates ?? [];
    const spikes = new Set(frame?.spikes ?? []);
    const nNeurons = rates.length;
    const neuronsPerSeg = nNeurons > 0 ? Math.ceil(nNeurons / n) : 1;

    const pokeIdx = lastPoke ? parseInt(lastPoke.segment.replace('seg_', ''), 10) : -1;
    const pokeFade = lastPoke ? Math.max(0, 1 - (Date.now() - lastPoke.time) / 600) : 0;

    const spinePoints: THREE.Vector3[] = [];

    for (let i = 0; i < n; i++) {
      if (!positions[i]) continue;

      const [x, y, z] = positions[i];
      const bodyFrac = i / Math.max(n - 1, 1);

      // Traveling wave undulation: propagates head -> tail
      const waveSpeed = 3.0;
      const waveNumber = 4.0;
      const amplitude = 0.004 * (0.5 + bodyFrac * 0.5); // increases toward tail
      const lateralWave = amplitude * Math.sin(waveSpeed * t - waveNumber * bodyFrac * Math.PI);
      // Dorsal-ventral alternation
      const dorsalWave = amplitude * 0.3 * Math.cos(waveSpeed * t - waveNumber * bodyFrac * Math.PI);

      const targetPos = new THREE.Vector3(
        x + lateralWave,
        z + dorsalWave,
        -y
      );

      // Smooth position
      smoothPositions.current[i].lerp(targetPos, 0.3);
      spinePoints.push(smoothPositions.current[i].clone());

      // Update neural node spheres
      const node = nodeRefs.current[i];
      if (node) {
        node.position.copy(smoothPositions.current[i]);
        node.visible = true;

        // Breathing scale for organic feel
        const breathSlow = Math.sin(t * 1.5 + i * 0.35) * 0.12;
        const breathFast = Math.sin(t * 3.2 + i * 0.7) * 0.05;
        const baseScale = 1.0 + breathSlow + breathFast;

        // Variable size: pharyngeal bulge, taper at ends
        const sizeProfile = bodyRadius(bodyFrac) / 0.012;
        const s = baseScale * sizeProfile;
        node.scale.set(s, s, s);
      }

      // Compute activity from firing rates
      const segStart = i * neuronsPerSeg;
      const segEnd = Math.min(segStart + neuronsPerSeg, nNeurons);
      let maxRate = 0;
      let hasSpike = false;
      for (let j = segStart; j < segEnd; j++) {
        maxRate = Math.max(maxRate, rates[j]);
        if (spikes.has(j)) hasSpike = true;
      }
      if (frame?.muscle_activations) {
        for (const [key, val] of Object.entries(frame.muscle_activations)) {
          if (key.includes(`_${i}`) || key.includes(`_${Math.max(0, i - 1)}`)) {
            maxRate = Math.max(maxRate, Math.abs(val) * 200);
          }
        }
      }

      const activity = Math.min(maxRate / 120, 1);
      const spikeBoost = hasSpike ? 0.4 : 0;
      const totalActivity = Math.min(activity + spikeBoost, 1);
      const mat = nodeMaterials[i];
      const isPoked = i === pokeIdx && pokeFade > 0;

      bodyGradient(bodyFrac, _restColor, HEAD_COLOR, MID_COLOR, TAIL_COLOR);
      bodyGradient(bodyFrac, _restEmissive, HEAD_EMISSIVE, MID_EMISSIVE, TAIL_EMISSIVE);

      if (isPoked) {
        mat.color.setRGB(0.3 + pokeFade * 0.5, 0.6 + pokeFade * 0.3, 0.7 + pokeFade * 0.3);
        mat.emissive.setRGB(0.15 * pokeFade, 0.5 * pokeFade, 0.7 * pokeFade);
        mat.emissiveIntensity = 2.0 + pokeFade * 3.0;
      } else if (totalActivity > 0.1) {
        if (totalActivity < 0.5) {
          _tmpColor.copy(_restColor).lerp(ACTIVE_CYAN, totalActivity * 2);
          _tmpEmissive.copy(_restEmissive).lerp(ACTIVE_EMISSIVE, totalActivity * 2);
        } else {
          _tmpColor.copy(ACTIVE_CYAN).lerp(HOT_WHITE, (totalActivity - 0.5) * 2);
          _tmpEmissive.copy(ACTIVE_EMISSIVE).lerp(HOT_EMISSIVE, (totalActivity - 0.5) * 2);
        }
        mat.color.copy(_tmpColor);
        mat.emissive.copy(_tmpEmissive);
        mat.emissiveIntensity = 1.5 + totalActivity * 4.0;
      } else {
        mat.color.copy(_restColor);
        mat.emissive.copy(_restEmissive);
        mat.emissiveIntensity = 0.8;
      }

      // Check circuit modification states (overrides normal colors)
      const neuronId = `seg_${i}`;
      if (lesionedNeurons.has(neuronId)) {
        mat.color.setRGB(0.1, 0.1, 0.1);
        mat.emissive.setRGB(0.02, 0.0, 0.0);
        mat.emissiveIntensity = 0.3;
        mat.opacity = 0.4;
      } else if (stimulatedNeurons.has(neuronId)) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 8);
        mat.color.setRGB(0.1 + pulse * 0.3, 0.5 + pulse * 0.3, 0.8 + pulse * 0.2);
        mat.emissive.setRGB(0.05 + pulse * 0.15, 0.2 + pulse * 0.3, 0.4 + pulse * 0.3);
        mat.emissiveIntensity = 2.0 + pulse * 3.0;
      } else if (recordedNeurons.has(neuronId)) {
        // Keep normal colors but add slight red tint for recording indicator
        mat.emissive.r += 0.1;
        mat.emissiveIntensity += 1.0;
      }
    }

    // Hide unused nodes
    for (let i = n; i < MAX_SEGMENTS; i++) {
      if (nodeRefs.current[i]) nodeRefs.current[i]!.visible = false;
    }

    // Update interior neural circuit lines
    if (interiorLinesRef.current && spinePoints.length >= 3) {
      const linePositions = buildInteriorLines(spinePoints, n);
      const geo = interiorLinesRef.current.geometry;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      // Copy as much as fits
      const copyLen = Math.min(linePositions.length, arr.length);
      arr.set(linePositions.subarray(0, copyLen));
      // Zero out the rest
      for (let i = copyLen; i < arr.length; i++) arr[i] = 0;

      posAttr.needsUpdate = true;
      geo.setDrawRange(0, Math.floor(copyLen / 3));

      // Drive neural interior shader uniforms with activity
      let avgActivity = 0;
      for (let i = 0; i < nNeurons; i++) avgActivity += rates[i] || 0;
      avgActivity = Math.min((avgActivity / Math.max(nNeurons, 1)) / 80, 1);

      if (interiorLineMaterial.uniforms) {
        interiorLineMaterial.uniforms.u_time.value = t;
        interiorLineMaterial.uniforms.u_activity.value = avgActivity;
      }
    }

    // Update nerve ring glow points at head
    if (nerveRingRef.current && spinePoints.length >= 3) {
      const ringCenter = spinePoints[Math.min(3, spinePoints.length - 1)];
      if (ringCenter) {
        const posAttr = nerveRingRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const r = 0.008 + Math.sin(t * 4 + i) * 0.002;
          arr[i * 3] = ringCenter.x + Math.cos(angle) * r;
          arr[i * 3 + 1] = ringCenter.y + Math.sin(angle) * r;
          arr[i * 3 + 2] = ringCenter.z;
        }
        posAttr.needsUpdate = true;

        // Nerve ring brightness from head neuron activity
        let headActivity = 0;
        for (let j = 0; j < Math.min(30, nNeurons); j++) {
          headActivity = Math.max(headActivity, rates[j] || 0);
        }
        headActivity = Math.min(headActivity / 100, 1);
        nerveRingMaterial.opacity = 0.3 + headActivity * 0.7;
        nerveRingMaterial.size = 0.006 + headActivity * 0.008;
      }
    }

    // Update tube geometry with variable radius (every 6th frame)
    if (tubeRef.current && spinePoints.length >= 3 && frameCount.current % 6 === 0) {
      const curve = new THREE.CatmullRomCurve3(spinePoints);
      const segments = Math.max(spinePoints.length * TUBE_LENGTH_MULTIPLIER, 32);

      // Build variable-radius tube by creating a TubeGeometry then scaling vertices
      const newGeo = new THREE.TubeGeometry(curve, segments, 0.012, TUBE_RADIAL_SEGMENTS, false);
      const posArr = newGeo.attributes.position.array as Float32Array;
      const curvePoints = curve.getPoints(segments);

      // Scale each ring of vertices by the bodyRadius function
      for (let seg = 0; seg <= segments; seg++) {
        const tFrac = seg / segments;
        const radiusScale = bodyRadius(tFrac) / 0.012;
        const centerPt = curvePoints[seg];
        if (!centerPt) continue;

        for (let rad = 0; rad <= TUBE_RADIAL_SEGMENTS; rad++) {
          const idx = (seg * (TUBE_RADIAL_SEGMENTS + 1) + rad) * 3;
          // Scale outward from the curve center point
          posArr[idx] = centerPt.x + (posArr[idx] - centerPt.x) * radiusScale;
          posArr[idx + 1] = centerPt.y + (posArr[idx + 1] - centerPt.y) * radiusScale;
          posArr[idx + 2] = centerPt.z + (posArr[idx + 2] - centerPt.z) * radiusScale;
        }
      }
      newGeo.computeVertexNormals();

      tubeRef.current.geometry.dispose();
      tubeRef.current.geometry = newGeo;

      // Average activity drives tube glow
      let avgActivity = 0;
      for (let i = 0; i < nNeurons; i++) avgActivity += rates[i] || 0;
      avgActivity = Math.min((avgActivity / Math.max(nNeurons, 1)) / 100, 1);

      tubeMaterial.emissive.setRGB(
        0.01 + avgActivity * 0.06,
        0.03 + avgActivity * 0.15,
        0.06 + avgActivity * 0.28,
      );
      tubeMaterial.emissiveIntensity = 1.5 + avgActivity * 2.5;
      tubeMaterial.transmission = 0.45 - avgActivity * 0.2;

      // Drive organism shader uniforms
      if (tubeMaterial.userData.uniforms) {
        tubeMaterial.userData.uniforms.u_avgActivity.value = avgActivity;
        tubeMaterial.userData.uniforms.u_time.value = t;
      }
    }
  });

  const segCount = frame?.body_positions?.length
    ? Math.min(frame.body_positions.length, MAX_SEGMENTS)
    : 12;

  const handleClick = (index: number, e?: React.PointerEvent) => {
    // Circuit modification selection
    if (e) {
      e.stopPropagation();
      useCircuitModificationStore.getState().toggleNeuronSelection(`seg_${index}`, e.shiftKey);
    }
    // Existing poke behavior
    const store = useSimulationStore.getState();
    if (store.experiment) {
      store.setPoke(`seg_${index}`);
    }
  };

  return (
    <group>
      {/* Semi-transparent body shell */}
      <mesh ref={tubeRef} geometry={tubeGeometry} material={tubeMaterial} />

      {/* Neural circuit interior lines (connectome running through body) */}
      <lineSegments ref={interiorLinesRef} geometry={interiorLinesGeometry} material={interiorLineMaterial} />

      {/* Nerve ring glow at head */}
      <points ref={nerveRingRef} geometry={nerveRingGeometry} material={nerveRingMaterial} />

      {/* Neural node spheres at each segment */}
      {Array.from({ length: segCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { nodeRefs.current[i] = el; }}
          geometry={nodeGeometry}
          material={nodeMaterials[i]}
          position={[i * 0.09, 0.012 + 0.001, 0]}
          onPointerDown={(e) => handleClick(i, e as unknown as React.PointerEvent)}
        />
      ))}
    </group>
  );
}
