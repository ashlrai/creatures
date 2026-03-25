import { useRef, useState, useEffect, useCallback } from 'react';
import type {
  AnalysisResponse,
  MutualInformationResult,
  TransferEntropyResult,
  StatTestResult,
  CalciumImagingResult,
  DegradationWarning,
} from '../workers/workerTypes';

interface MIOptions { nBins?: number; maxNeurons?: number }
interface TEOptions { lag?: number; nBins?: number; maxNeurons?: number; nShuffles?: number; significanceThreshold?: number }
interface CalciumOptions { tauRise?: number; tauDecay?: number; amplitude?: number; noiseStd?: number; fMax?: number; kd?: number; dt?: number }

export interface AnalysisWorkerAPI {
  computeMI: (firingRates: number[][], opts?: MIOptions) => void;
  computeTE: (firingRates: number[][], opts?: TEOptions) => void;
  runStatTest: (test: import('../workers/workerTypes').StatTestRequest['test']) => void;
  computeCalcium: (spikeTimes: number[][], nNeurons: number, tMax: number, opts?: CalciumOptions) => void;
  cancel: () => void;

  miResult: MutualInformationResult | null;
  teResult: TransferEntropyResult | null;
  statResult: StatTestResult | null;
  calciumResult: CalciumImagingResult | null;
  pending: boolean;
  lastComputeMs: number;
  degradationWarning: string | null;
}

export function useAnalysisWorker(): AnalysisWorkerAPI {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const degradationRef = useRef({ maxNeurons: 60, consecutiveOk: 0 });

  const [miResult, setMiResult] = useState<MutualInformationResult | null>(null);
  const [teResult, setTeResult] = useState<TransferEntropyResult | null>(null);
  const [statResult, setStatResult] = useState<StatTestResult | null>(null);
  const [calciumResult, setCalciumResult] = useState<CalciumImagingResult | null>(null);
  const [pending, setPending] = useState(false);
  const [lastComputeMs, setLastComputeMs] = useState(0);
  const [degradationWarning, setDegradationWarning] = useState<string | null>(null);

  useEffect(() => {
    const w = new Worker(
      new URL('../workers/analysis.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = w;

    w.onmessage = (evt: MessageEvent<AnalysisResponse>) => {
      const resp = evt.data;
      if ('requestId' in resp && resp.requestId !== requestIdRef.current) return;

      switch (resp.type) {
        case 'mutual-information':
          setMiResult(resp); setPending(false); setLastComputeMs(resp.computeMs);
          handleBudgetOk(resp.computeMs, 200);
          break;
        case 'transfer-entropy':
          setTeResult(resp); setPending(false); setLastComputeMs(resp.computeMs);
          handleBudgetOk(resp.computeMs, 500);
          break;
        case 'stat-test':
          setStatResult(resp); setPending(false); setLastComputeMs(resp.computeMs);
          break;
        case 'calcium-imaging':
          setCalciumResult(resp); setPending(false); setLastComputeMs(resp.computeMs);
          break;
        case 'degradation-warning':
          handleDegradation(resp as DegradationWarning);
          break;
        case 'error':
          console.error('[AnalysisWorker]', resp.message);
          setPending(false);
          break;
      }
    };

    return () => { w.terminate(); workerRef.current = null; };
  }, []);

  const handleDegradation = (warning: DegradationWarning) => {
    const d = degradationRef.current;
    d.maxNeurons = Math.max(20, warning.reducedN);
    d.consecutiveOk = 0;
    setDegradationWarning(warning.reason);
  };

  const handleBudgetOk = (computeMs: number, budget: number) => {
    if (computeMs < budget) {
      const d = degradationRef.current;
      d.consecutiveOk++;
      if (d.consecutiveOk >= 5 && d.maxNeurons < 60) {
        d.maxNeurons = Math.min(60, Math.ceil(d.maxNeurons * 1.1));
        d.consecutiveOk = 0;
      }
      setDegradationWarning(null);
    }
  };

  const nextId = () => ++requestIdRef.current;

  const computeMI = useCallback((firingRates: number[][], opts?: MIOptions) => {
    const id = nextId();
    setPending(true);
    workerRef.current?.postMessage({
      type: 'mutual-information',
      requestId: id,
      firingRates,
      nBins: opts?.nBins ?? 8,
      maxNeurons: opts?.maxNeurons ?? degradationRef.current.maxNeurons,
    });
  }, []);

  const computeTE = useCallback((firingRates: number[][], opts?: TEOptions) => {
    const id = nextId();
    setPending(true);
    workerRef.current?.postMessage({
      type: 'transfer-entropy',
      requestId: id,
      firingRates,
      lag: opts?.lag ?? 1,
      nBins: opts?.nBins ?? 8,
      maxNeurons: opts?.maxNeurons ?? degradationRef.current.maxNeurons,
      nShuffles: opts?.nShuffles ?? 20,
      significanceThreshold: opts?.significanceThreshold ?? 2.0,
    });
  }, []);

  const runStatTest = useCallback((test: import('../workers/workerTypes').StatTestRequest['test']) => {
    const id = nextId();
    setPending(true);
    workerRef.current?.postMessage({ type: 'stat-test', requestId: id, test });
  }, []);

  const computeCalcium = useCallback((spikeTimes: number[][], nNeurons: number, tMax: number, opts?: CalciumOptions) => {
    const id = nextId();
    setPending(true);
    workerRef.current?.postMessage({
      type: 'calcium-imaging',
      requestId: id,
      spikeTimes,
      nNeurons,
      tMax,
      dt: opts?.dt ?? 33,
      params: {
        tauRise: opts?.tauRise ?? 50,
        tauDecay: opts?.tauDecay ?? 400,
        amplitude: opts?.amplitude ?? 1.0,
        noiseStd: opts?.noiseStd ?? 0.1,
        fMax: opts?.fMax ?? 1.0,
        kd: opts?.kd ?? 0.5,
      },
    });
  }, []);

  const cancel = useCallback(() => {
    const id = nextId();
    workerRef.current?.postMessage({ type: 'cancel', requestId: id });
    setPending(false);
  }, []);

  return {
    computeMI, computeTE, runStatTest, computeCalcium, cancel,
    miResult, teResult, statResult, calciumResult,
    pending, lastComputeMs, degradationWarning,
  };
}
