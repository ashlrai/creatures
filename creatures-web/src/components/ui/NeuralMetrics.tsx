import { useState, useEffect, useCallback, useRef } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

const API_BASE = '/api';
const POLL_INTERVAL_MS = 2000;

interface NetworkSummary {
  active_count: number;
  silent_count: number;
  active_fraction: number;
  mean_rate: number;
  max_rate: number;
  top_neuron: string | null;
  classification: string;
  synchrony_index: number;
  n_neurons: number;
}

interface TopNeuron {
  id: string;
  firing_rate: number;
}

interface OscillationData {
  peak_frequency_hz: number;
  locomotion_band_power: number;
  has_data: boolean;
}

// -- Demo mode placeholder data --
const DEMO_SUMMARY: NetworkSummary = {
  active_count: 89,
  silent_count: 213,
  active_fraction: 0.2947,
  mean_rate: 12.4,
  max_rate: 87.3,
  top_neuron: 'AVAL',
  classification: 'moderate',
  synchrony_index: 0.42,
  n_neurons: 302,
};

const DEMO_TOP: TopNeuron[] = [
  { id: 'AVAL', firing_rate: 87.3 },
  { id: 'AVAR', firing_rate: 82.1 },
  { id: 'AVBL', firing_rate: 61.5 },
  { id: 'AVBR', firing_rate: 58.9 },
  { id: 'PVCL', firing_rate: 44.2 },
];

const DEMO_OSCILLATION: OscillationData = {
  peak_frequency_hz: 1.23,
  locomotion_band_power: 0.34,
  has_data: true,
};

// Classification badge colors
const CLASSIFICATION_COLORS: Record<string, string> = {
  quiescent: '#4a5568',
  sparse: '#2b6cb0',
  moderate: '#2f855a',
  active: '#c05621',
  hyperactive: '#c53030',
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      style={{
        width: '100%',
        height: 6,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 3,
          background: color,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function GaugeRing({ value, size = 40 }: { value: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - progress);

  // Color from blue (0) to cyan (0.5) to green (1)
  const hue = 200 + progress * 120; // 200 (blue) -> 320 mapped to green via saturation
  const color =
    progress < 0.3
      ? '#4299e1'
      : progress < 0.6
        ? '#38b2ac'
        : progress < 0.8
          ? '#48bb78'
          : '#f6ad55';

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={3}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s ease' }}
      />
      <text
        x={size / 2}
        y={size / 2 + 4}
        textAnchor="middle"
        fill="rgba(200,220,240,0.9)"
        fontSize={11}
        fontFamily="'SF Mono', 'Fira Code', monospace"
        fontWeight={600}
      >
        {(progress * 100).toFixed(0)}
      </text>
    </svg>
  );
}

export function NeuralMetrics() {
  const experiment = useSimulationStore((s) => s.experiment);
  const connected = useSimulationStore((s) => s.connected);

  const [summary, setSummary] = useState<NetworkSummary>(DEMO_SUMMARY);
  const [topNeurons, setTopNeurons] = useState<TopNeuron[]>(DEMO_TOP);
  const [oscillation, setOscillation] = useState<OscillationData>(DEMO_OSCILLATION);
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const simId = experiment?.id;

  const fetchMetrics = useCallback(async () => {
    if (!simId) return;
    try {
      const [summaryRes, topRes, oscRes] = await Promise.all([
        fetch(`${API_BASE}/metrics/${simId}/summary`),
        fetch(`${API_BASE}/metrics/${simId}/top-active?n=5`),
        fetch(`${API_BASE}/metrics/${simId}/oscillations`),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
        setIsLive(true);
      }
      if (topRes.ok) {
        const data = await topRes.json();
        setTopNeurons(data.neurons || []);
      }
      if (oscRes.ok) {
        const data = await oscRes.json();
        setOscillation(data);
      }
    } catch {
      // Silently fall back to demo data on network errors
      setIsLive(false);
    }
  }, [simId]);

  useEffect(() => {
    if (connected && simId) {
      fetchMetrics();
      intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    } else {
      setIsLive(false);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [connected, simId, fetchMetrics]);

  const badgeColor = CLASSIFICATION_COLORS[summary.classification] || '#4a5568';
  const totalNeurons = summary.n_neurons || summary.active_count + summary.silent_count;

  return (
    <div className="glass" style={{ padding: 10 }}>
      <div className="glass-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Neural Metrics
        {isLive && (
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#48bb78',
              boxShadow: '0 0 4px #48bb78',
            }}
          />
        )}
        {!isLive && (
          <span style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)', marginLeft: 2 }}>
            demo
          </span>
        )}
      </div>

      {/* Network State */}
      <div style={{ marginTop: 8, marginBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 10, color: 'rgba(160,180,200,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Network State
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: '#fff',
              background: badgeColor,
              borderRadius: 3,
              padding: '1px 5px',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {summary.classification}
          </span>
        </div>

        {/* Active / Silent / Total */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#48bb78' }}>
              {summary.active_count}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)' }}>Active</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#4a5568' }}>
              {summary.silent_count}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)' }}>Silent</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(200,220,240,0.8)' }}>
              {totalNeurons}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)' }}>Total</div>
          </div>
        </div>

        <MiniBar value={summary.active_count} max={totalNeurons} color="#48bb78" />

        {/* Rate stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10 }}>
          <span style={{ color: 'rgba(160,180,200,0.6)' }}>
            Mean: <span style={{ color: 'rgba(200,220,240,0.9)', fontWeight: 600 }}>{summary.mean_rate} Hz</span>
          </span>
          <span style={{ color: 'rgba(160,180,200,0.6)' }}>
            Max: <span style={{ color: 'rgba(200,220,240,0.9)', fontWeight: 600 }}>{summary.max_rate} Hz</span>
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

      {/* Oscillations + Synchrony row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* Dominant Frequency */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
            Frequency
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: oscillation.has_data ? '#63b3ed' : 'rgba(160,180,200,0.3)' }}>
            {oscillation.has_data ? `${oscillation.peak_frequency_hz}` : '--'}
            <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(160,180,200,0.5)', marginLeft: 2 }}>
              Hz
            </span>
          </div>
        </div>

        {/* Synchrony Index gauge */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
            Synchrony
          </div>
          <GaugeRing value={summary.synchrony_index} size={42} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

      {/* Top Active Neurons */}
      <div>
        <div style={{ fontSize: 9, color: 'rgba(160,180,200,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
          Top Active Neurons
        </div>
        <div
          style={{
            maxHeight: 100,
            overflowY: 'auto',
            fontSize: 11,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}
        >
          {topNeurons.map((neuron, i) => (
            <div
              key={neuron.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '2px 0',
                borderBottom: i < topNeurons.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}
            >
              <span style={{ color: 'rgba(200,220,240,0.8)' }}>
                <span style={{ color: 'rgba(160,180,200,0.4)', fontSize: 9, marginRight: 4 }}>
                  {i + 1}.
                </span>
                {neuron.id}
              </span>
              <span style={{ color: '#63b3ed', fontWeight: 600, fontSize: 10 }}>
                {neuron.firing_rate} Hz
              </span>
            </div>
          ))}
          {topNeurons.length === 0 && (
            <div style={{ color: 'rgba(160,180,200,0.3)', fontStyle: 'italic', fontSize: 10 }}>
              No active neurons
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
