import { useState } from 'react';

interface Props {
  onCreateWorld: (worldType: string, nOrganisms: number, enableAI: boolean) => void;
  loading: boolean;
}

export function WorldCreator({ onCreateWorld, loading }: Props) {
  const [worldType, setWorldType] = useState('pond');
  const [population, setPopulation] = useState(500);
  const [enableAI, setEnableAI] = useState(true);

  const worlds = [
    { id: 'pond', name: 'Pond', desc: 'Aquatic environment with chemical gradients', color: '#1a3a5a' },
    { id: 'soil', name: 'Soil', desc: 'Underground ecosystem with nutrient patches', color: '#3a2a1a' },
    { id: 'lab_plate', name: 'Lab Plate', desc: 'Controlled petri dish environment', color: '#2a2a3a' },
  ];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(2, 2, 6, 0.95)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, padding: 40,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 600 }}>
        <h2 style={{
          fontSize: 28, fontWeight: 700, color: '#dce4ec',
          letterSpacing: '-0.5px', marginBottom: 8,
          background: 'linear-gradient(135deg, #e0eaf0, #88ccff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Enter a Living World
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(180, 200, 220, 0.6)', lineHeight: 1.5, maxWidth: 480, margin: '0 auto' }}>
          Create an ecosystem where organisms with real spiking neural networks
          forage, reproduce, and evolve. An AI observer narrates what emerges.
        </p>
      </div>

      {/* World type selector */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {worlds.map(w => (
          <button key={w.id} onClick={() => setWorldType(w.id)} style={{
            width: 160, padding: '16px 14px',
            background: worldType === w.id ? 'rgba(0, 180, 255, 0.12)' : 'rgba(10, 14, 28, 0.6)',
            border: worldType === w.id ? '1px solid rgba(0, 180, 255, 0.3)' : '1px solid rgba(80, 130, 200, 0.1)',
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            transition: 'all 0.2s',
          }}>
            <div style={{
              width: '100%', height: 60, borderRadius: 8, marginBottom: 10,
              background: w.color,
              border: '1px solid rgba(255,255,255,0.05)',
            }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#dce4ec' }}>{w.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(140, 170, 200, 0.5)', marginTop: 2, lineHeight: 1.3 }}>{w.desc}</div>
          </button>
        ))}
      </div>

      {/* Population slider */}
      <div style={{ width: 400, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'rgba(140, 170, 200, 0.5)' }}>Population</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff', fontFamily: 'var(--font-mono)' }}>{population}</span>
        </div>
        <input type="range" min={100} max={2000} step={100} value={population}
          onChange={(e) => setPopulation(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#00d4ff' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(140, 170, 200, 0.3)' }}>
          <span>100</span><span>500</span><span>1000</span><span>2000</span>
        </div>
      </div>

      {/* AI Observer toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        padding: '8px 16px', borderRadius: 8,
        background: enableAI ? 'rgba(0, 180, 255, 0.08)' : 'transparent',
        border: '1px solid rgba(80, 130, 200, 0.1)',
      }}>
        <input type="checkbox" checked={enableAI} onChange={(e) => setEnableAI(e.target.checked)}
          style={{ accentColor: '#00d4ff' }} />
        <div>
          <div style={{ fontSize: 12, color: '#dce4ec', fontWeight: 500 }}>Enable AI Observer</div>
          <div style={{ fontSize: 10, color: 'rgba(140, 170, 200, 0.4)' }}>
            God Agent analyzes behavior and intervenes
          </div>
        </div>
      </label>

      {/* Enter button */}
      <button onClick={() => onCreateWorld(worldType, population, enableAI)}
        disabled={loading}
        style={{
          padding: '12px 40px', fontSize: 15, fontWeight: 600,
          background: 'linear-gradient(135deg, rgba(0, 180, 255, 0.2), rgba(0, 100, 255, 0.15))',
          border: '1px solid rgba(0, 180, 255, 0.3)',
          borderRadius: 10, color: '#00d4ff', cursor: loading ? 'wait' : 'pointer',
          letterSpacing: '0.5px', fontFamily: 'var(--font-mono)',
          transition: 'all 0.2s',
        }}>
        {loading ? 'Creating World...' : 'Enter World'}
      </button>
    </div>
  );
}
