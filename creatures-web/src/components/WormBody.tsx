import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../stores/simulationStore';

const SEGMENT_RADIUS = 0.015;
const SEGMENT_LENGTH = 0.08;

function lerpColor(rate: number): THREE.Color {
  // Cold (blue) to hot (red) based on neural activity
  const t = Math.min(rate / 100, 1); // normalize firing rate
  return new THREE.Color().setHSL(0.6 - t * 0.6, 0.8, 0.4 + t * 0.3);
}

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const meshRefs = useRef<THREE.Mesh[]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(SEGMENT_RADIUS, SEGMENT_LENGTH, 8, 16),
    []
  );

  useFrame(() => {
    if (!frame) return;
    const positions = frame.body_positions;
    if (!positions || positions.length === 0) return;

    meshRefs.current.forEach((mesh, i) => {
      if (mesh && positions[i]) {
        mesh.position.set(positions[i][0], positions[i][2], -positions[i][1]);

        // Color by muscle activation in nearby joints
        const rate = frame.firing_rates?.[i] ?? 0;
        const hasActivity = frame.n_active > 0;
        const color = hasActivity ? lerpColor(rate * 10) : new THREE.Color(0.8, 0.6, 0.4);
        (mesh.material as THREE.MeshStandardMaterial).color = color;
        (mesh.material as THREE.MeshStandardMaterial).emissive = hasActivity
          ? color.clone().multiplyScalar(0.3)
          : new THREE.Color(0, 0, 0);
      }
    });
  });

  return (
    <group>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) meshRefs.current[i] = el; }}
          geometry={geometry}
          position={[i * SEGMENT_LENGTH, SEGMENT_RADIUS + 0.001, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <meshStandardMaterial color="#cc9966" roughness={0.6} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}
