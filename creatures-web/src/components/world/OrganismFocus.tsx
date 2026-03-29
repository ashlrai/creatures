import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MassiveOrganism } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// OrganismFocus — Full-detail view of a selected organism
//
// Renders a translucent biological body with visible neural network,
// synaptic connections, and activity-driven animations. The neural layout
// uses a Fibonacci sphere for neuron placement with type-based coloring
// (sensory/interneuron/motor) and simulated spike activity.
// ---------------------------------------------------------------------------

const N_NEURONS = 50; // matches default neurons_per_organism
const N_SYNAPSES = 80;

const SENSORY_COLOR = new THREE.Color(0.1, 0.9, 0.4);
const INTER_COLOR = new THREE.Color(0.2, 0.5, 1.0);
const MOTOR_COLOR = new THREE.Color(1.0, 0.25, 0.35);

interface OrganismFocusProps {
  organism: MassiveOrganism;
  visible: boolean;
}

export function OrganismFocus({ organism, visible }: OrganismFocusProps) {
  if (!visible) return null;

  const isCelegans = organism.species === 0;
  const energy = Math.min(1, Math.max(0, organism.energy / 200));

  // Body shape: elongated for worm, rounder for fly
  const bodyScaleX = isCelegans ? 2.2 : 1.4;
  const bodyScaleY = isCelegans ? 0.7 : 0.9;
  const bodyScaleZ = isCelegans ? 0.7 : 1.0;

  return (
    <group position={[organism.x, organism.y, 0.5]}>
      {/* Translucent body shell */}
      <mesh scale={[bodyScaleX, bodyScaleY, bodyScaleZ]}>
        <sphereGeometry args={[1.2, 32, 24]} />
        <meshPhysicalMaterial
          color={isCelegans ? '#0a2a40' : '#3a2818'}
          emissive={isCelegans ? '#0066aa' : '#aa6622'}
          emissiveIntensity={0.15 + energy * 0.35}
          transmission={0.5}
          roughness={0.15}
          thickness={2}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Neural network inside the body */}
      <NeuralNetwork energy={energy} isCelegans={isCelegans} />

      {/* Synapse connections */}
      <SynapseLines energy={energy} isCelegans={isCelegans} />

      {/* Outer glow ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]}>
        <ringGeometry args={[bodyScaleX * 1.2, bodyScaleX * 1.25, 64]} />
        <meshBasicMaterial
          color={isCelegans ? '#0088cc' : '#cc8844'}
          transparent
          opacity={0.2 + energy * 0.15}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Energy bar */}
      <EnergyBar energy={energy} position={[0, -1.8, 0]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Neural Network — animated neurons with type coloring and spike simulation
// ---------------------------------------------------------------------------

function NeuralNetwork({ energy, isCelegans }: { energy: number; isCelegans: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Points>(null);

  // Layout neurons in a Fibonacci sphere, compressed to body shape
  const positions = useMemo(() => {
    const pos = new Float32Array(N_NEURONS * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const rx = isCelegans ? 1.6 : 1.0;
    const ry = isCelegans ? 0.45 : 0.65;
    const rz = isCelegans ? 0.45 : 0.7;

    for (let i = 0; i < N_NEURONS; i++) {
      const t = i / (N_NEURONS - 1);
      const y = 1 - 2 * t;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;

      pos[i * 3] = Math.cos(theta) * r * rx;
      pos[i * 3 + 1] = y * ry;
      pos[i * 3 + 2] = Math.sin(theta) * r * rz;
    }
    return pos;
  }, [isCelegans]);

  // Base colors by neuron type
  const baseColors = useMemo(() => {
    const cols = new Float32Array(N_NEURONS * 3);
    for (let i = 0; i < N_NEURONS; i++) {
      const t = i / N_NEURONS;
      let c: THREE.Color;
      if (t < 0.2) c = SENSORY_COLOR;       // 20% sensory
      else if (t < 0.8) c = INTER_COLOR;     // 60% interneurons
      else c = MOTOR_COLOR;                   // 20% motor
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    return cols;
  }, []);

  const animColors = useMemo(() => new Float32Array(baseColors), [baseColors]);
  const baseSizes = useMemo(() => {
    const sizes = new Float32Array(N_NEURONS);
    for (let i = 0; i < N_NEURONS; i++) {
      const t = i / N_NEURONS;
      // Central neurons slightly larger
      sizes[i] = (t >= 0.35 && t <= 0.65) ? 0.08 : 0.05;
    }
    return sizes;
  }, []);
  const animSizes = useMemo(() => new Float32Array(baseSizes), [baseSizes]);

  // Simulate neural activity
  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < N_NEURONS; i++) {
      // Simulated activity: random spikes influenced by energy
      const spikeProb = energy * 0.15;
      const wave = Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5;
      const isSpiking = wave > (1 - spikeProb) && Math.sin(t * 7 + i * 3.1) > 0.7;

      if (isSpiking) {
        // Bright white spike
        animColors[i * 3] = 1.0;
        animColors[i * 3 + 1] = 1.0;
        animColors[i * 3 + 2] = 1.0;
        animSizes[i] = baseSizes[i] * 3.0;
      } else {
        // Decay back to base
        const decay = 0.08;
        animColors[i * 3] += (baseColors[i * 3] - animColors[i * 3]) * decay;
        animColors[i * 3 + 1] += (baseColors[i * 3 + 1] - animColors[i * 3 + 1]) * decay;
        animColors[i * 3 + 2] += (baseColors[i * 3 + 2] - animColors[i * 3 + 2]) * decay;
        animSizes[i] += (baseSizes[i] - animSizes[i]) * decay;

        // Subtle activity-driven brightening
        const activity = wave * energy * 0.3;
        animColors[i * 3] = Math.min(1, animColors[i * 3] + activity * 0.3);
        animColors[i * 3 + 1] = Math.min(1, animColors[i * 3 + 1] + activity * 0.3);
        animColors[i * 3 + 2] = Math.min(1, animColors[i * 3 + 2] + activity * 0.3);
      }
    }

    // Push to GPU
    const cAttr = pointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    (cAttr.array as Float32Array).set(animColors);
    cAttr.needsUpdate = true;

    const sAttr = pointsRef.current.geometry.getAttribute('size') as THREE.BufferAttribute;
    (sAttr.array as Float32Array).set(animSizes);
    sAttr.needsUpdate = true;

    // Glow layer copies
    if (glowRef.current) {
      const gc = glowRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
      (gc.array as Float32Array).set(animColors);
      gc.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Neuron points */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={positions} count={N_NEURONS} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={animColors} count={N_NEURONS} itemSize={3} />
          <bufferAttribute attach="attributes-size" array={animSizes} count={N_NEURONS} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Glow halo layer */}
      <points ref={glowRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={positions} count={N_NEURONS} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={new Float32Array(animColors)} count={N_NEURONS} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.15}
          sizeAttenuation
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </>
  );
}

// ---------------------------------------------------------------------------
// Synapse Lines — connections between neurons with activity pulsing
// ---------------------------------------------------------------------------

function SynapseLines({ energy, isCelegans }: { energy: number; isCelegans: boolean }) {
  const lineRef = useRef<THREE.LineSegments>(null);

  // Build synapse connections at creation time
  const { geom, synapsePairs } = useMemo(() => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const rx = isCelegans ? 1.6 : 1.0;
    const ry = isCelegans ? 0.45 : 0.65;
    const rz = isCelegans ? 0.45 : 0.7;

    // Regenerate positions to match NeuralNetwork
    const neuronPos = new Float32Array(N_NEURONS * 3);
    for (let i = 0; i < N_NEURONS; i++) {
      const t = i / (N_NEURONS - 1);
      const y = 1 - 2 * t;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      neuronPos[i * 3] = Math.cos(theta) * r * rx;
      neuronPos[i * 3 + 1] = y * ry;
      neuronPos[i * 3 + 2] = Math.sin(theta) * r * rz;
    }

    const verts = new Float32Array(N_SYNAPSES * 6);
    const cols = new Float32Array(N_SYNAPSES * 6);
    const pairs: [number, number][] = [];

    // Create connections between nearby neurons
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let s = 0; s < N_SYNAPSES; s++) {
      const pre = Math.floor(rng() * N_NEURONS);
      const offset = 1 + Math.floor(rng() * Math.floor(N_NEURONS * 0.2));
      const post = Math.min(pre + offset, N_NEURONS - 1);
      pairs.push([pre, post]);

      const i6 = s * 6;
      verts[i6] = neuronPos[pre * 3];
      verts[i6 + 1] = neuronPos[pre * 3 + 1];
      verts[i6 + 2] = neuronPos[pre * 3 + 2];
      verts[i6 + 3] = neuronPos[post * 3];
      verts[i6 + 4] = neuronPos[post * 3 + 1];
      verts[i6 + 5] = neuronPos[post * 3 + 2];

      // Base color: dim blue
      cols[i6] = 0.08;  cols[i6 + 1] = 0.2;  cols[i6 + 2] = 0.5;
      cols[i6 + 3] = 0.08; cols[i6 + 4] = 0.2; cols[i6 + 5] = 0.5;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return { geom: g, synapsePairs: pairs };
  }, [isCelegans]);

  // Animate synapse colors based on simulated activity
  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const t = clock.getElapsedTime();
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colAttr.array as Float32Array;

    for (let s = 0; s < N_SYNAPSES; s++) {
      const [pre, post] = synapsePairs[s];
      // Activity wave
      const wave = Math.sin(t * 2 + pre * 0.3) * 0.5 + 0.5;
      const active = wave * energy;

      const i6 = s * 6;
      const brightness = 0.08 + active * 0.6;
      const r = 0.08 + active * 0.4;
      const g = 0.2 + active * 0.5;
      const b = 0.5 + active * 0.3;

      colArr[i6] = r;     colArr[i6 + 1] = g;     colArr[i6 + 2] = b;
      colArr[i6 + 3] = r; colArr[i6 + 4] = g; colArr[i6 + 5] = b;
    }

    colAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef} geometry={geom}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// Energy Bar
// ---------------------------------------------------------------------------

function EnergyBar({ energy, position }: { energy: number; position: [number, number, number] }) {
  const barWidth = 2;
  const barHeight = 0.1;
  const fillWidth = Math.max(0.01, barWidth * energy);
  const fillColor = energy > 0.5 ? '#00cc66' : energy > 0.2 ? '#ffaa22' : '#ff4444';

  return (
    <group position={position}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[barWidth, barHeight]} />
        <meshBasicMaterial color="#111" transparent opacity={0.5} />
      </mesh>
      <mesh position={[(fillWidth - barWidth) / 2, 0, 0]}>
        <planeGeometry args={[fillWidth, barHeight]} />
        <meshBasicMaterial color={fillColor} toneMapped={false} />
      </mesh>
    </group>
  );
}
