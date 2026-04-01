// ============================================================================
// TimelineParticles — ambient particle system for the Timeline River scene
// Hundreds of floating motes that drift along the river flow, tinted by
// proximity to nearby era nodes. Uses instanced Points for performance.
// ============================================================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PARTICLE_COUNT = 600;
const SPREAD_X = 60;
const SPREAD_Y = 20;
const SPREAD_Z = 8;
const DRIFT_SPEED = 0.12;

interface EraPosition {
  position: [number, number, number];
  color: string;
}

interface TimelineParticlesProps {
  eraPositions?: EraPosition[];
}

export function TimelineParticles({ eraPositions = [] }: TimelineParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const { positions, velocities, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const siz = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Distribute along the river's extent
      pos[i3] = (Math.random() - 0.5) * SPREAD_X * 2;
      pos[i3 + 1] = (Math.random() - 0.5) * SPREAD_Y * 2;
      pos[i3 + 2] = (Math.random() - 0.5) * SPREAD_Z * 2;

      // Gentle drift — mostly along +X (the river flow direction)
      vel[i3] = (Math.random() * 0.5 + 0.3) * DRIFT_SPEED;
      vel[i3 + 1] = (Math.random() - 0.5) * 0.02;
      vel[i3 + 2] = (Math.random() - 0.5) * 0.02;

      // Base color: soft blue-white
      col[i3] = 0.5 + Math.random() * 0.3;
      col[i3 + 1] = 0.6 + Math.random() * 0.3;
      col[i3 + 2] = 0.8 + Math.random() * 0.2;

      siz[i] = Math.random() * 0.08 + 0.02;
    }

    return { positions: pos, velocities: vel, colors: col, sizes: siz };
  }, []);

  // Tint particles based on proximity to eras
  const eraColorsVec3 = useMemo(() => {
    return eraPositions.map(ep => ({
      pos: new THREE.Vector3(...ep.position),
      col: new THREE.Color(ep.color),
    }));
  }, [eraPositions]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const geo = pointsRef.current.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const clampedDelta = Math.min(delta, 0.05);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Move
      posArr[i3] += velocities[i3] * clampedDelta * 60;
      posArr[i3 + 1] += velocities[i3 + 1] * clampedDelta * 60 + Math.sin(Date.now() * 0.001 + i) * 0.0008;
      posArr[i3 + 2] += velocities[i3 + 2] * clampedDelta * 60;

      // Wrap around X
      if (posArr[i3] > SPREAD_X) posArr[i3] = -SPREAD_X;
      if (posArr[i3] < -SPREAD_X) posArr[i3] = SPREAD_X;

      // Tint by nearest era
      if (eraColorsVec3.length > 0) {
        let minDist = Infinity;
        let nearestCol: THREE.Color | null = null;
        const px = posArr[i3], py = posArr[i3 + 1], pz = posArr[i3 + 2];
        for (const ec of eraColorsVec3) {
          const dx = px - ec.pos.x, dy = py - ec.pos.y, dz = pz - ec.pos.z;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < minDist) { minDist = d; nearestCol = ec.col; }
        }
        const influence = Math.max(0, 1 - Math.sqrt(minDist) / 15);
        // Blend towards nearest era color
        colArr[i3] = THREE.MathUtils.lerp(colors[i3], nearestCol!.r, influence * 0.5);
        colArr[i3 + 1] = THREE.MathUtils.lerp(colors[i3 + 1], nearestCol!.g, influence * 0.5);
        colArr[i3 + 2] = THREE.MathUtils.lerp(colors[i3 + 2], nearestCol!.b, influence * 0.5);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Update shader time
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += clampedDelta;
    }
  });

  const vertexShader = `
    attribute float size;
    attribute vec3 color;
    varying vec3 vColor;
    uniform float uTime;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * 300.0 / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.1, d) * 0.6;
      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={PARTICLE_COUNT}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={PARTICLE_COUNT}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
      />
    </points>
  );
}
