import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConnectomeNode {
  id: string;
  type: 'sensory' | 'inter' | 'motor';
  nt: string | null;
  x: number;
  y: number;
  z: number;
}

interface ConnectomeEdge {
  pre: string;
  post: string;
  weight: number;
  type: string;
}

interface ConnectomeGraph {
  nodes: ConnectomeNode[];
  edges: ConnectomeEdge[];
  n_neurons: number;
  n_edges: number;
}

interface NeuronTypeInfo {
  type: string;
  nt: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  sensory: new THREE.Color('#00ff88'),
  inter: new THREE.Color('#2288ff'),
  motor: new THREE.Color('#ff4444'),
} as const;

const TYPE_COLORS_HEX: Record<string, string> = {
  sensory: '#00ff88',
  inter: '#2288ff',
  motor: '#ff4444',
};

const DIM_COLOR = new THREE.Color('#222233');
const WHITE = new THREE.Color('#ffffff');
const CYAN_SELECT = new THREE.Color('#00ddff');
const EDGE_REST = new THREE.Color('#1a2233');
const EDGE_EXCITATORY = new THREE.Color('#ff8844');
const EDGE_INHIBITORY = new THREE.Color('#4466cc');

const FORCE_ITERATIONS = 200;
const SPHERE_RADIUS = 0.015;
const DAMPING = 0.95;

// ── Fibonacci sphere distribution ────────────────────────────────────────────

function fibonacciSphere(n: number, radius: number): Float32Array {
  const positions = new Float32Array(n * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2; // -1 to 1
    const r = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

// ── Force-directed layout simulation ─────────────────────────────────────────

function runForceStep(
  positions: Float32Array,
  velocities: Float32Array,
  n: number,
  edgeIndices: [number, number][],
): void {
  const repulsionK = 0.0004;
  const attractionK = 0.3;
  const centerK = 0.01;

  // Accumulate forces
  for (let i = 0; i < n; i++) {
    const ix = i * 3, iy = ix + 1, iz = ix + 2;
    let fx = 0, fy = 0, fz = 0;

    // Repulsion from all other neurons (Coulomb-like)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const jx = j * 3, jy = jx + 1, jz = jx + 2;
      const dx = positions[ix] - positions[jx];
      const dy = positions[iy] - positions[jy];
      const dz = positions[iz] - positions[jz];
      const distSq = dx * dx + dy * dy + dz * dz + 0.0001; // epsilon to avoid div0
      const dist = Math.sqrt(distSq);
      const force = repulsionK / distSq;
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
      fz += (dz / dist) * force;
    }

    // Centering force
    fx -= positions[ix] * centerK;
    fy -= positions[iy] * centerK;
    fz -= positions[iz] * centerK;

    velocities[ix] += fx;
    velocities[iy] += fy;
    velocities[iz] += fz;
  }

  // Attraction along edges (spring)
  for (const [a, b] of edgeIndices) {
    const ax = a * 3, ay = ax + 1, az = ax + 2;
    const bx = b * 3, by = bx + 1, bz = bx + 2;
    const dx = positions[bx] - positions[ax];
    const dy = positions[by] - positions[ay];
    const dz = positions[bz] - positions[az];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.0001);
    const force = attractionK * dist;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    const fz = (dz / dist) * force;
    velocities[ax] += fx;
    velocities[ay] += fy;
    velocities[az] += fz;
    velocities[bx] -= fx;
    velocities[by] -= fy;
    velocities[bz] -= fz;
  }

  // Apply velocities with damping
  for (let i = 0; i < n * 3; i++) {
    velocities[i] *= DAMPING;
    positions[i] += velocities[i];
  }
}

// ── Neuron Instances (R3F sub-component) ─────────────────────────────────────

const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();

interface NeuronsProps {
  graph: ConnectomeGraph;
  positions: Float32Array;
  nodeIndexMap: Map<string, number>;
  onHover: (idx: number | null, event?: ThreeEvent<PointerEvent>) => void;
  onClick: (idx: number, event: ThreeEvent<MouseEvent>) => void;
}

