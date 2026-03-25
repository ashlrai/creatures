import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useAnalysisWorker } from '../../hooks/useAnalysisWorker';
import { useSimulationStore } from '../../stores/simulationStore';
import { CollapsiblePanel } from './CollapsiblePanel';

// ─── Indicator presets ──────────────────────────────────────────────────────
type IndicatorPreset = 'GCaMP6f' | 'GCaMP6s';

const INDICATOR_PARAMS: Record<IndicatorPreset, { tauRise: number; tauDecay: number; label: string }> = {
  GCaMP6f: { tauRise: 50, tauDecay: 400, label: 'GCaMP6f (fast)' },
  GCaMP6s: { tauRise: 100, tauDecay: 1500, label: 'GCaMP6s (slow)' },
};

// ─── useCalciumColors hook ──────────────────────────────────────────────────
/**
 * Returns a Float32Array of per-neuron fluorescence values (0..1),
 * suitable for adding green emissive channel to 3D neuron meshes.
 * Returns null when disabled or before first computation completes.
 */
export function useCalciumColors(enabled: boolean): Float32Array | null {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const { computeCalcium, calciumResult } = useAnalysisWorker();

  const spikeBufferRef = useRef<Map<number, number[]>>(new Map());
  const frameCountRef = useRef(0);
  const colorsRef = useRef<Float32Array | null>(null);
  const BUFFER_WINDOW_MS = 2000;

  // Accumulate spike times into a rolling buffer
  useEffect(() => {
    if (!enabled || !frame) return;

    const tNow = frame.t_ms;
    const buf = spikeBufferRef.current;

    // Record spike times for each spiking neuron
    for (const neuronIdx of frame.spikes) {
      if (!buf.has(neuronIdx)) buf.set(neuronIdx, []);
      buf.get(neuronIdx)!.push(tNow);
    }

    // Prune old spikes beyond the window
    const cutoff = tNow - BUFFER_WINDOW_MS;
    for (const [nid, times] of buf) {
      const pruned = times.filter((t) => t > cutoff);
      if (pruned.length === 0) buf.delete(nid);
      else buf.set(nid, pruned);
    }

    // Compute calcium every 10 frames
    frameCountRef.current++;
    if (frameCountRef.current % 10 !== 0) return;

    const nNeurons = experiment?.n_neurons ?? 0;
    if (nNeurons === 0) return;

    // Build spikeTimes array: per neuron, array of spike times
    const spikeTimes: number[][] = [];
    for (let i = 0; i < nNeurons; i++) {
      spikeTimes.push(buf.get(i) ?? []);
    }

    computeCalcium(spikeTimes, nNeurons, tNow, {
      tauRise: 50,
      tauDecay: 400,
      noiseStd: 0.05,
      dt: 33,
    });
  }, [enabled, frame, experiment, computeCalcium]);

  // Extract latest fluorescence values from the result
  useEffect(() => {
    if (!enabled || !calciumResult || calciumResult.fluorescence.length === 0) {
      colorsRef.current = null;
      return;
    }

    const nNeurons = calciumResult.fluorescence.length;
    const arr = new Float32Array(nNeurons);

    // Use last time point of each neuron's fluorescence
    for (let i = 0; i < nNeurons; i++) {
      const trace = calciumResult.fluorescence[i];
      arr[i] = trace.length > 0 ? Math.max(0, Math.min(1, trace[trace.length - 1])) : 0;
    }

    colorsRef.current = arr;
  }, [enabled, calciumResult]);

  return enabled ? colorsRef.current : null;
}

// ─── CalciumOverlay panel ───────────────────────────────────────────────────

