import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'neurevo.dev'
  ? 'https://creatures-production.up.railway.app' : '';

interface RunStatus {
  run_id: string;
  status: string;
  current_generation: number;
  target_generations: number;
  progress: number;
  elapsed_seconds: number;
  eta_seconds: number | null;
  snapshots_saved: number;
}

interface TimelinePoint {
  generation: number;
  alive: number;
  n_lineages: number;
  mean_energy: number;
  emergent_behaviors: string[];
}

interface Discovery {
  title: string;
  description: string;
  category: string;
  evidence: Record<string, unknown>;
  effect_size: number;
  p_value: number;
  confidence: number;
  generation: number;
}

export function DeepEvolutionPanel() {
  // Setup state
  const [population, setPopulation] = useState(5000);
  const [targetGen, setTargetGen] = useState(1000);
  const [worldType, setWorldType] = useState('pond');
  const [mutationRate, setMutationRate] = useState(0.02);

  // Run state
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [phase, setPhase] = useState<'setup' | 'running' | 'complete'>('setup');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estimated time calculation
  const estimatedMinutes = Math.round((targetGen / 2700) * 60 * (population / 5000));

  const startRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/deep-evolution/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          n_organisms: population,
          neurons_per: 100,
          world_type: worldType,
          target_generations: targetGen,
          snapshot_interval: Math.max(10, Math.round(targetGen / 50)),
          enable_stdp: true,
          mutation_sigma: mutationRate,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRunId(data.run_id);
        setPhase('running');
      }
    } catch (e) {
      console.error('Failed to start deep evolution:', e);
    } finally {
      setLoading(false);
    }
  }, [population, targetGen, worldType, mutationRate]);

  // Poll status when running
  useEffect(() => {
    if (phase !== 'running' || !runId) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/deep-evolution/${runId}`);
        if (res.ok) {
          const data: RunStatus = await res.json();
          setStatus(data);
          if (data.status === 'completed' || data.status === 'stopped' || data.status === 'extinct') {
            setPhase('complete');
            // Fetch timeline
            const tlRes = await fetch(`${API_BASE}/api/deep-evolution/${runId}/timeline`);
            if (tlRes.ok) {
              const tlData = await tlRes.json();
              setTimeline(tlData.timeline ?? []);
            }
            // Fetch discoveries
            const discRes = await fetch(`${API_BASE}/api/deep-evolution/${runId}/discoveries`);
            if (discRes.ok) {
              const discData = await discRes.json();
              const sorted = (discData.discoveries ?? []).sort(
                (a: Discovery, b: Discovery) => b.confidence - a.confidence
              );
              setDiscoveries(sorted);
            }
          }
        }
      } catch { /* ignore poll errors */ }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, runId]);

  // SETUP PHASE
  if (phase === 'setup') {
    return (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 20,
        background: 'rgba(2, 2, 6, 0.95)', backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: 40,
      }}>
        <h2 style={{
          fontSize: 24, fontWeight: 700, color: '#dce4ec', letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg, #ffcc88, #ff8866)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Deep Evolution
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(180,200,220,0.5)', maxWidth: 450, textAlign: 'center', lineHeight: 1.5 }}>
          Run thousands of generations of neural evolution at maximum speed.
          Organisms learn, reproduce, and evolve. AI observes and intervenes.
          Results are saved for exploration.
        </p>

        {/* World type */}
        <div style={{ display: 'flex', gap: 8 }}>
          {['pond', 'soil', 'lab_plate'].map(wt => (
            <button key={wt} onClick={() => setWorldType(wt)} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: worldType === wt ? 'rgba(255,204,136,0.12)' : 'rgba(10,14,28,0.6)',
              border: worldType === wt ? '1px solid rgba(255,204,136,0.3)' : '1px solid rgba(80,130,200,0.1)',
              color: worldType === wt ? '#ffcc88' : 'rgba(180,200,220,0.5)',
            }}>
              {wt === 'lab_plate' ? 'Lab Plate' : wt.charAt(0).toUpperCase() + wt.slice(1)}
            </button>
          ))}
        </div>

        {/* Population */}
        <div style={{ width: 350 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(140,170,200,0.5)', marginBottom: 4 }}>
            <span>Population</span>
            <span style={{ color: '#ffcc88', fontFamily: 'var(--font-mono)' }}>{population.toLocaleString()}</span>
          </div>
          <input type="range" min={500} max={10000} step={500} value={population}
            onChange={e => setPopulation(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ffcc88' }} />
        </div>

        {/* Target generations */}
        <div style={{ width: 350 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(140,170,200,0.5)', marginBottom: 4 }}>
            <span>Target Generations</span>
            <span style={{ color: '#ffcc88', fontFamily: 'var(--font-mono)' }}>{targetGen.toLocaleString()}</span>
          </div>
          <input type="range" min={100} max={100000} step={100} value={targetGen}
            onChange={e => setTargetGen(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ffcc88' }} />
        </div>

        {/* Mutation rate */}
        <div style={{ width: 350 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(140,170,200,0.5)', marginBottom: 4 }}>
            <span>Mutation Sigma</span>
            <span style={{ color: '#ffcc88', fontFamily: 'var(--font-mono)' }}>{mutationRate.toFixed(3)}</span>
          </div>
          <input type="range" min={0.001} max={0.1} step={0.001} value={mutationRate}
            onChange={e => setMutationRate(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#ffcc88' }} />
        </div>

        {/* Estimated time */}
        <div style={{ fontSize: 12, color: 'rgba(140,170,200,0.4)', fontFamily: 'var(--font-mono)' }}>
          Estimated time: ~{estimatedMinutes < 60 ? `${estimatedMinutes} min` : `${(estimatedMinutes / 60).toFixed(1)} hours`}
        </div>

        <button onClick={startRun} disabled={loading} style={{
          padding: '12px 36px', fontSize: 14, fontWeight: 600,
          background: 'linear-gradient(135deg, rgba(255,204,136,0.2), rgba(255,136,102,0.15))',
          border: '1px solid rgba(255,204,136,0.3)', borderRadius: 10,
          color: '#ffcc88', cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.5px',
        }}>
          {loading ? 'Initializing...' : 'Begin Deep Evolution'}
        </button>
      </div>
    );
  }

  // RUNNING PHASE
  if (phase === 'running' && status) {
    const pct = Math.round(status.progress * 100);
    const etaMin = status.eta_seconds ? Math.round(status.eta_seconds / 60) : null;
    return (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 20,
        background: 'rgba(2, 2, 6, 0.95)', backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 40,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#ffcc88' }}>
          Evolution in Progress
        </h2>
        <div style={{ fontSize: 13, color: 'rgba(180,200,220,0.5)', fontFamily: 'var(--font-mono)' }}>
          Generation {status.current_generation.toLocaleString()} / {status.target_generations.toLocaleString()}
        </div>

        {/* Progress bar */}
        <div style={{ width: 400, height: 8, background: 'rgba(80,130,200,0.1)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg, #ffcc88, #ff8866)',
            transition: 'width 0.5s ease',
          }} />
        </div>

        <div style={{ fontSize: 11, color: 'rgba(140,170,200,0.4)', fontFamily: 'var(--font-mono)' }}>
          {pct}% — {Math.round(status.elapsed_seconds)}s elapsed
          {etaMin !== null && ` — ~${etaMin < 60 ? `${etaMin}m` : `${(etaMin/60).toFixed(1)}h`} remaining`}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(140,170,200,0.3)' }}>
          {status.snapshots_saved} snapshots saved
        </div>

        <button onClick={async () => {
          if (runId) {
            await fetch(`${API_BASE}/api/deep-evolution/${runId}/stop`, { method: 'POST' });
            setPhase('complete');
          }
        }} style={{
          padding: '6px 20px', fontSize: 11, background: 'none',
          border: '1px solid rgba(255,100,100,0.3)', borderRadius: 6,
          color: 'rgba(255,100,100,0.7)', cursor: 'pointer', marginTop: 8,
        }}>
          Stop Early
        </button>
      </div>
    );
  }

  // COMPLETE PHASE
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(2, 2, 6, 0.95)', backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 40, overflow: 'auto',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#00ff88', marginBottom: 4 }}>
        Evolution Complete
      </h2>
      <div style={{ fontSize: 12, color: 'rgba(180,200,220,0.5)', fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
        {status?.current_generation.toLocaleString() ?? '?'} generations — {status?.snapshots_saved ?? 0} snapshots
      </div>

      {/* Timeline summary */}
      {timeline.length > 0 && (
        <div style={{ width: '100%', maxWidth: 700, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, color: '#dce4ec', marginBottom: 8 }}>Evolution Timeline</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {timeline.slice(-12).map((tp, i) => (
              <div key={i} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(10,14,28,0.6)', border: '1px solid rgba(80,130,200,0.1)',
              }}>
                <div style={{ fontSize: 10, color: '#ffcc88', fontFamily: 'var(--font-mono)' }}>Gen {tp.generation}</div>
                <div style={{ fontSize: 10, color: 'rgba(180,200,220,0.5)' }}>
                  Pop: {tp.alive} · Lineages: {tp.n_lineages}
                </div>
                {tp.emergent_behaviors.length > 0 && (
                  <div style={{ fontSize: 9, color: '#00ff88', marginTop: 2 }}>
                    {tp.emergent_behaviors.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discoveries */}
      {discoveries.length > 0 && (
        <div style={{ width: '100%', maxWidth: 700, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, color: '#ffcc88', marginBottom: 8 }}>
            Discoveries ({discoveries.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {discoveries.map((d, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(10,14,28,0.6)',
                border: `1px solid ${d.p_value < 0.001 ? 'rgba(0,255,136,0.3)' : d.p_value < 0.01 ? 'rgba(255,204,136,0.3)' : 'rgba(80,130,200,0.15)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#dce4ec' }}>{d.title}</span>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: 4,
                    background: d.confidence > 0.7 ? 'rgba(0,255,136,0.12)' : d.confidence > 0.4 ? 'rgba(255,204,136,0.12)' : 'rgba(80,130,200,0.1)',
                    color: d.confidence > 0.7 ? '#00ff88' : d.confidence > 0.4 ? '#ffcc88' : 'rgba(180,200,220,0.5)',
                  }}>
                    conf {(d.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(180,200,220,0.5)', lineHeight: 1.4, marginBottom: 4 }}>
                  {d.description}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(140,170,200,0.4)' }}>
                  <span>p={d.p_value < 0.001 ? '<0.001' : d.p_value.toFixed(4)}</span>
                  <span>d={d.effect_size.toFixed(2)}</span>
                  <span>gen {d.generation}</span>
                  <span style={{
                    padding: '1px 5px', borderRadius: 3,
                    background: 'rgba(80,130,200,0.08)', color: 'rgba(140,170,200,0.5)',
                  }}>
                    {d.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => { setPhase('setup'); setRunId(null); setStatus(null); setTimeline([]); setDiscoveries([]); }} style={{
        padding: '8px 24px', fontSize: 12, background: 'rgba(0,180,255,0.15)',
        border: '1px solid rgba(0,180,255,0.3)', borderRadius: 8,
        color: '#00d4ff', cursor: 'pointer', fontFamily: 'var(--font-mono)',
      }}>
        New Experiment
      </button>
    </div>
  );
}
