import { useRef, useEffect, useCallback } from 'react';
import { useEvolutionStore } from '../../stores/evolutionStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEvent {
  generation: number;
  type: 'breakthrough' | 'god_intervention' | 'speciation';
  label: string;
}

// ---------------------------------------------------------------------------
// Derive timeline events from store data
// ---------------------------------------------------------------------------

function deriveEvents(
  generations: number[],
  bestFitness: number[],
  godReportCount: number,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Detect fitness breakthroughs (jumps > 5%)
  for (let i = 1; i < bestFitness.length; i++) {
    const jump = bestFitness[i] - bestFitness[i - 1];
    if (jump > 0.05) {
      events.push({
        generation: generations[i],
        type: 'breakthrough',
        label: `Fitness +${(jump * 100).toFixed(0)}%`,
      });
    }
  }

  // Mock speciation events at roughly every 20 generations
  for (const gen of generations) {
    if (gen > 0 && gen % 20 === 0) {
      events.push({
        generation: gen,
        type: 'speciation',
        label: 'Speciation event',
      });
    }
  }

  // God Agent interventions — place them at regular intervals
  if (godReportCount > 0) {
    const interval = Math.max(1, Math.floor(generations.length / godReportCount));
    for (let i = 0; i < godReportCount; i++) {
      const idx = Math.min(interval * (i + 1), generations.length - 1);
      if (idx >= 0 && generations[idx] !== undefined) {
        events.push({
          generation: generations[idx],
          type: 'god_intervention',
          label: 'God Agent tweak',
        });
      }
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

const EVENT_COLORS: Record<TimelineEvent['type'], string> = {
  breakthrough: '#00d4ff',
  god_intervention: '#ff2288',
  speciation: '#ffaa22',
};

const EVENT_ICONS: Record<TimelineEvent['type'], string> = {
  breakthrough: '\u2B06', // up arrow
  god_intervention: '\u26A1', // lightning
  speciation: '\u2726', // star
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerationTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<TimelineEvent | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const fitnessHistory = useEvolutionStore((s) => s.fitnessHistory);
  const currentRun = useEvolutionStore((s) => s.currentRun);
  const godReports = useEvolutionStore((s) => s.godReports);

  const currentGen = currentRun?.generation ?? 0;
  const totalGens = currentRun?.n_generations ?? 100;
  const events = deriveEvents(
    fitnessHistory.generations,
    fitnessHistory.best,
    godReports.length,
  );

  const draw = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = 'rgba(4, 6, 12, 0.95)';
    ctx.fillRect(0, 0, w, h);

    const paddingX = 24;
    const lineY = h / 2;
    const trackWidth = w - paddingX * 2;

    // Background track
    ctx.beginPath();
    ctx.moveTo(paddingX, lineY);
    ctx.lineTo(paddingX + trackWidth, lineY);
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Progress fill
    const progress = totalGens > 0 ? currentGen / totalGens : 0;
    const progressX = paddingX + trackWidth * progress;
    const progressGrad = ctx.createLinearGradient(paddingX, 0, progressX, 0);
    progressGrad.addColorStop(0, 'rgba(0, 212, 255, 0.15)');
    progressGrad.addColorStop(1, 'rgba(0, 212, 255, 0.4)');
    ctx.beginPath();
    ctx.moveTo(paddingX, lineY);
    ctx.lineTo(progressX, lineY);
    ctx.strokeStyle = progressGrad;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Generation tick marks
    const tickInterval = totalGens <= 50 ? 5 : totalGens <= 200 ? 10 : 25;
    ctx.font = '9px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'center';
    for (let g = 0; g <= totalGens; g += tickInterval) {
      const x = paddingX + (g / totalGens) * trackWidth;
      ctx.beginPath();
      ctx.moveTo(x, lineY - 4);
      ctx.lineTo(x, lineY + 4);
      ctx.strokeStyle = 'rgba(60, 80, 120, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (g % (tickInterval * 2) === 0 || g === 0) {
        ctx.fillStyle = 'rgba(140, 170, 200, 0.35)';
        ctx.fillText(`${g}`, x, lineY + 16);
      }
    }

    // Events
    for (const ev of events) {
      const x = paddingX + (ev.generation / totalGens) * trackWidth;
      const color = EVENT_COLORS[ev.type];
      const isHovered = hoveredRef.current === ev;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, lineY - 14);
      ctx.lineTo(x, lineY + 14);
      ctx.strokeStyle = isHovered ? color : `${color}66`;
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();

      // Diamond marker
      const size = isHovered ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(x, lineY - size);
      ctx.lineTo(x + size, lineY);
      ctx.lineTo(x, lineY + size);
      ctx.lineTo(x - size, lineY);
      ctx.closePath();
      ctx.fillStyle = isHovered ? color : `${color}aa`;
      if (isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Icon above
      if (isHovered) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(EVENT_ICONS[ev.type], x, lineY - 18);
      }
    }

    // Current generation marker
    ctx.beginPath();
    ctx.arc(progressX, lineY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Current gen label
    ctx.font = '10px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(`Gen ${currentGen}`, progressX, lineY - 12);

    // Labels
    ctx.font = '9px "SF Mono", "Fira Code", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.fillText('START', paddingX, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`GEN ${totalGens}`, w - paddingX, h - 4);
  }, [currentGen, totalGens, events]);

  // Handle mouse hover for event tooltips
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    const paddingX = 24;
    const trackWidth = rect.width - paddingX * 2;

    let closest: TimelineEvent | null = null;
    let closestDist = Infinity;

    for (const ev of events) {
      const x = paddingX + (ev.generation / totalGens) * trackWidth;
      const dist = Math.abs(mx - x);
      if (dist < 12 && dist < closestDist) {
        closest = ev;
        closestDist = dist;
      }
    }

    hoveredRef.current = closest;

    // Update tooltip
    if (tooltipRef.current) {
      if (closest) {
        const x = paddingX + (closest.generation / totalGens) * trackWidth;
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.style.left = `${x}px`;
        tooltipRef.current.style.color = EVENT_COLORS[closest.type];
        tooltipRef.current.textContent = `Gen ${closest.generation}: ${closest.label}`;
      } else {
        tooltipRef.current.style.display = 'none';
      }
    }
  }, [events, totalGens]);

  // Redraw on data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => draw(canvas));
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 56,
        position: 'relative',
        background: 'rgba(4, 6, 12, 0.8)',
        borderTop: '1px solid rgba(40, 60, 100, 0.15)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          hoveredRef.current = null;
          if (tooltipRef.current) tooltipRef.current.style.display = 'none';
          const canvas = canvasRef.current;
          if (canvas) draw(canvas);
        }}
      />
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'absolute',
          top: 2,
          transform: 'translateX(-50%)',
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
