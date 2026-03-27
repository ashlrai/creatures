import { useState, useEffect } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

export function ViewportOverlay() {
  const experiment = useSimulationStore((s) => s.experiment);
  const frame = useSimulationStore((s) => s.frame);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [cascadeLabels, setCascadeLabels] = useState<string[]>([]);

  // Listen for poke events to show cascade labels
  useEffect(() => {
    const handler = () => {
      setHasInteracted(true);
      // Show cascade labels with stagger
      setCascadeLabels([]);
      const labels = ['Sensory', 'Interneuron', 'Motor', 'Muscle'];
      labels.forEach((label, i) => {
        setTimeout(() => {
          setCascadeLabels(prev => [...prev, label]);
        }, i * 300);
      });
      // Clear after 4 seconds
      setTimeout(() => setCascadeLabels([]), 4000);
    };
    window.addEventListener('neurevo-poke', handler);
    return () => window.removeEventListener('neurevo-poke', handler);
  }, []);

  if (!experiment) return null;

  const organism = experiment.organism ?? 'c_elegans';
  const speciesName = organism === 'drosophila' ? 'Drosophila melanogaster'
    : organism === 'zebrafish' ? 'Danio rerio (larval)'
    : 'Caenorhabditis elegans';
  const nNeurons = experiment.n_neurons ?? 0;
  const nSynapses = experiment.n_synapses ?? 0;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {/* Organism badge — top left */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: 'rgba(6, 8, 18, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(80, 130, 200, 0.12)',
        borderRadius: 8, padding: '8px 14px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#dce4ec', letterSpacing: '-0.2px' }}>
          {speciesName}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(140, 170, 200, 0.6)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {nNeurons.toLocaleString()} neurons · {nSynapses.toLocaleString()} synapses
        </div>
        {frame && (
          <div style={{ fontSize: 10, color: 'rgba(0, 212, 255, 0.6)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {frame.n_active} active · {frame.t_ms.toFixed(0)}ms
          </div>
        )}
      </div>

      {/* First-load instruction — center, fading */}
      {!hasInteracted && (
        <div style={{
          position: 'absolute', bottom: '20%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(6, 8, 18, 0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(80, 130, 200, 0.15)',
          borderRadius: 12, padding: '12px 24px',
          textAlign: 'center',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 14, color: '#dce4ec', fontWeight: 500 }}>
            Touch the organism to stimulate
          </div>
          <div style={{ fontSize: 11, color: 'rgba(140, 170, 200, 0.5)', marginTop: 4 }}>
            Click anywhere on the body · Press Space to poke tail
          </div>
        </div>
      )}

      {/* Spike cascade labels — after poke */}
      {cascadeLabels.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '35%', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {cascadeLabels.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span style={{ color: 'rgba(0, 212, 255, 0.4)', fontSize: 16 }}>{'\u2192'}</span>}
              <span style={{
                background: label === 'Sensory' ? 'rgba(0, 255, 136, 0.15)' :
                  label === 'Motor' ? 'rgba(255, 34, 136, 0.15)' :
                  label === 'Muscle' ? 'rgba(255, 170, 34, 0.15)' :
                  'rgba(0, 180, 255, 0.15)',
                border: `1px solid ${label === 'Sensory' ? 'rgba(0, 255, 136, 0.3)' :
                  label === 'Motor' ? 'rgba(255, 34, 136, 0.3)' :
                  label === 'Muscle' ? 'rgba(255, 170, 34, 0.3)' :
                  'rgba(0, 180, 255, 0.3)'}`,
                borderRadius: 6, padding: '4px 10px',
                fontSize: 11, fontWeight: 500,
                color: label === 'Sensory' ? '#00ff88' :
                  label === 'Motor' ? '#ff2288' :
                  label === 'Muscle' ? '#ffaa22' : '#00d4ff',
                fontFamily: 'var(--font-mono)',
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
