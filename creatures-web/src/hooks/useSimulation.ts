import { useEffect, useRef, useCallback } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import { useTransportStore } from '../stores/transportStore';
import type { SimulationFrame, ExperimentInfo } from '../types/simulation';

import { API_BASE, WS_BASE } from '../config';
const INITIAL_RECONNECT_DELAYS = [1000, 2000, 4000]; // initial backoff steps
const MAX_RECONNECT_BACKOFF = 30_000; // cap for indefinite retries
const MAX_RECONNECT_ATTEMPTS = 10; // show recovery panel after this many failures

export function useSimulation() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastSimIdRef = useRef<string | null>(null);
  const pendingFrameRef = useRef<SimulationFrame | null>(null);
  const rafIdRef = useRef<number>(0);
  const store = useSimulationStore();

  const createExperiment = useCallback(async (organism = 'c_elegans') => {
    store.setLoading(true);
    store.setError(null);
    try {
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
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const exp: ExperimentInfo = await res.json();
      store.setExperiment(exp);
      return exp;
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to create experiment');
      throw err;
    } finally {
      store.setLoading(false);
    }
  }, []);

  const attemptReconnect = useCallback((simId: string) => {
    const currentAttempts = useSimulationStore.getState().reconnectAttempts;

    // After MAX_RECONNECT_ATTEMPTS, surface the recovery panel
    if (currentAttempts >= MAX_RECONNECT_ATTEMPTS) {
      store.setConnectionStatus('failed');
      store.setError('Connection lost after multiple retries');
      return;
    }

    store.setConnectionStatus('reconnecting');
    store.setReconnectAttempts(currentAttempts + 1);

    // Use predefined delays for the first few attempts, then exponential backoff capped at 30s
    const baseDelay = currentAttempts < INITIAL_RECONNECT_DELAYS.length
      ? INITIAL_RECONNECT_DELAYS[currentAttempts]
      : Math.min(MAX_RECONNECT_BACKOFF, 4000 * Math.pow(2, currentAttempts - INITIAL_RECONNECT_DELAYS.length));
    // Add 30% random jitter to prevent thundering herd
    const delay = baseDelay + Math.random() * baseDelay * 0.3;

    reconnectTimerRef.current = window.setTimeout(() => {
      connect(simId, true);
    }, delay);
  }, []);

  const connect = useCallback((simId: string, isReconnect = false) => {
    if (wsRef.current) wsRef.current.close();
    lastSimIdRef.current = simId;

    if (!isReconnect) {
      store.setReconnectAttempts(0);
      store.setConnectionStatus('connecting');
    }

    const ws = new WebSocket(`${WS_BASE}/ws/${simId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      store.setConnected(true);
      store.setConnectionStatus('connected');
      store.setReconnectAttempts(0);
      store.setError(null);
    };
    ws.onclose = () => {
      store.setConnected(false);
      // Only attempt reconnect if we had a valid connection before and it wasn't intentional
      if (lastSimIdRef.current === simId) {
        attemptReconnect(simId);
      }
    };
    ws.onerror = () => {
      store.setConnected(false);
      // Error is followed by onclose, which handles reconnect
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        // Route typed messages
        if (data.type === 'weight_snapshot') {
          window.dispatchEvent(new CustomEvent('neurevo-weight-snapshot', { detail: data }));
        } else if (data.type === 'error') {
          console.warn('[WS] Backend error:', data.message);
        } else {
          // Buffer the latest frame — only apply once per browser frame (RAF throttle)
          // This prevents 60+ store updates/sec from causing 49 component re-renders each
          pendingFrameRef.current = data as SimulationFrame;
          if (!rafIdRef.current) {
            rafIdRef.current = requestAnimationFrame(() => {
              const f = pendingFrameRef.current;
              if (f) {
                store.setFrame(f);
                useTransportStore.getState().pushFrame(f);
                pendingFrameRef.current = null;
              }
              rafIdRef.current = 0;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to parse frame:', err);
      }
    };
  }, [attemptReconnect]);

  const sendCommand = useCallback((cmd: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    } else {
      useSimulationStore.getState().setError('Not connected — command not sent');
    }
  }, []);

  const poke = useCallback((segment = 'seg_8') => {
    sendCommand({ type: 'poke', segment, force: [0, 0.15, 0] });
    store.setPoke(segment);
  }, [sendCommand]);

  const stimulate = useCallback((neuronIds: string[], current = 25) => {
    sendCommand({ type: 'stimulate', neuron_ids: neuronIds, current });
  }, [sendCommand]);

  const setSpeed = useCallback((value: number) => {
    sendCommand({ type: 'speed', value });
    useTransportStore.getState().setSpeed(value);
  }, [sendCommand]);

  const pause = useCallback(() => sendCommand({ type: 'pause' }), [sendCommand]);
  const resume = useCallback(() => sendCommand({ type: 'resume' }), [sendCommand]);

  useEffect(() => {
    return () => {
      lastSimIdRef.current = null; // prevent reconnect on unmount
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      wsRef.current?.close();
    };
  }, []);

  return {
    createExperiment, connect, poke, stimulate, pause, resume, setSpeed, sendCommand,
    ...store,
  };
}
