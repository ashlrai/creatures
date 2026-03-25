/// <reference lib="webworker" />

import type {
  AnalysisRequest, AnalysisResponse,
  MutualInformationRequest, MutualInformationResult,
  TransferEntropyRequest, TransferEntropyResult,
  StatTestRequest, StatTestResult,
  CalciumImagingRequest, CalciumImagingResult,
  ErrorResult,
} from './workerTypes';

let currentRequestId = 0;

// ─── Math Utilities ──────────────────────────────────────────────────

function mean(arr: number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr: number[]): number {
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return s / (arr.length - 1);
}

function std(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

/** Abramowitz & Stegun normal CDF approximation, error < 7.5e-8 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327; // 1/sqrt(2*pi)
  const p = d * Math.exp(-x * x / 2) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Regularized incomplete beta via Lentz continued fraction */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation for convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a);
  }

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz continued fraction
  let f = 1e-30;
  let c = 1e-30;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 100; m++) {
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;

    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;

    if (Math.abs(d * c - 1) < 1e-8) break;
  }

  return front * f;
}

/** Log-gamma via Stirling approximation */
function lgamma(x: number): number {
  if (x <= 0) return 0;
  // Lanczos approximation
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = coef[0];
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function tCDF(x: number, df: number): number {
  const t2 = x * x;
  const v = df / (df + t2);
  const ib = regularizedBeta(v, df / 2, 0.5);
  return x >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function tInvCDF(p: number, df: number): number {
  // Newton's method
  let x = p > 0.5 ? 1 : -1;
  for (let i = 0; i < 50; i++) {
    const cdf = tCDF(x, df);
    const pdf = Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + x * x / df));
    if (pdf < 1e-15) break;
    x -= (cdf - p) / pdf;
  }
  return x;
}

function fCDF(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const v = d1 * x / (d1 * x + d2);
  return regularizedBeta(v, d1 / 2, d2 / 2);
}

