import { useRef, useEffect, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Vec2 {
  x: number;
  y: number;
}

export interface EcosystemOrganism {
  id: number;
  species: 'c_elegans' | 'drosophila';
  position: Vec2;
  energy: number;
  alive: boolean;
  // Internal sim state
  angle: number;
  vel: Vec2;
  segments: Vec2[];
  fadeAlpha: number;
}

export interface EcosystemFood {
  position: Vec2;
  energy: number;
  pulse: number;
}

export interface EcosystemStats {
  c_elegans_count: number;
  drosophila_count: number;
  total_food: number;
  generation: number;
}

/** Organism record returned by the massive brain-world API. */
export interface MassiveOrganism {
  x: number;
  y: number;
  species: number; // 0 = c_elegans, 1 = drosophila
  energy: number;
  age?: number;
  generation?: number;
  lineage_id?: string;
  lifetime_food_eaten?: number;
}

/** Neural stats from the massive brain-world state. */
export interface MassiveNeuralStats {
  total_neurons: number;
  neurons_per_organism: number;
  n_organisms: number;
  total_synapses: number;
  total_fired: number;
  mean_firing_rate: number;
}

/** Emergent behavior event. */
export interface EmergentEvent {
  behavior_type: string;
  confidence: number;
  description: string;
  timestamp?: number;
}

interface EcosystemViewProps {
  organisms?: EcosystemOrganism[];
  food_sources?: EcosystemFood[];
  stats?: EcosystemStats;
  ecosystemId?: string | null;
  /** When set, renders massive brain-world data instead of standard ecosystem. */
  massiveId?: string | null;
  massiveOrganisms?: MassiveOrganism[];
  massiveNeuralStats?: MassiveNeuralStats | null;
  emergentEvents?: EmergentEvent[];
  worldType?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARENA_RADIUS = 260;
const MOCK_ELEGANS = 20;
const MOCK_DROSOPHILA = 8;
const MOCK_FOOD = 12;
const SEGMENT_SPACING = 5;

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

function randomInCircle(radius: number): Vec2 {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius * 0.85;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function createMockOrganisms(): EcosystemOrganism[] {
  const orgs: EcosystemOrganism[] = [];
  let id = 0;

  // C. elegans -- small worms
  for (let i = 0; i < MOCK_ELEGANS; i++) {
    const pos = randomInCircle(ARENA_RADIUS - 30);
    const angle = Math.random() * Math.PI * 2;
    const segments: Vec2[] = [];
    for (let s = 0; s < 3; s++) {
      segments.push({
        x: -Math.cos(angle) * SEGMENT_SPACING * (s + 1),
        y: -Math.sin(angle) * SEGMENT_SPACING * (s + 1),
      });
    }
    orgs.push({
      id: id++,
      species: 'c_elegans',
      position: pos,
      energy: 0.4 + Math.random() * 0.6,
      alive: true,
      angle,
      vel: { x: 0, y: 0 },
      segments,
      fadeAlpha: 1,
    });
  }

  // Drosophila -- larger flies
  for (let i = 0; i < MOCK_DROSOPHILA; i++) {
    const pos = randomInCircle(ARENA_RADIUS - 40);
    const angle = Math.random() * Math.PI * 2;
    orgs.push({
      id: id++,
      species: 'drosophila',
      position: pos,
      energy: 0.5 + Math.random() * 0.5,
      alive: true,
      angle,
      vel: { x: 0, y: 0 },
      segments: [],
      fadeAlpha: 1,
    });
  }

  return orgs;
}

function createMockFood(): EcosystemFood[] {
  return Array.from({ length: MOCK_FOOD }, () => ({
    position: randomInCircle(ARENA_RADIUS - 50),
    energy: 0.3 + Math.random() * 0.7,
    pulse: Math.random() * Math.PI * 2,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EcosystemView({
  organisms, food_sources, stats, ecosystemId,
  massiveId, massiveOrganisms, massiveNeuralStats, emergentEvents, worldType,
}: EcosystemViewProps) {
  const isMassive = !!massiveId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orgsRef = useRef<EcosystemOrganism[]>(organisms ?? createMockOrganisms());
  const foodRef = useRef<EcosystemFood[]>(food_sources ?? createMockFood());
  const massiveOrgsRef = useRef<MassiveOrganism[]>(massiveOrganisms ?? []);
  const neuralStatsRef = useRef<MassiveNeuralStats | null>(massiveNeuralStats ?? null);
  const emergentRef = useRef<EmergentEvent[]>(emergentEvents ?? []);
  const worldTypeRef = useRef<string>(worldType ?? 'soil');
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const [apiStats, setApiStats] = useState<EcosystemStats | null>(null);

  // Poll real API data when ecosystemId is provided
  useEffect(() => {
    if (!ecosystemId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/ecosystem/${ecosystemId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();

        // Update organisms from API if available
        if (data.organisms && Array.isArray(data.organisms)) {
          orgsRef.current = data.organisms.map((o: Record<string, unknown>, i: number) => ({
            id: (o.id as number) ?? i,
            species: (o.species as string) ?? 'c_elegans',
            position: (o.position as Vec2) ?? { x: 0, y: 0 },
            energy: (o.energy as number) ?? 0.5,
            alive: (o.alive as boolean) ?? true,
            angle: (o.angle as number) ?? Math.random() * Math.PI * 2,
            vel: (o.vel as Vec2) ?? { x: 0, y: 0 },
            segments: (o.segments as Vec2[]) ?? [],
            fadeAlpha: (o.alive as boolean) !== false ? 1 : 0,
          }));
        }

        // Update food from API if available
        if (data.food_sources && Array.isArray(data.food_sources)) {
          foodRef.current = data.food_sources.map((f: Record<string, unknown>) => ({
            position: (f.position as Vec2) ?? { x: 0, y: 0 },
            energy: (f.energy as number) ?? 0.5,
            pulse: Math.random() * Math.PI * 2,
          }));
        }

        // Update stats
        if (data.stats) {
          setApiStats(data.stats as EcosystemStats);
        }
      } catch {
        // Silently fall back to mock simulation on fetch failure
      }
    };

    const interval = setInterval(poll, 500);
    poll(); // Initial fetch
    return () => { cancelled = true; clearInterval(interval); };
  }, [ecosystemId]);

  // Sync props into refs when they change
  useEffect(() => {
    if (organisms) orgsRef.current = organisms;
  }, [organisms]);

  useEffect(() => {
    if (food_sources) foodRef.current = food_sources;
  }, [food_sources]);

  // Sync massive mode props into refs
  useEffect(() => {
    if (massiveOrganisms) massiveOrgsRef.current = massiveOrganisms;
  }, [massiveOrganisms]);

  useEffect(() => {
    neuralStatsRef.current = massiveNeuralStats ?? null;
  }, [massiveNeuralStats]);

  useEffect(() => {
    emergentRef.current = emergentEvents ?? [];
  }, [emergentEvents]);

  useEffect(() => {
    worldTypeRef.current = worldType ?? 'soil';
  }, [worldType]);

  // Compute live stats from ref data
  const computeStats = useCallback((): EcosystemStats => {
    if (apiStats) return apiStats;
    if (stats) return stats;
    const orgs = orgsRef.current;
    return {
      c_elegans_count: orgs.filter((o) => o.species === 'c_elegans' && o.alive).length,
      drosophila_count: orgs.filter((o) => o.species === 'drosophila' && o.alive).length,
      total_food: foodRef.current.length,
      generation: 0,
    };
  }, [stats, apiStats]);

  const tick = useCallback((dt: number) => {
    const orgs = orgsRef.current;
    const foods = foodRef.current;

    for (const org of orgs) {
      if (!org.alive) {
        org.fadeAlpha = Math.max(0, org.fadeAlpha - dt * 0.5);
        continue;
      }

      // Random death chance (very rare)
      if (Math.random() < 0.00005) {
        org.alive = false;
        continue;
      }

      // Steer toward nearest food
      let nearestDist = Infinity;
      let nearestFood: EcosystemFood | null = null;
      for (const f of foods) {
        const dx = f.position.x - org.position.x;
        const dy = f.position.y - org.position.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) {
          nearestDist = d;
          nearestFood = f;
        }
      }

      if (nearestFood && nearestDist > 5) {
        const dx = nearestFood.position.x - org.position.x;
        const dy = nearestFood.position.y - org.position.y;
        const targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - org.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        org.angle += diff * 0.02;
      }

      // Wander
      org.angle += (Math.random() - 0.5) * 0.1;

      // Stay in arena
      const distC = Math.sqrt(org.position.x * org.position.x + org.position.y * org.position.y);
      if (distC > ARENA_RADIUS - 25) {
        const pushAngle = Math.atan2(-org.position.y, -org.position.x);
        org.angle += (pushAngle - org.angle) * 0.06;
      }

      // Speed: drosophila faster
      const baseSpeed = org.species === 'drosophila' ? 0.6 : 0.35;
      const speed = baseSpeed * dt * 60;
      org.vel.x = Math.cos(org.angle) * speed;
      org.vel.y = Math.sin(org.angle) * speed;
      org.position.x += org.vel.x;
      org.position.y += org.vel.y;

      // Update worm segments for c_elegans
      if (org.species === 'c_elegans') {
        for (let s = 0; s < org.segments.length; s++) {
          const target = s === 0 ? { x: 0, y: 0 } : org.segments[s - 1];
          const seg = org.segments[s];
          seg.x += (target.x - seg.x - Math.cos(org.angle) * SEGMENT_SPACING * (s + 1)) * 0.1;
          seg.y += (target.y - seg.y - Math.sin(org.angle) * SEGMENT_SPACING * (s + 1)) * 0.1;
        }
      }
    }

    // Pulse food
    for (const f of foods) {
      f.pulse += dt * 2.5;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  /** Draw the shared arena background (clear, gradient, border, grid). */
  const drawArenaBackground = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, cx: number, cy: number) => {
    ctx.fillStyle = '#030308';
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ARENA_RADIUS);
    bgGrad.addColorStop(0, 'rgba(6, 10, 22, 1)');
    bgGrad.addColorStop(0.8, 'rgba(4, 7, 16, 1)');
    bgGrad.addColorStop(1, 'rgba(2, 3, 8, 1)');
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(40, 70, 120, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle grid
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(30, 50, 80, 0.06)';
    ctx.lineWidth = 0.5;
    const gs = 50;
    for (let x = cx - ARENA_RADIUS; x <= cx + ARENA_RADIUS; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, cy - ARENA_RADIUS);
      ctx.lineTo(x, cy + ARENA_RADIUS);
      ctx.stroke();
    }
    for (let y = cy - ARENA_RADIUS; y <= cy + ARENA_RADIUS; y += gs) {
      ctx.beginPath();
      ctx.moveTo(cx - ARENA_RADIUS, y);
      ctx.lineTo(cx + ARENA_RADIUS, y);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  /** Draw massive brain-world organisms as colored dots with neural glow. */
  const drawMassive = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cx = width / 2;
    const cy = height / 2;
    const t = timeRef.current;

    drawArenaBackground(ctx, width, height, cx, cy);

    const mOrgs = massiveOrgsRef.current;
    const ns = neuralStatsRef.current;
    const events = emergentRef.current;
    const wt = worldTypeRef.current;

    // Mean firing rate drives "neural glow" intensity (0..1 scale, clamp)
    const firingGlow = ns ? Math.min(1, ns.mean_firing_rate / 0.3) : 0;

    // Scale factor: massive ecosystem coords are in arena units (e.g. 0..50),
    // we map to the canvas ARENA_RADIUS circle.
    // The backend uses arena_size (default 50), so coords range roughly -25..25
    const scale = ARENA_RADIUS / 25;

    // Draw organisms as small dots
    for (const org of mOrgs) {
      const ox = cx + org.x * scale;
      const oy = cy + org.y * scale;

      // Skip if outside visible area
      const dx = ox - cx;
      const dy = oy - cy;
      if (dx * dx + dy * dy > ARENA_RADIUS * ARENA_RADIUS) continue;

      const isCelegans = org.species === 0;
      const baseAlpha = 0.4 + org.energy * 0.5;
      // Neural pulse: organisms glow brighter with higher mean firing rate
      const glowBoost = firingGlow * 0.4 * (0.7 + 0.3 * Math.sin(t * 6 + ox * 0.1 + oy * 0.1));
      const alpha = Math.min(1, baseAlpha + glowBoost);

      if (isCelegans) {
        // Cyan dot
        const r = 1.5 + org.energy * 0.5;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
        ctx.fill();

        // Neural glow halo
        if (glowBoost > 0.1) {
          ctx.beginPath();
          ctx.arc(ox, oy, r + 2 + glowBoost * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 212, 255, ${glowBoost * 0.15})`;
          ctx.fill();
        }
      } else {
        // Amber dot
        const r = 2 + org.energy * 0.5;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 170, 34, ${alpha})`;
        ctx.fill();

        if (glowBoost > 0.1) {
          ctx.beginPath();
          ctx.arc(ox, oy, r + 2 + glowBoost * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 170, 34, ${glowBoost * 0.15})`;
          ctx.fill();
        }
      }
    }

    // --- Stats overlay (top-left) ---
    ctx.font = '10px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(6, 6, 155, ns ? 80 : 52);

    ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
    ctx.fillText('MASSIVE BRAIN-WORLD', 12, 20);

    ctx.fillStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.fillText(`Organisms: ${mOrgs.length}`, 12, 34);

    if (ns) {
      ctx.fillStyle = 'rgba(180, 140, 255, 0.7)';
      ctx.fillText(`Neurons: ${ns.total_neurons.toLocaleString()}`, 12, 48);

      ctx.fillStyle = 'rgba(0, 255, 136, 0.7)';
      ctx.fillText(`Fired: ${ns.total_fired.toLocaleString()}`, 12, 62);

      ctx.fillStyle = 'rgba(255, 200, 100, 0.6)';
      ctx.fillText(`Rate: ${ns.mean_firing_rate.toFixed(3)}`, 12, 76);
    }

    // --- World type label (bottom-left) ---
    const worldLabels: Record<string, string> = {
      soil: 'SOIL', pond: 'POND', lab_plate: 'LAB PLATE', abstract: 'ABSTRACT',
    };
    ctx.font = '9px "SF Mono", "Fira Code", monospace';
    ctx.fillStyle = 'rgba(100, 130, 170, 0.35)';
    ctx.textAlign = 'left';
    ctx.fillText(worldLabels[wt] ?? wt.toUpperCase(), 12, height - 12);

    // --- Emergent behavior badges (top-right) ---
    if (events.length > 0) {
      ctx.textAlign = 'right';
      // Show up to 3 most recent unique behavior types
      const seen = new Set<string>();
      const recent: EmergentEvent[] = [];
      for (let i = events.length - 1; i >= 0 && recent.length < 3; i--) {
        if (!seen.has(events[i].behavior_type)) {
          seen.add(events[i].behavior_type);
          recent.push(events[i]);
        }
      }
      recent.reverse();

      const badgeColors: Record<string, string> = {
        aggregation: '255, 100, 100',
        trail_following: '100, 200, 255',
        avoidance_learning: '255, 200, 100',
      };

      for (let i = 0; i < recent.length; i++) {
        const ev = recent[i];
        const yPos = 14 + i * 18;
        const colorRgb = badgeColors[ev.behavior_type] ?? '180, 180, 220';
        const pulseAlpha = 0.5 + 0.3 * Math.sin(t * 4 + i);

        // Pulsing indicator dot
        ctx.beginPath();
        ctx.arc(width - 10, yPos - 3, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorRgb}, ${pulseAlpha})`;
        ctx.fill();

        // Label
        ctx.font = '9px "SF Mono", "Fira Code", monospace';
        ctx.fillStyle = `rgba(${colorRgb}, 0.7)`;
        const label = ev.behavior_type.replace(/_/g, ' ').toUpperCase() + ' DETECTED';
        ctx.fillText(label, width - 20, yPos);
      }
    }

    // --- Pulsing "LIVE" dot (below emergent badges) ---
    const dotAlpha = 0.4 + Math.sin(t * 3) * 0.3;
    const liveY = 14 + Math.min((emergentRef.current.length > 0 ? 3 : 0), 3) * 18 + (emergentRef.current.length > 0 ? 8 : 0);
    ctx.textAlign = 'right';
    ctx.beginPath();
    ctx.arc(width - 8, liveY, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 255, 136, ${dotAlpha})`;
    ctx.fill();
    ctx.font = '10px "SF Mono", "Fira Code", monospace';
    ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
    ctx.fillText('LIVE', width - 16, liveY + 4);
  }, [drawArenaBackground]);

  /** Draw standard (small) ecosystem. */
  const drawStandard = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cx = width / 2;
    const cy = height / 2;
    const t = timeRef.current;

    drawArenaBackground(ctx, width, height, cx, cy);

    // Food sources -- green pulsing dots
    const foods = foodRef.current;
    for (const food of foods) {
      const pr = 4 + Math.sin(food.pulse) * 1.5;
      const alpha = 0.5 + food.energy * 0.4;

      const gGrad = ctx.createRadialGradient(
        cx + food.position.x, cy + food.position.y, 0,
        cx + food.position.x, cy + food.position.y, pr * 4,
      );
      gGrad.addColorStop(0, `rgba(0, 255, 136, ${alpha * 0.2})`);
      gGrad.addColorStop(1, 'rgba(0, 255, 136, 0)');
      ctx.fillStyle = gGrad;
      ctx.fillRect(
        cx + food.position.x - pr * 4, cy + food.position.y - pr * 4,
        pr * 8, pr * 8,
      );

      ctx.beginPath();
      ctx.arc(cx + food.position.x, cy + food.position.y, pr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
      ctx.fill();
    }

    // Organisms
    const orgs = orgsRef.current;
    for (const org of orgs) {
      if (org.fadeAlpha <= 0) continue;

      const ox = cx + org.position.x;
      const oy = cy + org.position.y;
      const alpha = org.alive ? 1 : org.fadeAlpha;

      if (org.species === 'c_elegans') {
        const color = `rgba(0, 212, 255, ${0.5 + org.energy * 0.5})`;
        const points: Vec2[] = [
          { x: ox, y: oy },
          ...org.segments.map((s) => ({ x: ox + s.x, y: oy + s.y })),
        ];

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const mx = (prev.x + curr.x) / 2;
          const my = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(ox, oy, 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;

      } else {
        const color = `rgba(255, 170, 34, ${0.5 + org.energy * 0.5})`;
        ctx.globalAlpha = alpha;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(org.angle);

        const wingFlap = Math.sin(t * 12 + org.id) * 0.3;
        ctx.beginPath();
        ctx.ellipse(-2, -5 + wingFlap * 2, 3, 7, -0.3 + wingFlap, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 100, ${0.15 * alpha})`;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-2, 5 - wingFlap * 2, 3, 7, 0.3 - wingFlap, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 100, ${0.15 * alpha})`;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(5, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // Stats overlay
    const liveStats = {
      c_elegans: orgs.filter((o) => o.species === 'c_elegans' && o.alive).length,
      drosophila: orgs.filter((o) => o.species === 'drosophila' && o.alive).length,
    };
    const total = liveStats.c_elegans + liveStats.drosophila;

    ctx.font = '10px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(6, 6, 130, 52);

    ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
    ctx.fillText('ECOSYSTEM', 12, 20);

    ctx.fillStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.fillText(`C.elegans: ${liveStats.c_elegans}`, 12, 34);

    ctx.fillStyle = 'rgba(255, 170, 34, 0.7)';
    ctx.fillText(`Drosophila: ${liveStats.drosophila}`, 12, 48);

    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.textAlign = 'right';
    ctx.fillText(`POP ${total}`, width - 12, 20);

    const dotAlpha = 0.4 + Math.sin(t * 3) * 0.3;
    ctx.beginPath();
    ctx.arc(width - 8, 30, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 255, 136, ${dotAlpha})`;
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText('LIVE', width - 16, 34);
  }, [drawArenaBackground, computeStats]);

  /** Top-level draw dispatcher. */
  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (isMassive) {
      drawMassive(ctx, width, height);
    } else {
      drawStandard(ctx, width, height);
    }
  }, [isMassive, drawMassive, drawStandard]);

  // Animation loop at ~30fps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();
    let frameSkip = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      timeRef.current += dt;

      // Throttle to ~30fps
      frameSkip++;
      if (frameSkip % 2 === 0) {
        // Resize
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
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
        }

        tick(dt * 2); // compensate for frame skip
        draw(ctx, canvas.clientWidth, canvas.clientHeight);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [tick, draw]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#030308',
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