function Neurons({ graph, positions, nodeIndexMap, onHover, onClick }: NeuronsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const frame = useSimulationStore((s) => s.frame);
  const selectedNeurons = useCircuitModificationStore((s) => s.selectedNeurons);
  const lesionedNeurons = useCircuitModificationStore((s) => s.lesionedNeurons);
  const spikeGlowRef = useRef<Float32Array>(new Float32Array(graph.nodes.length));
  const lastTimeRef = useRef(0);

  const n = graph.nodes.length;
  const selectedSet = useMemo(() => new Set(selectedNeurons), [selectedNeurons]);

  // Sphere geometry (shared)
  const geometry = useMemo(() => new THREE.SphereGeometry(SPHERE_RADIUS, 12, 8), []);

  // Update instance matrices + colors every frame
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const firingRates = frame?.firing_rates ?? [];
    const spikes = frame?.spikes ?? [];
    const now = performance.now();
    const dtMs = now - (lastTimeRef.current || now);
    lastTimeRef.current = now;

    // Decay spike glow
    const decay = Math.exp(-dtMs * 0.005); // ~200ms decay
    const glows = spikeGlowRef.current;
    for (let i = 0; i < n; i++) {
      glows[i] *= decay;
      if (glows[i] < 0.01) glows[i] = 0;
    }

    // Trigger spike flash
    for (const spikeIdx of spikes) {
      if (spikeIdx >= 0 && spikeIdx < n) {
        glows[spikeIdx] = Math.min((glows[spikeIdx] || 0) + 0.9, 1.0);
      }
    }

    for (let i = 0; i < n; i++) {
      const node = graph.nodes[i];
      const rate = firingRates[i] ?? 0;
      const t = Math.min(rate / 80, 1); // normalized firing rate
      const glow = glows[i];
      const isSelected = selectedSet.has(node.id);
      const isLesioned = lesionedNeurons.has(node.id);

      // Scale: 1.0x at rest, 2.0x at max activity, slight boost for selected
      let scale = 1.0 + t * 1.0 + glow * 0.5;
      if (isSelected) scale *= 1.3;
      if (isLesioned) scale *= 0.5;

      // Position
      _tempObj.position.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      );
      _tempObj.scale.setScalar(scale);
      _tempObj.updateMatrix();
      mesh.setMatrixAt(i, _tempObj.matrix);

      // Color
      if (isLesioned) {
        _tempColor.set('#333340');
      } else if (glow > 0.05) {
        // Spike flash: lerp toward white
        const baseColor = TYPE_COLORS[node.type] ?? TYPE_COLORS.inter;
        _tempColor.copy(baseColor).lerp(WHITE, glow * 0.7);
      } else if (isSelected) {
        _tempColor.copy(CYAN_SELECT);
      } else {
        // Base color, brightened by firing rate
        const baseColor = TYPE_COLORS[node.type] ?? TYPE_COLORS.inter;
        _tempColor.copy(baseColor);
        if (t < 0.1) {
          _tempColor.multiplyScalar(0.25); // dim at rest
        } else {
          _tempColor.multiplyScalar(0.3 + t * 0.7);
        }
      }
      mesh.setColorAt(i, _tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, n]}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onHover(e.instanceId, e);
      }}
      onPointerLeave={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) onClick(e.instanceId, e);
      }}
    >
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ── Synapse Lines (R3F sub-component) ────────────────────────────────────────

interface SynapsesProps {
  graph: ConnectomeGraph;
  positions: Float32Array;
  nodeIndexMap: Map<string, number>;
}