function fisherYatesShuffle(arr: Uint8Array): Uint8Array {
  const n = arr.length;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function gaussianRandom(): number {
  return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

// ─── Subsample & Bin ─────────────────────────────────────────────────

function subsampleAndBin(firingRates: number[][], maxNeurons: number, nBins: number) {
  const T = firingRates.length;
  const N = firingRates[0]?.length ?? 0;

  // Pick top-N most active neurons
  let indices: number[];
  if (N > maxNeurons) {
    const meanRates = new Float64Array(N);
    for (let t = 0; t < T; t++) for (let n = 0; n < N; n++) meanRates[n] += firingRates[t][n];
    const indexed = Array.from({ length: N }, (_, i) => i);
    indexed.sort((a, b) => meanRates[b] - meanRates[a]);
    indices = indexed.slice(0, maxNeurons);
  } else {
    indices = Array.from({ length: N }, (_, i) => i);
  }

  const n = indices.length;
  const binned: Uint8Array[] = [];
  for (let ni = 0; ni < n; ni++) {
    const col = indices[ni];
    const series = new Float64Array(T);
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < T; t++) {
      const v = firingRates[t][col] ?? 0;
      series[t] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min;
    const b = new Uint8Array(T);
    if (range > 1e-12) {
      for (let t = 0; t < T; t++) {
        b[t] = Math.min(Math.floor((series[t] - min) / range * nBins), nBins - 1);
      }
    }
    binned.push(b);
  }

  return { T, n, indices, binned };
}

// ─── Mutual Information ──────────────────────────────────────────────

function computeMI(req: MutualInformationRequest): MutualInformationResult {
  const t0 = performance.now();
  const { T, n, indices, binned } = subsampleAndBin(req.firingRates, req.maxNeurons, req.nBins);
  const K = req.nBins;

  // Marginal histograms
  const marginals: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const hist = new Uint32Array(K);
    for (let t = 0; t < T; t++) hist[binned[i][t]]++;
    const p = new Float64Array(K);
    for (let k = 0; k < K; k++) p[k] = hist[k] / T;
    marginals.push(p);
  }

  const miMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const joint = new Uint32Array(K * K);

  for (let i = 0; i < n; i++) {
    if (currentRequestId !== req.requestId) break; // cancellation
    for (let j = i + 1; j < n; j++) {
      joint.fill(0);
      for (let t = 0; t < T; t++) {
        joint[binned[i][t] * K + binned[j][t]]++;
      }
      let mi = 0;
      for (let bi = 0; bi < K; bi++) {
        const px = marginals[i][bi];
        if (px < 1e-12) continue;
        for (let bj = 0; bj < K; bj++) {
          const pxy = joint[bi * K + bj] / T;
          if (pxy < 1e-12) continue;
          const py = marginals[j][bj];
          if (py < 1e-12) continue;
          mi += pxy * Math.log2(pxy / (px * py));
        }
      }
      mi = Math.max(0, mi);
      miMatrix[i][j] = mi;
      miMatrix[j][i] = mi;
    }
  }

  return { type: 'mutual-information', requestId: req.requestId, miMatrix, neuronIndices: indices, computeMs: performance.now() - t0 };
}

// ─── Transfer Entropy ────────────────────────────────────────────────

function computeTE(req: TransferEntropyRequest): TransferEntropyResult {
  const t0 = performance.now();
  const { T, n, indices, binned } = subsampleAndBin(req.firingRates, req.maxNeurons, req.nBins);
  const K = req.nBins;
  const lag = req.lag;
  const Teff = T - lag;

  if (Teff < 10) {
    return { type: 'transfer-entropy', requestId: req.requestId, teMatrix: [], significanceMask: [], neuronIndices: indices, computeMs: performance.now() - t0 };
  }

  const teMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const significanceMask: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));

  // Reusable buffers
  const jointYfYp = new Uint32Array(K * K);
  const histYp = new Uint32Array(K);
  const tripleYfYpXp = new Uint32Array(K * K * K);
  const jointYpXp = new Uint32Array(K * K);

  function condEntropy2(joint: Uint32Array, marginal: Uint32Array, size: number): number {
    // H(A|B) = -sum p(a,b) * log(p(a|b))
    let h = 0;
    for (let a = 0; a < K; a++) {
      for (let b = 0; b < K; b++) {
        const pab = joint[a * K + b] / size;
        const pb = marginal[b] / size;
        if (pab > 1e-12 && pb > 1e-12) {
          h -= pab * Math.log2(pab / pb);
        }
      }
    }
    return h;
  }

  function condEntropy3(triple: Uint32Array, marginal: Uint32Array, size: number): number {
    // H(A|B,C) = -sum p(a,b,c) * log(p(a|b,c))
    let h = 0;
    for (let a = 0; a < K; a++) {
      for (let b = 0; b < K; b++) {
        for (let c = 0; c < K; c++) {
          const pabc = triple[a * K * K + b * K + c] / size;
          const pbc = marginal[b * K + c] / size;
          if (pabc > 1e-12 && pbc > 1e-12) {
            h -= pabc * Math.log2(pabc / pbc);
          }
        }
      }
    }
    return h;
  }

  for (let target = 0; target < n; target++) {
    if (currentRequestId !== req.requestId) break;
    for (let source = 0; source < n; source++) {
      if (source === target) continue;

      // H(Yf | Yp)
      jointYfYp.fill(0);
      histYp.fill(0);
      for (let t = 0; t < Teff; t++) {
        const yp = binned[target][t];
        const yf = binned[target][t + lag];
        jointYfYp[yf * K + yp]++;
        histYp[yp]++;
      }
      const hYfGivenYp = condEntropy2(jointYfYp, histYp, Teff);

      // H(Yf | Yp, Xp)
      tripleYfYpXp.fill(0);
      jointYpXp.fill(0);
      for (let t = 0; t < Teff; t++) {
        const yp = binned[target][t];
        const yf = binned[target][t + lag];
        const xp = binned[source][t];
        tripleYfYpXp[yf * K * K + yp * K + xp]++;
        jointYpXp[yp * K + xp]++;
      }
      const hYfGivenYpXp = condEntropy3(tripleYfYpXp, jointYpXp, Teff);

      let te = Math.max(0, hYfGivenYp - hYfGivenYpXp);

      // Bias correction via shuffling
      const shuffledTEs = new Float64Array(req.nShuffles);
      const shuffledSource = new Uint8Array(binned[source].subarray(0, Teff));
      for (let s = 0; s < req.nShuffles; s++) {
        fisherYatesShuffle(shuffledSource);
        tripleYfYpXp.fill(0);
        jointYpXp.fill(0);
        for (let t = 0; t < Teff; t++) {
          const yp = binned[target][t];
          const yf = binned[target][t + lag];
          const xp = shuffledSource[t];
          tripleYfYpXp[yf * K * K + yp * K + xp]++;
          jointYpXp[yp * K + xp]++;
        }
        shuffledTEs[s] = hYfGivenYp - condEntropy3(tripleYfYpXp, jointYpXp, Teff);
      }

      const meanShuf = mean(Array.from(shuffledTEs));
      const stdShuf = std(Array.from(shuffledTEs));
      const teCorrected = Math.max(0, te - meanShuf);

      teMatrix[source][target] = teCorrected;
      significanceMask[source][target] = stdShuf > 1e-12
        ? (te - meanShuf) / stdShuf > req.significanceThreshold
        : teCorrected > 0;
    }
  }

  return { type: 'transfer-entropy', requestId: req.requestId, teMatrix, significanceMask, neuronIndices: indices, computeMs: performance.now() - t0 };
}

