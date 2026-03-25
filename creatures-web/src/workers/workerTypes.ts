// ─── Request Types ───────────────────────────────────────────────────

export interface MutualInformationRequest {
  type: 'mutual-information';
  requestId: number;
  firingRates: number[][];  // T × N (row-major)
  nBins: number;
  maxNeurons: number;
}

export interface TransferEntropyRequest {
  type: 'transfer-entropy';
  requestId: number;
  firingRates: number[][];
  lag: number;
  nBins: number;
  maxNeurons: number;
  nShuffles: number;
  significanceThreshold: number;
}

export interface StatTestRequest {
  type: 'stat-test';
  requestId: number;
  test:
    | { fn: 'welch-t'; a: number[]; b: number[] }
    | { fn: 'paired-t'; a: number[]; b: number[] }
    | { fn: 'one-way-anova'; groups: number[][] }
    | { fn: 'mann-whitney-u'; a: number[]; b: number[] }
    | { fn: 'bootstrap-ci'; data: number[]; nBoot: number; alpha: number }
    | { fn: 'permutation'; a: number[]; b: number[]; nPerm: number }
    | { fn: 'bonferroni'; pValues: number[] }
    | { fn: 'benjamini-hochberg'; pValues: number[] };
}

export interface CalciumImagingRequest {
  type: 'calcium-imaging';
  requestId: number;
  spikeTimes: number[][];   // per neuron: array of spike times in ms
  nNeurons: number;
  tMax: number;
  dt: number;
  params: {
    tauRise: number;
    tauDecay: number;
    amplitude: number;
    noiseStd: number;
    fMax: number;
    kd: number;
  };
}

export type AnalysisRequest =
  | MutualInformationRequest
  | TransferEntropyRequest
  | StatTestRequest
  | CalciumImagingRequest
  | { type: 'cancel'; requestId: number };

// ─── Response Types ──────────────────────────────────────────────────

export interface MutualInformationResult {
  type: 'mutual-information';
  requestId: number;
  miMatrix: number[][];
  neuronIndices: number[];
  computeMs: number;
}

export interface TransferEntropyResult {
  type: 'transfer-entropy';
  requestId: number;
  teMatrix: number[][];
  significanceMask: boolean[][];
  neuronIndices: number[];
  computeMs: number;
}

export interface StatTestResult {
  type: 'stat-test';
  requestId: number;
  result:
    | { fn: 'welch-t'; t: number; p: number; df: number; ci95: [number, number]; cohenD: number }
    | { fn: 'paired-t'; t: number; p: number; df: number; ci95: [number, number] }
    | { fn: 'one-way-anova'; f: number; p: number; df1: number; df2: number; eta2: number }
    | { fn: 'mann-whitney-u'; u: number; p: number; r: number }
    | { fn: 'bootstrap-ci'; lower: number; upper: number; mean: number }
    | { fn: 'permutation'; p: number; observedDiff: number }
    | { fn: 'bonferroni'; corrected: number[] }
    | { fn: 'benjamini-hochberg'; corrected: number[] };
  computeMs: number;
}

export interface CalciumImagingResult {
  type: 'calcium-imaging';
  requestId: number;
  fluorescence: number[][];  // per-neuron fluorescence time series
  tPoints: number;
  computeMs: number;
}

export interface ErrorResult {
  type: 'error';
  requestId: number;
  message: string;
}

export interface DegradationWarning {
  type: 'degradation-warning';
  requestId: number;
  originalN: number;
  reducedN: number;
  reason: string;
}

export type AnalysisResponse =
  | MutualInformationResult
  | TransferEntropyResult
  | StatTestResult
  | CalciumImagingResult
  | ErrorResult
  | DegradationWarning;
