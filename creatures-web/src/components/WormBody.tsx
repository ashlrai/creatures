import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../stores/simulationStore';

const SEGMENT_RADIUS = 0.015;
const SEGMENT_HALF_LENGTH = 0.04;

function firingColor(rate: number): [number, number, number] {
  // Blue (cold/silent) → Yellow → Red (hot/firing)
  const t = Math.min(rate / 200, 1);
  if (t < 0.5) {
    const s = t * 2;
    return [s, s * 0.8, 1 - s]; // blue → yellow
  }
  const s = (t - 0.5) * 2;
  return [1, 0.8 * (1 - s), 0]; // yellow → red
}

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(SEGMENT_RADIUS, SEGMENT_HALF_LENGTH * 2, 4, 12),
    []
  );

  const materials = useMemo(
    () => Array.from({ length: 12 }, () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.75, 0.55, 0.35),
        roughness: 0.5,
        metalness: 0.05,
      })
    ),
    []
  );

  useFrame(() => {
    if (!frame || !frame.body_positions || frame.body_positions.length < 12) return;

    const positions = frame.body_positions;
    const hasActivity = frame.n_active > 0;

    for (let i = 0; i < Math.min(12, positions.length); i++) {
      const mesh = meshRefs.current[i];
      if (!mesh || !positions[i]) continue;

      const [x, y, z] = positions[i];
      // MuJoCo: X=forward, Y=lateral, Z=up
      // Three.js: X=right, Y=up, Z=forward (toward camera)
      mesh.position.set(x, z, -y);

      // Orient capsule along the worm body axis
      if (i < positions.length - 1 && positions[i + 1]) {
        const [nx, ny, nz] = positions[i + 1];
        const dir = new THREE.Vector3(nx - x, nz - z, -(ny - y)).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);
      }

      // Color by neural activity
      const mat = materials[i];
      if (hasActivity) {
        // Use per-segment muscle activation as proxy for local activity
        const muscleKeys = Object.keys(frame.muscle_activations);
        const segMuscles = muscleKeys.filter(k =>
          k.includes(`_${i}`) || k.includes(`_${Math.max(0, i - 1)}`)
        );
        const avgActivation = segMuscles.length > 0
          ? segMuscles.reduce((sum, k) => sum + Math.abs(frame.muscle_activations[k] || 0), 0) / segMuscles.length
          : 0;

        const intensity = Math.min(avgActivation * 500, 1);
        const [r, g, b] = firingColor(intensity * 200);
        mat.color.setRGB(r, g, b);
        mat.emissive.setRGB(r * 0.4, g * 0.4, b * 0.4);
      } else {
        mat.color.setRGB(0.75, 0.55, 0.35);
        mat.emissive.setRGB(0, 0, 0);
      }
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          geometry={geometry}
          material={materials[i]}
          position={[i * SEGMENT_HALF_LENGTH * 2 + SEGMENT_HALF_LENGTH, SEGMENT_RADIUS + 0.001, 0]}
        />
      ))}
    </group>
  );
}