// ─── Statistical Tests ───────────────────────────────────────────────

function computeStatTest(req: StatTestRequest): StatTestResult {
  const t0 = performance.now();
  const test = req.test;
  let result: StatTestResult['result'];

  switch (test.fn) {
    case 'welch-t': {
      const { a, b } = test;
      const nA = a.length, nB = b.length;
      const mA = mean(a), mB = mean(b);
      const vA = variance(a), vB = variance(b);
      const se = Math.sqrt(vA / nA + vB / nB);
      if (se < 1e-15) {
        result = { fn: 'welch-t', t: 0, p: 1, df: nA + nB - 2, ci95: [0, 0], cohenD: 0 };
        break;
      }
      const t_stat = (mA - mB) / se;
      const num = (vA / nA + vB / nB) ** 2;
      const denom = (vA / nA) ** 2 / (nA - 1) + (vB / nB) ** 2 / (nB - 1);
      const df = num / denom;
      const p = 2 * (1 - tCDF(Math.abs(t_stat), df));
      const tCrit = tInvCDF(0.975, df);
      const diff = mA - mB;
      const pooledSD = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2));
      result = { fn: 'welch-t', t: t_stat, p, df, ci95: [diff - tCrit * se, diff + tCrit * se], cohenD: pooledSD > 1e-15 ? diff / pooledSD : 0 };
      break;
    }
    case 'paired-t': {
      const { a, b } = test;
      const diffs = a.map((v, i) => v - b[i]);
      const n = diffs.length;
      const mD = mean(diffs);
      const vD = variance(diffs);
      const se = Math.sqrt(vD / n);
      if (se < 1e-15) { result = { fn: 'paired-t', t: 0, p: 1, df: n - 1, ci95: [0, 0] }; break; }
      const t_stat = mD / se;
      const df = n - 1;
      const p = 2 * (1 - tCDF(Math.abs(t_stat), df));
      const tCrit = tInvCDF(0.975, df);
      result = { fn: 'paired-t', t: t_stat, p, df, ci95: [mD - tCrit * se, mD + tCrit * se] };
      break;
    }
    case 'one-way-anova': {
      const { groups } = test;
      const k = groups.length;
      const all = groups.flat();
      const N = all.length;
      const gm = mean(all);
      let SSb = 0, SSw = 0;
      for (const g of groups) {
        const gMean = mean(g);
        SSb += g.length * (gMean - gm) ** 2;
        for (const x of g) SSw += (x - gMean) ** 2;
      }
      const df1 = k - 1, df2 = N - k;
      const MSb = SSb / df1, MSw = SSw / df2;
      const f = MSw > 1e-15 ? MSb / MSw : 0;
      const p = 1 - fCDF(f, df1, df2);
      const SSt = SSb + SSw;
      result = { fn: 'one-way-anova', f, p, df1, df2, eta2: SSt > 1e-15 ? SSb / SSt : 0 };
      break;
    }
    case 'mann-whitney-u': {
      const { a, b } = test;
      const nA = a.length, nB = b.length;
      const combined = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))];
      combined.sort((x, y) => x.v - y.v);
      // Assign ranks with ties
      const ranks = new Float64Array(combined.length);
      let i = 0;
      while (i < combined.length) {
        let j = i;
        while (j < combined.length && combined[j].v === combined[i].v) j++;
        const avgRank = (i + 1 + j) / 2;
        for (let k = i; k < j; k++) ranks[k] = avgRank;
        i = j;
      }
      let rankSumA = 0;
      for (let k = 0; k < combined.length; k++) if (combined[k].g === 0) rankSumA += ranks[k];
      const U_a = rankSumA - nA * (nA + 1) / 2;
      const U = Math.min(U_a, nA * nB - U_a);
      const mu = nA * nB / 2;
      const sigma = Math.sqrt(nA * nB * (nA + nB + 1) / 12);
      const z = sigma > 0 ? (U - mu) / sigma : 0;
      const p = 2 * normalCDF(-Math.abs(z));
      result = { fn: 'mann-whitney-u', u: U, p, r: Math.abs(z / Math.sqrt(nA + nB)) };
      break;
    }
    case 'bootstrap-ci': {
      const { data, nBoot, alpha } = test;
      const n = data.length;
      const means = new Float64Array(nBoot);
      for (let b = 0; b < nBoot; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += data[Math.floor(Math.random() * n)];
        means[b] = s / n;
      }
      means.sort();
      result = { fn: 'bootstrap-ci', lower: means[Math.floor(alpha / 2 * nBoot)], upper: means[Math.floor((1 - alpha / 2) * nBoot)], mean: mean(data) };
      break;
    }
    case 'permutation': {
      const { a, b, nPerm } = test;
      const obs = mean(a) - mean(b);
      const combined = [...a, ...b];
      const nA = a.length;
      let count = 0;
      for (let p = 0; p < nPerm; p++) {
        // Fisher-Yates shuffle
        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = combined[i]; combined[i] = combined[j]; combined[j] = tmp;
        }
        let s1 = 0, s2 = 0;
        for (let i = 0; i < nA; i++) s1 += combined[i];
        for (let i = nA; i < combined.length; i++) s2 += combined[i];
        if (Math.abs(s1 / nA - s2 / (combined.length - nA)) >= Math.abs(obs)) count++;
      }
      result = { fn: 'permutation', p: (count + 1) / (nPerm + 1), observedDiff: obs };
      break;
    }
    case 'bonferroni': {
      const m = test.pValues.length;
      result = { fn: 'bonferroni', corrected: test.pValues.map(p => Math.min(p * m, 1)) };
      break;
    }
    case 'benjamini-hochberg': {
      const m = test.pValues.length;
      const indexed = test.pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
      const adj = new Array(m);
      for (let k = m - 1; k >= 0; k--) {
        const raw = indexed[k].p * m / (k + 1);
        adj[indexed[k].i] = k === m - 1 ? Math.min(raw, 1) : Math.min(raw, adj[indexed[k + 1].i]);
      }
      result = { fn: 'benjamini-hochberg', corrected: adj };
      break;
    }
  }

  return { type: 'stat-test', requestId: req.requestId, result: result!, computeMs: performance.now() - t0 };
}

