import { useEffect, useRef, useCallback } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import type { SimulationFrame, ExperimentInfo } from '../types/simulation';

const API_BASE = '/api';
const WS_BASE = `ws://${window.location.host}`;

export function useSimulation() {
  const wsRef = useRef<WebSocket | null>(null);
  const store = useSimulationStore();

  const createExperiment = useCallback(async (organism = 'c_elegans') => {
    const configs: Record<string, Record<string, unknown>> = {
      c_elegans: { name: 'C. elegans', organism: 'c_elegans', weight_scale: 3.0 },
      drosophila: {
        name: 'Drosophila', organism: 'drosophila',
        weight_scale: 0.5, tau_syn: 5.0, tau_m: 10.0,
        neuropils: 'central_complex', max_neurons: 1000,
      },
    };
    const body = configs[organism] ?? configs.c_elegans;
    const res = await fetch(`${API_BASE}/experiments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const exp: ExperimentInfo = await res.json();
    store.setExperiment(exp);
    return exp;
  }, []);

  const connect = useCallback((simId: string) => {
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(`${WS_BASE}/ws/${simId}`);
    wsRef.current = ws;

    ws.onopen = () => store.setConnected(true);
    ws.onclose = () => store.setConnected(false);
    ws.onerror = () => store.setConnected(false);

    ws.onmessage = (evt) => {
      try {
        const frame: SimulationFrame = JSON.parse(evt.data);
        store.setFrame(frame);
      } catch {}
    };
  }, []);

  const sendCommand = useCallback((cmd: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  const poke = useCallback((segment = 'seg_8') => {
    sendCommand({ type: 'poke', segment, force: [0, 0.15, 0] });
  }, [sendCommand]);

  const stimulate = useCallback((neuronIds: string[], current = 25) => {
    sendCommand({ type: 'stimulate', neuron_ids: neuronIds, current });
  }, [sendCommand]);

  const pause = useCallback(() => sendCommand({ type: 'pause' }), [sendCommand]);
  const resume = useCallback(() => sendCommand({ type: 'resume' }), [sendCommand]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    createExperiment,
    connect,
    poke,
    stimulate,
    pause,
    resume,
    sendCommand,
    ...store,
  };
}
