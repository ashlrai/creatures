import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D visualization of actual neuron positions from OpenWorm NeuroML data.
 * Each neuron rendered as a point, colored by type and activity.
 * Active neurons glow dramatically with halo rings.
 * Positions are real 3D coordinates from the C. elegans body.
 *
 * Hover over a neuron point to see its name, type, firing rate, and
 * neurotransmitter in a tooltip (rendered in App.tsx via simulationStore).
 */

interface NeuronPos {
  id: string;
  position: [number, number, number];
}

export interface NeuronTypeInfo {
  type: string;
  nt: string | null;
}

// Well-known gene expression for key mechanosensory / command neurons.
// Used as a fallback when the /api/neurons/{id}/genes endpoint is unavailable.
const HARDCODED_GENES: Record<string, string[]> = {
  PLML: ['mec-4', 'mec-10', 'mec-2', 'mec-6'],
  PLMR: ['mec-4', 'mec-10', 'mec-2', 'mec-6'],
  ALML: ['mec-4', 'mec-10', 'mec-2', 'mec-6'],
  ALMR: ['mec-4', 'mec-10', 'mec-2', 'mec-6'],
  AVM:  ['mec-4', 'mec-10', 'mec-2'],
  PVM:  ['mec-4', 'mec-10'],
  AVAL: ['glr-1', 'nmr-1', 'unc-8'],
  AVAR: ['glr-1', 'nmr-1', 'unc-8'],
  AVBL: ['glr-1', 'nmr-1'],
  AVBR: ['glr-1', 'nmr-1'],
  AVDL: ['glr-1', 'nmr-1'],
  AVDR: ['glr-1', 'nmr-1'],
  AVEL: ['glr-1'],
  AVER: ['glr-1'],
  ASHL: ['osm-9', 'ocr-2'],
  ASHR: ['osm-9', 'ocr-2'],
  ADEL: ['dat-1', 'cat-2'],
  ADER: ['dat-1', 'cat-2'],
};

/** Procedural soft-circle texture for neuron points (avoids square artifacts). */
function makeCircleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const circleTexture = makeCircleTexture();

const TYPE_COLORS: Record<string, THREE.Color> = {
  sensory: new THREE.Color(0.1, 0.8, 0.4),  // green
  inter: new THREE.Color(0.2, 0.5, 1.0),    // blue
  motor: new THREE.Color(1.0, 0.3, 0.2),    // red
  unknown: new THREE.Color(0.4, 0.4, 0.5),  // gray
};

