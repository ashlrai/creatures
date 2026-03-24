import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D worm body using MeshPhysicalMaterial (robust, no custom shaders).
 * Translucent glassy segments with activity-driven emissive glow.
 */

const MAX_SEGMENTS = 88;
const SEG_RADIUS = 0.012;
const SEG_HALF_LEN = 0.032;

const REST_COLOR = new THREE.Color(0.04, 0.22, 0.32);
const ACTIVE_COLOR = new THREE.Color(0.05, 0.65, 0.9);
const HOT_COLOR = new THREE.Color(0.6, 0.9, 1.0);
const POKE_COLOR = new THREE.Color(1, 1, 1);

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
      new THREE.MeshPhysicalMaterial({
        color: REST_COLOR.clone(),
        emissive: new THREE.Color(0.02, 0.06, 0.1),
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.1,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
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
      // MuJoCo → Three.js coordinate mapping
      mesh.position.set(x, z, -y);
      mesh.visible = true;

      // Breathing animation
      const breath = 1.0 + Math.sin(t * 2.0 + i * 0.4) * 0.02;
      mesh.scale.set(breath, 1, breath);

      // Orient along body axis
      if (i < n - 1 && positions[i + 1]) {
        const [nx, ny, nz] = positions[i + 1];
        const dir = new THREE.Vector3(nx - x, nz - z, -(ny - y));
        if (dir.length() > 0.0001) {
          dir.normalize();
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        }
      }

      // Compute activity for this segment
      const segStart = i * neuronsPerSeg;
      const segEnd = Math.min(segStart + neuronsPerSeg, nNeurons);
      let maxRate = 0;
      for (let j = segStart; j < segEnd; j++) {
        maxRate = Math.max(maxRate, rates[j]);
      }
      // Also check muscles
      for (const [key, val] of Object.entries(frame.muscle_activations)) {
        if (key.includes(`_${i}`) || key.includes(`_${Math.max(0, i - 1)}`)) {
          maxRate = Math.max(maxRate, Math.abs(val) * 200);
        }
      }

      const activity = Math.min(maxRate / 120, 1);
      const mat = materials[i];

      // Poke flash
      const isPoked = i === pokeIdx && pokeFade > 0;
      const nearPoke = Math.abs(i - pokeIdx) <= 1 && pokeFade > 0;

      if (isPoked) {
        mat.color.copy(POKE_COLOR);
        mat.emissive.set(1, 1, 1);
        mat.emissiveIntensity = pokeFade * 2;
      } else if (activity > 0.05) {
        // Active: interpolate from active color to hot
        const c = activity < 0.5
          ? REST_COLOR.clone().lerp(ACTIVE_COLOR, activity * 2)
          : ACTIVE_COLOR.clone().lerp(HOT_COLOR, (activity - 0.5) * 2);
        mat.color.copy(c);
        mat.emissive.copy(c);
        mat.emissiveIntensity = 0.5 + activity * 2.5;
      } else if (nearPoke) {
        mat.color.copy(REST_COLOR);
        mat.emissive.set(0.3, 0.3, 0.3);
        mat.emissiveIntensity = pokeFade * 0.5;
      } else {
        mat.color.copy(REST_COLOR);
        mat.emissive.set(0.01, 0.04, 0.06);
        mat.emissiveIntensity = 0.6 + Math.sin(t * 1.5 + i * 0.3) * 0.15;
      }
    }

    // Hide extra
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
