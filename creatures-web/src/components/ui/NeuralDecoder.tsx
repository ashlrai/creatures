import { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

// ---------------------------------------------------------------------------
// Online Linear Classifier (Perceptron + Softmax, trained via SGD)
// ---------------------------------------------------------------------------

const DIRECTION_LABELS = ['Left', 'Right', 'Forward', 'Backward', 'Still'] as const;
const N_CLASSES = DIRECTION_LABELS.length;
const ACCURACY_WINDOW = 200;
const COM_THRESHOLD = 0.002; // minimum delta to count as directional movement

class OnlineDecoder {
  weights: Float64Array; // (nFeatures + 1) x nClasses, row-major
  nFeatures: number;
  nClasses: number;
  lr: number;
  lrDecay: number;
  accuracyHistory: (0 | 1)[]; // rolling window: 1 = correct, 0 = incorrect
  sampleCount: number;

  constructor(nFeatures: number, lr = 0.001) {
    this.nFeatures = nFeatures;
    this.nClasses = N_CLASSES;
    this.lr = lr;
    this.lrDecay = 0.999;
    // (nFeatures + 1 bias) * nClasses
    this.weights = new Float64Array((nFeatures + 1) * this.nClasses);
    // Small random init for symmetry breaking
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() - 0.5) * 0.01;
    }
    this.accuracyHistory = [];
    this.sampleCount = 0;
  }

  /** Compute softmax probabilities and predicted class. */
  predict(features: number[]): { cls: number; probabilities: number[] } {
    const nF = this.nFeatures;
    const nC = this.nClasses;
    const logits = new Array<number>(nC);

    for (let c = 0; c < nC; c++) {
      let z = this.weights[nF * nC + c]; // bias row
      for (let f = 0; f < nF; f++) {
        z += (features[f] ?? 0) * this.weights[f * nC + c];
      }
      logits[c] = z;
    }

    // Numerically stable softmax
    let maxLogit = -Infinity;
    for (let c = 0; c < nC; c++) if (logits[c] > maxLogit) maxLogit = logits[c];

    const exps = new Array<number>(nC);
    let sumExp = 0;
    for (let c = 0; c < nC; c++) {
      exps[c] = Math.exp(logits[c] - maxLogit);
      sumExp += exps[c];
    }

    const probabilities = new Array<number>(nC);
    let bestC = 0;
    let bestP = 0;
    for (let c = 0; c < nC; c++) {
      probabilities[c] = exps[c] / sumExp;
      if (probabilities[c] > bestP) {
        bestP = probabilities[c];
        bestC = c;
      }
    }

    return { cls: bestC, probabilities };
  }

  /** One SGD step using cross-entropy gradient. */
  train(features: number[], trueClass: number): { correct: boolean; probabilities: number[] } {
    const { cls, probabilities } = this.predict(features);
    const correct = cls === trueClass;

    this.accuracyHistory.push(correct ? 1 : 0);
    if (this.accuracyHistory.length > ACCURACY_WINDOW) {
      this.accuracyHistory.shift();
    }
    this.sampleCount++;

    // Gradient: dL/dz_c = p_c - 1(c == trueClass)
    const nF = this.nFeatures;
    const nC = this.nClasses;
    const lr = this.lr;

    for (let c = 0; c < nC; c++) {
      const grad = probabilities[c] - (c === trueClass ? 1 : 0);
      // Update feature weights
      for (let f = 0; f < nF; f++) {
        this.weights[f * nC + c] -= lr * grad * (features[f] ?? 0);
      }
      // Update bias
      this.weights[nF * nC + c] -= lr * grad;
    }

    // Decay learning rate
    this.lr *= this.lrDecay;

    return { correct, probabilities };
  }

  /** Sum of absolute weights per input neuron across all output classes. */
  getFeatureImportance(): number[] {
    const nF = this.nFeatures;
    const nC = this.nClasses;
    const importance = new Array<number>(nF);
    for (let f = 0; f < nF; f++) {
      let sum = 0;
      for (let c = 0; c < nC; c++) {
        sum += Math.abs(this.weights[f * nC + c]);
      }
      importance[f] = sum;
    }
    return importance;
  }

  getRollingAccuracy(): number {
    if (this.accuracyHistory.length === 0) return 0;
    let sum = 0;
    for (const v of this.accuracyHistory) sum += v;
    return sum / this.accuracyHistory.length;
  }
}

