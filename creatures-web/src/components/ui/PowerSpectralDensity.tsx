import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Power spectral density of the total population firing rate.
 * Uses a radix-2 Cooley-Tukey FFT on the last 256 frames.
 * Displays frequency (Hz) on X, log power on Y.
 * Highlights peak frequency with a vertical line and label.
 *
 * Self-contained: reads frame data from useSimulationStore and accumulates
 * the last 256 frames of summed population firing rate internally.
 */
export function PowerSpectralDensity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<number[]>([]);
  const lastTRef = useRef<number>(-1);

  const frame = useSimulationStore((s) => s.frame);
  const BUFFER_SIZE = 256;
  const SAMPLE_RATE = 30; // assumed 30 fps

  // Radix-2 Cooley-Tukey FFT (in-place, iterative)
  const fft = (re: Float64Array, im: Float64Array): void => {
    const n = re.length;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;

      if (i < j) {
        let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }

    // Butterfly stages
    for (let len = 2; len <= n; len *= 2) {
      const halfLen = len / 2;
      const angle = -2 * Math.PI / len;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);

      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let k = 0; k < halfLen; k++) {
          const evenIdx = i + k;
          const oddIdx = i + k + halfLen;

          const tRe = curRe * re[oddIdx] - curIm * im[oddIdx];
          const tIm = curRe * im[oddIdx] + curIm * re[oddIdx];

          re[oddIdx] = re[evenIdx] - tRe;
          im[oddIdx] = im[evenIdx] - tIm;
          re[evenIdx] += tRe;
          im[evenIdx] += tIm;

          const newCurRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newCurRe;
        }
      }
    }
  };

  // Accumulate population firing rate from each new frame
  useEffect(() => {
    if (!frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    // Sum all firing rates for population signal
    let sum = 0;
    for (let i = 0; i < frame.firing_rates.length; i++) {
      sum += frame.firing_rates[i];
    }

    bufferRef.current.push(sum);
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }
  }, [frame]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    const signal = bufferRef.current;
    if (signal.length < BUFFER_SIZE) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '10px monospace';
      ctx.fillText(`Buffering... ${signal.length}/${BUFFER_SIZE}`, 8, h / 2);
      return;
    }

    const N = BUFFER_SIZE;
    const nyquist = SAMPLE_RATE / 2;

    // Apply Hann window + DC removal
    const re = new Float64Array(N);
    const im = new Float64Array(N);

    let mean = 0;
    for (let i = 0; i < N; i++) mean += signal[signal.length - N + i];
    mean /= N;

    for (let i = 0; i < N; i++) {
      const hannWeight = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      re[i] = (signal[signal.length - N + i] - mean) * hannWeight;
      im[i] = 0;
    }

    fft(re, im);

    // Compute power spectrum (positive frequencies only)
    const nBins = N / 2;
    const power = new Float64Array(nBins);
    let maxPower = -Infinity;
    let peakBin = 0;

    for (let k = 1; k < nBins; k++) {
      power[k] = re[k] * re[k] + im[k] * im[k];
      if (power[k] > maxPower) {
        maxPower = power[k];
        peakBin = k;
      }
    }

    // Log scale
    const logPower = new Float64Array(nBins);
    let minLog = Infinity, maxLog = -Infinity;
    for (let k = 1; k < nBins; k++) {
      logPower[k] = Math.log10(Math.max(power[k], 1e-10));
      if (logPower[k] < minLog) minLog = logPower[k];
      if (logPower[k] > maxLog) maxLog = logPower[k];
    }

    if (maxLog - minLog < 0.1) minLog = maxLog - 1;

    // Drawing area
    const marginL = 32;
    const marginR = 8;
    const marginT = 12;
    const marginB = 20;
    const plotW = w - marginL - marginR;
    const plotH = h - marginT - marginB;

    const freqToX = (f: number) => marginL + (f / nyquist) * plotW;
    const logToY = (lp: number) => marginT + plotH - ((lp - minLog) / (maxLog - minLog)) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const freqStep = nyquist <= 20 ? 5 : 10;
    for (let f = 0; f <= nyquist; f += freqStep) {
      const x = freqToX(f);
      ctx.beginPath(); ctx.moveTo(x, marginT); ctx.lineTo(x, h - marginB); ctx.stroke();
      ctx.fillText(`${f}`, x, h - marginB + 3);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const logRange = maxLog - minLog;
    const logStep = logRange > 6 ? 2 : logRange > 3 ? 1 : 0.5;
    for (let lp = Math.ceil(minLog / logStep) * logStep; lp <= maxLog; lp += logStep) {
      const y = logToY(lp);
      ctx.beginPath(); ctx.moveTo(marginL, y); ctx.lineTo(w - marginR, y); ctx.stroke();
      ctx.fillText(`${lp.toFixed(0)}`, marginL - 3, y);
    }

    // Power spectrum line
    ctx.beginPath();
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 1.5;
    for (let k = 1; k < nBins; k++) {
      const freq = (k / N) * SAMPLE_RATE;
      const x = freqToX(freq);
      const y = logToY(logPower[k]);
      if (k === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    const lastFreq = ((nBins - 1) / N) * SAMPLE_RATE;
    ctx.lineTo(freqToX(lastFreq), h - marginB);
    ctx.lineTo(freqToX((1 / N) * SAMPLE_RATE), h - marginB);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 200, 255, 0.06)';
    ctx.fill();

    // Peak frequency highlight
    if (peakBin > 0) {
      const peakFreq = (peakBin / N) * SAMPLE_RATE;
      const peakX = freqToX(peakFreq);

      ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(peakX, marginT);
      ctx.lineTo(peakX, h - marginB);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 200, 0, 0.7)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${peakFreq.toFixed(1)} Hz`, peakX + 3, marginT + 2);
    }

    // Axis labels
    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Hz', w - marginR - 4, h - 10);

    ctx.save();
    ctx.translate(8, marginT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('log P', 0, 0);
    ctx.restore();
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, frame]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={140}
      style={{ width: '200px', height: '140px', borderRadius: 4, display: 'block' }}
    />
  );
}