// ─── Calcium Imaging Synthesis ───────────────────────────────────────

function computeCalcium(req: CalciumImagingRequest): CalciumImagingResult {
  const t0 = performance.now();
  const { spikeTimes, nNeurons, tMax, dt, params } = req;
  const nTimepoints = Math.ceil(tMax / dt);

  // Precompute kernel
  const kernelDuration = Math.min(5 * params.tauDecay, tMax);
  const kernelLen = Math.ceil(kernelDuration / dt);
  const kernel = new Float32Array(kernelLen);
  for (let k = 0; k < kernelLen; k++) {
    const t = k * dt;
    kernel[k] = params.amplitude * (1 - Math.exp(-t / params.tauRise)) * Math.exp(-t / params.tauDecay);
  }

  const fluorescence: number[][] = [];
  for (let neuron = 0; neuron < nNeurons; neuron++) {
    if (currentRequestId !== req.requestId) break;
    const calcium = new Float32Array(nTimepoints);

    const spikes = spikeTimes[neuron] ?? [];
    for (const spikeT of spikes) {
      const startBin = Math.floor(spikeT / dt);
      for (let k = 0; k < kernelLen; k++) {
        const idx = startBin + k;
        if (idx >= nTimepoints) break;
        calcium[idx] += kernel[k];
      }
    }

    const peakCa = calcium.reduce((a, b) => Math.max(a, b), 0);
    const f = new Array(nTimepoints);
    for (let t = 0; t < nTimepoints; t++) {
      const saturated = params.fMax * calcium[t] / (calcium[t] + params.kd);
      const noise = gaussianRandom() * params.noiseStd * (peakCa > 0 ? peakCa : 1);
      f[t] = Math.max(0, saturated + noise);
    }
    fluorescence.push(f);
  }

  return { type: 'calcium-imaging', requestId: req.requestId, fluorescence, tPoints: nTimepoints, computeMs: performance.now() - t0 };
}

