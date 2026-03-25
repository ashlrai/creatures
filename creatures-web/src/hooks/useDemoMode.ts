import { useEffect, useRef, useCallback, useState } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import { useTransportStore } from '../stores/transportStore';
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

  // Perturbation state for interactive demo responses
  const perturbationRef = useRef<{
    pokeBoost: number;       // decaying boost from poke (0-1)
    pokeSegment: number;     // which segment was poked (-1 = none)
    drugEffect: number;      // drug multiplier (0-2, 1 = normal)
    stimulatedNeurons: Set<number>; // indices with extra current
    lesionedNeurons: Set<number>;   // indices forced to zero
    globalExcitation: number; // overall excitation modifier (0-2)
  }>({
    pokeBoost: 0,
    pokeSegment: -1,
    drugEffect: 1.0,
    stimulatedNeurons: new Set(),
    lesionedNeurons: new Set(),
    globalExcitation: 1.0,
  });

  // Listen for neurevo-command events to drive perturbations in demo mode
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const p = perturbationRef.current;

      if (detail.type === 'poke') {
        p.pokeBoost = 1.0;
        const segStr = detail.segment || 'seg_8';
        p.pokeSegment = parseInt(segStr.replace(/\D/g, ''), 10);
      } else if (detail.type === 'stimulate') {
        const ids: (string | number)[] = detail.neuron_ids || [];
        for (const id of ids) {
          const idx = parseInt(String(id).replace(/\D/g, ''), 10);
          if (!isNaN(idx)) p.stimulatedNeurons.add(idx);
        }
        // Auto-clear after 2s
        setTimeout(() => {
          for (const id of ids) {
            p.stimulatedNeurons.delete(parseInt(String(id).replace(/\D/g, ''), 10));
          }
        }, 2000);
      } else if (detail.type === 'apply_drug' || detail.type === 'set_drug') {
        const dose = detail.dose ?? detail.value ?? 1.0;
        p.drugEffect = 1.0 + dose * 0.5; // drugs boost activity
      } else if (detail.type === 'clear_stimuli') {
        p.stimulatedNeurons.clear();
        p.drugEffect = 1.0;
      } else if (detail.type === 'lesion_neuron') {
        const idx = parseInt(String(detail.neuron_id).replace(/\D/g, ''), 10);
        if (!isNaN(idx)) {
          p.lesionedNeurons.add(idx);
          p.stimulatedNeurons.delete(idx);
        }
      }
    };
    window.addEventListener('neurevo-command', handler);
    return () => window.removeEventListener('neurevo-command', handler);
  }, []);

  // Also catch pokes from store.setPoke (used by App auto-poke and direct poke buttons)
  useEffect(() => {
    if (!isDemo) return;
    const unsub = useSimulationStore.subscribe((state, prev) => {
      if (state.lastPoke && state.lastPoke !== (prev as typeof state).lastPoke) {
        const p = perturbationRef.current;
        p.pokeBoost = 1.0;
        const segStr = state.lastPoke.segment || 'seg_8';
        p.pokeSegment = parseInt(segStr.replace(/\D/g, ''), 10);
      }
    });
    return unsub;
  }, [isDemo]);

  const startDemo = useCallback(async (organism: string = 'c_elegans') => {
    store.setLoading(true);
    store.setError(null);

    // Choose demo data file based on organism
    const demoFile = organism === 'drosophila' ? 'demo-frames-fly.json' : 'demo-frames.json';

    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}${demoFile}`);
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

      console.log(`Demo (${organism}): loaded ${data.frames.length} frames`);
      demoDataRef.current = data;
      store.setExperiment(data.experiment);
      store.setConnected(true);
      store.setLoading(false);
      setIsDemo(true);
      frameIdx.current = 30; // Skip first 30 quiet frames — start where neural activity begins

      if (intervalRef.current) clearInterval(intervalRef.current);

      const tick = tickRef.current = () => {
        const d = demoDataRef.current;
        if (!d) return;

        const transport = useTransportStore.getState();

        // Respect play/pause from transport
        if (!transport.isPlaying) return;

        const total = d.frames.length;
        const idx = frameIdx.current % total;

        // Crossfade: when near end of loop, blend toward start
        let frame: SimulationFrame;
        const distFromEnd = total - idx;
        if (distFromEnd <= CROSSFADE_FRAMES && total > CROSSFADE_FRAMES * 2) {
          const blendIdx = CROSSFADE_FRAMES - distFromEnd; // 0 to CROSSFADE_FRAMES
          const t = blendIdx / CROSSFADE_FRAMES; // 0 to 1
          const startFrame = d.frames[blendIdx];
          const endFrame = d.frames[idx];
          frame = lerpFrame(endFrame, startFrame, t);
        } else {
          frame = d.frames[idx];
        }

        // Apply perturbations to demo data for interactive responsiveness
        const p = perturbationRef.current;

        // Decay poke boost each tick
        if (p.pokeBoost > 0) {
          p.pokeBoost *= 0.95;
          if (p.pokeBoost < 0.01) p.pokeBoost = 0;
        }

        const hasPerturbation =
          p.pokeBoost > 0 ||
          p.drugEffect !== 1.0 ||
          p.stimulatedNeurons.size > 0 ||
          p.lesionedNeurons.size > 0;

        let outputFrame = frame;

        if (hasPerturbation) {
          const rates = [...frame.firing_rates];
          const n = rates.length;

          // Poke effect: boost neurons near the poked segment with spatial falloff
          if (p.pokeBoost > 0 && p.pokeSegment >= 0) {
            const neuronsPerSeg = Math.ceil(n / 12);
            const center = p.pokeSegment * neuronsPerSeg;
            const start = Math.max(0, (p.pokeSegment - 2) * neuronsPerSeg);
            const end = Math.min(n, (p.pokeSegment + 3) * neuronsPerSeg);
            for (let i = start; i < end; i++) {
              rates[i] += p.pokeBoost * 80 * Math.exp(
                -Math.abs(i - center) / (neuronsPerSeg * 1.5)
              );
            }
          }

          // Drug effect: scale all rates
          if (p.drugEffect !== 1.0) {
            for (let i = 0; i < n; i++) {
              rates[i] *= p.drugEffect;
            }
          }

          // Stimulated neurons: add constant current
          for (const idx of p.stimulatedNeurons) {
            if (idx < n) rates[idx] += 50;
          }

          // Lesioned neurons: force to zero
          for (const idx of p.lesionedNeurons) {
            if (idx < n) rates[idx] = 0;
          }

          // Generate extra spikes from boosted neurons
          const extraSpikes = rates
            .map((r, i) => (r > 30 && Math.random() < r / 200) ? i : -1)
            .filter(i => i >= 0);

          outputFrame = {
            ...frame,
            firing_rates: rates,
            n_active: rates.filter(r => r > 5).length,
            spikes: [...new Set([...frame.spikes, ...extraSpikes])],
          };
        }

        store.setFrame(outputFrame);
        transport.pushFrame(outputFrame);

        frameIdx.current++;
      };

      // Compute interval from transport speed (base = 33ms at 1x)
      const baseInterval = 33;
      const currentSpeed = useTransportStore.getState().speed;
      intervalRef.current = window.setInterval(tick, baseInterval / currentSpeed);
    } catch (err) {
      console.error(`Demo mode failed (${organism}):`, err);
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

  // Re-create interval when transport speed changes during demo
  const tickRef = useRef<(() => void) | null>(null);
  const lastSpeedRef = useRef(1);

  useEffect(() => {
    if (!isDemo) return;
    const unsub = useTransportStore.subscribe((state) => {
      if (!isDemo || !tickRef.current) return;
      if (state.speed !== lastSpeedRef.current) {
        lastSpeedRef.current = state.speed;
        if (intervalRef.current) clearInterval(intervalRef.current);
        const baseInterval = 33;
        intervalRef.current = window.setInterval(tickRef.current, baseInterval / state.speed);
      }
    });
    return unsub;
  }, [isDemo]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return { startDemo, stopDemo, isDemo };
}
