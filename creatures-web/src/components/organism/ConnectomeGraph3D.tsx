import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D visualization of actual synaptic connections from the connectome.
 * Renders the top 200 connections as lines between neuron positions.
 * Lines are nearly invisible at rest; glow teal/cyan only when BOTH
 * pre and post neurons are firing (true signal propagation).
 */

interface GraphData {
  nodes: Array<{ id: string; type: string; x: number; y: number; z: number }>;
  edges: Array<{ pre: string; post: string; weight: number }>;
}

const MAX_VISIBLE_EDGES = 200;

export function ConnectomeGraph3D() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  // Fetch connectome graph — API first, fall back to static
  useEffect(() => {
    if (!experiment) return;
    const base = import.meta.env.BASE_URL || '/';
    fetch('/api/morphology/connectome-graph')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch(`${base}connectome-graph.json`).then(r => r.json()))
      .then(setGraphData)
      .catch(e => console.warn('Failed to load connectome graph:', e));
  }, [experiment]);

  // Build line geometry from top edges by weight
  const { linePositions, lineColors, nodeMap, edgeList } = useMemo(() => {
    if (!graphData) return { linePositions: null, lineColors: null, nodeMap: {} as Record<string, { idx: number; x: number; y: number; z: number }>, edgeList: [] as GraphData['edges'] };

    const nMap: Record<string, { idx: number; x: number; y: number; z: number }> = {};
    graphData.nodes.forEach((n, i) => {
      nMap[n.id] = { idx: i, x: n.x, y: n.y, z: n.z };
    });

    // Sort edges by weight descending and take top MAX_VISIBLE_EDGES
    const validEdges = graphData.edges
      .filter(e => nMap[e.pre] && nMap[e.post])
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_VISIBLE_EDGES);

    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of validEdges) {
      const pre = nMap[edge.pre];
      const post = nMap[edge.post];

      positions.push(pre.x, pre.y, pre.z);
      positions.push(post.x, post.y, post.z);

      // Nearly invisible at rest
      const d = 0.005;
      colors.push(d, d * 1.5, d * 2);
      colors.push(d, d * 1.5, d * 2);
    }

    return {
      linePositions: new Float32Array(positions),
      lineColors: new Float32Array(colors),
      nodeMap: nMap as Record<string, { idx: number; x: number; y: number; z: number }>,
      edgeList: validEdges,
    };
  }, [graphData]);

  // Animate line colors based on neural activity
  useFrame(() => {
    if (!linesRef.current || !frame?.firing_rates || !edgeList.length || !nodeMap) return;

    const geo = linesRef.current.geometry;
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    const arr = colorAttr.array as Float32Array;
    const rates = frame.firing_rates;

    for (let edgeIdx = 0; edgeIdx < edgeList.length; edgeIdx++) {
      const edge = edgeList[edgeIdx];
      const preNode = nodeMap[edge.pre];
      const postNode = nodeMap[edge.post];
      if (!preNode || !postNode) continue;

      const preRate = rates[preNode.idx] ?? 0;
      const postRate = rates[postNode.idx] ?? 0;

      // Only glow when BOTH endpoints are firing (true signal propagation)
      const preActive = preRate > 15;
      const postActive = postRate > 15;
      const bothFiring = preActive && postActive;

      if (bothFiring) {
        // Warm teal/cyan glow proportional to combined activity
        const activity = Math.min((preRate + postRate) / 180, 1);
        const r = 0.02 + activity * 0.12;
        const g = 0.06 + activity * 0.30;
        const b = 0.08 + activity * 0.45;
        arr[edgeIdx * 6] = r;
        arr[edgeIdx * 6 + 1] = g;
        arr[edgeIdx * 6 + 2] = b;
        arr[edgeIdx * 6 + 3] = r;
        arr[edgeIdx * 6 + 4] = g;
        arr[edgeIdx * 6 + 5] = b;
      } else {
        // Nearly invisible when not both firing
        const d = 0.004;
        arr[edgeIdx * 6] = d;
        arr[edgeIdx * 6 + 1] = d * 1.5;
        arr[edgeIdx * 6 + 2] = d * 2;
        arr[edgeIdx * 6 + 3] = d;
        arr[edgeIdx * 6 + 4] = d * 1.5;
        arr[edgeIdx * 6 + 5] = d * 2;
      }
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
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        linewidth={1}
      />
    </lineSegments>
  );
}