export function NeuralNetwork3D() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const setHoveredNeuron = useSimulationStore((s) => s.setHoveredNeuron);
  const [neurons, setNeurons] = useState<NeuronPos[]>([]);
  const [neuronTypes, setNeuronTypes] = useState<Record<string, string>>({});
  const [neuronFullInfo, setNeuronFullInfo] = useState<Record<string, NeuronTypeInfo>>({});
  const [geneCache, setGeneCache] = useState<Record<string, string[]>>({});
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
        if (!data || typeof data !== 'object') {
          console.warn('[NeuralNetwork3D] neuron position data is missing or malformed');
          return;
        }
        const entries: NeuronPos[] = [];
        for (const [id, pos] of Object.entries(data)) {
          if (!Array.isArray(pos) || pos.length < 3) continue;
          if (typeof pos[0] !== 'number' || typeof pos[1] !== 'number' || typeof pos[2] !== 'number') continue;
          entries.push({ id, position: pos as [number, number, number] });
        }
        if (entries.length === 0) {
          console.warn('[NeuralNetwork3D] no valid neuron positions found in data');
        }
        setNeurons(entries);
      })
      .catch(e => console.warn('[NeuralNetwork3D] Failed to load neuron positions:', e));

    // Types — API first, fall back to static
    fetch(`/api/neurons/${experiment.id}/info`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Array<{ id: string; type: string }>) => {
        if (!Array.isArray(data)) {
          console.warn('[NeuralNetwork3D] neuron type API returned non-array');
          return;
        }
        const types: Record<string, string> = {};
        data.forEach(n => { if (n?.id) types[n.id] = n.type || 'unknown'; });
        setNeuronTypes(types);
      })
      .catch(() => {
        fetch(`${base}neuron-types.json`)
          .then(r => r.json())
          .then((data: Record<string, { type: string; nt?: string | null }>) => {
            if (!data || typeof data !== 'object') {
              console.warn('[NeuralNetwork3D] neuron-types.json is malformed');
              return;
            }
            const types: Record<string, string> = {};
            const fullInfo: Record<string, NeuronTypeInfo> = {};
            Object.entries(data).forEach(([id, info]) => {
              if (!info || typeof info !== 'object') return;
              types[id] = info.type || 'unknown';
              fullInfo[id] = { type: info.type || 'unknown', nt: info.nt ?? null };
            });
            setNeuronTypes(types);
            setNeuronFullInfo(fullInfo);
          })
          .catch((e) => {
            console.warn('[NeuralNetwork3D] Failed to load neuron types:', e);
          });
      });
  }, [experiment]);

  // Fetch gene data for a neuron (with caching)
  const fetchGenes = useCallback((neuronId: string) => {
    if (geneCache[neuronId] !== undefined) return;

    // Mark as loading to avoid duplicate fetches
    setGeneCache(prev => ({ ...prev, [neuronId]: [] }));

    fetch(`/api/neurons/${neuronId}/genes`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { genes: string[] }) => {
        setGeneCache(prev => ({ ...prev, [neuronId]: data.genes }));
      })
      .catch(() => {
        // Fall back to hardcoded data
        const hardcoded = HARDCODED_GENES[neuronId];
        if (hardcoded) {
          setGeneCache(prev => ({ ...prev, [neuronId]: hardcoded }));
        }
      });
  }, [geneCache]);

  // Handle pointer move over neuron points — raycasting is handled by R3F
  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    // R3F provides the intersection index for Points geometry
    const index = event.index;
    if (index === undefined || index < 0 || index >= neurons.length) {
      setHoveredNeuron(null);
      return;
    }

    const neuron = neurons[index];
    const info = neuronFullInfo[neuron.id];
    const type = info?.type ?? neuronTypes[neuron.id] ?? 'unknown';
    const nt = info?.nt ?? null;

    // Get current firing rate from the frame
    const firingRate = frame?.firing_rates?.[index] ?? 0;

    // Kick off gene data fetch for this neuron
    fetchGenes(neuron.id);

    setHoveredNeuron({
      id: neuron.id,
      type,
      nt,
      firingRate,
      mouseX: event.nativeEvent.clientX,
      mouseY: event.nativeEvent.clientY,
    });
  }, [neurons, neuronFullInfo, neuronTypes, frame, setHoveredNeuron, fetchGenes]);

  const handlePointerLeave = useCallback(() => {
    setHoveredNeuron(null);
  }, [setHoveredNeuron]);

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

  // Cache spike set to avoid allocation every frame
  const spikeSetRef = useRef(new Set<number>());

  // Change-detection refs — typed arrays for lightweight per-neuron tracking.
  // Previous firing rates and spike flags let us skip neurons whose visual
  // output hasn't meaningfully changed, avoiding a full GPU buffer upload
  // every frame.
  const prevRatesRef = useRef<Float32Array | null>(null);
  const prevSpikesRef = useRef<Uint8Array | null>(null);

  // Animate colors based on firing rates + spikes
  useFrame(() => {
    if (!pointsRef.current || !frame?.firing_rates || !colors || !baseColors) return;

    const geo = pointsRef.current.geometry;
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    const rates = frame.firing_rates;
    const count = Math.min(neurons.length, rates.length);

    // Build spike lookup
    const spikeSet = spikeSetRef.current;
    spikeSet.clear();
    if (frame.spikes) {
      for (const s of frame.spikes) {
        // Bounds-check: only add valid indices within neuron range
        if (typeof s === 'number' && s >= 0 && s < neurons.length) spikeSet.add(s);
      }
    }

    // Lazily allocate / resize change-detection buffers
    if (!prevRatesRef.current || prevRatesRef.current.length < count) {
      prevRatesRef.current = new Float32Array(count);
      // Fill with -1 so every neuron is "dirty" on the first frame
      prevRatesRef.current.fill(-1);
    }
    if (!prevSpikesRef.current || prevSpikesRef.current.length < count) {
      prevSpikesRef.current = new Uint8Array(count);
    }

    const prevRates = prevRatesRef.current;
    const prevSpikes = prevSpikesRef.current;
    const arr = colorAttr.array as Float32Array;

    // Halo layer
    const haloGeo = haloRef.current?.geometry;
    const haloColorAttr = haloGeo?.getAttribute('color') as THREE.BufferAttribute | undefined;
    const hArr = haloColorAttr?.array as Float32Array | undefined;

    let dirty = false;

    for (let i = 0; i < count; i++) {
      const rate = rates[i];
      const isSpiking = spikeSet.has(i) ? 1 : 0;

      // Change detection: skip if rate moved <5% AND spike state is the same
      const prevRate = prevRates[i];
      const rateDelta = rate - prevRate;
      // Absolute threshold avoids division; 5% of 80 (max visual range) = 4.0
      // but we also care about relative change on small values, so use the
      // larger of an absolute band (0.5) and 5% of the previous value.
      const threshold = prevRate > 10 ? prevRate * 0.05 : 0.5;
      if (
        (rateDelta < threshold && rateDelta > -threshold) &&
        isSpiking === prevSpikes[i]
      ) {
        continue;
      }

      // Neuron changed — update cached state
      prevRates[i] = rate;
      prevSpikes[i] = isSpiking as 0 | 1;
      dirty = true;

      const intensity = Math.min(rate / 80, 1); // more sensitive threshold

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

    // Only trigger GPU buffer upload when at least one neuron visually changed
    if (dirty) {
      colorAttr.needsUpdate = true;
      if (haloColorAttr) haloColorAttr.needsUpdate = true;
    }
  });

  if (!positions || !colors || neurons.length === 0) return null;

  return (
    <group>
      {/* Main neuron points — larger and more visible */}
      <points
        ref={pointsRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
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
          map={circleTexture}
          alphaMap={circleTexture}
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
            map={circleTexture}
            alphaMap={circleTexture}
          />
        </points>
      )}
    </group>
  );
}

/** Gene cache exposed for the tooltip to read */
export { HARDCODED_GENES };
