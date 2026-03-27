import { useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COUNT = 100;
const CONNECTION_MAX_DIST = 1.6;
const MAX_CONNECTIONS = 180;
const ROTATION_SPEED = 0.15; // rad/s
const PULSE_INTERVAL_MS = 80;
const PULSE_DECAY = 0.025;

// Teal/blue palette
const COLOR_A = { r: 8, g: 145, b: 178 };   // #0891b2
const COLOR_B = { r: 0, g: 102, b: 204 };   // #0066cc

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Node {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  pulse: number; // extra brightness 0..1
}

interface Connection {
  i: number;
  j: number;
  brightness: number; // base brightness from distance
}

// ---------------------------------------------------------------------------
// Geometry generation (runs once)
// ---------------------------------------------------------------------------

function buildNodes(count: number): Node[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nodes: Node[] = [];

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    const scaleX = 2.2;
    const scaleY = 1.4;
    const scaleZ = 1.8;

    const jitter = 0.15;
    const rx = (Math.random() - 0.5) * jitter;
    const ry = (Math.random() - 0.5) * jitter;
    const rz = (Math.random() - 0.5) * jitter;

    const t = Math.random();
    const r = Math.round(COLOR_A.r + (COLOR_B.r - COLOR_A.r) * t);
    const g = Math.round(COLOR_A.g + (COLOR_B.g - COLOR_A.g) * t);
    const b = Math.round(COLOR_A.b + (COLOR_B.b - COLOR_A.b) * t);

    nodes.push({
      x: Math.cos(theta) * radiusAtY * scaleX + rx,
      y: y * scaleY + ry,
      z: Math.sin(theta) * radiusAtY * scaleZ + rz,
      r,
      g,
      b,
      pulse: 0,
    });
  }

  return nodes;
}

function buildConnections(nodes: Node[], maxLines: number, maxDist: number): Connection[] {
  const candidates: { i: number; j: number; dist: number }[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < maxDist) {
        candidates.push({ i, j, dist });
      }
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, maxLines).map(({ i, j, dist }) => ({
    i,
    j,
    brightness: 0.35 * (1 - dist / maxDist),
  }));
}

// ---------------------------------------------------------------------------
// 2D projection helper
// ---------------------------------------------------------------------------

function project(
  node: Node,
  angle: number,
  cx: number,
  cy: number,
  scale: number,
): { sx: number; sy: number; depth: number } {
  // Rotate around Y axis
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const rx = node.x * cosA - node.z * sinA;
  const rz = node.x * sinA + node.z * cosA;
  const ry = node.y;

  // Simple perspective
  const perspective = 4;
  const pScale = perspective / (perspective + rz);

  return {
    sx: cx + rx * scale * pScale,
    sy: cy - ry * scale * pScale,
    depth: rz,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeroVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // State captured in closure on first call via data attribute
    let state = (canvas as any).__vizState as {
      nodes: Node[];
      connections: Connection[];
      angle: number;
      lastTime: number;
      pulseTimer: number;
    } | undefined;

    if (!state) {
      const nodes = buildNodes(NODE_COUNT);
      const connections = buildConnections(nodes, MAX_CONNECTIONS, CONNECTION_MAX_DIST);
      state = {
        nodes,
        connections,
        angle: 0,
        lastTime: performance.now(),
        pulseTimer: 0,
      };
      (canvas as any).__vizState = state;
    }

    const now = performance.now();
    const delta = Math.min((now - state.lastTime) / 1000, 0.1); // cap at 100ms
    state.lastTime = now;

    // Rotation
    state.angle += ROTATION_SPEED * delta;

    // Pulse timer
    state.pulseTimer += delta * 1000;
    if (state.pulseTimer >= PULSE_INTERVAL_MS) {
      state.pulseTimer -= PULSE_INTERVAL_MS;
      const idx = Math.floor(Math.random() * NODE_COUNT);
      state.nodes[idx].pulse = 1.0;
    }

    // Decay pulses
    for (const node of state.nodes) {
      if (node.pulse > 0) {
        node.pulse = Math.max(0, node.pulse - PULSE_DECAY);
      }
    }

    // Handle DPR
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = '#040810';
    ctx.fillRect(0, 0, w, h);

    // Draw radial glow background
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.6);
    bgGrad.addColorStop(0, 'rgba(8, 145, 178, 0.06)');
    bgGrad.addColorStop(0.5, 'rgba(0, 102, 204, 0.02)');
    bgGrad.addColorStop(1, 'rgba(4, 8, 16, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.45;
    const scale = Math.min(w, h) * 0.18;

    // Project all nodes
    const projected = state.nodes.map((n) => project(n, state!.angle, cx, cy, scale));

    // Draw connections
    ctx.lineCap = 'round';
    for (const conn of state.connections) {
      const a = projected[conn.i];
      const b = projected[conn.j];
      const nodeA = state.nodes[conn.i];
      const nodeB = state.nodes[conn.j];

      // Boost connection brightness if either node is pulsing
      const pulseBoost = Math.max(nodeA.pulse, nodeB.pulse) * 0.4;
      const alpha = Math.min(1, conn.brightness + pulseBoost);

      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.strokeStyle = `rgba(8, 145, 178, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Sort nodes by depth for painter's algorithm (back to front)
    const sortedIndices = projected
      .map((p, i) => ({ i, depth: p.depth }))
      .sort((a, b) => a.depth - b.depth)
      .map((x) => x.i);

    // Draw nodes
    for (const i of sortedIndices) {
      const p = projected[i];
      const node = state.nodes[i];

      // Base size with perspective
      const perspective = 4;
      const pScale = perspective / (perspective + p.depth);
      const baseRadius = 2.2 * pScale;

      // Pulse glow
      if (node.pulse > 0.1) {
        const glowRadius = baseRadius + node.pulse * 8;
        const glow = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowRadius);
        const pr = Math.min(255, node.r + Math.round(node.pulse * 200));
        const pg = Math.min(255, node.g + Math.round(node.pulse * 180));
        const pb = Math.min(255, node.b + Math.round(node.pulse * 140));
        glow.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${node.pulse * 0.6})`);
        glow.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, 0)`);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Core dot
      const alpha = 0.5 + node.pulse * 0.5;
      const cr = Math.min(255, node.r + Math.round(node.pulse * 150));
      const cg = Math.min(255, node.g + Math.round(node.pulse * 130));
      const cb = Math.min(255, node.b + Math.round(node.pulse * 100));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        display: 'block',
        background: '#040810',
        borderRadius: 24,
      }}
    />
  );
}
