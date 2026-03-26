import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Spike propagation visualization with cascade particles.
 *
 * Two layers of particles:
 * 1. Burst particles — the original "fireworks" at neuron spike locations
 * 2. Cascade particles — glowing dots that travel along synapse edges
 *    from pre-synaptic to post-synaptic neurons, colored by
 *    neurotransmitter type (ACh=cyan, GABA=magenta, glutamate=green)
 *
 * Cascade particles use the connectome-graph.json edge data to know
 * which neurons connect to which, and lerp from source to target
 * position over ~200ms per synapse.
 */

// --- Burst particles (original spike location effects) ---
const MAX_BURST = 2000;
const BURST_LIFETIME = 0.6;

// --- Cascade particles (signal propagation along synapses) ---
const MAX_CASCADE = 1000;
const CASCADE_TRAVEL_TIME = 0.3; // 300ms per synapse hop — longer trails
const MAX_SPIKES_PER_FRAME = 40; // cap to avoid flooding
const MAX_EDGES_PER_SPIKE = 8;  // top N strongest outgoing edges

interface BurstParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  age: number;
  alive: boolean;
}

interface CascadeParticle {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  baseSize: number; // larger for stronger synapses
  age: number;
  lifetime: number; // CASCADE_TRAVEL_TIME
  alive: boolean;
}

interface ConnectomeEdge {
  pre: string;
  post: string;
  weight: number;
  type: string;
}

interface ConnectomeNode {
  id: string;
  type: string;
  nt: string;
  x: number;
  y: number;
  z: number;
}

// Neurotransmitter-based colors for cascade particles (refined palette)
const NT_COLORS: Record<string, THREE.Color> = {
  Acetylcholine: new THREE.Color(0.1, 0.8, 1.0),   // cyan
  GABA:          new THREE.Color(0.8, 0.15, 0.7),   // magenta
  Glutamate:     new THREE.Color(0.2, 0.9, 0.3),    // green
  Serotonin:     new THREE.Color(0.9, 0.7, 0.2),    // warm yellow
  Dopamine:      new THREE.Color(1.0, 0.45, 0.1),   // orange
};
const NT_DEFAULT_COLOR = new THREE.Color(0.8, 0.8, 1.0); // white-blue

// Burst colors by neuron type
const TYPE_BURST_COLORS: Record<string, THREE.Color> = {
  sensory: new THREE.Color(0.3, 1.2, 0.6),
  inter:   new THREE.Color(0.4, 0.8, 1.5),
  motor:   new THREE.Color(1.4, 0.4, 0.25),
  unknown: new THREE.Color(0.6, 0.6, 0.8),
};

/**
 * Pre-builds an adjacency map: neuronId -> sorted outgoing edges (strongest first).
 * Only keeps the top MAX_EDGES_PER_SPIKE per source to bound work at emit time.
 */
function buildAdjacency(edges: ConnectomeEdge[]): Map<string, ConnectomeEdge[]> {
  const adj = new Map<string, ConnectomeEdge[]>();
  for (const e of edges) {
    let list = adj.get(e.pre);
    if (!list) { list = []; adj.set(e.pre, list); }
    list.push(e);
  }
  // Sort descending by weight, keep top N
  for (const [id, list] of adj) {
    list.sort((a, b) => b.weight - a.weight);
    if (list.length > MAX_EDGES_PER_SPIKE) {
      adj.set(id, list.slice(0, MAX_EDGES_PER_SPIKE));
    }
  }
  return adj;
}

