import { useState, useCallback } from 'react';

interface Props {
  massiveId: string | null;
  apiBase: string;
  onNotify: (msg: string) => void;
}

export function CoCreatorPanel({ massiveId, apiBase, onNotify }: Props) {
  const [mutationRate, setMutationRate] = useState(0.02);

  const triggerEvent = useCallback(async (eventType: string, label: string) => {
    if (!massiveId) return;
    try {
      await fetch(`${apiBase}/api/ecosystem/${massiveId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: eventType }),
      });
      onNotify(`⚡ ${label} triggered`);
    } catch {
      onNotify(`${label} (local only)`);
    }
  }, [massiveId, apiBase, onNotify]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Divine Interventions */}
      <div className="glass">
        <div className="glass-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>✦</span> Divine Interventions
        </div>
        <p style={{ fontSize: 10, color: 'rgba(140,170,200,0.4)', margin: '0 0 8px', lineHeight: 1.4 }}>
          Shape the world. Every action creates selection pressure that drives evolution.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn btn-ghost" style={{ textAlign: 'left', fontSize: 11, padding: '6px 8px' }}
            onClick={() => triggerEvent('food_scarcity', 'Famine')}>
            🏜️ Famine — Remove 50% of food
          </button>
          <button className="btn btn-ghost" style={{ textAlign: 'left', fontSize: 11, padding: '6px 8px' }}
            onClick={() => triggerEvent('predator_surge', 'Predator Surge')}>
            💀 Predator Surge — Cull weakest 20%
          </button>
          <button className="btn btn-ghost" style={{ textAlign: 'left', fontSize: 11, padding: '6px 8px' }}
            onClick={() => triggerEvent('mutation_burst', 'Mutation Burst')}>
            🧬 Mutation Burst — Increase genetic variation
          </button>
          <button className="btn btn-ghost" style={{ textAlign: 'left', fontSize: 11, padding: '6px 8px' }}
            onClick={() => triggerEvent('climate_shift', 'Climate Shift')}>
            🌊 Climate Shift — Relocate all resources
          </button>
          <button className="btn btn-primary" style={{ textAlign: 'left', fontSize: 11, padding: '6px 8px', marginTop: 4 }}
            onClick={async () => {
              if (!massiveId) return;
              try {
                await fetch(`${apiBase}/api/ecosystem/massive/${massiveId}/step?steps=1000`, { method: 'POST' });
                onNotify('⏩ Fast-forwarded 1000 steps');
              } catch {
                onNotify('Fast-forward unavailable');
              }
            }}>
            ⏩ Fast-Forward 1000 Steps
          </button>
        </div>
      </div>

      {/* Mutation Control */}
      <div className="glass">
        <div className="glass-label">🔬 Mutation Rate</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-label)', marginBottom: 4 }}>
          <span>Conservative</span>
          <span style={{ color: '#ffcc88', fontFamily: 'var(--font-mono)' }}>{mutationRate.toFixed(3)}</span>
          <span>Radical</span>
        </div>
        <input type="range" min={0.001} max={0.1} step={0.001} value={mutationRate}
          onChange={(e) => setMutationRate(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#ffcc88' }} />
        <p style={{ fontSize: 9, color: 'rgba(140,170,200,0.3)', margin: '4px 0 0', lineHeight: 1.3 }}>
          Higher rates = more exploration but risk losing successful adaptations
        </p>
      </div>

      {/* Philosophy */}
      <div style={{
        padding: '8px 10px', borderRadius: 8,
        background: 'rgba(100, 130, 200, 0.04)',
        border: '1px solid rgba(100, 130, 200, 0.08)',
      }}>
        <p style={{ fontSize: 10, color: 'rgba(140,170,200,0.4)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
          You set the parameters. The AI observes. Life emerges from the neural dynamics.
          Together — co-creation.
        </p>
      </div>
    </div>
  );
}
