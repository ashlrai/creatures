import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { CollapsiblePanel } from './CollapsiblePanel';

// ── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 30; // ~30 fps
const MAX_BUFFER = 300; // 10s at 30fps

// Biophysical constants for membrane potential estimation
const V_REST = -65; // mV
const V_THRESH = -40; // mV

// Channel definitions
interface ChannelDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  colorRgb: string; // for alpha compositing
}

const CHANNELS: ChannelDef[] = [
  { key: 'firingRate', label: 'Firing Rate', unit: 'Hz', color: '#00d4ff', colorRgb: '0,212,255' },
  { key: 'spikeTrain', label: 'Spike Train', unit: '', color: '#ff4444', colorRgb: '255,68,68' },
  { key: 'membranePotential', label: 'V_est (membrane)', unit: 'mV', color: '#44ff88', colorRgb: '68,255,136' },
  { key: 'synapticInput', label: 'Synaptic Input', unit: 'a.u.', color: '#4488ff', colorRgb: '68,136,255' },
];

const TIME_WINDOWS = [1, 2, 5, 10] as const;
type TimeWindow = (typeof TIME_WINDOWS)[number];

// ── Connectome types (mirrored from NeuronDetailPanel) ───────────────────────

interface ConnectomeEdge {
  pre: string;
  post: string;
  weight: number;
}

interface ConnectomeGraph {
  nodes: { id: string }[];
  edges: ConnectomeEdge[];
}

// ── Ring buffer helper ───────────────────────────────────────────────────────