export function CalciumOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [indicator, setIndicator] = useState<IndicatorPreset>('GCaMP6f');
  const [noiseLevel, setNoiseLevel] = useState(0.1);

  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const { computeCalcium, calciumResult, pending } = useAnalysisWorker();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spikeBufferRef = useRef<Map<number, number[]>>(new Map());
  const frameCountRef = useRef(0);

  const params = INDICATOR_PARAMS[indicator];

  // Accumulate spikes and trigger computation
  useEffect(() => {
    if (!enabled || !frame) return;

    const tNow = frame.t_ms;
    const buf = spikeBufferRef.current;

    for (const neuronIdx of frame.spikes) {
      if (!buf.has(neuronIdx)) buf.set(neuronIdx, []);
      buf.get(neuronIdx)!.push(tNow);
    }

    // Prune old
    const cutoff = tNow - 2000;
    for (const [nid, times] of buf) {
      const pruned = times.filter((t) => t > cutoff);
      if (pruned.length === 0) buf.delete(nid);
      else buf.set(nid, pruned);
    }

    frameCountRef.current++;
    if (frameCountRef.current % 10 !== 0) return;

    const nNeurons = experiment?.n_neurons ?? 0;
    if (nNeurons === 0) return;

    const spikeTimes: number[][] = [];
    for (let i = 0; i < nNeurons; i++) {
      spikeTimes.push(buf.get(i) ?? []);
    }

    computeCalcium(spikeTimes, nNeurons, tNow, {
      tauRise: params.tauRise,
      tauDecay: params.tauDecay,
      noiseStd: noiseLevel,
      dt: 33,
    });
  }, [enabled, frame, experiment, computeCalcium, params.tauRise, params.tauDecay, noiseLevel]);

  // Draw the population-average fluorescence preview
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !calciumResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#040810';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(0, 180, 100, 0.08)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += h / 3) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const { fluorescence, tPoints } = calciumResult;
    if (fluorescence.length === 0 || tPoints === 0) return;

    // Compute population average at each time point
    const nNeurons = fluorescence.length;
    const avg = new Float32Array(tPoints);
    let maxVal = 0.001;

    for (let t = 0; t < tPoints; t++) {
      let sum = 0;
      for (let n = 0; n < nNeurons; n++) {
        sum += fluorescence[n]?.[t] ?? 0;
      }
      avg[t] = sum / nNeurons;
      if (avg[t] > maxVal) maxVal = avg[t];
    }

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let t = 0; t < tPoints; t++) {
      const x = (t / (tPoints - 1)) * w;
      const y = h - (avg[t] / maxVal) * (h * 0.85);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 255, 120, 0.3)');
    grad.addColorStop(1, 'rgba(0, 255, 120, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 4;
    for (let t = 0; t < tPoints; t++) {
      const x = (t / (tPoints - 1)) * w;
      const y = h - (avg[t] / maxVal) * (h * 0.85);
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [calciumResult]);

  useEffect(() => {
    if (enabled) drawPreview();
  }, [enabled, drawPreview]);

  // Compute peak delta-F/F0
  const peakDeltaF = useMemo(() => {
    if (!calciumResult || calciumResult.fluorescence.length === 0) return 0;
    let peak = 0;
    for (const trace of calciumResult.fluorescence) {
      for (const val of trace) {
        if (val > peak) peak = val;
      }
    }
    return peak;
  }, [calciumResult]);

  return (
    <CollapsiblePanel id="calcium-imaging" label="Calcium Imaging">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Enable toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ accentColor: 'var(--accent-green)' }}
          />
          Enable GCaMP6 overlay
          {pending && (
            <span className="experiment-spinner" style={{ marginLeft: 4 }} />
          )}
        </label>

        {!enabled ? (
          <div style={{ fontSize: 10, color: 'var(--text-label)', fontStyle: 'italic', lineHeight: 1.5 }}>
            Enable to predict calcium fluorescence from spike trains
          </div>
        ) : (
          <>
            {/* Fluorescence preview canvas */}
            <canvas
              ref={canvasRef}
              width={360}
              height={120}
              style={{
                width: '100%',
                height: 60,
                borderRadius: 4,
                display: 'block',
                border: '1px solid rgba(0, 255, 136, 0.1)',
              }}
            />

            {/* Peak value */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Peak dF/F0
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent-green)',
              }}>
                {peakDeltaF.toFixed(3)}
              </span>
            </div>

            {/* Indicator selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Indicator
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(Object.keys(INDICATOR_PARAMS) as IndicatorPreset[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setIndicator(key)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      borderRadius: 5,
                      border: `1px solid ${indicator === key ? 'rgba(0, 255, 136, 0.3)' : 'var(--border-subtle)'}`,
                      background: indicator === key ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255,255,255,0.02)',
                      color: indicator === key ? 'var(--accent-green)' : 'var(--text-label)',
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-label)' }}>
                {params.label} | tau_decay = {params.tauDecay}ms
              </span>
            </div>

            {/* Noise slider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Noise level
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {noiseLevel.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={noiseLevel}
                onChange={(e) => setNoiseLevel(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--accent-green)',
                  height: 3,
                }}
              />
            </div>
          </>
        )}
      </div>
    </CollapsiblePanel>
  );
}
