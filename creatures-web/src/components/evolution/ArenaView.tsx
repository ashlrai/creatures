import { useRef, useEffect, useCallback } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';
import { getChallengeById, CHALLENGE_PRESETS } from '../../data/challengePresets';
import type { ChallengePreset } from '../../types/evolution';

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
  targetFood: number; // index into rendered food array
  angle: number;
}

interface RenderedEntity {
  type: string;
  pos: Vec2;
  radius: number;
  intensity: number;
  color: string;
  pulse: number;
  params?: Record<string, unknown>;
  // For predator dynamics
  vel?: Vec2;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARENA_RADIUS = 280;
const NUM_ORGANISMS = 16;
const ORGANISM_SPEED = 0.4;
const SEGMENT_SPACING = 6;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function fitnessColor(fitness: number): string {
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
// Entity initialization from preset
// ---------------------------------------------------------------------------

function normalizedToArena(x: number, y: number): Vec2 {
  return { x: x * ARENA_RADIUS * 1.8, y: y * ARENA_RADIUS * 1.8 };
}

function initEntitiesFromPreset(preset: ChallengePreset): RenderedEntity[] {
  return preset.entities.map((e) => {
    const pos = normalizedToArena(e.x, e.y);
    return {
      type: e.type,
      pos,
      radius: e.radius * ARENA_RADIUS * 2,
      intensity: e.intensity,
      color: e.color,
      pulse: Math.random() * Math.PI * 2,
      params: e.params,
      vel: e.params?.predator ? { x: 0, y: 0 } : undefined,
    };
  });
}

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
      targetFood: i % 5,
      angle,
    };
  });
}

// ---------------------------------------------------------------------------
// Drawing helpers for entity types
// ---------------------------------------------------------------------------

