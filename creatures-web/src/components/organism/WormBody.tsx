import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

const MAX_SEGMENTS = 88;
const SEG_RADIUS = 0.013;
const SEG_HALF_LEN = 0.035;

// Rich teal palette — subtle emissive at rest for visibility, bright when active
const REST_COLOR = new THREE.Color(0.08, 0.30, 0.42);
const ACTIVE_COLOR = new THREE.Color(0.12, 0.65, 0.90);
const HOT_COLOR = new THREE.Color(0.35, 0.90, 1.0);
const REST_EMISSIVE = new THREE.Color(0.015, 0.06, 0.09);
const ACTIVE_EMISSIVE = new THREE.Color(0.06, 0.35, 0.55);
const HOT_EMISSIVE = new THREE.Color(0.18, 0.55, 0.75);

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const lastPoke = useSimulationStore((s) => s.lastPoke);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const spineRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(SEG_RADIUS, SEG_HALF_LEN * 2, 8, 16),
    []
  );

  // Spine tube geometry — will be updated each frame
  const spineGeometry = useMemo(() => {
    // Start with a straight line; updated dynamically
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 12 }, (_, i) => new THREE.Vector3(i * SEG_HALF_LEN * 2.3, SEG_RADIUS, 0))
    );
    return new THREE.TubeGeometry(curve, 64, SEG_RADIUS * 0.5, 8, false);
  }, []);

  const spineMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.06, 0.22, 0.32),
      emissive: new THREE.Color(0.008, 0.03, 0.05),
      emissiveIntensity: 1,
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      opacity: 0.45,
    }),
    []
  );

  const materials = useMemo(
    () => Array.from({ length: MAX_SEGMENTS }, () =>
      new THREE.MeshStandardMaterial({
        color: REST_COLOR.clone(),
        emissive: REST_EMISSIVE.clone(),
        emissiveIntensity: 1,
        roughness: 0.45,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      })
    ),
    []
  );

  // Track smoothed positions for spine
  const smoothPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: MAX_SEGMENTS }, () => new THREE.Vector3())
  );
  const frameCount = useRef(0);

  useFrame(({ clock }) => {
    frameCount.current++;
    if (!frame?.body_positions?.length) return;

    const t = clock.getElapsedTime();
    const positions = frame.body_positions;
    const n = Math.min(positions.length, MAX_SEGMENTS);
    const rates = frame.firing_rates ?? [];
    const spikes = new Set(frame.spikes ?? []);
    const nNeurons = rates.length;
    const neuronsPerSeg = nNeurons > 0 ? Math.ceil(nNeurons / n) : 1;

    const pokeIdx = lastPoke ? parseInt(lastPoke.segment.replace('seg_', ''), 10) : -1;
    const pokeFade = lastPoke ? Math.max(0, 1 - (Date.now() - lastPoke.time) / 600) : 0;

    const spinePoints: THREE.Vector3[] = [];

    for (let i = 0; i < n; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh || !positions[i]) continue;

      const [x, y, z] = positions[i];
      const targetPos = new THREE.Vector3(x, z, -y);

      // Smooth position to prevent tail fly-apart
      smoothPositions.current[i].lerp(targetPos, 0.3);
      mesh.position.copy(smoothPositions.current[i]);
      mesh.visible = true;

      spinePoints.push(smoothPositions.current[i].clone());

      // Breathing: multi-frequency for organic feel
      const breathSlow = Math.sin(t * 1.5 + i * 0.35) * 0.012;
      const breathFast = Math.sin(t * 3.2 + i * 0.7) * 0.005;
      const breathScale = 1.0 + breathSlow + breathFast;
      // Taper at head and tail
      const bodyFrac = i / Math.max(n - 1, 1);
      const taper = 1.0 - 0.15 * Math.pow(Math.abs(bodyFrac - 0.4) / 0.6, 2);
      mesh.scale.set(breathScale * taper, 1, breathScale * taper);

      // Orient along body axis — smoothed with slerp to prevent jitter
      if (i < n - 1 && positions[i + 1]) {
        const next = smoothPositions.current[i + 1] || targetPos;
        const fwd = new THREE.Vector3().subVectors(next, smoothPositions.current[i]);

        // Average with previous direction for smoother tangent
        if (i > 0) {
          const prev = smoothPositions.current[i - 1];
          const back = new THREE.Vector3().subVectors(smoothPositions.current[i], prev);
          if (back.length() > 0.0001) {
            back.normalize();
            fwd.normalize();
            fwd.add(back).normalize(); // catmull-rom tangent
          }
        }

        if (fwd.length() > 0.001) {
          fwd.normalize();
          const up = new THREE.Vector3(0, 1, 0);
          const targetQuat = new THREE.Quaternion().setFromUnitVectors(up, fwd);
          mesh.quaternion.slerp(targetQuat, 0.2);
        }
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
      for (const [key, val] of Object.entries(frame.muscle_activations)) {
        if (key.includes(`_${i}`) || key.includes(`_${Math.max(0, i - 1)}`)) {
          maxRate = Math.max(maxRate, Math.abs(val) * 200);
        }
      }

      const activity = Math.min(maxRate / 120, 1);
      // Spike flash: immediate bright boost that decays
      const spikeBoost = hasSpike ? 0.4 : 0;
      const totalActivity = Math.min(activity + spikeBoost, 1);
      const mat = materials[i];

      const isPoked = i === pokeIdx && pokeFade > 0;

      if (isPoked) {
        mat.color.setRGB(0.3 + pokeFade * 0.5, 0.6 + pokeFade * 0.3, 0.7 + pokeFade * 0.3);
        mat.emissive.setRGB(0.08 * pokeFade, 0.35 * pokeFade, 0.55 * pokeFade);
      } else if (totalActivity > 0.1) {
        // Color: teal -> cyan -> bright cyan-white
        const c = totalActivity < 0.5
          ? REST_COLOR.clone().lerp(ACTIVE_COLOR, totalActivity * 2)
          : ACTIVE_COLOR.clone().lerp(HOT_COLOR, (totalActivity - 0.5) * 2);
        mat.color.copy(c);

        // Emissive: only HIGH when active — this is what bloom catches
        const e = totalActivity < 0.5
          ? REST_EMISSIVE.clone().lerp(ACTIVE_EMISSIVE, totalActivity * 2)
          : ACTIVE_EMISSIVE.clone().lerp(HOT_EMISSIVE, (totalActivity - 0.5) * 2);
        mat.emissive.copy(e);
        mat.emissiveIntensity = 1.0 + totalActivity * 1.5;
      } else {
        mat.color.copy(REST_COLOR);
        mat.emissive.copy(REST_EMISSIVE);
        mat.emissiveIntensity = 0.8;
      }
    }

    // Update spine tube geometry (throttled to every 5th frame to avoid GPU churn)
    if (spineRef.current && spinePoints.length >= 2 && frameCount.current % 5 === 0) {
      const curve = new THREE.CatmullRomCurve3(spinePoints);
      const newGeo = new THREE.TubeGeometry(curve, Math.max(spinePoints.length * 2, 16), SEG_RADIUS * 0.45, 6, false);
      spineRef.current.geometry.dispose();
      spineRef.current.geometry = newGeo;

      // Tint spine based on average activity
      let avgActivity = 0;
      for (let i = 0; i < n; i++) {
        const segStart = i * neuronsPerSeg;
        const segEnd = Math.min(segStart + neuronsPerSeg, nNeurons);
        for (let j = segStart; j < segEnd; j++) {
          avgActivity += rates[j] || 0;
        }
      }
      avgActivity = Math.min((avgActivity / Math.max(nNeurons, 1)) / 100, 1);
      spineMaterial.emissive.setRGB(
        0.003 + avgActivity * 0.03,
        0.01 + avgActivity * 0.08,
        0.02 + avgActivity * 0.12,
      );
    }

    for (let i = n; i < MAX_SEGMENTS; i++) {
      if (meshRefs.current[i]) meshRefs.current[i]!.visible = false;
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
      {/* Continuous spine tube connecting segments */}
      <mesh ref={spineRef} geometry={spineGeometry} material={spineMaterial} />

      {/* Individual body segments */}
      {Array.from({ length: segCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          geometry={geometry}
          material={materials[i]}
          position={[i * SEG_HALF_LEN * 2.3, SEG_RADIUS + 0.001, 0]}
          onPointerDown={() => handleClick(i)}
        />
      ))}
    </group>
  );
}
