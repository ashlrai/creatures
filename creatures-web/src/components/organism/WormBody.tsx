import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

const MAX_SEGMENTS = 88;
const TUBE_RADIUS = 0.012;
const NODE_RADIUS = 0.006;

// Color gradient along body: head (green/sensory) -> middle (deep cyan) -> tail (magenta/motor)
const HEAD_COLOR = new THREE.Color(0.05, 0.3, 0.2);
const MID_COLOR = new THREE.Color(0.03, 0.18, 0.3);
const TAIL_COLOR = new THREE.Color(0.25, 0.05, 0.2);

const HEAD_EMISSIVE = new THREE.Color(0.02, 0.12, 0.06);
const MID_EMISSIVE = new THREE.Color(0.01, 0.06, 0.12);
const TAIL_EMISSIVE = new THREE.Color(0.1, 0.02, 0.08);

// Activity colors
const ACTIVE_CYAN = new THREE.Color(0.1, 0.7, 0.95);
const HOT_WHITE = new THREE.Color(0.5, 0.95, 1.0);
const ACTIVE_EMISSIVE = new THREE.Color(0.08, 0.4, 0.65);
const HOT_EMISSIVE = new THREE.Color(0.3, 0.7, 0.9);

/** Lerp between three colors based on t in [0,1]: head -> mid -> tail */
function bodyGradient(t: number, target: THREE.Color, head: THREE.Color, mid: THREE.Color, tail: THREE.Color) {
  if (t < 0.5) {
    target.copy(head).lerp(mid, t * 2);
  } else {
    target.copy(mid).lerp(tail, (t - 0.5) * 2);
  }
  return target;
}

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const lastPoke = useSimulationStore((s) => s.lastPoke);

  const tubeRef = useRef<THREE.Mesh>(null);
  const nodeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const frameCount = useRef(0);

  // Smooth positions for each segment
  const smoothPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: MAX_SEGMENTS }, () => new THREE.Vector3())
  );

  // Shared node sphere geometry
  const nodeGeometry = useMemo(
    () => new THREE.SphereGeometry(NODE_RADIUS, 12, 8),
    []
  );

  // Initial tube geometry (will be replaced each update)
  const tubeGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 12 }, (_, i) => new THREE.Vector3(i * 0.09, TUBE_RADIUS, 0))
    );
    return new THREE.TubeGeometry(curve, 128, TUBE_RADIUS, 12, false);
  }, []);

  // Primary tube material — translucent physical material
  const tubeMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.04, 0.2, 0.3),
      emissive: new THREE.Color(0.01, 0.06, 0.1),
      emissiveIntensity: 1.5,
      roughness: 0.25,
      metalness: 0.1,
      transmission: 0.3,
      thickness: 0.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
      iridescence: 0.4,
      iridescenceIOR: 1.3,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    }),
    []
  );

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
        metalness: 0.2,
        transmission: 0.15,
        thickness: 0.3,
        clearcoat: 0.5,
        iridescence: 0.3,
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

    // Generate default positions if no body data yet (so worm is visible immediately)
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

      // Add undulation wave even when moving — sinusoidal body wall contractions
      const bodyFrac = i / Math.max(n - 1, 1);
      const undulationX = Math.sin(t * 2.5 + bodyFrac * Math.PI * 3) * 0.003;
      const undulationZ = Math.cos(t * 1.8 + bodyFrac * Math.PI * 2.5) * 0.002;

      const targetPos = new THREE.Vector3(
        x + undulationX,
        z,
        -y + undulationZ
      );

      // Smooth position to prevent fly-apart
      smoothPositions.current[i].lerp(targetPos, 0.3);
      spinePoints.push(smoothPositions.current[i].clone());

      // Update neural node spheres
      const node = nodeRefs.current[i];
      if (node) {
        node.position.copy(smoothPositions.current[i]);
        node.visible = true;

        // Breathing scale for organic feel
        const breathSlow = Math.sin(t * 1.5 + i * 0.35) * 0.15;
        const breathFast = Math.sin(t * 3.2 + i * 0.7) * 0.06;
        const baseScale = 1.0 + breathSlow + breathFast;

        // Taper at head and tail
        const taper = 1.0 - 0.2 * Math.pow(Math.abs(bodyFrac - 0.4) / 0.6, 2);
        const s = baseScale * taper;
        node.scale.set(s, s, s);
      }

      // Compute activity from firing rates + muscle activations
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

      // Get rest color from body gradient
      bodyGradient(bodyFrac, _restColor, HEAD_COLOR, MID_COLOR, TAIL_COLOR);
      bodyGradient(bodyFrac, _restEmissive, HEAD_EMISSIVE, MID_EMISSIVE, TAIL_EMISSIVE);

      if (isPoked) {
        mat.color.setRGB(0.3 + pokeFade * 0.5, 0.6 + pokeFade * 0.3, 0.7 + pokeFade * 0.3);
        mat.emissive.setRGB(0.15 * pokeFade, 0.5 * pokeFade, 0.7 * pokeFade);
        mat.emissiveIntensity = 2.0 + pokeFade * 3.0;
      } else if (totalActivity > 0.1) {
        // Active: blend from rest gradient toward cyan/white
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
    }

    // Hide unused nodes
    for (let i = n; i < MAX_SEGMENTS; i++) {
      if (nodeRefs.current[i]) nodeRefs.current[i]!.visible = false;
    }

    // Update the main tube geometry (every 8th frame to reduce GC pressure)
    if (tubeRef.current && spinePoints.length >= 3 && frameCount.current % 8 === 0) {
      const curve = new THREE.CatmullRomCurve3(spinePoints);
      const segments = Math.max(spinePoints.length * 4, 32);
      const newGeo = new THREE.TubeGeometry(curve, segments, TUBE_RADIUS, 12, false);
      tubeRef.current.geometry.dispose();
      tubeRef.current.geometry = newGeo;

      // Average activity to tint tube emissive
      let avgActivity = 0;
      for (let i = 0; i < n; i++) {
        const segStart = i * neuronsPerSeg;
        const segEnd = Math.min(segStart + neuronsPerSeg, nNeurons);
        for (let j = segStart; j < segEnd; j++) {
          avgActivity += rates[j] || 0;
        }
      }
      avgActivity = Math.min((avgActivity / Math.max(nNeurons, 1)) / 100, 1);

      // Pulse the tube color based on activity
      tubeMaterial.emissive.setRGB(
        0.01 + avgActivity * 0.08,
        0.04 + avgActivity * 0.2,
        0.08 + avgActivity * 0.35,
      );
      tubeMaterial.emissiveIntensity = 1.5 + avgActivity * 3.0;
      tubeMaterial.transmission = 0.3 - avgActivity * 0.15; // less transparent when active
    }
  });

  const segCount = frame?.body_positions?.length
    ? Math.min(frame.body_positions.length, MAX_SEGMENTS)
    : 12;

  const handleClick = (index: number) => {
    const store = useSimulationStore.getState();
    if (store.experiment) {
      store.setPoke(`seg_${index}`);
    }
  };

  return (
    <group>
      {/* Primary smooth tube body */}
      <mesh ref={tubeRef} geometry={tubeGeometry} material={tubeMaterial} />

      {/* Neural node spheres at each segment */}
      {Array.from({ length: segCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { nodeRefs.current[i] = el; }}
          geometry={nodeGeometry}
          material={nodeMaterials[i]}
          position={[i * 0.09, TUBE_RADIUS + 0.001, 0]}
          onPointerDown={() => handleClick(i)}
        />
      ))}
    </group>
  );
}