function drawFood(ctx: CanvasRenderingContext2D, cx: number, cy: number, entity: RenderedEntity) {
  const x = cx + entity.pos.x;
  const y = cy + entity.pos.y;
  const pulseR = entity.radius + Math.sin(entity.pulse) * 1.5;

  // Outer glow
  const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, pulseR * 4);
  glowGrad.addColorStop(0, `rgba(0, 255, 136, ${0.15 * entity.intensity})`);
  glowGrad.addColorStop(1, 'rgba(0, 255, 136, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(x - pulseR * 4, y - pulseR * 4, pulseR * 8, pulseR * 8);

  // Core
  ctx.beginPath();
  ctx.arc(x, y, pulseR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 255, 136, ${0.5 + entity.intensity * 0.3 + Math.sin(entity.pulse) * 0.15})`;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawObstacle(ctx: CanvasRenderingContext2D, cx: number, cy: number, entity: RenderedEntity) {
  const x = cx + entity.pos.x;
  const y = cy + entity.pos.y;
  const obsGrad = ctx.createRadialGradient(x, y, 0, x, y, entity.radius);
  obsGrad.addColorStop(0, 'rgba(60, 60, 70, 0.6)');
  obsGrad.addColorStop(0.7, 'rgba(40, 40, 50, 0.4)');
  obsGrad.addColorStop(1, 'rgba(30, 30, 40, 0)');
  ctx.beginPath();
  ctx.arc(x, y, entity.radius, 0, Math.PI * 2);
  ctx.fillStyle = obsGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 80, 100, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawToxicZone(ctx: CanvasRenderingContext2D, cx: number, cy: number, entity: RenderedEntity, time: number) {
  const x = cx + entity.pos.x;
  const y = cy + entity.pos.y;
  const pulseScale = 1.0 + Math.sin(time * 2 + entity.pulse) * 0.08;
  const r = entity.radius * pulseScale;

  // Danger glow
  const toxGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
  toxGrad.addColorStop(0, `rgba(255, 34, 68, ${0.25 * entity.intensity})`);
  toxGrad.addColorStop(0.6, `rgba(255, 34, 68, ${0.1 * entity.intensity})`);
  toxGrad.addColorStop(1, 'rgba(255, 34, 68, 0)');
  ctx.fillStyle = toxGrad;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Core zone
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 34, 68, ${0.15 + entity.intensity * 0.12})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 68, 102, ${0.3 + Math.sin(time * 3) * 0.15})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Hazard icon (small skull-like dots)
  ctx.fillStyle = `rgba(255, 100, 120, ${0.4 + Math.sin(time * 2) * 0.2})`;
  ctx.font = `${Math.max(8, r * 0.3)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u2620', x, y); // ☠
  ctx.textBaseline = 'alphabetic';
}

function drawLightZone(ctx: CanvasRenderingContext2D, cx: number, cy: number, entity: RenderedEntity, time: number) {
  const x = cx + entity.pos.x;
  const y = cy + entity.pos.y;
  const pulseAlpha = entity.intensity * (0.08 + Math.sin(time * 1.5) * 0.03);

  const lightGrad = ctx.createRadialGradient(x, y, 0, x, y, entity.radius);
  lightGrad.addColorStop(0, `rgba(255, 221, 68, ${pulseAlpha * 1.5})`);
  lightGrad.addColorStop(0.5, `rgba(255, 221, 68, ${pulseAlpha})`);
  lightGrad.addColorStop(1, 'rgba(255, 221, 68, 0)');
  ctx.beginPath();
  ctx.arc(x, y, entity.radius, 0, Math.PI * 2);
  ctx.fillStyle = lightGrad;
  ctx.fill();
}

function drawChemicalGradient(ctx: CanvasRenderingContext2D, cx: number, cy: number, entity: RenderedEntity, time: number) {
  const x = cx + entity.pos.x;
  const y = cy + entity.pos.y;

  // Concentric rings emanating outward
  const nRings = 4;
  for (let i = nRings; i >= 1; i--) {
    const ringR = entity.radius * (i / nRings);
    const phase = (time * 0.5 + i * 0.5) % (Math.PI * 2);
    const alpha = entity.intensity * 0.12 * (1 - i / (nRings + 1)) * (0.6 + Math.sin(phase) * 0.4);
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(68, 136, 255, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPheromoneSource(ctx: CanvasRenderingContext2D, cx: number, cy: number, entity: RenderedEntity, time: number) {
  const x = cx + entity.pos.x;
  const y = cy + entity.pos.y;

  // Emanating wave rings
  for (let w = 0; w < 3; w++) {
    const wavePhase = (time * 1.2 + w * 2.1) % 4.0;
    const waveR = entity.radius * 0.3 + wavePhase * entity.radius * 0.5;
    const waveAlpha = Math.max(0, entity.intensity * 0.2 * (1 - wavePhase / 4.0));
    ctx.beginPath();
    ctx.arc(x, y, waveR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(170, 102, 255, ${waveAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Core dot
  ctx.beginPath();
  ctx.arc(x, y, entity.radius * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(170, 102, 255, ${0.5 + Math.sin(time * 2) * 0.2})`;
  ctx.shadowColor = '#aa66ff';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArenaView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const organismsRef = useRef<ArenaOrganism[]>(initOrganisms());
  const entitiesRef = useRef<RenderedEntity[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const lastPresetRef = useRef<string | null>(null);

  const currentRun = useEvolutionStore((s) => s.currentRun);
  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);
  const selectedChallenge = useEvolutionStore((s) => s.selectedChallenge);

  // Initialize entities from selected preset
  useEffect(() => {
    const presetId = selectedChallenge ?? 'open-field';
    if (lastPresetRef.current === presetId) return;
    lastPresetRef.current = presetId;

    const preset = getChallengeById(presetId) ?? CHALLENGE_PRESETS[0];
    entitiesRef.current = initEntitiesFromPreset(preset);

    // Re-assign organism food targets
    const foodEntities = entitiesRef.current.filter((e) => e.type === 'food');
    for (const org of organismsRef.current) {
      org.targetFood = foodEntities.length > 0 ? org.id % foodEntities.length : 0;
    }
  }, [selectedChallenge]);

  // Update organism fitnesses from evolution store
  useEffect(() => {
    if (!fitnessHistory.best.length) return;
    const best = fitnessHistory.best[fitnessHistory.best.length - 1] ?? 0;
    const mean = fitnessHistory.mean[fitnessHistory.mean.length - 1] ?? 0;
    const orgs = organismsRef.current;
    for (let i = 0; i < orgs.length; i++) {
      const rank = i / (orgs.length - 1);
      orgs[i].fitness = Math.max(0, Math.min(1, mean * (1 - rank) + best * rank + (Math.random() - 0.5) * 0.05));
    }
    orgs.sort((a, b) => a.fitness - b.fitness);
  }, [fitnessHistory]);

  const tick = useCallback((dt: number) => {
    const orgs = organismsRef.current;
    const entities = entitiesRef.current;
    const foodEntities = entities.filter((e) => e.type === 'food');
    const obstacleEntities = entities.filter((e) => e.type === 'obstacle');
    const toxicEntities = entities.filter((e) => e.type === 'toxic_zone');

    // Update predator dynamics — move toward organism cluster center
    for (const ent of toxicEntities) {
      if (!ent.params?.predator || !ent.vel) continue;
      // Find center of mass of organisms
      let comX = 0, comY = 0;
      for (const org of orgs) { comX += org.pos.x; comY += org.pos.y; }
      comX /= orgs.length; comY /= orgs.length;
      const dx = comX - ent.pos.x;
      const dy = comY - ent.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        const speed = 0.3 * dt * 60;
        ent.vel.x = (dx / dist) * speed;
        ent.vel.y = (dy / dist) * speed;
        ent.pos.x += ent.vel.x;
        ent.pos.y += ent.vel.y;
      }
      // Keep in arena
      const predDist = Math.sqrt(ent.pos.x * ent.pos.x + ent.pos.y * ent.pos.y);
      if (predDist > ARENA_RADIUS - 40) {
        ent.pos.x *= (ARENA_RADIUS - 40) / predDist;
        ent.pos.y *= (ARENA_RADIUS - 40) / predDist;
      }
    }

    for (const org of orgs) {
      // Steer toward target food
      if (foodEntities.length > 0) {
        const food = foodEntities[org.targetFood % foodEntities.length];
        if (food) {
          const dx = food.pos.x - org.pos.x;
          const dy = food.pos.y - org.pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 8) {
            org.targetFood = Math.floor(Math.random() * foodEntities.length);
          } else {
            const steerStrength = 0.015 + org.fitness * 0.02;
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - org.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            org.angle += angleDiff * steerStrength;
          }
        }
      }

      // Avoid obstacles
      for (const obs of obstacleEntities) {
        const dx = org.pos.x - obs.pos.x;
        const dy = org.pos.y - obs.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < obs.radius + 15) {
          const pushStrength = 0.8 / Math.max(dist - obs.radius, 1);
          org.pos.x += (dx / dist) * pushStrength;
          org.pos.y += (dy / dist) * pushStrength;
        }
      }

      // Avoid toxic zones
      for (const tox of toxicEntities) {
        const dx = org.pos.x - tox.pos.x;
        const dy = org.pos.y - tox.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < tox.radius + 20) {
          const pushStrength = 1.2 / Math.max(dist - tox.radius, 1);
          org.pos.x += (dx / dist) * pushStrength;
          org.pos.y += (dy / dist) * pushStrength;
          // Steer away more aggressively
          const fleeAngle = Math.atan2(dy, dx);
          let angleDiff = fleeAngle - org.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          org.angle += angleDiff * 0.08;
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

      // Update trailing segments
      for (let s = 0; s < org.segments.length; s++) {
        const target = s === 0 ? { x: 0, y: 0 } : org.segments[s - 1];
        const seg = org.segments[s];
        const sdx = target.x - seg.x;
        const sdy = target.y - seg.y;
        const segDist = Math.sqrt(sdx * sdx + sdy * sdy);
        if (segDist > SEGMENT_SPACING) {
          const ratio = SEGMENT_SPACING / segDist;
          seg.x = target.x - sdx * ratio;
          seg.y = target.y - sdy * ratio;
        }
        seg.x += (target.x - seg.x - Math.cos(org.angle) * SEGMENT_SPACING * (s + 1)) * 0.08;
        seg.y += (target.y - seg.y - Math.sin(org.angle) * SEGMENT_SPACING * (s + 1)) * 0.08;
      }
    }

    // Pulse animated entities
    for (const ent of entities) {
      if (ent.type === 'food') ent.pulse += dt * 2;
    }
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cx = width / 2;
    const cy = height / 2;
    const t = timeRef.current;
    const entities = entitiesRef.current;
    const presetId = selectedChallenge ?? 'open-field';
    const preset = getChallengeById(presetId) ?? CHALLENGE_PRESETS[0];

    // Clear
    ctx.fillStyle = '#040408';
    ctx.fillRect(0, 0, width, height);

    // Arena background
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

    // Subtle grid
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(30, 50, 90, 0.08)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let x = cx - ARENA_RADIUS; x <= cx + ARENA_RADIUS; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, cy - ARENA_RADIUS); ctx.lineTo(x, cy + ARENA_RADIUS); ctx.stroke();
    }
    for (let y = cy - ARENA_RADIUS; y <= cy + ARENA_RADIUS; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(cx - ARENA_RADIUS, y); ctx.lineTo(cx + ARENA_RADIUS, y); ctx.stroke();
    }
    ctx.restore();

    // Draw entities by layer: gradients/light first, then obstacles/toxic, then food
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();

    // Layer 1: Chemical gradients and light zones (background)
    for (const ent of entities) {
      if (ent.type === 'chemical_gradient') drawChemicalGradient(ctx, cx, cy, ent, t);
      if (ent.type === 'light_zone') drawLightZone(ctx, cx, cy, ent, t);
      if (ent.type === 'pheromone_source') drawPheromoneSource(ctx, cx, cy, ent, t);
    }

    // Layer 2: Toxic zones
    for (const ent of entities) {
      if (ent.type === 'toxic_zone') drawToxicZone(ctx, cx, cy, ent, t);
    }

    // Layer 3: Obstacles
    for (const ent of entities) {
      if (ent.type === 'obstacle') drawObstacle(ctx, cx, cy, ent);
    }

    // Fitness heatmap overlay
    const orgs = organismsRef.current;
    for (const org of orgs) {
      if (org.fitness > 0.5) {
        const heatGrad = ctx.createRadialGradient(
          cx + org.pos.x, cy + org.pos.y, 0,
          cx + org.pos.x, cy + org.pos.y, 40 + org.fitness * 30,
        );
        heatGrad.addColorStop(0, `rgba(0, 180, 255, ${org.fitness * 0.04})`);
        heatGrad.addColorStop(1, 'rgba(0, 180, 255, 0)');
        ctx.fillStyle = heatGrad;
        ctx.fillRect(cx + org.pos.x - 70, cy + org.pos.y - 70, 140, 140);
      }
    }

    // Layer 4: Food (on top of heatmap)
    for (const ent of entities) {
      if (ent.type === 'food') drawFood(ctx, cx, cy, ent);
    }

    ctx.restore();

    // Organisms
    for (const org of orgs) {
      const color = fitnessColor(org.fitness);
      const glow = fitnessGlow(org.fitness);

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

    // Challenge name overlay (top right of arena)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '10px "SF Mono", "Fira Code", monospace';
    ctx.fillText(`${preset.icon} ${preset.name.toUpperCase()}`, width - 12, 20);
    ctx.fillStyle = 'rgba(140, 170, 200, 0.25)';
    ctx.font = '9px "SF Mono", "Fira Code", monospace';
    ctx.fillText(preset.evolutionaryPressure, width - 12, 32);

    // Population count
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.textAlign = 'right';
    ctx.font = '11px "SF Mono", "Fira Code", monospace';
    ctx.fillText(`POP ${orgs.length}`, width - 12, height - 12);
  }, [currentRun, selectedChallenge]);

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
    return () => { cancelAnimationFrame(animFrameRef.current); };
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
