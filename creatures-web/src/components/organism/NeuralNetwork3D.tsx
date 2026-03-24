import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D visualization of actual neuron positions from OpenWorm NeuroML data.
 * Each neuron rendered as a point/sphere, colored by type and activity.
 * Positions are real 3D coordinates from the C. elegans body.
 */

interface NeuronPos {
  id: string;
  position: [number, number, number];
}

const TYPE_COLORS: Record<string, THREE.Color> = {
  sensory: new THREE.Color(0.1, 0.8, 0.4),  // green
  inter: new THREE.Color(0.2, 0.5, 1.0),    // blue
  motor: new THREE.Color(1.0, 0.3, 0.2),    // red
  unknown: new THREE.Color(0.4, 0.4, 0.5),  // gray
};

export function NeuralNetwork3D() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const [neurons, setNeurons] = useState<NeuronPos[]>([]);
  const [neuronTypes, setNeuronTypes] = useState<Record<string, string>>({});
  const pointsRef = useRef<THREE.Points>(null);

  // Fetch neuron positions from API
  useEffect(() => {
    if (!experiment || experiment.organism !== 'c_elegans') return;

    fetch('/api/neurons/positions')
      .then(r => r.json())
      .then((data: Record<string, [number, number, number]>) => {
        const entries = Object.entries(data).map(([id, pos]) => ({ id, position: pos }));
        setNeurons(entries);
      })
      .catch(() => {});

    // Also fetch neuron info for types
    fetch(`/api/neurons/${experiment.id}/info`)
      .then(r => r.json())
      .then((data: Array<{ id: string; type: string }>) => {
        const types: Record<string, string> = {};
        data.forEach(n => { types[n.id] = n.type; });
        setNeuronTypes(types);
      })
      .catch(() => {});
  }, [experiment]);

  // Build geometry from neuron positions
  const { positions, colors, baseColors } = useMemo(() => {
    if (neurons.length === 0) return { positions: null, colors: null, baseColors: null };

    const pos = new Float32Array(neurons.length * 3);
    const col = new Float32Array(neurons.length * 3);
    const baseCols = new Float32Array(neurons.length * 3);

    // The worm body in MuJoCo spans roughly x=0 to x=0.88
    // NeuroML positions: Y ranges -311 to 410 (head to tail along body axis)
    // We need to map NeuroML coords to match the MuJoCo body position
    const yMin = -320, yMax = 420;
    const bodyStart = 0.0, bodyEnd = 0.88;

    for (let i = 0; i < neurons.length; i++) {
      const [nx, ny, nz] = neurons[i].position;
      // Map NeuroML Y → MuJoCo X (body axis), NeuroML X,Z → MuJoCo Y,Z (lateral/dorsal)
      const bodyFrac = (ny - yMin) / (yMax - yMin);
      const x = bodyStart + bodyFrac * (bodyEnd - bodyStart);
      const y = nz * 0.0003 + 0.015; // slight offset above body center
      const z = -nx * 0.0003;

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const type = neuronTypes[neurons[i].id] || 'unknown';
      const tc = TYPE_COLORS[type] || TYPE_COLORS.unknown;
      baseCols[i * 3] = tc.r;
      baseCols[i * 3 + 1] = tc.g;
      baseCols[i * 3 + 2] = tc.b;

      col[i * 3] = tc.r * 0.3;
      col[i * 3 + 1] = tc.g * 0.3;
      col[i * 3 + 2] = tc.b * 0.3;
    }

    return { positions: pos, colors: col, baseColors: baseCols };
  }, [neurons, neuronTypes]);

  // Animate colors based on firing rates
  useFrame(() => {
    if (!pointsRef.current || !frame?.firing_rates || !colors || !baseColors) return;

    const geo = pointsRef.current.geometry;
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    const rates = frame.firing_rates;
    const arr = colorAttr.array as Float32Array;

    for (let i = 0; i < Math.min(neurons.length, rates.length); i++) {
      const rate = rates[i];
      const intensity = Math.min(rate / 100, 1);

      if (intensity > 0.01) {
        // Active: brighten toward white
        arr[i * 3] = baseColors[i * 3] + (1 - baseColors[i * 3]) * intensity;
        arr[i * 3 + 1] = baseColors[i * 3 + 1] + (1 - baseColors[i * 3 + 1]) * intensity;
        arr[i * 3 + 2] = baseColors[i * 3 + 2] + (1 - baseColors[i * 3 + 2]) * intensity;
      } else {
        // Silent: dim base color
        arr[i * 3] = baseColors[i * 3] * 0.25;
        arr[i * 3 + 1] = baseColors[i * 3 + 1] * 0.25;
        arr[i * 3 + 2] = baseColors[i * 3 + 2] * 0.25;
      }
    }
    colorAttr.needsUpdate = true;
  });

  if (!positions || !colors || neurons.length === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={neurons.length}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={neurons.length}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={0.003}
        sizeAttenuation
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
