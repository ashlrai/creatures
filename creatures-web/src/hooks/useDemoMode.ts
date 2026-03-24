import { useEffect, useRef, useCallback, useState } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import type { SimulationFrame, ExperimentInfo } from '../types/simulation';

interface DemoData {
  experiment: ExperimentInfo;
  frames: SimulationFrame[];
}

const CROSSFADE_FRAMES = 30; // blend last N frames into first N for seamless loop

function lerpFrame(a: SimulationFrame, b: SimulationFrame, t: number): SimulationFrame {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    t_ms: lerp(a.t_ms, b.t_ms),
    n_active: Math.round(lerp(a.n_active, b.n_active)),
    spikes: t < 0.5 ? a.spikes : b.spikes,
    firing_rates: a.firing_rates.map((v, i) => lerp(v, b.firing_rates[i] ?? 0)),
    body_positions: a.body_positions.map((p, i) =>
      p.map((v, j) => lerp(v, b.body_positions[i]?.[j] ?? v))
    ),
    joint_angles: a.joint_angles.map((v, i) => lerp(v, b.joint_angles[i] ?? 0)),
    center_of_mass: a.center_of_mass.map((v, i) => lerp(v, b.center_of_mass[i] ?? v)),
    muscle_activations: { ...a.muscle_activations },
  };
}

export function useDemoMode() {
  const store = useSimulationStore();
  const frameIdx = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const demoDataRef = useRef<DemoData | null>(null);

  const startDemo = useCallback(async () => {
    store.setLoading(true);
    store.setError(null);

    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}demo-frames.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      let data: DemoData;
      if (!contentType.includes('json') && !contentType.includes('octet')) {
        const text = await res.text();
        if (text.startsWith('<!')) throw new Error('Got HTML instead of JSON');
        data = JSON.parse(text);
      } else {
        data = await res.json();
      }

      console.log(`Demo: loaded ${data.frames.length} frames`);
      demoDataRef.current = data;
      store.setExperiment(data.experiment);
      store.setConnected(true);
      store.setLoading(false);
      setIsDemo(true);
      frameIdx.current = 30; // Skip first 30 quiet frames — start where neural activity begins

      if (intervalRef.current) clearInterval(intervalRef.current);

      intervalRef.current = window.setInterval(() => {
        const d = demoDataRef.current;
        if (!d) return;

        const total = d.frames.length;
        const idx = frameIdx.current % total;

        // Crossfade: when near end of loop, blend toward start
        const distFromEnd = total - idx;
        if (distFromEnd <= CROSSFADE_FRAMES && total > CROSSFADE_FRAMES * 2) {
          const blendIdx = CROSSFADE_FRAMES - distFromEnd; // 0 to CROSSFADE_FRAMES
          const t = blendIdx / CROSSFADE_FRAMES; // 0 to 1
          const startFrame = d.frames[blendIdx];
          const endFrame = d.frames[idx];
          store.setFrame(lerpFrame(endFrame, startFrame, t));
        } else {
          store.setFrame(d.frames[idx]);
        }

        frameIdx.current++;
      }, 33);
    } catch (err) {
      console.error('Demo mode failed:', err);
      store.setError('Demo data not available');
      store.setLoading(false);
    }
  }, []);

  const stopDemo = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsDemo(false);
  }, []);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return { startDemo, stopDemo, isDemo };
}