function Synapses({ graph, positions, nodeIndexMap }: SynapsesProps) {
  const linesRef = useRef<THREE.LineSegments>(null);
  const frame = useSimulationStore((s) => s.frame);

  // Compute max weight for opacity normalization
  const maxWeight = useMemo(() => {
    let max = 1;
    for (const e of graph.edges) if (e.weight > max) max = e.weight;
    return max;
  }, [graph.edges]);

  // Build line geometry
  const { linePositions, lineColors, edgeList } = useMemo(() => {
    const posArr: number[] = [];
    const colArr: number[] = [];
    const edges: ConnectomeEdge[] = [];

    for (const edge of graph.edges) {
      const preIdx = nodeIndexMap.get(edge.pre);
      const postIdx = nodeIndexMap.get(edge.post);
      if (preIdx === undefined || postIdx === undefined) continue;

      posArr.push(
        positions[preIdx * 3], positions[preIdx * 3 + 1], positions[preIdx * 3 + 2],
        positions[postIdx * 3], positions[postIdx * 3 + 1], positions[postIdx * 3 + 2],
      );

      // Rest color: dim gray
      colArr.push(
        EDGE_REST.r, EDGE_REST.g, EDGE_REST.b,
        EDGE_REST.r, EDGE_REST.g, EDGE_REST.b,
      );
      edges.push(edge);
    }

    return {
      linePositions: new Float32Array(posArr),
      lineColors: new Float32Array(colArr),
      edgeList: edges,
    };
  }, [graph.edges, positions, nodeIndexMap]);

  // Update synapse positions when layout changes
  useEffect(() => {
    if (!linesRef.current) return;
    const geo = linesRef.current.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;

    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < edgeList.length; i++) {
      const edge = edgeList[i];
      const preIdx = nodeIndexMap.get(edge.pre);
      const postIdx = nodeIndexMap.get(edge.post);
      if (preIdx === undefined || postIdx === undefined) continue;

      arr[i * 6] = positions[preIdx * 3];
      arr[i * 6 + 1] = positions[preIdx * 3 + 1];
      arr[i * 6 + 2] = positions[preIdx * 3 + 2];
      arr[i * 6 + 3] = positions[postIdx * 3];
      arr[i * 6 + 4] = positions[postIdx * 3 + 1];
      arr[i * 6 + 5] = positions[postIdx * 3 + 2];
    }
    posAttr.needsUpdate = true;
  }, [positions, edgeList, nodeIndexMap]);

  // Animate line colors based on activity
  useFrame(() => {
    if (!linesRef.current || !frame?.firing_rates) return;

    const colorAttr = linesRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;
    const arr = colorAttr.array as Float32Array;
    const rates = frame.firing_rates;

    for (let i = 0; i < edgeList.length; i++) {
      const edge = edgeList[i];
      const preIdx = nodeIndexMap.get(edge.pre);
      const postIdx = nodeIndexMap.get(edge.post);
      if (preIdx === undefined || postIdx === undefined) continue;

      const preRate = rates[preIdx] ?? 0;
      const postRate = rates[postIdx] ?? 0;
      const bothFiring = preRate > 10 && postRate > 10;
      const weightAlpha = edge.weight / maxWeight;

      if (bothFiring) {
        const activity = Math.min((preRate + postRate) / 160, 1);
        // Excitatory = warm, inhibitory (GABA) = cool blue
        const isInhibitory = edge.type === 'electrical' || edge.type === 'inhibitory';
        const activeColor = isInhibitory ? EDGE_INHIBITORY : EDGE_EXCITATORY;
        _tempColor.copy(EDGE_REST).lerp(activeColor, activity * weightAlpha);
      } else {
        _tempColor.copy(EDGE_REST);
        _tempColor.multiplyScalar(0.3 + weightAlpha * 0.7);
      }

      arr[i * 6] = _tempColor.r;
      arr[i * 6 + 1] = _tempColor.g;
      arr[i * 6 + 2] = _tempColor.b;
      arr[i * 6 + 3] = _tempColor.r;
      arr[i * 6 + 4] = _tempColor.g;
      arr[i * 6 + 5] = _tempColor.b;
    }
    colorAttr.needsUpdate = true;
  });

  if (linePositions.length === 0) return null;

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={linePositions}
          count={linePositions.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={lineColors}
          count={lineColors.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// ── Force simulation driver (runs inside R3F) ───────────────────────────────

interface ForceSimProps {
  positions: Float32Array;
  velocities: Float32Array;
  edgeIndices: [number, number][];
  n: number;
  onSettled: () => void;
}

function ForceSimulation({ positions, velocities, edgeIndices, n, onSettled }: ForceSimProps) {
  const iterRef = useRef(0);
  const settled = useRef(false);

  useFrame(() => {
    if (settled.current) return;
    if (iterRef.current >= FORCE_ITERATIONS) {
      settled.current = true;
      onSettled();
      return;
    }

    // Run 4 steps per frame for faster convergence
    const stepsPerFrame = Math.min(4, FORCE_ITERATIONS - iterRef.current);
    for (let s = 0; s < stepsPerFrame; s++) {
      runForceStep(positions, velocities, n, edgeIndices);
      iterRef.current++;
    }
  });

  return null;
}

// ── Camera reset helper ──────────────────────────────────────────────────────

function CameraFit({ positions, n, resetKey }: { positions: Float32Array; n: number; resetKey: number }) {
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    initialized.current = false;
  }, [resetKey]);

  useFrame(() => {
    if (initialized.current || n === 0) return;

    // Wait a bit for force sim to run
    const bbox = new THREE.Box3();
    for (let i = 0; i < n; i++) {
      bbox.expandByPoint(
        new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]),
      );
    }
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    if (maxDim < 0.001) return; // layout hasn't spread yet

    const dist = maxDim * 2.0;
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.8);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    initialized.current = true;
  });

  return null;
}