class RingBuffer {
  private data: Float64Array;
  private head = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Float64Array(capacity);
  }

  push(value: number) {
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Return the most recent `n` values in chronological order */
  recent(n: number): Float64Array {
    const len = Math.min(n, this.count);
    const result = new Float64Array(len);
    const start = (this.head - len + this.capacity) % this.capacity;
    for (let i = 0; i < len; i++) {
      result[i] = this.data[(start + i) % this.capacity];
    }
    return result;
  }

  last(): number {
    if (this.count === 0) return 0;
    return this.data[(this.head - 1 + this.capacity) % this.capacity];
  }

  get length() {
    return this.count;
  }

  clear() {
    this.head = 0;
    this.count = 0;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function Oscilloscope() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const selectedNeurons = useCircuitModificationStore((s) => s.selectedNeurons);
  const selectedNeuron = useSimulationStore((s) => s.selectedNeuron);

  // Derive active neuron ID from either store
  const activeNeuronId = selectedNeurons[0] ?? selectedNeuron ?? null;

  // Local state
  const [monitorNeuronId, setMonitorNeuronId] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(5);
  const [frozen, setFrozen] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({
    firingRate: true,
    spikeTrain: true,
    membranePotential: true,
    synapticInput: true,
  });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const buffersRef = useRef<{
    firingRate: RingBuffer;
    spikeTrain: RingBuffer; // 1 = spike, 0 = no spike
    membranePotential: RingBuffer;
    synapticInput: RingBuffer;
  }>({
    firingRate: new RingBuffer(MAX_BUFFER),
    spikeTrain: new RingBuffer(MAX_BUFFER),
    membranePotential: new RingBuffer(MAX_BUFFER),
    synapticInput: new RingBuffer(MAX_BUFFER),
  });
  const graphRef = useRef<ConnectomeGraph | null>(null);
  const presynapticMapRef = useRef<Map<number, { idx: number; weight: number }[]>>(new Map());

  // Sync monitored neuron with selection
  useEffect(() => {
    if (activeNeuronId) {
      setMonitorNeuronId(activeNeuronId);
    }
  }, [activeNeuronId]);

  // Parse neuron index from ID
  const neuronIndex = useMemo(() => {
    if (!monitorNeuronId) return -1;
    return parseInt(monitorNeuronId.replace(/\D/g, ''), 10);
  }, [monitorNeuronId]);

  // Load connectome graph for synaptic input computation
  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || '/';

    const load = async () => {
      try {
        let data: ConnectomeGraph;
        try {
          const res = await fetch('/api/morphology/connectome-graph');
          if (!res.ok) throw new Error('api');
          data = await res.json();
        } catch {
          const res = await fetch(`${base}connectome-graph.json`);
          if (!res.ok) throw new Error('static');
          data = await res.json();
        }
        if (!cancelled) graphRef.current = data;
      } catch {
        // Connectome unavailable — synaptic input channel will be flat
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Build presynaptic neighbor map when neuron changes
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || neuronIndex < 0) {
      presynapticMapRef.current = new Map();
      return;
    }

    const targetId = monitorNeuronId!;
    const neighbors: { idx: number; weight: number }[] = [];
    for (const edge of graph.edges) {
      if (edge.post === targetId) {
        const preIdx = parseInt(edge.pre.replace(/\D/g, ''), 10);
        if (!isNaN(preIdx)) {
          neighbors.push({ idx: preIdx, weight: edge.weight });
        }
      }
    }
    const map = new Map<number, { idx: number; weight: number }[]>();
    map.set(neuronIndex, neighbors);
    presynapticMapRef.current = map;
  }, [neuronIndex, monitorNeuronId]);

  // Clear buffers when monitored neuron changes
  useEffect(() => {
    const b = buffersRef.current;
    b.firingRate.clear();
    b.spikeTrain.clear();
    b.membranePotential.clear();
    b.synapticInput.clear();
  }, [neuronIndex]);

  // Accumulate data from simulation frames
  useEffect(() => {
    if (!frame || neuronIndex < 0 || frozen) return;

    const b = buffersRef.current;
    const rate = frame.firing_rates[neuronIndex] ?? 0;
    const hasSpike = frame.spikes?.includes(neuronIndex) ? 1 : 0;

    // Firing rate
    b.firingRate.push(rate);

    // Spike train
    b.spikeTrain.push(hasSpike);

    // Estimated membrane potential: V_est = V_rest + (V_thresh - V_rest) * (rate / max_rate)
    // Use a running max for stability
    let maxRate = 1;
    const recent = b.firingRate.recent(b.firingRate.length);
    for (let i = 0; i < recent.length; i++) {
      if (recent[i] > maxRate) maxRate = recent[i];
    }
    const vEst = V_REST + (V_THRESH - V_REST) * (rate / maxRate);
    b.membranePotential.push(vEst);

    // Synaptic input: sum of presynaptic neighbor activity * weight
    const neighbors = presynapticMapRef.current.get(neuronIndex);
    let synapticSum = 0;
    if (neighbors && frame.firing_rates) {
      for (const { idx, weight } of neighbors) {
        const preRate = frame.firing_rates[idx] ?? 0;
        synapticSum += preRate * weight;
      }
    }
    b.synapticInput.push(synapticSum);
  }, [frame, neuronIndex, frozen]);

  // Neuron ID list for dropdown
  const neuronIds = useMemo(() => {
    const n = experiment?.n_neurons ?? frame?.firing_rates?.length ?? 0;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(`N${i}`);
    return ids;
  }, [experiment, frame?.firing_rates?.length]);

  // Export CSV
  const exportTrace = useCallback(() => {
    const b = buffersRef.current;
    const samples = b.firingRate.length;
    const fr = b.firingRate.recent(samples);
    const sp = b.spikeTrain.recent(samples);
    const vm = b.membranePotential.recent(samples);
    const si = b.synapticInput.recent(samples);

    let csv = 'sample,time_s,firing_rate_Hz,spike,membrane_potential_mV,synaptic_input\n';
    for (let i = 0; i < samples; i++) {
      const t = (i / SAMPLE_RATE).toFixed(4);
      csv += `${i},${t},${fr[i].toFixed(4)},${sp[i]},${vm[i].toFixed(4)},${si[i].toFixed(4)}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oscilloscope_${monitorNeuronId ?? 'unknown'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [monitorNeuronId]);

  // ── Canvas rendering ──────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle DPR for crisp rendering
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear
    ctx.fillStyle = '#030308';
    ctx.fillRect(0, 0, w, h);

    const b = buffersRef.current;
    const samplesInWindow = Math.round(timeWindow * SAMPLE_RATE);

    // Visible channels
    const visibleChannels = CHANNELS.filter((ch) => channelVisibility[ch.key]);
    const numChannels = visibleChannels.length;
    if (numChannels === 0) return;

    // Layout
    const labelWidth = 100;
    const valueWidth = 70;
    const timeAxisHeight = 20;
    const channelHeight = (h - timeAxisHeight) / numChannels;
    const plotLeft = labelWidth;
    const plotRight = w - valueWidth;
    const plotWidth = plotRight - plotLeft;

    // ── Grid ──────────────────────────────────────────────────────────────

    // Vertical grid lines (every 1s)
    ctx.strokeStyle = 'rgba(60, 80, 120, 0.12)';
    ctx.lineWidth = 0.5;
    for (let t = 0; t <= timeWindow; t++) {
      const x = plotLeft + (t / timeWindow) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h - timeAxisHeight);
      ctx.stroke();
    }

    // ── Time axis ─────────────────────────────────────────────────────────

    ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (let t = 0; t <= timeWindow; t++) {
      const x = plotLeft + (t / timeWindow) * plotWidth;
      const label = t === 0 ? `-${timeWindow}s` : t === timeWindow ? '0s' : `-${timeWindow - t}s`;
      ctx.fillText(label, x, h - 4);
    }

    // ── Draw each channel ────────────────────────────────────────────────

    for (let ci = 0; ci < numChannels; ci++) {
      const ch = visibleChannels[ci];
      const chTop = ci * channelHeight;
      const chBottom = chTop + channelHeight;
      const chMid = chTop + channelHeight / 2;

      // Channel separator
      if (ci > 0) {
        ctx.strokeStyle = 'rgba(60, 80, 120, 0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, chTop);
        ctx.lineTo(w, chTop);
        ctx.stroke();
      }

      // Horizontal grid (3 divisions per channel)
      ctx.strokeStyle = 'rgba(60, 80, 120, 0.08)';
      ctx.lineWidth = 0.5;
      for (let d = 1; d < 4; d++) {
        const y = chTop + (channelHeight * d) / 4;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
      }

      // Channel label
      ctx.fillStyle = ch.color;
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(ch.label, 6, chTop + 12);

      // Color indicator bar
      ctx.fillStyle = ch.color;
      ctx.fillRect(2, chTop + 2, 2, channelHeight - 4);

      // Get data
      const bufferKey = ch.key as keyof typeof b;
      const buffer = b[bufferKey];
      const data = buffer.recent(samplesInWindow);
      const dataLen = data.length;

      if (dataLen < 2) {
        ctx.fillStyle = 'rgba(140, 170, 200, 0.2)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('waiting...', plotLeft + plotWidth / 2, chMid);
        continue;
      }

      // Compute Y-scale
      let minVal = data[0], maxVal = data[0];
      for (let i = 1; i < dataLen; i++) {
        if (data[i] < minVal) minVal = data[i];
        if (data[i] > maxVal) maxVal = data[i];
      }

      // Special handling per channel type
      if (ch.key === 'spikeTrain') {
        // Spike train: vertical ticks
        const margin = 4;
        for (let i = 0; i < dataLen; i++) {
          if (data[i] > 0.5) {
            const x = plotLeft + (i / (samplesInWindow - 1)) * plotWidth;
            ctx.strokeStyle = ch.color;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, chBottom - margin);
            ctx.lineTo(x, chTop + margin);
            ctx.stroke();
          }
        }

        // Current value text
        const lastVal = data[dataLen - 1];
        ctx.fillStyle = ch.color;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(lastVal > 0.5 ? 'SPIKE' : '--', plotRight + 6, chMid + 3);
        continue;
      }

      // Continuous trace channels
      let scaleMin: number, scaleMax: number;
      if (autoScale) {
        const range = maxVal - minVal;
        const pad = range < 0.001 ? 1 : range * 0.15;
        scaleMin = minVal - pad;
        scaleMax = maxVal + pad;
      } else {
        // Fixed scales per channel type
        if (ch.key === 'firingRate') { scaleMin = 0; scaleMax = 100; }
        else if (ch.key === 'membranePotential') { scaleMin = -80; scaleMax = -20; }
        else { scaleMin = minVal; scaleMax = maxVal; }
      }
      const scaleRange = scaleMax - scaleMin || 1;

      // Y-axis scale markers
      ctx.fillStyle = 'rgba(140, 170, 200, 0.25)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(scaleMax.toFixed(1), plotLeft - 4, chTop + 10);
      ctx.fillText(scaleMin.toFixed(1), plotLeft - 4, chBottom - 4);

      // Threshold line for membrane potential
      if (ch.key === 'membranePotential') {
        const threshY = chTop + channelHeight - ((V_THRESH - scaleMin) / scaleRange) * channelHeight;
        if (threshY >= chTop && threshY <= chBottom) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255, 200, 60, 0.3)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(plotLeft, threshY);
          ctx.lineTo(plotRight, threshY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Threshold label
          ctx.fillStyle = 'rgba(255, 200, 60, 0.4)';
          ctx.font = '7px monospace';
          ctx.textAlign = 'right';
          ctx.fillText('Vth', plotLeft - 4, threshY + 3);
        }
      }

      // Draw trace with phosphor persistence effect
      // Older samples are dimmer
      const margin = 6;
      const drawH = channelHeight - margin * 2;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.5;

      // Draw segments with intensity gradient (persistence phosphor)
      for (let i = 1; i < dataLen; i++) {
        const age = 1 - (i / dataLen); // 0 = newest, 1 = oldest
        const alpha = 0.15 + 0.75 * (1 - age * age); // quadratic fade

        const x0 = plotLeft + ((i - 1) / (samplesInWindow - 1)) * plotWidth;
        const x1 = plotLeft + (i / (samplesInWindow - 1)) * plotWidth;
        const y0 = chTop + margin + drawH - ((data[i - 1] - scaleMin) / scaleRange) * drawH;
        const y1 = chTop + margin + drawH - ((data[i] - scaleMin) / scaleRange) * drawH;

        ctx.strokeStyle = `rgba(${ch.colorRgb},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // Glow at the rightmost (current) point
      if (dataLen > 0) {
        const lastIdx = dataLen - 1;
        const cx = plotLeft + (lastIdx / (samplesInWindow - 1)) * plotWidth;
        const cy = chTop + margin + drawH - ((data[lastIdx] - scaleMin) / scaleRange) * drawH;

        // Glow halo
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6);
        grad.addColorStop(0, `rgba(${ch.colorRgb}, 0.6)`);
        grad.addColorStop(1, `rgba(${ch.colorRgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();

        // Bright dot
        ctx.fillStyle = ch.color;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Current value display
      const lastVal = data[dataLen - 1];
      ctx.fillStyle = ch.color;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${lastVal.toFixed(1)}${ch.unit ? ' ' + ch.unit : ''}`, plotRight + 6, chMid + 3);
    }

    // No-neuron message
    if (neuronIndex < 0) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Select a neuron to begin recording', w / 2, h / 2);
    }
  }, [timeWindow, autoScale, channelVisibility, neuronIndex]);

  // Animation loop
  useEffect(() => {
    let running = true;

    const loop = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // Toggle a channel
  const toggleChannel = useCallback((key: string) => {
    setChannelVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <CollapsiblePanel id="oscilloscope" label="Oscilloscope" badge="LIVE" defaultExpanded>
      {/* Controls toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 6,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 9,
      }}>
        {/* Neuron selector */}
        <label style={{ color: 'rgba(200,220,240,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Neuron:
          <select
            value={monitorNeuronId ?? ''}
            onChange={(e) => setMonitorNeuronId(e.target.value || null)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              color: 'rgba(200,220,240,0.8)',
              fontSize: 9,
              fontFamily: 'inherit',
              padding: '2px 4px',
              maxWidth: 80,
            }}
          >
            <option value="">--</option>
            {neuronIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>

        {/* Divider */}
        <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.08)' }} />

        {/* Channel toggles */}
        {CHANNELS.map((ch) => (
          <label
            key={ch.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              cursor: 'pointer',
              color: channelVisibility[ch.key] ? ch.color : 'rgba(140,170,200,0.3)',
              transition: 'color 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={channelVisibility[ch.key]}
              onChange={() => toggleChannel(ch.key)}
              style={{ width: 10, height: 10, accentColor: ch.color }}
            />
            {ch.label}
          </label>
        ))}

        {/* Divider */}
        <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.08)' }} />

        {/* Time window */}
        <label style={{ color: 'rgba(200,220,240,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Window:
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(Number(e.target.value) as TimeWindow)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              color: 'rgba(200,220,240,0.8)',
              fontSize: 9,
              fontFamily: 'inherit',
              padding: '2px 4px',
            }}
          >
            {TIME_WINDOWS.map((tw) => (
              <option key={tw} value={tw}>{tw}s</option>
            ))}
          </select>
        </label>

        {/* Auto-scale toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
          color: autoScale ? 'rgba(200,220,240,0.7)' : 'rgba(140,170,200,0.3)',
        }}>
          <input
            type="checkbox"
            checked={autoScale}
            onChange={() => setAutoScale((p) => !p)}
            style={{ width: 10, height: 10 }}
          />
          Auto-scale
        </label>

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Freeze button */}
        <button
          onClick={() => setFrozen((p) => !p)}
          style={{
            background: frozen ? 'rgba(255, 200, 60, 0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${frozen ? 'rgba(255, 200, 60, 0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 3,
            color: frozen ? '#ffc83c' : 'rgba(200,220,240,0.6)',
            cursor: 'pointer',
            fontSize: 9,
            fontFamily: 'inherit',
            padding: '2px 8px',
          }}
        >
          {frozen ? 'FROZEN' : 'Freeze'}
        </button>

        {/* Export button */}
        <button
          onClick={exportTrace}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 3,
            color: 'rgba(200,220,240,0.6)',
            cursor: 'pointer',
            fontSize: 9,
            fontFamily: 'inherit',
            padding: '2px 8px',
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Canvas */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: 300,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
        background: '#030308',
      }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
        {/* Frozen overlay indicator */}
        {frozen && (
          <div style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: 'rgba(255, 200, 60, 0.15)',
            border: '1px solid rgba(255, 200, 60, 0.3)',
            borderRadius: 3,
            padding: '1px 6px',
            fontSize: 8,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#ffc83c',
            pointerEvents: 'none',
          }}>
            PAUSED
          </div>
        )}
        {/* Recording indicator */}
        {neuronIndex >= 0 && !frozen && (
          <div style={{
            position: 'absolute',
            top: 6,
            left: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 8,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'rgba(255, 80, 80, 0.7)',
            pointerEvents: 'none',
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#ff4444',
              animation: 'oscilloscope-blink 1s ease-in-out infinite',
            }} />
            REC {monitorNeuronId}
          </div>
        )}
      </div>

      {/* Blink animation via style tag */}
      <style>{`
        @keyframes oscilloscope-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </CollapsiblePanel>
  );
}
