import { useState, useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { RasterPlot } from './RasterPlot';
import { FiringRateHeatmap } from './FiringRateHeatmap';
import { ActivityTimeline } from './ActivityTimeline';

interface NeuronTypeInfo {
  type: 'sensory' | 'inter' | 'motor';
  nt: string | null;
  position: number[] | null;
}

interface SpikeFrame {
  t_ms: number;
  spikes: number[];
}

interface RateFrame {
  t_ms: number;
  firing_rates: number[];
}

const MAX_SPIKE_HISTORY = 500;
const MAX_RATE_HISTORY = 200;

/**
 * Container panel combining RasterPlot, FiringRateHeatmap, and ActivityTimeline.
 * Builds spike/rate history from the simulation store's current frame.
 * Loads neuron type data from neuron-types.json on mount.
 * Collapsible: defaults to contracted (header only).
 */
export function RecordingPanel() {
  const [expanded, setExpanded] = useState(false);
  const [neuronTypeMap, setNeuronTypeMap] = useState<Record<number, 'sensory' | 'inter' | 'motor'>>({});

  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const nNeurons = experiment?.n_neurons ?? 0;

  // Accumulate spike and rate history in refs for performance
  const spikeHistoryRef = useRef<SpikeFrame[]>([]);
  const rateHistoryRef = useRef<RateFrame[]>([]);
  const [spikeHistory, setSpikeHistory] = useState<SpikeFrame[]>([]);
  const [rateHistory, setRateHistory] = useState<RateFrame[]>([]);
  const lastTRef = useRef<number>(-1);

  // Load neuron types from public/neuron-types.json
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    const load = async () => {
      try {
        const res = await fetch(`${base}neuron-types.json`);
        if (!res.ok) return;
        const data: Record<string, NeuronTypeInfo> = await res.json();

        // The simulation uses index-based neurons; build a map from index -> type.
        // neuron-types.json is keyed by name. We map index = insertion order.
        const entries = Object.values(data);
        const map: Record<number, 'sensory' | 'inter' | 'motor'> = {};
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.type === 'sensory' || entry.type === 'inter' || entry.type === 'motor') {
            map[i] = entry.type;
          }
        }
        setNeuronTypeMap(map);
      } catch {
        // neuron-types.json not available; visualizations will use defaults
      }
    };
    load();
  }, []);

  // On each new frame, append to history buffers
  useEffect(() => {
    if (!frame || !expanded) return;
    // Deduplicate: skip if we already recorded this timestamp
    if (frame.t_ms === lastTRef.current) return;
    lastTRef.current = frame.t_ms;

    // Spike history
    const spikeEntry: SpikeFrame = { t_ms: frame.t_ms, spikes: frame.spikes ?? [] };
    const newSpikeHistory = [...spikeHistoryRef.current, spikeEntry].slice(-MAX_SPIKE_HISTORY);
    spikeHistoryRef.current = newSpikeHistory;
    setSpikeHistory(newSpikeHistory);

    // Rate history
    const rateEntry: RateFrame = { t_ms: frame.t_ms, firing_rates: frame.firing_rates ?? [] };
    const newRateHistory = [...rateHistoryRef.current, rateEntry].slice(-MAX_RATE_HISTORY);
    rateHistoryRef.current = newRateHistory;
    setRateHistory(newRateHistory);
  }, [frame, expanded]);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        className="glass-label"
        onClick={toggle}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Neural Recording</span>
        <span style={{ fontSize: '10px', opacity: 0.5 }}>
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div style={{ fontSize: '9px', color: 'rgba(140,170,200,0.4)', marginBottom: 2, fontFamily: 'monospace' }}>
              Spike Raster
            </div>
            <RasterPlot
              spikeHistory={spikeHistory}
              neuronTypes={neuronTypeMap}
              nNeurons={nNeurons}
              windowMs={500}
            />
          </div>

          <div>
            <div style={{ fontSize: '9px', color: 'rgba(140,170,200,0.4)', marginBottom: 2, fontFamily: 'monospace' }}>
              Firing Rate Heatmap
            </div>
            <FiringRateHeatmap
              rateHistory={rateHistory}
              neuronTypes={neuronTypeMap}
              nNeurons={nNeurons}
            />
          </div>

          <div>
            <div style={{ fontSize: '9px', color: 'rgba(140,170,200,0.4)', marginBottom: 2, fontFamily: 'monospace' }}>
              Activity Timeline
            </div>
            <ActivityTimeline
              spikeHistory={spikeHistory}
              neuronTypes={neuronTypeMap}
              nNeurons={nNeurons}
              windowMs={500}
            />
          </div>
        </div>
      )}
    </div>
  );
}
