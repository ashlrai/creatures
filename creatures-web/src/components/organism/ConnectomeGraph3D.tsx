import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D visualization of actual synaptic connections from the connectome.
 * Renders the top connections as glowing lines between neuron positions.
 * Active connections (where both pre and post neurons are firing) glow brighter.
 */

interface GraphData {
  nodes: Array<{ id: string; type: string; x: number; y: number; z: number }>;
  edges: Array<{ pre: string; post: string; weight: number }>;
}

const TYPE_COLORS: Record<string, number> = {
  sensory: 0x22cc66,
  inter: 0x3388ff,
  motor: 0xff4422,
  unknown: 0x666688,
};

export function ConnectomeGraph3D() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  // Fetch connectome graph
  useEffect(() => {
    if (!experiment || experiment.organism !== 'c_elegans') return;
    fetch('/api/morphology/connectome-graph')
      .then(r => r.json())
      .then(setGraphData)
      .catch(() => {});
  }, [experiment]);

  // Build line geometry from edges
  const { linePositions, lineColors, nodeMap } = useMemo(() => {
    if (!graphData) return { linePositions: null, lineColors: null, nodeMap: {} as Record<string, { idx: number; x: number; y: number; z: number }> };

    const nMap: Record<string, { idx: number; x: number; y: number; z: number }> = {};
    graphData.nodes.forEach((n, i) => {
      nMap[n.id] = { idx: i, x: n.x, y: n.y, z: n.z };
    });

    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of graphData.edges) {
      const pre = nMap[edge.pre];
      const post = nMap[edge.post];
      if (!pre || !post) continue;

      positions.push(pre.x, pre.y, pre.z);
      positions.push(post.x, post.y, post.z);

      // Base color: dim cyan
      const intensity = 0.08;
      colors.push(intensity, intensity * 1.5, intensity * 2);
      colors.push(intensity, intensity * 1.5, intensity * 2);
    }

    return {
      linePositions: new Float32Array(positions),
      lineColors: new Float32Array(colors),
      nodeMap: nMap as Record<string, { idx: number; x: number; y: number; z: number }>,
    };
  }, [graphData]);

  // Animate line colors based on neural activity
  useFrame(() => {
    if (!linesRef.current || !frame?.firing_rates || !graphData || !nodeMap) return;

    const geo = linesRef.current.geometry;
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    const arr = colorAttr.array as Float32Array;
    const rates = frame.firing_rates;
    const neuronIds = Object.keys(nodeMap);

    let edgeIdx = 0;
    for (const edge of graphData.edges) {
      const preNode = nodeMap[edge.pre];
      const postNode = nodeMap[edge.post];
      if (!preNode || !postNode) continue;

      const preRate = rates[preNode.idx] ?? 0;
      const postRate = rates[postNode.idx] ?? 0;
      const activity = Math.min((preRate + postRate) / 200, 1);

      if (activity > 0.05) {
        // Active connection: bright cyan-white
        const t = activity;
        arr[edgeIdx * 6] = 0.1 + t * 0.9;
        arr[edgeIdx * 6 + 1] = 0.2 + t * 0.8;
        arr[edgeIdx * 6 + 2] = 0.3 + t * 0.7;
        arr[edgeIdx * 6 + 3] = 0.1 + t * 0.9;
        arr[edgeIdx * 6 + 4] = 0.2 + t * 0.8;
        arr[edgeIdx * 6 + 5] = 0.3 + t * 0.7;
      } else {
        // Dim
        const d = 0.03;
        arr[edgeIdx * 6] = d;
        arr[edgeIdx * 6 + 1] = d * 1.2;
        arr[edgeIdx * 6 + 2] = d * 1.5;
        arr[edgeIdx * 6 + 3] = d;
        arr[edgeIdx * 6 + 4] = d * 1.2;
        arr[edgeIdx * 6 + 5] = d * 1.5;
      }
      edgeIdx++;
    }
    colorAttr.needsUpdate = true;
  });

  if (!linePositions || !lineColors) return null;

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
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        linewidth={1}
      />
    </lineSegments>
  );
}
