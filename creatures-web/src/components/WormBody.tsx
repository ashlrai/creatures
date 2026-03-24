import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../stores/simulationStore';

const SEGMENT_RADIUS = 0.015;
const SEGMENT_HALF_LEN = 0.04;
const MAX_SEGMENTS = 88; // support up to fly body count

function activityColor(intensity: number): [number, number, number] {
  // 0 = warm amber (resting), 0.5 = yellow, 1.0 = hot white-red
  const t = Math.min(Math.max(intensity, 0), 1);
  if (t < 0.01) return [0.7, 0.5, 0.3]; // resting amber
  if (t < 0.3) {
    const s = t / 0.3;
    return [0.7 + 0.3 * s, 0.5 + 0.3 * s, 0.3 - 0.2 * s]; // amber → orange
  }
  if (t < 0.7) {
    const s = (t - 0.3) / 0.4;
    return [1.0, 0.8 - 0.3 * s, 0.1 + 0.1 * s]; // orange → bright yellow
  }
  const s = (t - 0.7) / 0.3;
  return [1.0, 0.5 + 0.5 * s, 0.2 + 0.8 * s]; // yellow → white-hot
}

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const lastPoke = useSimulationStore((s) => s.lastPoke);
  const [segCount, setSegCount] = useState(12);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(SEGMENT_RADIUS, SEGMENT_HALF_LEN * 2, 4, 12),
    []
  );

  const materials = useMemo(
    () => Array.from({ length: MAX_SEGMENTS }, () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.7, 0.5, 0.3),
        roughness: 0.4,
        metalness: 0.05,
        emissive: new THREE.Color(0, 0, 0),
      })
    ),
    []
  );

  useFrame(() => {
    if (!frame?.body_positions?.length) return;

    const positions = frame.body_positions;
    const n = Math.min(positions.length, MAX_SEGMENTS);

    // Update segment count if changed
    if (n !== segCount) setSegCount(n);

    // Compute per-segment activity from firing rates
    const rates = frame.firing_rates ?? [];
    const nNeurons = rates.length;
    const neuronsPerSeg = nNeurons > 0 ? Math.ceil(nNeurons / n) : 1;

    // Poke flash: which segment index was poked?
    const pokeIdx = lastPoke ? parseInt(lastPoke.segment.replace('seg_', ''), 10) : -1;
    const pokeFade = lastPoke ? Math.max(0, 1 - (Date.now() - lastPoke.time) / 500) : 0;

    for (let i = 0; i < n; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh || !positions[i]) continue;

      const [x, y, z] = positions[i];
      mesh.position.set(x, z, -y);
      mesh.visible = true;

      // Orient along body axis
      if (i < n - 1 && positions[i + 1]) {
        const [nx, ny, nz] = positions[i + 1];
        const dir = new THREE.Vector3(nx - x, nz - z, -(ny - y));
        if (dir.length() > 0.0001) {
          dir.normalize();
          const up = new THREE.Vector3(0, 1, 0);
          mesh.quaternion.setFromUnitVectors(up, dir);
        }
      }

      // Compute segment activity from firing rates
      const segStart = i * neuronsPerSeg;
      const segEnd = Math.min(segStart + neuronsPerSeg, nNeurons);
      let segActivity = 0;
      if (nNeurons > 0) {
        for (let j = segStart; j < segEnd; j++) {
          segActivity = Math.max(segActivity, rates[j]);
        }
      }

      // Also factor in muscle activations for this segment
      const muscleKeys = Object.keys(frame.muscle_activations);
      for (const key of muscleKeys) {
        if (key.includes(`_${i}`) || key.includes(`_${Math.max(0, i - 1)}`)) {
          segActivity = Math.max(segActivity, Math.abs(frame.muscle_activations[key]) * 300);
        }
      }

      const intensity = Math.min(segActivity / 150, 1);
      const [r, g, b] = activityColor(intensity);

      const mat = materials[i];
      // Poke flash overlay
      if (i === pokeIdx && pokeFade > 0) {
        mat.color.setRGB(
          r + (1 - r) * pokeFade,
          g + (1 - g) * pokeFade,
          b + (1 - b) * pokeFade,
        );
        mat.emissive.setRGB(pokeFade * 0.8, pokeFade * 0.8, pokeFade * 0.8);
      } else {
        mat.color.setRGB(r, g, b);
        mat.emissive.setRGB(r * intensity * 0.6, g * intensity * 0.4, b * intensity * 0.2);
      }
    }

    // Hide extra meshes
    for (let i = n; i < MAX_SEGMENTS; i++) {
      if (meshRefs.current[i]) meshRefs.current[i]!.visible = false;
    }
  });

  // Render up to segCount segments (dynamically sized)
  const renderCount = Math.min(segCount, MAX_SEGMENTS);

  return (
    <group>
      {Array.from({ length: renderCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          geometry={geometry}
          material={materials[i]}
          position={[i * SEGMENT_HALF_LEN * 2 + SEGMENT_HALF_LEN, SEGMENT_RADIUS + 0.001, 0]}
        />
      ))}
    </group>
  );
}
