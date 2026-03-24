import { useEffect, useRef, useCallback, useState } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import type { SimulationFrame, ExperimentInfo } from '../types/simulation';

interface DemoData {
  experiment: ExperimentInfo;
  frames: SimulationFrame[];
  positions: Record<string, [number, number, number]>;
  graph: { nodes: any[]; edges: any[]; n_neurons: number; n_edges: number };
}

/**
 * Demo mode: plays back pre-recorded simulation frames from a static JSON file.
 * Used when no backend is available (e.g., static deployment on Vercel).
 */
export function useDemoMode() {
  const store = useSimulationStore();
  const [demoData, setDemoData] = useState<DemoData | null>(null);
  const frameIdx = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  // Load demo data
  const loadDemo = useCallback(async () => {
    try {
      const res = await fetch('/demo-frames.json');
      if (!res.ok) return false;
      const data: DemoData = await res.json();
      setDemoData(data);
      return true;
    } catch {
      return false;
    }
  }, []);

  const startDemo = useCallback(async () => {
    store.setLoading(true);
    const loaded = demoData || await loadDemo().then(ok => ok ? null : null);

    // Re-fetch if not loaded
    let data = demoData;
    if (!data) {
      try {
        const res = await fetch('/demo-frames.json');
        data = await res.json();
        setDemoData(data);
      } catch {
        store.setError('Demo data not available');
        store.setLoading(false);
        return;
      }
    }

    if (!data) {
      store.setLoading(false);
      return;
    }

    store.setExperiment(data.experiment);
    store.setConnected(true);
    store.setLoading(false);
    setIsDemo(true);
    frameIdx.current = 0;

    // Play frames at ~30fps
    intervalRef.current = window.setInterval(() => {
      if (!data) return;
      const idx = frameIdx.current % data.frames.length;
      store.setFrame(data.frames[idx]);
      frameIdx.current++;
    }, 33);
  }, [demoData, loadDemo]);

  const stopDemo = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsDemo(false);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { startDemo, stopDemo, isDemo, demoData };
}
