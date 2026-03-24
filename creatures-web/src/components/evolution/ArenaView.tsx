import { useRef, useEffect, useCallback } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Vec2 {
  x: number;
  y: number;
}

interface ArenaOrganism {
  id: number;
  pos: Vec2;
  vel: Vec2;
  segments: Vec2[]; // 4 segment offsets relative to pos
  fitness: number;
  targetFood: number; // index into foods array
  angle: number;
}

interface Food {
  pos: Vec2;
  radius: number;
  pulse: number; // animation phase
}

interface Obstacle {
  pos: Vec2;
  radius: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARENA_RADIUS = 280;
const NUM_ORGANISMS = 16;
const NUM_FOOD = 5;
const NUM_OBSTACLES = 3;
const ORGANISM_SPEED = 0.4;
const SEGMENT_SPACING = 6;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function fitnessColor(fitness: number): string {
  // 0 = dim gray, 0.5 = medium blue, 1.0 = bright cyan
  if (fitness < 0.5) {
    const t = fitness * 2;
    const r = Math.round(80 + t * (40 - 80));
    const g = Math.round(80 + t * (120 - 80));
    const b = Math.round(90 + t * (220 - 90));
    return `rgb(${r},${g},${b})`;
  }
  const t = (fitness - 0.5) * 2;
  const r = Math.round(40 + t * (0 - 40));
  const g = Math.round(120 + t * (212 - 120));
  const b = Math.round(220 + t * (255 - 220));
  return `rgb(${r},${g},${b})`;
}

function fitnessGlow(fitness: number): string {
  if (fitness > 0.8) return `rgba(0, 212, 255, ${0.3 + fitness * 0.3})`;
  if (fitness > 0.5) return `rgba(34, 136, 255, ${0.15 + fitness * 0.15})`;
  return 'transparent';
}

// ---------------------------------------------------------------------------
// Synthetic data generation
// ---------------------------------------------------------------------------

function randomInCircle(radius: number): Vec2 {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius * 0.85;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function initOrganisms(): ArenaOrganism[] {
  return Array.from({ length: NUM_ORGANISMS }, (_, i) => {
    const pos = randomInCircle(ARENA_RADIUS - 30);
    const angle = Math.random() * Math.PI * 2;
    const fitness = Math.random();
    const segments: Vec2[] = [];
    for (let s = 0; s < 4; s++) {
      segments.push({
        x: -Math.cos(angle) * SEGMENT_SPACING * s,
        y: -Math.sin(angle) * SEGMENT_SPACING * s,
      });
    }
    return {
      id: i,
      pos,
      vel: { x: Math.cos(angle) * ORGANISM_SPEED, y: Math.sin(angle) * ORGANISM_SPEED },
      segments,
      fitness,
      targetFood: i % NUM_FOOD,
      angle,
    };
  });
}

function initFoods(): Food[] {
  return Array.from({ length: NUM_FOOD }, () => ({
    pos: randomInCircle(ARENA_RADIUS - 60),
    radius: 5,
    pulse: Math.random() * Math.PI * 2,
  }));
}

function initObstacles(): Obstacle[] {
  return Array.from({ length: NUM_OBSTACLES }, () => ({
    pos: randomInCircle(ARENA_RADIUS - 80),
    radius: 18 + Math.random() * 14,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArenaView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const organismsRef = useRef<ArenaOrganism[]>(initOrganisms());
  const foodsRef = useRef<Food[]>(initFoods());
  const obstaclesRef = useRef<Obstacle[]>(initObstacles());
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  const currentRun = useEvolutionStore((s) => s.currentRun);
  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);

  // Update organism fitnesses from evolution store
  useEffect(() => {
    if (!fitnessHistory.best.length) return;
    const best = fitnessHistory.best[fitnessHistory.best.length - 1] ?? 0;
    const mean = fitnessHistory.mean[fitnessHistory.mean.length - 1] ?? 0;
    const orgs = organismsRef.current;
    for (let i = 0; i < orgs.length; i++) {
      // Distribute fitness: top organisms get near best, bottom near 0
      const rank = i / (orgs.length - 1); // 0=worst, 1=best
      orgs[i].fitness = Math.max(0, Math.min(1, mean * (1 - rank) + best * rank + (Math.random() - 0.5) * 0.05));
    }
    // Sort so best are last (drawn on top)
    orgs.sort((a, b) => a.fitness - b.fitness);
  }, [fitnessHistory]);

  const tick = useCallback((dt: number) => {
    const orgs = organismsRef.current;
    const foods = foodsRef.current;
    const obstacles = obstaclesRef.current;

    for (const org of orgs) {
      // Steer toward target food
      const food = foods[org.targetFood];
      if (food) {
        const dx = food.pos.x - org.pos.x;
        const dy = food.pos.y - org.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 8) {
          // Reached food — pick new target
          org.targetFood = Math.floor(Math.random() * foods.length);
        } else {
          // Steer gently toward food
          const steerStrength = 0.015 + org.fitness * 0.02;
          const targetAngle = Math.atan2(dy, dx);
          let angleDiff = targetAngle - org.angle;
          // Normalize
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          org.angle += angleDiff * steerStrength;
        }
      }

      // Avoid obstacles
      for (const obs of obstacles) {
        const dx = org.pos.x - obs.pos.x;
        const dy = org.pos.y - obs.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < obs.radius + 15) {
          const pushStrength = 0.8 / Math.max(dist - obs.radius, 1);
          org.pos.x += (dx / dist) * pushStrength;
          org.pos.y += (dy / dist) * pushStrength;
        }
      }

      // Stay in arena
      const distFromCenter = Math.sqrt(org.pos.x * org.pos.x + org.pos.y * org.pos.y);
      if (distFromCenter > ARENA_RADIUS - 20) {
        const pushAngle = Math.atan2(-org.pos.y, -org.pos.x);
        org.angle += (pushAngle - org.angle) * 0.05;
      }

      // Add slight wander
      org.angle += (Math.random() - 0.5) * 0.08;

      // Speed varies with fitness
      const speed = (ORGANISM_SPEED + org.fitness * 0.3) * dt * 60;
      org.vel.x = Math.cos(org.angle) * speed;
      org.vel.y = Math.sin(org.angle) * speed;
      org.pos.x += org.vel.x;
      org.pos.y += org.vel.y;

      // Update trailing segments (follow-the-leader)
      for (let s = 0; s < org.segments.length; s++) {
        const target = s === 0
          ? { x: 0, y: 0 }
          : org.segments[s - 1];
        const seg = org.segments[s];
        const sdx = target.x - seg.x;
        const sdy = target.y - seg.y;
        const segDist = Math.sqrt(sdx * sdx + sdy * sdy);
        if (segDist > SEGMENT_SPACING) {
          const ratio = SEGMENT_SPACING / segDist;
          seg.x = target.x - sdx * ratio;
          seg.y = target.y - sdy * ratio;
        }
        // Smooth follow
        seg.x += (target.x - seg.x - Math.cos(org.angle) * SEGMENT_SPACING * (s + 1)) * 0.08;
        seg.y += (target.y - seg.y - Math.sin(org.angle) * SEGMENT_SPACING * (s + 1)) * 0.08;
      }
    }

    // Pulse food
    for (const f of foods) {
      f.pulse += dt * 2;
    }
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cx = width / 2;
    const cy = height / 2;
    const t = timeRef.current;

    // Clear
    ctx.fillStyle = '#040408';
    ctx.fillRect(0, 0, width, height);

    // Arena background with subtle radial gradient
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ARENA_RADIUS);
    bgGrad.addColorStop(0, 'rgba(8, 14, 28, 1)');
    bgGrad.addColorStop(0.7, 'rgba(6, 10, 20, 1)');
    bgGrad.addColorStop(1, 'rgba(3, 5, 10, 1)');
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Arena border
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(40, 80, 140, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Subtle grid inside arena
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(30, 50, 90, 0.08)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let x = cx - ARENA_RADIUS; x <= cx + ARENA_RADIUS; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, cy - ARENA_RADIUS);
      ctx.lineTo(x, cy + ARENA_RADIUS);
      ctx.stroke();
    }
    for (let y = cy - ARENA_RADIUS; y <= cy + ARENA_RADIUS; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(cx - ARENA_RADIUS, y);
      ctx.lineTo(cx + ARENA_RADIUS, y);
      ctx.stroke();
    }
    ctx.restore();

    // Fitness heatmap overlay — draw circles where high-fitness organisms cluster
    const orgs = organismsRef.current;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();
    for (const org of orgs) {
      if (org.fitness > 0.5) {
        const heatGrad = ctx.createRadialGradient(
          cx + org.pos.x, cy + org.pos.y, 0,
          cx + org.pos.x, cy + org.pos.y, 40 + org.fitness * 30,
        );
        heatGrad.addColorStop(0, `rgba(0, 180, 255, ${org.fitness * 0.04})`);
        heatGrad.addColorStop(1, 'rgba(0, 180, 255, 0)');
        ctx.fillStyle = heatGrad;
        ctx.fillRect(
          cx + org.pos.x - 70, cy + org.pos.y - 70,
          140, 140,
        );
      }
    }
    ctx.restore();

    // Obstacles
    const obstacles = obstaclesRef.current;
    for (const obs of obstacles) {
      const obsGrad = ctx.createRadialGradient(
        cx + obs.pos.x, cy + obs.pos.y, 0,
        cx + obs.pos.x, cy + obs.pos.y, obs.radius,
      );
      obsGrad.addColorStop(0, 'rgba(60, 60, 70, 0.6)');
      obsGrad.addColorStop(0.7, 'rgba(40, 40, 50, 0.4)');
      obsGrad.addColorStop(1, 'rgba(30, 30, 40, 0)');
      ctx.beginPath();
      ctx.arc(cx + obs.pos.x, cy + obs.pos.y, obs.radius, 0, Math.PI * 2);
      ctx.fillStyle = obsGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 80, 100, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Food sources
    const foods = foodsRef.current;
    for (const food of foods) {
      const pulseR = food.radius + Math.sin(food.pulse) * 1.5;

      // Outer glow
      const glowGrad = ctx.createRadialGradient(
        cx + food.pos.x, cy + food.pos.y, 0,
        cx + food.pos.x, cy + food.pos.y, pulseR * 4,
      );
      glowGrad.addColorStop(0, 'rgba(0, 255, 136, 0.15)');
      glowGrad.addColorStop(1, 'rgba(0, 255, 136, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(
        cx + food.pos.x - pulseR * 4, cy + food.pos.y - pulseR * 4,
        pulseR * 8, pulseR * 8,
      );

      // Core
      ctx.beginPath();
      ctx.arc(cx + food.pos.x, cy + food.pos.y, pulseR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 136, ${0.7 + Math.sin(food.pulse) * 0.2})`;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Organisms
    for (const org of orgs) {
      const color = fitnessColor(org.fitness);
      const glow = fitnessGlow(org.fitness);

      // Draw worm-like curve through segments
      const points: Vec2[] = [
        { x: cx + org.pos.x, y: cy + org.pos.y },
        ...org.segments.map((s) => ({ x: cx + org.pos.x + s.x, y: cy + org.pos.y + s.y })),
      ];

      // Glow trail for high-fitness organisms
      if (org.fitness > 0.5) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const midX = (prev.x + curr.x) / 2;
          const midY = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        ctx.strokeStyle = glow;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Body curve
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 + org.fitness * 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Head dot
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 2.5 + org.fitness * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      if (org.fitness > 0.7) {
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Generation / status overlay
    const gen = currentRun?.generation ?? 0;
    const status = currentRun?.status ?? 'idle';
    ctx.font = '11px "SF Mono", "Fira Code", monospace';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
    ctx.textAlign = 'left';
    ctx.fillText(`GEN ${gen}`, 12, 20);

    if (status === 'running') {
      // Animated dot
      const dotAlpha = 0.4 + Math.sin(t * 3) * 0.3;
      ctx.beginPath();
      ctx.arc(8, 34, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 136, ${dotAlpha})`;
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
      ctx.fillText('EVOLVING', 16, 38);
    } else if (status === 'idle') {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.fillText('IDLE', 12, 38);
    } else if (status === 'paused') {
      ctx.fillStyle = 'rgba(255, 170, 34, 0.6)';
      ctx.fillText('PAUSED', 12, 38);
    } else if (status === 'completed') {
      ctx.fillStyle = 'rgba(0, 212, 255, 0.6)';
      ctx.fillText('COMPLETE', 12, 38);
    }

    // Population count
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.textAlign = 'right';
    ctx.fillText(`POP ${orgs.length}`, width - 12, 20);
  }, [currentRun]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      timeRef.current += dt;

      // Resize canvas to container
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        const dpr = window.devicePixelRatio || 1;
        const w = rect.width;
        const h = rect.height;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
          ctx.scale(dpr, dpr);
        }
      }

      tick(dt);
      draw(ctx, canvas.clientWidth, canvas.clientHeight);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [tick, draw]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#040408',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