// ── Hover tooltip (rendered as HTML overlay inside Canvas) ───────────────────

interface TooltipProps {
  graph: ConnectomeGraph;
  hoveredIdx: number | null;
  position: THREE.Vector3 | null;
}

function HoverTooltip({ graph, hoveredIdx, position }: TooltipProps) {
  const frame = useSimulationStore((s) => s.frame);
  if (hoveredIdx === null || !position) return null;

  const node = graph.nodes[hoveredIdx];
  if (!node) return null;

  const rate = frame?.firing_rates?.[hoveredIdx] ?? 0;

  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(8, 10, 20, 0.92)',
          border: '1px solid rgba(100, 160, 255, 0.3)',
          borderRadius: 6,
          padding: '6px 10px',
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#c8d8e8',
          whiteSpace: 'nowrap',
          transform: 'translate(16px, -50%)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 11, color: '#e8f0ff' }}>{node.id}</div>
        <div style={{ color: TYPE_COLORS_HEX[node.type] ?? '#888', marginTop: 2 }}>
          {node.type} {node.nt ? `| ${node.nt}` : ''}
        </div>
        <div style={{ color: '#8ca0b8', marginTop: 2 }}>
          Firing: {rate.toFixed(1)} Hz
        </div>
      </div>
    </Html>
  );
}

// ── Scene content ────────────────────────────────────────────────────────────

interface SceneContentProps {
  graph: ConnectomeGraph;
  resetKey: number;
}

