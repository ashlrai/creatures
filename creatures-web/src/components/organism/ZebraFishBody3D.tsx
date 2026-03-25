import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Zebrafish Mauthner circuit visualization.
 *
 * Shows the neural circuit as a glowing 3D graph — sensory neurons
 * at the top, the giant Mauthner cells in the center, motor neurons
 * at the bottom. Real-time spike activity flows through the network.
 */

const SENSORY_COLOR = new THREE.Color(0.1, 0.8, 0.3);
const MAUTHNER_COLOR = new THREE.Color(1.0, 0.8, 0.1);
const MOTOR_COLOR = new THREE.Color(1.0, 0.2, 0.4);
const INHIB_COLOR = new THREE.Color(0.6, 0.2, 0.8);

function layoutZebrafishCircuit(nNeurons: number): Float32Array {
  const positions = new Float32Array(nNeurons * 3);
  for (let i = 0; i < nNeurons; i++) {
    const t = i / Math.max(nNeurons - 1, 1);
    // Fish-shaped layout: elongated along X, layered in Y
    const angle = i * 2.399; // golden angle
    let x: number, y: number, z: number;

    if (t < 0.2) {
      // Sensory: clustered at front-top
      x = -0.06 + Math.cos(angle) * 0.03;
      y = 0.06 + Math.sin(angle) * 0.02;
      z = Math.sin(angle * 1.5) * 0.03;
    } else if (t < 0.3) {
      // Mauthner/giant neurons: central, prominent
      x = Math.cos(angle) * 0.02;
      y = 0.02 + Math.sin(angle) * 0.02;
      z = Math.sin(angle * 0.7) * 0.04;
    } else if (t < 0.7) {
      // Interneurons: spread through the middle
      x = -0.03 + (t - 0.3) * 0.25 + Math.cos(angle) * 0.02;
      y = Math.sin(angle) * 0.03;
      z = Math.cos(angle * 1.3) * 0.04;
    } else {
      // Motor neurons: elongated along tail
      x = 0.04 + (t - 0.7) * 0.2;
      y = -0.03 + Math.sin(angle) * 0.015;
      z = Math.cos(angle) * 0.025;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

export function ZebraFishBody3D() {
  const frame = useSimulationStore((s) => s.frame);
  const pointsRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Points>(null);

  const nNeurons = frame?.firing_rates?.length ?? 50;
  const positions = useMemo(() => layoutZebrafishCircuit(nNeurons), [nNeurons]);

  const baseColors = useMemo(() => {
    const c = new Float32Array(nNeurons * 3);
    for (let i = 0; i < nNeurons; i++) {
      const t = i / Math.max(nNeurons - 1, 1);
      let col: THREE.Color;
      if (t < 0.2) col = SENSORY_COLOR;
      else if (t < 0.3) col = MAUTHNER_COLOR;
      else if (t < 0.6) col = INHIB_COLOR;
      else col = MOTOR_COLOR;
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    return c;
  }, [nNeurons]);

  const animColors = useMemo(() => new Float32Array(baseColors), [baseColors]);
  const sizes = useMemo(() => {
    const s = new Float32Array(nNeurons);
    for (let i = 0; i < nNeurons; i++) {
      const t = i / Math.max(nNeurons - 1, 1);
      // Mauthner cells are BIG
      s[i] = (t >= 0.2 && t < 0.3) ? 0.006 : 0.003;
    }
    return s;
  }, [nNeurons]);
  const animSizes = useMemo(() => new Float32Array(sizes), [sizes]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();
    const rates = frame?.firing_rates ?? [];
    const spikes = new Set(frame?.spikes ?? []);

    for (let i = 0; i < nNeurons; i++) {
      const rate = i < rates.length ? rates[i] : 0;
      const activity = Math.min(rate / 60, 1);
      const isSpiking = spikes.has(i);

      if (isSpiking) {
        animColors[i * 3] = 1; animColors[i * 3 + 1] = 1; animColors[i * 3 + 2] = 1;
        animSizes[i] = sizes[i] * 5;
      } else if (activity > 0.05) {
        animColors[i * 3] = baseColors[i * 3] + (1 - baseColors[i * 3]) * activity * 0.5;
        animColors[i * 3 + 1] = baseColors[i * 3 + 1] + (1 - baseColors[i * 3 + 1]) * activity * 0.5;
        animColors[i * 3 + 2] = baseColors[i * 3 + 2] + (1 - baseColors[i * 3 + 2]) * activity * 0.5;
        animSizes[i] = sizes[i] * (1 + activity * 2);
      } else {
        animColors[i * 3] += (baseColors[i * 3] - animColors[i * 3]) * 0.08;
        animColors[i * 3 + 1] += (baseColors[i * 3 + 1] - animColors[i * 3 + 1]) * 0.08;
        animColors[i * 3 + 2] += (baseColors[i * 3 + 2] - animColors[i * 3 + 2]) * 0.08;
        animSizes[i] += (sizes[i] - animSizes[i]) * 0.08;
      }
    }

    const cAttr = pointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    (cAttr.array as Float32Array).set(animColors);
    cAttr.needsUpdate = true;
    const sAttr = pointsRef.current.geometry.getAttribute('size') as THREE.BufferAttribute;
    (sAttr.array as Float32Array).set(animSizes);
    sAttr.needsUpdate = true;

    pointsRef.current.rotation.y = Math.sin(t * 0.15) * 0.15;
    if (glowRef.current) glowRef.current.rotation.y = pointsRef.current.rotation.y;
  });

  return (
    <group position={[0.4, 0.03, 0]}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={positions} count={nNeurons} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={animColors} count={nNeurons} itemSize={3} />
          <bufferAttribute attach="attributes-size" array={animSizes} count={nNeurons} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial vertexColors size={0.005} sizeAttenuation transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <points ref={glowRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={positions} count={nNeurons} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={animColors} count={nNeurons} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial vertexColors size={0.015} sizeAttenuation transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}