export function SpikeParticles() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);

  // Refs for the two Points objects
  const burstRef = useRef<THREE.Points>(null);
  const cascadeRef = useRef<THREE.Points>(null);

  // --- Neuron data loaded from static JSON files ---
  const [neuronData, setNeuronData] = useState<{
    positions: Record<number, [number, number, number]>;
    types: Record<number, string>;
    idByIndex: string[];  // spike index -> neuron ID string
  } | null>(null);

  // --- Connectome graph: node positions + adjacency ---
  const [connectome, setConnectome] = useState<{
    nodePos: Map<string, THREE.Vector3>;
    nodeNt: Map<string, string>;
    adjacency: Map<string, ConnectomeEdge[]>;
  } | null>(null);

  // --- Burst particle pool ---
  const burstParticles = useRef<BurstParticle[]>(
    Array.from({ length: MAX_BURST }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(),
      age: 0,
      alive: false,
    }))
  );
  const nextBurst = useRef(0);

  // --- Cascade particle pool ---
  const cascadeParticles = useRef<CascadeParticle[]>(
    Array.from({ length: MAX_CASCADE }, () => ({
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      color: new THREE.Color(),
      baseSize: 0.003,
      age: 0,
      lifetime: CASCADE_TRAVEL_TIME,
      alive: false,
    }))
  );
  const nextCascade = useRef(0);

  const lastSpikes = useRef<Set<number>>(new Set());

  // ---- Load neuron positions & types (same logic as before) ----
  useEffect(() => {
    if (!experiment) return;
    const base = import.meta.env.BASE_URL || '/';

    Promise.all([
      fetch('/api/neurons/positions').catch(() => fetch(`${base}neuron-positions.json`)).then(r => r.json()),
      fetch(`${base}neuron-types.json`).then(r => r.json()).catch(() => ({})),
    ]).then(([posData, typeData]) => {
      if (!posData || typeof posData !== 'object') {
        console.warn('[SpikeParticles] neuron position data is missing or malformed, skipping');
        return;
      }

      const positions: Record<number, [number, number, number]> = {};
      const types: Record<number, string> = {};
      const idByIndex: string[] = [];
      const neuronIds = Object.keys(posData);

      const yMin = -320, yMax = 420;
      neuronIds.forEach((nid, idx) => {
        const raw = posData[nid];
        if (!Array.isArray(raw) || raw.length < 3) return; // skip malformed entries
        const [nx, ny, nz] = raw;
        if (typeof nx !== 'number' || typeof ny !== 'number' || typeof nz !== 'number') return;
        const bodyFrac = (ny - yMin) / (yMax - yMin);
        const x = bodyFrac * 0.88;
        const y = nz * 0.0003 + 0.015;
        const z = -nx * 0.0003;
        positions[idx] = [x, y, z];
        types[idx] = typeData[nid]?.type || 'unknown';
        idByIndex[idx] = nid;
      });

      setNeuronData({ positions, types, idByIndex });
    }).catch((e) => {
      console.warn('[SpikeParticles] Failed to load neuron position/type data:', e);
    });
  }, [experiment]);

  // ---- Load connectome graph for cascade routing ----
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}connectome-graph.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { nodes: ConnectomeNode[]; edges: ConnectomeEdge[] }) => {
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          console.warn('[SpikeParticles] connectome-graph.json has unexpected shape, cascade disabled');
          return;
        }
        const nodePos = new Map<string, THREE.Vector3>();
        const nodeNt = new Map<string, string>();
        for (const n of data.nodes) {
          if (!n.id || typeof n.x !== 'number' || typeof n.y !== 'number' || typeof n.z !== 'number') continue;
          // Use the pre-computed x/y/z from the graph (already in scene coords)
          nodePos.set(n.id, new THREE.Vector3(n.x, n.y, n.z));
          nodeNt.set(n.id, n.nt || '');
        }
        const adjacency = buildAdjacency(data.edges);
        setConnectome({ nodePos, nodeNt, adjacency });
      })
      .catch((e) => {
        console.warn('[SpikeParticles] Failed to load connectome-graph.json — cascade particles disabled:', e);
      });
  }, []);

  // ---- GPU buffer arrays ----
  const burstPosArr = useMemo(() => new Float32Array(MAX_BURST * 3), []);
  const burstColArr = useMemo(() => new Float32Array(MAX_BURST * 3), []);
  const burstSizeArr = useMemo(() => new Float32Array(MAX_BURST), []);

  const cascadePosArr = useMemo(() => new Float32Array(MAX_CASCADE * 3), []);
  const cascadeColArr = useMemo(() => new Float32Array(MAX_CASCADE * 3), []);
  const cascadeSizeArr = useMemo(() => new Float32Array(MAX_CASCADE), []);

  // Temp vector for lerp calculations (avoid allocation per frame)
  const _tmpVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!frame || !neuronData) return;

    // ===== Spawn burst + cascade particles for new spikes =====
    const currentSpikes = new Set(frame.spikes);
    let spikeCount = 0;

    for (const spikeIdx of currentSpikes) {
      if (lastSpikes.current.has(spikeIdx)) continue;
      if (spikeCount >= MAX_SPIKES_PER_FRAME) break;

      // Bounds-check: skip invalid spike indices
      if (typeof spikeIdx !== 'number' || spikeIdx < 0 || !Number.isFinite(spikeIdx)) continue;

      spikeCount++;

      const pos = neuronData.positions[spikeIdx];
      if (!pos) continue;

      const type = neuronData.types[spikeIdx] || 'unknown';
      const burstColor = TYPE_BURST_COLORS[type] || TYPE_BURST_COLORS.unknown;

      // --- Burst particles (2-3 per spike) ---
      const bCount = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < bCount; j++) {
        const p = burstParticles.current[nextBurst.current % MAX_BURST];
        p.position.set(pos[0], pos[1], pos[2]);
        p.velocity.set(
          (Math.random() - 0.5) * 0.025,
          Math.random() * 0.02 + 0.01,
          (Math.random() - 0.5) * 0.025,
        );
        p.color.copy(burstColor);
        p.age = 0;
        p.alive = true;
        nextBurst.current++;
      }

      // --- Cascade particles along outgoing synapses ---
      if (connectome) {
        const neuronId = neuronData.idByIndex[spikeIdx];
        if (!neuronId) continue;
        const outEdges = connectome.adjacency.get(neuronId);
        if (!outEdges) continue;

        const srcPos = connectome.nodePos.get(neuronId);
        if (!srcPos) continue;

        for (const edge of outEdges) {
          const tgtPos = connectome.nodePos.get(edge.post);
          if (!tgtPos) continue;

          const cp = cascadeParticles.current[nextCascade.current % MAX_CASCADE];
          cp.from.copy(srcPos);
          cp.to.copy(tgtPos);

          // Color by neurotransmitter of the pre-synaptic neuron
          const nt = connectome.nodeNt.get(neuronId) || '';
          cp.color.copy(NT_COLORS[nt] || NT_DEFAULT_COLOR);

          // Stronger synapses = larger particles (weight typically 1-40+)
          const normWeight = Math.min(edge.weight / 30, 1);
          cp.baseSize = 0.004 + normWeight * 0.006; // range 0.004 - 0.010

          cp.age = 0;
          cp.lifetime = CASCADE_TRAVEL_TIME;
          cp.alive = true;
          nextCascade.current++;
        }
      }
    }
    lastSpikes.current = currentSpikes;

    // ===== Update burst particles =====
    if (burstRef.current) {
      for (let i = 0; i < MAX_BURST; i++) {
        const p = burstParticles.current[i];
        if (!p.alive) {
          burstSizeArr[i] = 0;
          continue;
        }
        p.age += delta;
        if (p.age > BURST_LIFETIME) {
          p.alive = false;
          burstSizeArr[i] = 0;
          continue;
        }

        p.position.addScaledVector(p.velocity, delta);
        p.velocity.y += delta * 0.005;
        p.velocity.x *= 0.98;
        p.velocity.z *= 0.98;

        const life = 1 - p.age / BURST_LIFETIME;
        const fade = life * Math.sqrt(life);

        burstPosArr[i * 3]     = p.position.x;
        burstPosArr[i * 3 + 1] = p.position.y;
        burstPosArr[i * 3 + 2] = p.position.z;

        burstColArr[i * 3]     = p.color.r * fade * 2.0;
        burstColArr[i * 3 + 1] = p.color.g * fade * 2.0;
        burstColArr[i * 3 + 2] = p.color.b * fade * 2.0;

        burstSizeArr[i] = 0.014 * fade;
      }

      const geo = burstRef.current.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    }

    // ===== Update cascade particles =====
    if (cascadeRef.current) {
      for (let i = 0; i < MAX_CASCADE; i++) {
        const cp = cascadeParticles.current[i];
        if (!cp.alive) {
          cascadeSizeArr[i] = 0;
          continue;
        }
        cp.age += delta;
        if (cp.age > cp.lifetime) {
          cp.alive = false;
          cascadeSizeArr[i] = 0;
          continue;
        }

        // Lerp position from source to target
        const t = cp.age / cp.lifetime;
        _tmpVec.lerpVectors(cp.from, cp.to, t);

        // Slight upward arc for visual flair: parabolic offset peaking at t=0.5
        const arc = 4 * t * (1 - t) * 0.004;
        _tmpVec.y += arc;

        cascadePosArr[i * 3]     = _tmpVec.x;
        cascadePosArr[i * 3 + 1] = _tmpVec.y;
        cascadePosArr[i * 3 + 2] = _tmpVec.z;

        // Fade: bright at start, fade toward end (trail-like feel)
        // Peak brightness at t~0.15, then fade out
        const fadeCurve = t < 0.15
          ? t / 0.15
          : 1.0 - ((t - 0.15) / 0.85) * ((t - 0.15) / 0.85);
        const brightness = Math.max(fadeCurve, 0) * 2.5;

        cascadeColArr[i * 3]     = cp.color.r * brightness;
        cascadeColArr[i * 3 + 1] = cp.color.g * brightness;
        cascadeColArr[i * 3 + 2] = cp.color.b * brightness;

        // Size pulses slightly during travel, with motion trail stretch
        // during mid-travel (t=0.3-0.7) particles expand to 2x for streak effect
        const sizePulse = 1.0 + 0.3 * Math.sin(t * Math.PI);
        const trailStretch = (t >= 0.3 && t <= 0.7) ? 2.0 : 1.0;
        cascadeSizeArr[i] = cp.baseSize * sizePulse * trailStretch * (1 - t * 0.4);
      }

      const geo = cascadeRef.current.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Burst particles — spike location fireworks */}
      <points ref={burstRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={burstPosArr} count={MAX_BURST} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={burstColArr} count={MAX_BURST} itemSize={3} />
          <bufferAttribute attach="attributes-size" array={burstSizeArr} count={MAX_BURST} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          sizeAttenuation
          transparent
          opacity={1.0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          size={0.014}
        />
      </points>

      {/* Cascade particles — signal propagation along synapses */}
      <points ref={cascadeRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={cascadePosArr} count={MAX_CASCADE} itemSize={3} />
          <bufferAttribute attach="attributes-color" array={cascadeColArr} count={MAX_CASCADE} itemSize={3} />
          <bufferAttribute attach="attributes-size" array={cascadeSizeArr} count={MAX_CASCADE} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          size={0.015}
        />
      </points>
    </group>
  );
}
