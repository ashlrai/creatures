import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Particle burst effects at neuron spike locations.
 * When a neuron fires, a small burst of colored particles appears
 * at its 3D position and fades over 300ms.
 *
 * Color by neuron type: sensory=green, inter=cyan, motor=red
 */

const MAX_PARTICLES = 400;
const PARTICLE_LIFETIME = 0.3; // seconds

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  age: number;
  alive: boolean;
}

const TYPE_BURST_COLORS: Record<string, THREE.Color> = {
  sensory: new THREE.Color(0.2, 1.0, 0.5),
  inter: new THREE.Color(0.3, 0.6, 1.0),
  motor: new THREE.Color(1.0, 0.3, 0.2),
  unknown: new THREE.Color(0.5, 0.5, 0.6),
};

export function SpikeParticles() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const pointsRef = useRef<THREE.Points>(null);
  const [neuronData, setNeuronData] = useState<{
    positions: Record<number, [number, number, number]>;
    types: Record<number, string>;
  } | null>(null);

  const particles = useRef<Particle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(),
      age: 0,
      alive: false,
    }))
  );
  const nextParticle = useRef(0);
  const lastSpikes = useRef<Set<number>>(new Set());

  // Load neuron positions and types for positioning particles
  useEffect(() => {
    if (!experiment) return;
    const base = import.meta.env.BASE_URL || '/';

    Promise.all([
      fetch('/api/neurons/positions').catch(() => fetch(`${base}neuron-positions.json`)).then(r => r.json()),
      fetch(`${base}neuron-types.json`).then(r => r.json()).catch(() => ({})),
    ]).then(([posData, typeData]) => {
      const positions: Record<number, [number, number, number]> = {};
      const types: Record<number, string> = {};
      const neuronIds = Object.keys(posData);

      const yMin = -320, yMax = 420;
      neuronIds.forEach((nid, idx) => {
        const [nx, ny, nz] = posData[nid];
        const bodyFrac = (ny - yMin) / (yMax - yMin);
        const x = bodyFrac * 0.88;
        const y = nz * 0.0003 + 0.015;
        const z = -nx * 0.0003;
        positions[idx] = [x, y, z];
        types[idx] = typeData[nid]?.type || 'unknown';
      });

      setNeuronData({ positions, types });
    }).catch(() => {});
  }, [experiment]);

  const positionArray = useMemo(() => new Float32Array(MAX_PARTICLES * 3), []);
  const colorArray = useMemo(() => new Float32Array(MAX_PARTICLES * 3), []);
  const sizeArray = useMemo(() => new Float32Array(MAX_PARTICLES), []);

  useFrame((_, delta) => {
    if (!frame || !neuronData || !pointsRef.current) return;

    // Spawn particles for new spikes
    const currentSpikes = new Set(frame.spikes);
    for (const spikeIdx of currentSpikes) {
      if (lastSpikes.current.has(spikeIdx)) continue; // already handled

      const pos = neuronData.positions[spikeIdx];
      if (!pos) continue;

      const type = neuronData.types[spikeIdx] || 'unknown';
      const burstColor = TYPE_BURST_COLORS[type] || TYPE_BURST_COLORS.unknown;

      // Spawn 2-3 particles per spike
      const count = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < count; j++) {
        const p = particles.current[nextParticle.current % MAX_PARTICLES];
        p.position.set(pos[0], pos[1], pos[2]);
        p.velocity.set(
          (Math.random() - 0.5) * 0.02,
          Math.random() * 0.015 + 0.005,
          (Math.random() - 0.5) * 0.02,
        );
        p.color.copy(burstColor);
        p.age = 0;
        p.alive = true;
        nextParticle.current++;
      }
    }
    lastSpikes.current = currentSpikes;

    // Update particles
    const geo = pointsRef.current.geometry;
    let visibleCount = 0;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles.current[i];
      if (!p.alive) {
        sizeArray[i] = 0;
        continue;
      }

      p.age += delta;
      if (p.age > PARTICLE_LIFETIME) {
        p.alive = false;
        sizeArray[i] = 0;
        continue;
      }

      // Move
      p.position.add(p.velocity.clone().multiplyScalar(delta));
      p.velocity.y -= delta * 0.01; // slight gravity

      // Fade
      const life = 1 - p.age / PARTICLE_LIFETIME;
      const fade = life * life; // quadratic fade

      positionArray[i * 3] = p.position.x;
      positionArray[i * 3 + 1] = p.position.y;
      positionArray[i * 3 + 2] = p.position.z;

      colorArray[i * 3] = p.color.r * fade;
      colorArray[i * 3 + 1] = p.color.g * fade;
      colorArray[i * 3 + 2] = p.color.b * fade;

      sizeArray[i] = 0.004 * fade;
      visibleCount++;
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positionArray} count={MAX_PARTICLES} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={colorArray} count={MAX_PARTICLES} itemSize={3} />
        <bufferAttribute attach="attributes-size" array={sizeArray} count={MAX_PARTICLES} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        size={0.004}
      />
    </points>
  );
}
