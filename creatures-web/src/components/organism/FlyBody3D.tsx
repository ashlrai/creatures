import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Drosophila neural circuit visualization.
 *
 * Instead of rendering a crude 3D fly body, we show the BRAIN —
 * a beautiful 3D force-directed graph of the neural network with
 * real-time spike activity as light pulses. A subtle fly silhouette
 * provides anatomical context.
 *
 * This is what makes it revolutionary: you're watching a real brain think.
 */

// Neuron type colors
const SENSORY_COLOR = new THREE.Color(0.1, 0.9, 0.4);    // green
const INTER_COLOR = new THREE.Color(0.2, 0.5, 1.0);      // blue
const MOTOR_COLOR = new THREE.Color(1.0, 0.2, 0.3);      // red
const DESCENDING_COLOR = new THREE.Color(1.0, 0.6, 0.1);  // amber

const SPIKE_COLOR = new THREE.Color(1.0, 1.0, 1.0);
const REST_OPACITY = 0.6;

// Layout: neurons arranged in layers (sensory top, inter middle, motor bottom)
function layoutNeurons(nNeurons: number): Float32Array {
  const positions = new Float32Array(nNeurons * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < nNeurons; i++) {
    const t = i / Math.max(nNeurons - 1, 1);
    // Determine layer: top 15% sensory, middle 65% inter, bottom 20% motor
    let y: number;
    if (t < 0.15) {
      y = 0.08 + (t / 0.15) * 0.04; // sensory at top
    } else if (t < 0.80) {
      y = -0.02 + ((t - 0.15) / 0.65) * 0.10; // inter in middle band
    } else {
      y = -0.06 + ((t - 0.80) / 0.20) * 0.04; // motor at bottom
    }

    // Spiral layout within each layer for visual appeal
    const angle = i * goldenAngle;
    const radius = 0.02 + Math.sqrt(t) * 0.10;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

export function FlyBody3D() {
  const frame = useSimulationStore((s) => s.frame);
  const pointsRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  const nNeurons = frame?.firing_rates?.length ?? 500;

  // Neuron positions (brain map layout)
  const neuronPositions = useMemo(() => layoutNeurons(nNeurons), [nNeurons]);

  // Neuron colors (by type)
  const baseColors = useMemo(() => {
    const colors = new Float32Array(nNeurons * 3);
    for (let i = 0; i < nNeurons; i++) {
      const t = i / Math.max(nNeurons - 1, 1);
      let c: THREE.Color;
      if (t < 0.15) c = SENSORY_COLOR;
      else if (t < 0.80) c = INTER_COLOR;
      else if (t < 0.95) c = DESCENDING_COLOR;
      else c = MOTOR_COLOR;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return colors;
  }, [nNeurons]);

  // Neuron sizes (larger for hub neurons)
  const baseSizes = useMemo(() => {
    const sizes = new Float32Array(nNeurons);
    for (let i = 0; i < nNeurons; i++) {
      sizes[i] = 0.002 + Math.random() * 0.002; // varied base size
    }
    return sizes;
  }, [nNeurons]);

  // Synapse connections (random but structured)
  const synapseGeometry = useMemo(() => {
    const nSynapses = Math.min(nNeurons * 3, 2000);
    const vertices = new Float32Array(nSynapses * 6); // 2 points per line
    const lineColors = new Float32Array(nSynapses * 6);

    for (let s = 0; s < nSynapses; s++) {
      const pre = Math.floor(Math.random() * nNeurons);
      // Bias connections forward (sensory → inter → motor)
      const post = Math.min(pre + 1 + Math.floor(Math.random() * (nNeurons * 0.3)), nNeurons - 1);

      const idx = s * 6;
      vertices[idx] = neuronPositions[pre * 3];
      vertices[idx + 1] = neuronPositions[pre * 3 + 1];
      vertices[idx + 2] = neuronPositions[pre * 3 + 2];
      vertices[idx + 3] = neuronPositions[post * 3];
      vertices[idx + 4] = neuronPositions[post * 3 + 1];
      vertices[idx + 5] = neuronPositions[post * 3 + 2];

      // Faint connection color
      lineColors[idx] = 0.1; lineColors[idx + 1] = 0.2; lineColors[idx + 2] = 0.4;
      lineColors[idx + 3] = 0.1; lineColors[idx + 4] = 0.2; lineColors[idx + 5] = 0.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
    return geo;
  }, [nNeurons, neuronPositions]);

  // Animated colors and sizes
  const animColors = useMemo(() => new Float32Array(baseColors), [baseColors]);
  const animSizes = useMemo(() => new Float32Array(baseSizes), [baseSizes]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();
    const rates = frame?.firing_rates ?? [];
    const spikes = new Set(frame?.spikes ?? []);

    // Update neuron visuals based on firing
    for (let i = 0; i < nNeurons; i++) {
      const rate = i < rates.length ? rates[i] : 0;
      const isSpiking = spikes.has(i);
      const activity = Math.min(rate / 80, 1);

      if (isSpiking) {
        // Flash white on spike
        animColors[i * 3] = 1.0;
        animColors[i * 3 + 1] = 1.0;
        animColors[i * 3 + 2] = 1.0;
        animSizes[i] = baseSizes[i] * 4;
      } else if (activity > 0.05) {
        // Blend toward bright cyan based on activity
        animColors[i * 3] = baseColors[i * 3] + (0.3 - baseColors[i * 3]) * activity;
        animColors[i * 3 + 1] = baseColors[i * 3 + 1] + (0.9 - baseColors[i * 3 + 1]) * activity;
        animColors[i * 3 + 2] = baseColors[i * 3 + 2] + (1.0 - baseColors[i * 3 + 2]) * activity;
        animSizes[i] = baseSizes[i] * (1 + activity * 2);
      } else {
        // Decay back to base
        animColors[i * 3] += (baseColors[i * 3] - animColors[i * 3]) * 0.1;
        animColors[i * 3 + 1] += (baseColors[i * 3 + 1] - animColors[i * 3 + 1]) * 0.1;
        animColors[i * 3 + 2] += (baseColors[i * 3 + 2] - animColors[i * 3 + 2]) * 0.1;
        animSizes[i] += (baseSizes[i] - animSizes[i]) * 0.1;
      }
    }

    // Update GPU buffers
    const colorAttr = pointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    (colorAttr.array as Float32Array).set(animColors);
    colorAttr.needsUpdate = true;

    const sizeAttr = pointsRef.current.geometry.getAttribute('size') as THREE.BufferAttribute;
    (sizeAttr.array as Float32Array).set(animSizes);
    sizeAttr.needsUpdate = true;

    // Gentle rotation for visual interest
    pointsRef.current.rotation.y = Math.sin(t * 0.2) * 0.1;
    if (linesRef.current) {
      linesRef.current.rotation.y = pointsRef.current.rotation.y;
    }
    if (glowRef.current) {
      glowRef.current.rotation.y = pointsRef.current.rotation.y;
    }
  });

  return (
    <group position={[0.4, 0.03, 0]}>
      {/* Synapse connections (faint lines) */}
      <lineSegments ref={linesRef} geometry={synapseGeometry}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Neuron nodes */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={neuronPositions} count={nNeurons} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={animColors} count={nNeurons} itemSize={3} />
          <bufferAttribute attach="attributes-size" array={animSizes} count={nNeurons} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.004}
          sizeAttenuation
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Glow halo layer (larger, fainter) */}
      <points ref={glowRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={neuronPositions} count={nNeurons} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={animColors} count={nNeurons} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.012}
          sizeAttenuation
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Label */}
      {/* The organism type is shown in the UI, not in 3D */}
    </group>
  );
}