// ---------------------------------------------------------------------------
// Determine ground truth movement direction from center_of_mass delta
// ---------------------------------------------------------------------------

function classifyDirection(prevCom: number[], curCom: number[]): number {
  const dx = curCom[0] - prevCom[0];
  const dy = curCom[1] - prevCom[1];

  // Prioritize the axis with the larger absolute delta
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > absDy && absDx > COM_THRESHOLD) {
    return dx > 0 ? 1 : 0; // right : left
  }
  if (absDy > COM_THRESHOLD) {
    return dy > 0 ? 2 : 3; // forward : backward
  }
  return 4; // still
}

// ---------------------------------------------------------------------------
// NeuralDecoder component
// ---------------------------------------------------------------------------

const CANVAS_W = 240;
const COMPASS_H = 90;
const ACCURACY_CHART_H = 80;
const IMPORTANCE_H = 70;
const CANVAS_H = COMPASS_H + ACCURACY_CHART_H + IMPORTANCE_H;

const TYPE_COLORS: Record<string, string> = {
  sensory: '#00ff88',
  inter: '#00ccff',
  motor: '#ff4466',
};

export function NeuralDecoder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<OnlineDecoder | null>(null);
  const prevComRef = useRef<number[] | null>(null);
  const lastTRef = useRef<number>(-1);
  const importanceRef = useRef<{ idx: number; value: number; type: string }[]>([]);
  const frameCountRef = useRef(0);
  const accuracyCurveRef = useRef<number[]>([]);
  const lastPredRef = useRef<{ probs: number[]; trueClass: number; correct: boolean } | null>(null);
  const flashRef = useRef<{ correct: boolean; t: number } | null>(null);
  const neuronTypeMapRef = useRef<Record<number, 'sensory' | 'inter' | 'motor'>>({});

  const [training, setTraining] = useState(true);
  const [lr, setLr] = useState(0.001);
  const [sampleCount, setSampleCount] = useState(0);

  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 0;

  // Load neuron types once
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    (async () => {
      try {
        const res = await fetch(`${base}neuron-types.json`);
        if (!res.ok) return;
        const data: Record<string, { type: 'sensory' | 'inter' | 'motor' }> = await res.json();
        const entries = Object.values(data);
        const map: Record<number, 'sensory' | 'inter' | 'motor'> = {};
        for (let i = 0; i < entries.length; i++) {
          if (entries[i].type) map[i] = entries[i].type;
        }
        neuronTypeMapRef.current = map;
      } catch { /* neuron-types.json not available */ }
    })();
  }, []);

  // Reset decoder when neuron count changes
  useEffect(() => {
    if (nNeurons > 0) {
      decoderRef.current = new OnlineDecoder(nNeurons, lr);
      prevComRef.current = null;
      lastTRef.current = -1;
      frameCountRef.current = 0;
      accuracyCurveRef.current = [];
      lastPredRef.current = null;
      importanceRef.current = [];
      setSampleCount(0);
    }
  }, [nNeurons]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync learning rate into decoder
  useEffect(() => {
    if (decoderRef.current) decoderRef.current.lr = lr;
  }, [lr]);

  const resetDecoder = useCallback(() => {
    if (nNeurons > 0) {
      decoderRef.current = new OnlineDecoder(nNeurons, lr);
      prevComRef.current = null;
      lastTRef.current = -1;
      frameCountRef.current = 0;
      accuracyCurveRef.current = [];
      lastPredRef.current = null;
      importanceRef.current = [];
      setSampleCount(0);
    }
  }, [nNeurons, lr]);

  // Train / predict on each frame
  useEffect(() => {
    const decoder = decoderRef.current;
    if (!decoder || !frame || !frame.firing_rates || frame.firing_rates.length === 0) return;
    if (!frame.center_of_mass || frame.center_of_mass.length < 2) return;
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    const com = frame.center_of_mass;
    const prevCom = prevComRef.current;
    prevComRef.current = com;

    if (!prevCom) return; // need two frames for direction

    const trueClass = classifyDirection(prevCom, com);
    const features = Array.from(frame.firing_rates);

    if (training) {
      const { correct, probabilities } = decoder.train(features, trueClass);
      lastPredRef.current = { probs: probabilities, trueClass, correct };
      flashRef.current = { correct, t: performance.now() };
      setSampleCount(decoder.sampleCount);
    } else {
      const { probabilities } = decoder.predict(features);
      lastPredRef.current = { probs: probabilities, trueClass, correct: false };
    }

    // Update accuracy curve
    const acc = decoder.getRollingAccuracy();
    accuracyCurveRef.current.push(acc);
    if (accuracyCurveRef.current.length > ACCURACY_WINDOW) {
      accuracyCurveRef.current.shift();
    }

    // Update feature importance every 30 frames
    frameCountRef.current++;
    if (frameCountRef.current % 30 === 0) {
      const raw = decoder.getFeatureImportance();
      const indexed = raw.map((value, idx) => ({
        idx,
        value,
        type: neuronTypeMapRef.current[idx] ?? 'inter',
      }));
      indexed.sort((a, b) => b.value - a.value);
      importanceRef.current = indexed.slice(0, 10);
    }
  }, [frame, training]);

  // Draw everything
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, CANVAS_H);

    const pred = lastPredRef.current;
    const probs = pred?.probs ?? [0.2, 0.2, 0.2, 0.2, 0.2];
    const trueClass = pred?.trueClass ?? -1;

    // ---- TOP: Compass direction display ----
    const cx = w / 2;
    const cy = 44;
    const r = 28;

    // Compass positions: left, right, forward(up), backward(down), still(center)
    const positions: [number, number, string][] = [
      [cx - r, cy, '\u2190'],      // 0: left
      [cx + r, cy, '\u2192'],      // 1: right
      [cx, cy - r, '\u2191'],      // 2: forward (up)
      [cx, cy + r, '\u2193'],      // 3: backward (down)
      [cx, cy, '\u25CF'],          // 4: still (center dot)
    ];

    // Flash timing
    const flash = flashRef.current;
    const flashAge = flash ? performance.now() - flash.t : 9999;
    const flashAlpha = flashAge < 300 ? 1 - flashAge / 300 : 0;

    for (let i = 0; i < N_CLASSES; i++) {
      const [px, py, symbol] = positions[i];
      const prob = probs[i];
      const isTrue = i === trueClass;

      // Background glow based on probability
      const alpha = 0.15 + prob * 0.7;
      ctx.fillStyle = `rgba(0, 204, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();

      // True direction border
      if (isTrue) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 15, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Flash overlay
      if (flashAlpha > 0 && isTrue && flash) {
        ctx.fillStyle = flash.correct
          ? `rgba(0, 255, 100, ${(flashAlpha * 0.5).toFixed(3)})`
          : `rgba(255, 50, 50, ${(flashAlpha * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      // Symbol
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.4 + prob * 0.6).toFixed(3)})`;
      ctx.font = i === 4 ? '12px monospace' : '16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol, px, py);
    }

    // Prediction label
    const bestClass = probs.indexOf(Math.max(...probs));
    ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Pred: ${DIRECTION_LABELS[bestClass]}`, 8, 84);
    ctx.textAlign = 'right';
    ctx.fillText(`True: ${trueClass >= 0 ? DIRECTION_LABELS[trueClass] : '...'}`, w - 8, 84);

    // ---- MIDDLE: Accuracy curve ----
    const accY0 = COMPASS_H;
    const accH = ACCURACY_CHART_H;
    const chartPad = 8;
    const chartW = w - chartPad * 2;
    const chartH = accH - 20;
    const chartY = accY0 + 14;

    // Section label
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Decoding Accuracy', chartPad, accY0 + 10);

    // Chart background
    ctx.fillStyle = 'rgba(10, 15, 25, 0.6)';
    ctx.fillRect(chartPad, chartY, chartW, chartH);

    // Chance level line at 20%
    const chanceY = chartY + chartH * (1 - 0.2);
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(chartPad, chanceY);
    ctx.lineTo(chartPad + chartW, chanceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Chance label
    ctx.fillStyle = 'rgba(255, 100, 100, 0.35)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('20%', chartPad + chartW - 2, chanceY - 2);

    // Draw accuracy curve
    const curve = accuracyCurveRef.current;
    if (curve.length > 1) {
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < curve.length; i++) {
        const x = chartPad + (i / (ACCURACY_WINDOW - 1)) * chartW;
        const y = chartY + chartH * (1 - curve[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Current accuracy number
    const currentAcc = curve.length > 0 ? curve[curve.length - 1] : 0;
    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${(currentAcc * 100).toFixed(1)}%`, w - chartPad, accY0 + 11);

    // ---- BOTTOM: Feature importance ----
    const impY0 = COMPASS_H + ACCURACY_CHART_H;
    const impH = IMPORTANCE_H;
    const barPad = 8;

    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Top Neurons', barPad, impY0 + 10);

    const importance = importanceRef.current;
    if (importance.length > 0) {
      const maxVal = importance[0].value || 1;
      const barH = Math.min(5, (impH - 16) / importance.length);
      const barAreaW = w - barPad * 2 - 30; // leave room for neuron ID label

      for (let i = 0; i < importance.length; i++) {
        const { idx, value, type } = importance[i];
        const y = impY0 + 14 + i * (barH + 1);
        const barW = (value / maxVal) * barAreaW;

        // Neuron ID label
        ctx.fillStyle = 'rgba(140, 170, 200, 0.5)';
        ctx.font = '7px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${idx}`, barPad + 24, y + barH - 0.5);

        // Bar
        ctx.fillStyle = TYPE_COLORS[type] ?? '#00ccff';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(barPad + 28, y, barW, barH);
        ctx.globalAlpha = 1;
      }
    }
  }, []);

  // Redraw on every frame
  useEffect(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw, frame]);

  return (
    <div style={{ width: `${CANVAS_W + 20}px` }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          width: `${CANVAS_W}px`,
          height: `${CANVAS_H}px`,
          borderRadius: 4,
          display: 'block',
        }}
      />

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: 8,
          fontFamily: 'monospace',
          fontSize: 10,
          color: 'rgba(140, 170, 200, 0.7)',
        }}
      >
        {/* Top row: buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setTraining((t) => !t)}
            style={{
              flex: 1,
              padding: '4px 8px',
              background: training ? 'rgba(0, 204, 255, 0.15)' : 'rgba(80, 80, 100, 0.15)',
              border: `1px solid ${training ? 'rgba(0, 204, 255, 0.4)' : 'rgba(80, 80, 100, 0.3)'}`,
              borderRadius: 4,
              color: training ? '#0cf' : 'rgba(140,170,200,0.6)',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {training ? 'Pause Training' : 'Train'}
          </button>
          <button
            onClick={resetDecoder}
            style={{
              padding: '4px 8px',
              background: 'rgba(255, 80, 80, 0.1)',
              border: '1px solid rgba(255, 80, 80, 0.25)',
              borderRadius: 4,
              color: 'rgba(255, 120, 120, 0.7)',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>

        {/* Learning rate slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ whiteSpace: 'nowrap' }}>LR</span>
          <input
            type="range"
            min={-4}
            max={-1.7}
            step={0.1}
            value={Math.log10(lr)}
            onChange={(e) => setLr(Math.pow(10, parseFloat(e.target.value)))}
            style={{ flex: 1, accentColor: '#00ccff', height: 12 }}
          />
          <span style={{ minWidth: 44, textAlign: 'right' }}>{lr.toFixed(4)}</span>
        </div>

        {/* Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, opacity: 0.6 }}>
          <span>Trained: {sampleCount.toLocaleString()} frames</span>
          <span>{nNeurons} neurons {'\u2192'} {N_CLASSES} classes</span>
        </div>
      </div>
    </div>
  );
}
