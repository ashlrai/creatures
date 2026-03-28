import { useState, useEffect } from 'react';

interface Props {
  onCreateWorld: (worldType: string, nOrganisms: number, enableAI: boolean) => void;
  loading: boolean;
}

/** Animated tagline that types out character by character */
function AnimatedTagline() {
  const text = 'Your organisms will evolve real neural circuits. The AI watches and intervenes.';
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= text.length) return;
    const timer = setTimeout(() => setVisible(v => v + 1), 22);
    return () => clearTimeout(timer);
  }, [visible, text.length]);

  return (
    <p style={{
      fontSize: 12, color: 'rgba(140, 200, 255, 0.45)',
      fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
      lineHeight: 1.6, maxWidth: 520, margin: '0 auto', minHeight: 20,
    }}>
      {text.slice(0, visible)}
      <span style={{ opacity: visible < text.length ? 1 : 0, transition: 'opacity 0.3s' }}>|</span>
    </p>
  );
}

export function WorldCreator({ onCreateWorld, loading }: Props) {
  const [worldType, setWorldType] = useState('pond');
  const [population, setPopulation] = useState(1000);

  const worlds = [
    { id: 'pond', name: 'Pond', desc: 'Aquatic environment with chemical gradients', color: '#1a3a5a', icon: '\uD83C\uDF0A' },
    { id: 'soil', name: 'Soil', desc: 'Underground ecosystem with nutrient patches', color: '#3a2a1a', icon: '\uD83C\uDF0D' },
    { id: 'lab_plate', name: 'Lab Plate', desc: 'Controlled petri dish environment', color: '#2a2a3a', icon: '\uD83D\uDD2C' },
  ];

  // Estimated neurons: ~50 per organism (matches backend default)
  const neuronsPerOrg = 50;
  const estimatedNeurons = population * neuronsPerOrg;

  // Arena size estimate based on population
  const arenaSize = population <= 500 ? 'Small' : population <= 2000 ? 'Medium' : population <= 5000 ? 'Large' : 'Massive';
  const arenaDim = population <= 500 ? '200x200' : population <= 2000 ? '400x400' : population <= 5000 ? '600x600' : '800x800';

  // Format large numbers
  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(2, 2, 6, 0.95)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, padding: 40,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 600 }}>
        <h2 style={{
          fontSize: 32, fontWeight: 700, color: '#dce4ec',
          letterSpacing: '-0.5px', marginBottom: 10,
          background: 'linear-gradient(135deg, #e0eaf0, #88ccff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Enter a Living World
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(180, 200, 220, 0.6)', lineHeight: 1.5, maxWidth: 480, margin: '0 auto 12px' }}>
          Create an ecosystem where organisms with real spiking neural networks
          forage, reproduce, and evolve.
        </p>
        <AnimatedTagline />
      </div>

      {/* World type selector */}
      <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
        {worlds.map(w => (
          <button key={w.id} onClick={() => setWorldType(w.id)} style={{
            width: 170, padding: '18px 16px',
            background: worldType === w.id ? 'rgba(0, 180, 255, 0.12)' : 'rgba(10, 14, 28, 0.6)',
            border: worldType === w.id ? '1px solid rgba(0, 180, 255, 0.3)' : '1px solid rgba(80, 130, 200, 0.1)',
            borderRadius: 14, cursor: 'pointer', textAlign: 'left',
            transition: 'all 0.25s',
            transform: worldType === w.id ? 'translateY(-2px)' : 'none',
            boxShadow: worldType === w.id ? '0 8px 32px rgba(0, 180, 255, 0.08)' : 'none',
          }}>
            <div style={{
              width: '100%', height: 56, borderRadius: 10, marginBottom: 10,
              background: `linear-gradient(135deg, ${w.color}, ${w.color}dd)`,
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>
              {w.icon}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#dce4ec' }}>{w.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(140, 170, 200, 0.5)', marginTop: 3, lineHeight: 1.3 }}>{w.desc}</div>
          </button>
        ))}
      </div>

      {/* Population slider */}
      <div style={{ width: 440, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'rgba(140, 170, 200, 0.5)' }}>Population</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#00d4ff', fontFamily: 'var(--font-mono)' }}>
            {formatNum(population)}
          </span>
        </div>
        <input type="range" min={100} max={10000} step={100} value={population}
          onChange={(e) => setPopulation(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#00d4ff' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(140, 170, 200, 0.3)', marginTop: 2 }}>
          <span>100</span><span>1K</span><span>5K</span><span>10K</span>
        </div>

        {/* Stats readout */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 14,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(0, 180, 255, 0.04)',
          border: '1px solid rgba(0, 180, 255, 0.08)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff', fontFamily: 'var(--font-mono)' }}>
              {formatNum(estimatedNeurons)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(140, 170, 200, 0.4)', marginTop: 2 }}>Est. neurons</div>
          </div>
          <div style={{ width: 1, background: 'rgba(80, 130, 200, 0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#88aadd', fontFamily: 'var(--font-mono)' }}>
              {arenaSize}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(140, 170, 200, 0.4)', marginTop: 2 }}>Arena ({arenaDim})</div>
          </div>
          <div style={{ width: 1, background: 'rgba(80, 130, 200, 0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00ff88', fontFamily: 'var(--font-mono)' }}>
              {formatNum(estimatedNeurons * 8)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(140, 170, 200, 0.4)', marginTop: 2 }}>Est. synapses</div>
          </div>
        </div>
      </div>

      {/* Enter button — large and dramatic */}
      <button onClick={() => onCreateWorld(worldType, population, true)}
        disabled={loading}
        style={{
          padding: '16px 64px', fontSize: 17, fontWeight: 700,
          background: loading
            ? 'rgba(0, 100, 180, 0.15)'
            : 'linear-gradient(135deg, rgba(0, 180, 255, 0.25), rgba(0, 100, 255, 0.2))',
          border: '1px solid rgba(0, 180, 255, 0.35)',
          borderRadius: 14, color: '#00d4ff', cursor: loading ? 'wait' : 'pointer',
          letterSpacing: '1px', fontFamily: 'var(--font-mono)',
          transition: 'all 0.3s',
          boxShadow: loading ? 'none' : '0 0 40px rgba(0, 180, 255, 0.1), inset 0 0 40px rgba(0, 180, 255, 0.03)',
          textTransform: 'uppercase',
        }}>
        {loading ? 'Creating World...' : 'Enter World'}
      </button>
    </div>
  );
}