function SceneContent({ graph, resetKey }: SceneContentProps) {
  const n = graph.nodes.length;

  // Build node index map: id -> array index
  const nodeIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    graph.nodes.forEach((node, i) => map.set(node.id, i));
    return map;
  }, [graph.nodes]);

  // Edge indices for force simulation
  const edgeIndices = useMemo(() => {
    const indices: [number, number][] = [];
    for (const edge of graph.edges) {
      const preIdx = nodeIndexMap.get(edge.pre);
      const postIdx = nodeIndexMap.get(edge.post);
      if (preIdx !== undefined && postIdx !== undefined) {
        indices.push([preIdx, postIdx]);
      }
    }
    return indices;
  }, [graph.edges, nodeIndexMap]);

  // Initialize positions on Fibonacci sphere
  const positions = useMemo(() => {
    return fibonacciSphere(n, 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, resetKey]);

  const velocities = useMemo(() => {
    return new Float32Array(n * 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, resetKey]);

  // Force re-render when simulation settles so final positions are picked up
  const [, setSettledTick] = useState(0);
  const handleSettled = useCallback(() => setSettledTick((t) => t + 1), []);

  // Hover state
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredPos, setHoveredPos] = useState<THREE.Vector3 | null>(null);

  // Store integration
  const toggleNeuronSelection = useCircuitModificationStore((s) => s.toggleNeuronSelection);
  const setSelectedNeuronGlobal = useSimulationStore((s) => s.setSelectedNeuron);

  const handleHover = useCallback((idx: number | null, event?: ThreeEvent<PointerEvent>) => {
    setHoveredIdx(idx);
    if (idx !== null && event) {
      setHoveredPos(new THREE.Vector3(
        positions[idx * 3],
        positions[idx * 3 + 1],
        positions[idx * 3 + 2],
      ));
    } else {
      setHoveredPos(null);
    }
  }, [positions]);

  const handleClick = useCallback((idx: number, event: ThreeEvent<MouseEvent>) => {
    const node = graph.nodes[idx];
    if (!node) return;
    const shift = (event.nativeEvent as MouseEvent).shiftKey;
    toggleNeuronSelection(node.id, shift);
    setSelectedNeuronGlobal(node.id);
  }, [graph.nodes, toggleNeuronSelection, setSelectedNeuronGlobal]);

  // Keyboard handler for 'R' to reset camera
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        setSettledTick((t) => t + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <CameraFit positions={positions} n={n} resetKey={resetKey} />

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.3}
        enableDamping
        dampingFactor={0.12}
        minDistance={0.2}
        maxDistance={8}
      />

      <ForceSimulation
        positions={positions}
        velocities={velocities}
        edgeIndices={edgeIndices}
        n={n}
        onSettled={handleSettled}
      />

      <Synapses
        graph={graph}
        positions={positions}
        nodeIndexMap={nodeIndexMap}
      />

      <Neurons
        graph={graph}
        positions={positions}
        nodeIndexMap={nodeIndexMap}
        onHover={handleHover}
        onClick={handleClick}
      />

      <HoverTooltip
        graph={graph}
        hoveredIdx={hoveredIdx}
        position={hoveredPos}
      />

      <EffectComposer>
        <Bloom
          intensity={0.6}
          luminanceThreshold={0.3}
          luminanceSmoothing={0.5}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

// ── Main exported panel component ────────────────────────────────────────────

export function ConnectomeGraph3DPanel() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const organism = experiment?.organism ?? 'c_elegans';
  const selectedNeurons = useCircuitModificationStore((s) => s.selectedNeurons);

  const [graph, setGraph] = useState<ConnectomeGraph | null>(null);
  const [neuronTypes, setNeuronTypes] = useState<Record<string, NeuronTypeInfo>>({});
  const [resetKey, setResetKey] = useState(0);

  // ── Data loading (mirrors ConnectomeExplorer) ──────────────────────────

  const generateFlyGraph = useCallback((nNeurons: number, nSynapses: number) => {
    const seededRand = (seed: number) => {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const nodes: ConnectomeNode[] = [];
    const neurotransmitters = ['ACh', 'GABA', 'Glu', 'DA', '5-HT'];

    for (let i = 0; i < nNeurons; i++) {
      const r = seededRand(i * 13 + 7);
      let type: 'sensory' | 'inter' | 'motor';
      if (r < 0.10) type = 'sensory';
      else if (r < 0.80) type = 'inter';
      else type = 'motor';

      nodes.push({
        id: `FBN${String(i).padStart(5, '0')}`,
        type,
        nt: neurotransmitters[Math.floor(seededRand(i * 11 + 5) * neurotransmitters.length)],
        x: seededRand(i * 3 + 1),
        y: seededRand(i * 17 + 9),
        z: seededRand(i * 23 + 11),
      });
    }

    const typeOrder: Record<string, number> = { sensory: 0, inter: 1, motor: 2 };
    const edges: ConnectomeEdge[] = [];
    const edgeTypes = ['chemical', 'electrical'];
    const maxAttempts = nSynapses * 3;
    const edgeSet = new Set<string>();

    for (let attempt = 0; attempt < maxAttempts && edges.length < nSynapses; attempt++) {
      const preIdx = Math.floor(seededRand(attempt * 37 + 1) * nNeurons);
      const postIdx = Math.floor(seededRand(attempt * 41 + 3) * nNeurons);
      if (preIdx === postIdx) continue;
      const key = `${preIdx}-${postIdx}`;
      if (edgeSet.has(key)) continue;

      const preOrder = typeOrder[nodes[preIdx].type] ?? 1;
      const postOrder = typeOrder[nodes[postIdx].type] ?? 1;
      if (preOrder > postOrder && seededRand(attempt * 53 + 7) < 0.7) continue;

      edgeSet.add(key);
      edges.push({
        pre: nodes[preIdx].id,
        post: nodes[postIdx].id,
        weight: Math.floor(seededRand(attempt * 59 + 11) * 5) + 1,
        type: edgeTypes[seededRand(attempt * 67 + 13) < 0.85 ? 0 : 1],
      });
    }

    setGraph({ nodes, edges, n_neurons: nodes.length, n_edges: edges.length });
  }, []);

  const loadCelegansGraph = useCallback(async () => {
    const base = import.meta.env.BASE_URL || '/';
    try {
      let data: ConnectomeGraph;
      try {
        const res = await fetch('/api/morphology/connectome-graph');
        if (!res.ok) throw new Error('api');
        data = await res.json();
      } catch {
        const res = await fetch(`${base}connectome-graph.json`);
        if (!res.ok) throw new Error('static');
        data = await res.json();
      }
      setGraph(data);
    } catch (err) {
      console.warn('ConnectomeGraph3D: failed to load C. elegans graph', err);
    }
  }, []);

  useEffect(() => {
    if (organism === 'drosophila') {
      generateFlyGraph(experiment?.n_neurons ?? 500, experiment?.n_synapses ?? 10000);
    } else {
      loadCelegansGraph();
    }
  }, [organism, experiment?.n_neurons, experiment?.n_synapses, generateFlyGraph, loadCelegansGraph]);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}neuron-types.json`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setNeuronTypes(data); })
      .catch(() => {});
  }, []);

  // ── Adjacency info for selected neuron detail ─────────────────────────

  const adjacency = useMemo(() => {
    if (!graph) return { inDeg: new Map<string, number>(), outDeg: new Map<string, number>() };
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    for (const n of graph.nodes) {
      inDeg.set(n.id, 0);
      outDeg.set(n.id, 0);
    }
    for (const e of graph.edges) {
      outDeg.set(e.pre, (outDeg.get(e.pre) ?? 0) + 1);
      inDeg.set(e.post, (inDeg.get(e.post) ?? 0) + 1);
    }
    return { inDeg, outDeg };
  }, [graph]);

  // ── Commands ──────────────────────────────────────────────────────────

  const sendWsCommand = useCallback((cmd: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent('neurevo-command', { detail: cmd }));
  }, []);

  const selectedId = selectedNeurons[0] ?? null;
  const selectedNode = graph?.nodes.find((n) => n.id === selectedId);

  const selectedInfo = selectedId && selectedNode ? {
    name: selectedId,
    type: selectedNode.type,
    nt: selectedNode.nt ?? neuronTypes[selectedId]?.nt ?? 'unknown',
    rate: (() => {
      if (!frame?.firing_rates || !graph) return 0;
      const idx = graph.nodes.findIndex((n) => n.id === selectedId);
      return idx >= 0 ? (frame.firing_rates[idx] ?? 0) : 0;
    })(),
    inDeg: adjacency.inDeg.get(selectedId) ?? 0,
    outDeg: adjacency.outDeg.get(selectedId) ?? 0,
  } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* 3D Canvas */}
      <div
        className="glass"
        style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative', minHeight: 200 }}
      >
        <div
          className="glass-label"
          style={{ position: 'absolute', top: 8, left: 10, zIndex: 2 }}
        >
          Connectome 3D — {organism === 'drosophila' ? 'Drosophila' : 'C. elegans'}
        </div>

        {/* Reset button */}
        <button
          onClick={() => setResetKey((k) => k + 1)}
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            zIndex: 2,
            padding: '2px 8px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: 'rgba(200,210,230,0.7)',
            fontSize: 9,
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>

        {graph ? (
          <Canvas
            key={resetKey}
            camera={{ fov: 50, near: 0.001, far: 100, position: [0.8, 0.6, 1.0] }}
            dpr={[1, 1.5]}
            style={{ width: '100%', height: '100%' }}
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={['#030308']} />
            <SceneContent graph={graph} resetKey={resetKey} />
          </Canvas>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(140,170,200,0.4)',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            Loading connectome...
          </div>
        )}
      </div>

      {/* Stats bar */}
      {graph && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: 'rgba(140,170,200,0.5)',
            display: 'flex',
            gap: 12,
            paddingLeft: 2,
          }}
        >
          <span>
            <span style={{ color: TYPE_COLORS_HEX.sensory }}>
              {graph.nodes.filter((n) => n.type === 'sensory').length}
            </span>{' '}
            sensory
          </span>
          <span>
            <span style={{ color: TYPE_COLORS_HEX.inter }}>
              {graph.nodes.filter((n) => n.type === 'inter').length}
            </span>{' '}
            inter
          </span>
          <span>
            <span style={{ color: TYPE_COLORS_HEX.motor }}>
              {graph.nodes.filter((n) => n.type === 'motor').length}
            </span>{' '}
            motor
          </span>
          <span>{graph.edges.length} syn</span>
        </div>
      )}

      {/* Selected neuron detail */}
      {selectedInfo && (
        <div className="neuron-detail">
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
            }}
          >
            {selectedInfo.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: TYPE_COLORS_HEX[selectedInfo.type] ?? '#888',
              marginTop: 2,
            }}
          >
            {selectedInfo.type} | {selectedInfo.nt}
          </div>
          <div className="stat-row" style={{ marginTop: 6 }}>
            <span className="stat-label">Firing rate</span>
            <span className="stat-value stat-cyan" style={{ fontSize: 13 }}>
              {selectedInfo.rate.toFixed(1)} Hz
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">In-degree</span>
            <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedInfo.inDeg}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Out-degree</span>
            <span className="stat-value" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedInfo.outDeg}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 11 }}
              onClick={() => {
                if (selectedId) {
                  sendWsCommand({ type: 'stimulate', neuron_ids: [selectedId], current: 30 });
                }
              }}
            >
              Stimulate
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 1, fontSize: 11 }}
              onClick={() => {
                if (selectedId) {
                  sendWsCommand({ type: 'lesion_neuron', neuron_id: selectedId });
                }
              }}
            >
              Lesion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
