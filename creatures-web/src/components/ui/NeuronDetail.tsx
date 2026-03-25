import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useNavigationStore } from '../../stores/navigationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { Oscilloscope } from './Oscilloscope';

const BUFFER_SIZE = 300;

export function NeuronDetail() {
  const currentLevel = useNavigationStore((s) => s.currentLevel);
  const selectedNeuronId = useNavigationStore((s) => s.selectedNeuronId);
  const goBack = useNavigationStore((s) => s.goBack);
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const lesionedNeurons = useCircuitModificationStore((s) => s.lesionedNeurons);
  const stimulatedNeurons = useCircuitModificationStore((s) => s.stimulatedNeurons);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rateBufferRef = useRef<number[]>([]);
  const spikeBufferRef = useRef<boolean[]>([]);

  // Determine neuron index from ID
  const neuronIndex = selectedNeuronId
    ? parseInt(selectedNeuronId.replace(/\D/g, ''), 10)
    : -1;

  // Accumulate data
  useEffect(() => {
    if (!frame || neuronIndex < 0) return;
    const rate = frame.firing_rates[neuronIndex] ?? 0;
    const hasSpike = frame.spikes?.includes(neuronIndex) ?? false;

    rateBufferRef.current.push(rate);
    spikeBufferRef.current.push(hasSpike);
    if (rateBufferRef.current.length > BUFFER_SIZE) rateBufferRef.current.shift();
    if (spikeBufferRef.current.length > BUFFER_SIZE) spikeBufferRef.current.shift();
  }, [frame, neuronIndex]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#05050d';
    ctx.fillRect(0, 0, w, h);

    const rates = rateBufferRef.current;
    const spikes = spikeBufferRef.current;
    if (rates.length < 2) {
      ctx.fillStyle = 'rgba(140, 170, 200, 0.3)';
      ctx.font = '12px monospace';
      ctx.fillText('Accumulating data...', 20, h / 2);
      return;
    }

    // Find max rate for scaling
    let maxRate = 1;
    for (const r of rates) if (r > maxRate) maxRate = r;

    const margin = { top: 30, right: 10, bottom: 20, left: 50 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    // Grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (plotH * i) / 4;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
    }

    // Spike marks (vertical ticks at bottom)
    ctx.strokeStyle = 'rgba(255, 100, 50, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < spikes.length; i++) {
      if (spikes[i]) {
        const x = margin.left + (i / (rates.length - 1)) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, h - margin.bottom);
        ctx.lineTo(x, h - margin.bottom + 8);
        ctx.stroke();
      }
    }

    // Firing rate line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < rates.length; i++) {
      const x = margin.left + (i / (rates.length - 1)) * plotW;
      const y = margin.top + plotH - (rates[i] / maxRate) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 212, 255, 0.05)';
    ctx.fill();

    // Y axis labels
    ctx.fillStyle = 'rgba(140, 170, 200, 0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = maxRate * (1 - i / 4);
      const y = margin.top + (plotH * i) / 4;
      ctx.fillText(val.toFixed(0), margin.left - 4, y + 3);
    }

    // Title
    ctx.fillStyle = 'rgba(200, 220, 240, 0.6)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Firing Rate (Hz)', margin.left, margin.top - 8);

    // Current value
    const currentRate = rates[rates.length - 1];
    ctx.fillStyle = 'rgba(0, 212, 255, 0.9)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${currentRate.toFixed(1)} Hz`, w - margin.right, margin.top - 8);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [draw, frame]);

  if (currentLevel !== 'neuron' || !selectedNeuronId) return null;

  const isLesioned = lesionedNeurons.has(selectedNeuronId);
  const isStimulated = stimulatedNeurons.has(selectedNeuronId);
  const currentRate = frame?.firing_rates[neuronIndex] ?? 0;
  const nNeurons = experiment?.n_neurons ?? frame?.firing_rates?.length ?? 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 50,
      background: 'rgba(3, 3, 8, 0.95)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      flexDirection: 'column',
      padding: 20,
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={goBack}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'rgba(200, 220, 240, 0.7)',
            cursor: 'pointer',
            padding: '6px 14px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        >
          ← Back to Circuit
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'rgba(200, 220, 240, 0.9)', fontFamily: 'var(--font-mono)' }}>
          Neuron: {selectedNeuronId}
        </h2>
        {isLesioned && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,60,60,0.15)', color: '#ff6b6b' }}>
            LESIONED
          </span>
        )}
        {isStimulated && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,212,255,0.15)', color: '#00d4ff' }}>
            STIMULATED
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Current Rate" value={`${currentRate.toFixed(1)} Hz`} color="#00d4ff" />
        <StatCard label="Neuron Index" value={`${neuronIndex} / ${nNeurons}`} color="rgba(200,220,240,0.6)" />
        <StatCard label="Spikes (recent)" value={`${spikeBufferRef.current.filter(Boolean).length}`} color="#ff6b4a" />
        <StatCard label="Mean Rate" value={`${rateBufferRef.current.length > 0 ? (rateBufferRef.current.reduce((a, b) => a + b, 0) / rateBufferRef.current.length).toFixed(1) : '0'} Hz`} color="#4aff8b" />
      </div>

      {/* Main firing rate chart */}
      <div style={{
        background: 'rgba(6, 8, 18, 0.8)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
      }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={250}
          style={{ width: '100%', height: 250, borderRadius: 4, display: 'block' }}
        />
      </div>

      {/* Oscilloscope — multi-channel electrophysiology trace */}
      <Oscilloscope />

      {/* Connection info */}
      <div style={{
        background: 'rgba(6, 8, 18, 0.8)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        padding: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(200, 220, 240, 0.5)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
          Neuron Properties
        </div>
        <div style={{ fontSize: 11, color: 'rgba(200, 220, 240, 0.4)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
          <div>ID: {selectedNeuronId}</div>
          <div>Index: {neuronIndex}</div>
          <div>Status: {isLesioned ? 'Lesioned' : isStimulated ? 'Stimulated' : 'Normal'}</div>
          <div>Recording: {BUFFER_SIZE} frame buffer</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(6, 8, 18, 0.8)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      padding: '8px 16px',
      minWidth: 120,
    }}>
      <div style={{ fontSize: 9, color: 'rgba(200, 220, 240, 0.4)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  );
}
