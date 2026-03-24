import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D visualization of actual neuron positions from OpenWorm NeuroML data.
 * Each neuron rendered as a point, colored by type and activity.
 * Active neurons glow dramatically with halo rings.
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
  const haloRef = useRef<THREE.Points>(null);

  // Fetch neuron positions — API first, fall back to static file
  useEffect(() => {
    if (!experiment) return;

    const base = import.meta.env.BASE_URL || '/';

    // Positions
    fetch('/api/neurons/positions')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch(`${base}neuron-positions.json`).then(r => r.json()))
      .then((data: Record<string, [number, number, number]>) => {
        const entries = Object.entries(data).map(([id, pos]) => ({ id, position: pos }));
        setNeurons(entries);
      })
      .catch(e => console.warn('Failed to load neuron positions:', e));

    // Types — API first, fall back to static
    fetch(`/api/neurons/${experiment.id}/info`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Array<{ id: string; type: string }>) => {
        const types: Record<string, string> = {};
        data.forEach(n => { types[n.id] = n.type; });
        setNeuronTypes(types);
      })
      .catch(() => {
        fetch(`${base}neuron-types.json`)
          .then(r => r.json())
          .then((data: Record<string, { type: string }>) => {
            const types: Record<string, string> = {};
            Object.entries(data).forEach(([id, info]) => { types[id] = info.type; });
            setNeuronTypes(types);
          })
          .catch(() => {});
      });
  }, [experiment]);

  // Build geometry from neuron positions
  const { positions, colors, baseColors, haloPositions, haloColors } = useMemo(() => {
    if (neurons.length === 0) return { positions: null, colors: null, baseColors: null, haloPositions: null, haloColors: null };

    const pos = new Float32Array(neurons.length * 3);
    const col = new Float32Array(neurons.length * 3);
    const baseCols = new Float32Array(neurons.length * 3);
    // Halo uses same positions, separate colors
    const hPos = new Float32Array(neurons.length * 3);
    const hCol = new Float32Array(neurons.length * 3);

    const yMin = -320, yMax = 420;
    const bodyStart = 0.0, bodyEnd = 0.88;

    for (let i = 0; i < neurons.length; i++) {
      const [nx, ny, nz] = neurons[i].position;
      const bodyFrac = (ny - yMin) / (yMax - yMin);
      const x = bodyStart + bodyFrac * (bodyEnd - bodyStart);
      const y = nz * 0.0003 + 0.015;
      const z = -nx * 0.0003;

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      hPos[i * 3] = x;
      hPos[i * 3 + 1] = y;
      hPos[i * 3 + 2] = z;

      const type = neuronTypes[neurons[i].id] || 'unknown';
      const tc = TYPE_COLORS[type] || TYPE_COLORS.unknown;
      baseCols[i * 3] = tc.r;
      baseCols[i * 3 + 1] = tc.g;
      baseCols[i * 3 + 2] = tc.b;

      // Start dim
      col[i * 3] = tc.r * 0.25;
      col[i * 3 + 1] = tc.g * 0.25;
      col[i * 3 + 2] = tc.b * 0.25;

      // Halo starts invisible
      hCol[i * 3] = 0;
      hCol[i * 3 + 1] = 0;
      hCol[i * 3 + 2] = 0;
    }

    return { positions: pos, colors: col, baseColors: baseCols, haloPositions: hPos, haloColors: hCol };
  }, [neurons, neuronTypes]);

  // Animate colors based on firing rates + spikes
  useFrame(() => {
    if (!pointsRef.current || !frame?.firing_rates || !colors || !baseColors) return;

    const geo = pointsRef.current.geometry;
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    const rates = frame.firing_rates;
    const spikes = new Set(frame.spikes ?? []);
    const arr = colorAttr.array as Float32Array;

    // Halo layer
    const haloGeo = haloRef.current?.geometry;
    const haloColorAttr = haloGeo?.getAttribute('color') as THREE.BufferAttribute | undefined;
    const hArr = haloColorAttr?.array as Float32Array | undefined;

    for (let i = 0; i < Math.min(neurons.length, rates.length); i++) {
      const rate = rates[i];
      const intensity = Math.min(rate / 80, 1); // more sensitive threshold
      const isSpiking = spikes.has(i);

      // Spike flash: immediate 3-5x brightness boost
      const spikeFlash = isSpiking ? 2.5 : 0;

      if (intensity > 0.02 || isSpiking) {
        // Active: dramatically brighter
        const boost = 0.3 + intensity * 1.2 + spikeFlash;
        arr[i * 3] = Math.min(baseColors[i * 3] * boost + intensity * 0.6, 3.0);
        arr[i * 3 + 1] = Math.min(baseColors[i * 3 + 1] * boost + intensity * 0.6, 3.0);
        arr[i * 3 + 2] = Math.min(baseColors[i * 3 + 2] * boost + intensity * 0.6, 3.0);

        // Halo: visible for active neurons
        if (hArr) {
          const haloIntensity = (intensity * 0.4 + (isSpiking ? 0.8 : 0)) * 0.5;
          hArr[i * 3] = baseColors[i * 3] * haloIntensity;
          hArr[i * 3 + 1] = baseColors[i * 3 + 1] * haloIntensity;
          hArr[i * 3 + 2] = baseColors[i * 3 + 2] * haloIntensity;
        }
      } else {
        // Silent: visible but dim
        arr[i * 3] = baseColors[i * 3] * 0.25;
        arr[i * 3 + 1] = baseColors[i * 3 + 1] * 0.25;
        arr[i * 3 + 2] = baseColors[i * 3 + 2] * 0.25;

        if (hArr) {
          hArr[i * 3] = 0;
          hArr[i * 3 + 1] = 0;
          hArr[i * 3 + 2] = 0;
        }
      }
    }
    colorAttr.needsUpdate = true;
    if (haloColorAttr) haloColorAttr.needsUpdate = true;
  });

  if (!positions || !colors || neurons.length === 0) return null;

  return (
    <group>
      {/* Main neuron points — larger and more visible */}
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
          size={0.012}
          sizeAttenuation
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Halo layer — larger, softer, only visible when active */}
      {haloPositions && haloColors && (
        <points ref={haloRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={haloPositions}
              count={neurons.length}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              array={haloColors}
              count={neurons.length}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            vertexColors
            size={0.028}
            sizeAttenuation
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}
