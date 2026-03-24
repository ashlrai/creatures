import { useEffect, useRef, useCallback, useState } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import type { SimulationFrame, ExperimentInfo } from '../types/simulation';

interface DemoData {
  experiment: ExperimentInfo;
  frames: SimulationFrame[];
}

export function useDemoMode() {
  const store = useSimulationStore();
  const [demoData, setDemoData] = useState<DemoData | null>(null);
  const frameIdx = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const startDemo = useCallback(async () => {
    store.setLoading(true);
    store.setError(null);

    try {
      console.log('Demo mode: fetching frames...');
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}demo-frames.json`);
      console.log('Demo mode: fetch status', res.status, res.headers.get('content-type'));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json') && !contentType.includes('octet')) {
        // Might be HTML from SPA fallback
        const text = await res.text();
        if (text.startsWith('<!')) throw new Error('Got HTML instead of JSON');
        // Try parsing anyway
        const data = JSON.parse(text);
        setDemoData(data);
        startPlayback(data);
        return;
      }

      const data: DemoData = await res.json();
      console.log('Demo mode: loaded', data.frames.length, 'frames');
      setDemoData(data);
      startPlayback(data);
    } catch (err) {
      console.error('Demo mode failed:', err);
      store.setError('Demo data not available');
      store.setLoading(false);
    }
  }, []);

  const startPlayback = useCallback((data: DemoData) => {
    store.setExperiment(data.experiment);
    store.setConnected(true);
    store.setLoading(false);
    setIsDemo(true);
    frameIdx.current = 0;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = window.setInterval(() => {
      const idx = frameIdx.current % data.frames.length;
      store.setFrame(data.frames[idx]);
      frameIdx.current++;
    }, 33);
  }, []);

  const stopDemo = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsDemo(false);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { startDemo, stopDemo, isDemo };
}
