import { useRef, useMemo } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { useSimulationStore } from '../../stores/simulationStore';

const MAX_SEGMENTS = 88;
const SEG_RADIUS = 0.012;
const SEG_HALF_LEN = 0.032;

// Custom bioluminescent shader
const BioLumMaterial = shaderMaterial(
  {
    uTime: 0,
    uActivity: 0,
    uPokeFlash: 0,
    uBaseColor: new THREE.Color(0.04, 0.12, 0.22),
    uRimColor: new THREE.Color(0.15, 0.55, 0.85),
    uGlowColor: new THREE.Color(0.0, 0.7, 1.0),
  },
  // Vertex shader
  `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uActivity;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);

      // Breathing: subtle scale pulse
      float breath = sin(uTime * 2.0 + position.y * 6.0) * 0.015 * (1.0 + uActivity * 2.0);
      vec3 displaced = position + normal * breath;

      vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,
  // Fragment shader
  `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uActivity;
    uniform float uPokeFlash;
    uniform vec3 uBaseColor;
    uniform vec3 uRimColor;
    uniform vec3 uGlowColor;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.5);

      // Base translucent body
      vec3 bodyColor = uBaseColor;

      // Rim glow (always visible, stronger when active)
      float rimStrength = 0.3 + uActivity * 0.7;
      vec3 rim = uRimColor * fresnel * rimStrength;

      // Neural activity core glow
      float corePulse = sin(uTime * 4.0 + vUv.y * 8.0) * 0.15 + 0.85;
      vec3 coreGlow = uGlowColor * uActivity * corePulse * (1.0 - fresnel * 0.5);

      // Poke flash (white burst)
      vec3 pokeColor = vec3(1.0, 0.95, 0.9) * uPokeFlash;

      // Combine
      vec3 color = bodyColor + rim + coreGlow + pokeColor;

      // Emissive output for bloom (only active parts bloom)
      float emissiveStrength = uActivity * 0.6 + fresnel * 0.15 + uPokeFlash * 0.8;

      // Opacity: more opaque at edges, translucent center
      float alpha = 0.35 + fresnel * 0.55 + uActivity * 0.1;

      gl_FragColor = vec4(color + color * emissiveStrength, alpha);
    }
  `
);

extend({ BioLumMaterial });

// Type declaration for JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      bioLumMaterial: any;
    }
  }
}

function JointNode({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[SEG_RADIUS * 0.5, 8, 8]} />
      <meshBasicMaterial color="#0a2030" transparent opacity={0.4} />
    </mesh>
  );
}

export function WormBody() {
  const frame = useSimulationStore((s) => s.frame);
  const lastPoke = useSimulationStore((s) => s.lastPoke);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<any[]>([]);
  const jointRefs = useRef<[number, number, number][]>([]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(SEG_RADIUS, SEG_HALF_LEN * 2, 8, 16),
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

    const joints: [number, number, number][] = [];

    for (let i = 0; i < n; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      if (!mesh || !mat || !positions[i]) continue;

      const [x, y, z] = positions[i];
      mesh.position.set(x, z, -y);
      mesh.visible = true;

      // Orient along body
      if (i < n - 1 && positions[i + 1]) {
        const [nx, ny, nz] = positions[i + 1];
        const dir = new THREE.Vector3(nx - x, nz - z, -(ny - y));
        if (dir.length() > 0.0001) {
          dir.normalize();
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        }
        // Joint position (midpoint between segments)
        joints.push([(x + nx) / 2, (z + nz) / 2, -(y + ny) / 2]);
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

      // Update shader uniforms
      mat.uTime = t;
      mat.uActivity = activity;
      mat.uPokeFlash = (i === pokeIdx) ? pokeFade : (Math.abs(i - pokeIdx) <= 1 ? pokeFade * 0.3 : 0);
    }

    // Hide extra meshes
    for (let i = n; i < MAX_SEGMENTS; i++) {
      if (meshRefs.current[i]) meshRefs.current[i]!.visible = false;
    }

    jointRefs.current = joints;
  });

  const segCount = frame?.body_positions?.length
    ? Math.min(frame.body_positions.length, MAX_SEGMENTS)
    : 12;

  return (
    <group>
      {Array.from({ length: segCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          geometry={geometry}
          position={[i * SEG_HALF_LEN * 2.3, SEG_RADIUS + 0.001, 0]}
        >
          <bioLumMaterial
            ref={(el: any) => { matRefs.current[i] = el; }}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Joint nodes between segments */}
      {jointRefs.current?.map((pos, i) => (
        <JointNode key={`joint-${i}`} position={pos} />
      ))}
    </group>
  );
}