// ─── Worker Message Handler ──────────────────────────────────────────

const BUDGETS: Record<string, number> = {
  'mutual-information': 200,
  'transfer-entropy': 500,
  'stat-test': 50,
  'calcium-imaging': 100,
};

self.onmessage = (evt: MessageEvent<AnalysisRequest>) => {
  const req = evt.data;

  if (req.type === 'cancel') {
    currentRequestId = req.requestId;
    return;
  }

  currentRequestId = req.requestId;

  try {
    let result: AnalysisResponse;
    switch (req.type) {
      case 'mutual-information': result = computeMI(req); break;
      case 'transfer-entropy': result = computeTE(req); break;
      case 'stat-test': result = computeStatTest(req); break;
      case 'calcium-imaging': result = computeCalcium(req); break;
    }

    const budget = BUDGETS[req.type];
    if (budget && 'computeMs' in result && (result as { computeMs: number }).computeMs > budget) {
      self.postMessage({
        type: 'degradation-warning',
        requestId: req.requestId,
        originalN: 'maxNeurons' in req ? (req as { maxNeurons: number }).maxNeurons : 0,
        reducedN: Math.max(20, Math.floor(('maxNeurons' in req ? (req as { maxNeurons: number }).maxNeurons : 60) * budget / (result as { computeMs: number }).computeMs)),
        reason: `${req.type} took ${(result as { computeMs: number }).computeMs.toFixed(0)}ms (budget: ${budget}ms)`,
      });
    }

    self.postMessage(result);
  } catch (err) {
    self.postMessage({
      type: 'error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    } satisfies ErrorResult);
  }
};
