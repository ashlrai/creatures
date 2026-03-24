import { useEffect, useState } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { HARDCODED_GENES } from '../organism/NeuralNetwork3D';

const TYPE_LABELS: Record<string, string> = {
  sensory: 'Sensory',
  inter: 'Interneuron',
  motor: 'Motor',
  unknown: 'Unknown',
};

const TYPE_COLORS: Record<string, string> = {
  sensory: '#1acc66',
  inter: '#3388ff',
  motor: '#ff5533',
  unknown: '#666677',
};

/**
 * Tooltip overlay that appears when the user hovers over a neuron point
 * in the 3D visualization. Positioned via CSS fixed positioning, rendered
 * outside the Three.js Canvas. Reads hovered neuron data from the store.
 */
export function NeuronTooltip() {
  const hoveredNeuron = useSimulationStore((s) => s.hoveredNeuron);
  const [genes, setGenes] = useState<string[] | null>(null);

  // Fetch / resolve gene data when hovered neuron changes
  useEffect(() => {
    if (!hoveredNeuron) {
      setGenes(null);
      return;
    }

    const id = hoveredNeuron.id;

    // Try the API first
    let cancelled = false;
    fetch(`/api/neurons/${id}/genes`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { genes: string[] }) => {
        if (!cancelled) setGenes(data.genes);
      })
      .catch(() => {
        // Fall back to hardcoded subset
        if (!cancelled) {
          setGenes(HARDCODED_GENES[id] ?? null);
        }
      });

    return () => { cancelled = true; };
  }, [hoveredNeuron?.id]);

  if (!hoveredNeuron) return null;

  // Use the latest firing rate from the current frame if available.
  // The store snapshot may be slightly stale, but frame is always fresh.
  const firingRate = hoveredNeuron.firingRate;
  const typeLabel = TYPE_LABELS[hoveredNeuron.type] ?? hoveredNeuron.type;
  const typeColor = TYPE_COLORS[hoveredNeuron.type] ?? TYPE_COLORS.unknown;

  return (
    <div
      className="neuron-tooltip"
      style={{
        left: hoveredNeuron.mouseX + 15,
        top: hoveredNeuron.mouseY + 15,
      }}
    >
      {/* Neuron name */}
      <div style={{ fontWeight: 700, fontSize: 13, color: '#f0f4ff', marginBottom: 4 }}>
        {hoveredNeuron.id}
      </div>

      {/* Type badge */}
      <div style={{ marginBottom: 3 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            color: typeColor,
            background: `${typeColor}18`,
            border: `1px solid ${typeColor}44`,
          }}
        >
          {typeLabel}
        </span>
      </div>

      {/* Firing rate */}
      <div style={{ marginBottom: 2 }}>
        <span style={{ color: '#889' }}>Firing rate: </span>
        <span style={{ color: '#e0e8ff', fontFamily: 'var(--font-mono, monospace)' }}>
          {firingRate.toFixed(1)} Hz
        </span>
      </div>

      {/* Neurotransmitter */}
      {hoveredNeuron.nt && (
        <div style={{ marginBottom: 2 }}>
          <span style={{ color: '#889' }}>Neurotransmitter: </span>
          <span style={{ color: '#c8d8ff' }}>{hoveredNeuron.nt}</span>
        </div>
      )}

      {/* Gene expression (receptors) */}
      {genes && genes.length > 0 && (
        <div style={{ marginTop: 3, paddingTop: 3, borderTop: '1px solid rgba(0,180,255,0.1)' }}>
          <span style={{ color: '#889' }}>Receptors: </span>
          <span style={{ color: '#aac4ee', fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>
            {genes.join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
