import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

const MAX_SEGMENTS = 88;
const SEG_RADIUS = 0.013;
const SEG_HALF_LEN = 0.035;

// Dark teal at rest, bright cyan when active
const REST_COLOR = new THREE.Color(0.08, 0.22, 0.3);
const ACTIVE_COLOR = new THREE.Color(0.15, 0.55, 0.8);
const HOT_COLOR = new THREE.Color(0.4, 0.8, 0.95);
const REST_EMISSIVE = new THREE.Color(0.015, 0.04, 0.06);
const ACTIVE_EMISSIVE = new THREE.Color(0.05, 0.2, 0.35);

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const lastPoke = useSimulationStore((s) => s.lastPoke);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(SEG_RADIUS, SEG_HALF_LEN * 2, 8, 16),
    []
  );

  const materials = useMemo(
    () => Array.from({ length: MAX_SEGMENTS }, () =>
      new THREE.MeshStandardMaterial({
        color: REST_COLOR.clone(),
        emissive: REST_EMISSIVE.clone(),
        emissiveIntensity: 1,
        roughness: 0.5,
        metalness: 0.15,
        transparent: true,
        opacity: 0.85,
      })
    ),
    []
  );

  useFrame(({ clock }) => {
    if (!frame?.body_positions?.length) return;

    const t = clock.getElapsedTime();
    const positions = frame.body_positions;
    const n = Math.min(positions.length, MAX_SEGMENTS);
    const rates = frame.firing_rates ?? [];
    const nNeurons = rates.length;
    const neuronsPerSeg = nNeurons > 0 ? Math.ceil(nNeurons / n) : 1;

    const pokeIdx = lastPoke ? parseInt(lastPoke.segment.replace('seg_', ''), 10) : -1;
    const pokeFade = lastPoke ? Math.max(0, 1 - (Date.now() - lastPoke.time) / 600) : 0;

    for (let i = 0; i < n; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh || !positions[i]) continue;

      const [x, y, z] = positions[i];
      mesh.position.set(x, z, -y);
      mesh.visible = true;

      // Subtle breathing
      const breath = 1.0 + Math.sin(t * 2.0 + i * 0.4) * 0.015;
      mesh.scale.set(breath, 1, breath);

      // Orient along body axis — smoothed with slerp to prevent jitter
      if (i < n - 1 && positions[i + 1]) {
        const [nx, ny, nz] = positions[i + 1];
        const fwd = new THREE.Vector3(nx - x, nz - z, -(ny - y));

        // Average with previous direction for smoother tangent
        if (i > 0 && positions[i - 1]) {
          const [px, py, pz] = positions[i - 1];
          const back = new THREE.Vector3(x - px, z - pz, -(y - py));
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
          mesh.quaternion.slerp(targetQuat, 0.25); // smooth interpolation
        }
      }

      // Compute activity
      const segStart = i * neuronsPerSeg;
      const segEnd = Math.min(segStart + neuronsPerSeg, nNeurons);
      let maxRate = 0;
      for (let j = segStart; j < segEnd; j++) {
        maxRate = Math.max(maxRate, rates[j]);
      }
      for (const [key, val] of Object.entries(frame.muscle_activations)) {
        if (key.includes(`_${i}`) || key.includes(`_${Math.max(0, i - 1)}`)) {
          maxRate = Math.max(maxRate, Math.abs(val) * 200);
        }
      }

      const activity = Math.min(maxRate / 120, 1);
      const mat = materials[i];

      const isPoked = i === pokeIdx && pokeFade > 0;

      if (isPoked) {
        mat.color.setRGB(0.4 + pokeFade * 0.6, 0.6 + pokeFade * 0.4, 0.7 + pokeFade * 0.3);
        mat.emissive.setRGB(0.1 * pokeFade, 0.3 * pokeFade, 0.5 * pokeFade);
      } else if (activity > 0.05) {
        const c = activity < 0.5
          ? REST_COLOR.clone().lerp(ACTIVE_COLOR, activity * 2)
          : ACTIVE_COLOR.clone().lerp(HOT_COLOR, (activity - 0.5) * 2);
        mat.color.copy(c);
        mat.emissive.lerpColors(REST_EMISSIVE, ACTIVE_EMISSIVE, activity);
      } else {
        mat.color.copy(REST_COLOR);
        mat.emissive.copy(REST_EMISSIVE);
        // Subtle pulse
        const pulse = Math.sin(t * 1.5 + i * 0.3) * 0.005;
        mat.emissive.r += pulse;
        mat.emissive.g += pulse * 2;
        mat.emissive.b += pulse * 3;
      }
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
