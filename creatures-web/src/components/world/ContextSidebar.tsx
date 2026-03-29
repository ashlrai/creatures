import { useState, useCallback, useMemo } from 'react';
import { useWorldStore } from '../../stores/worldStore';
import { CoCreatorPanel } from '../ui/CoCreatorPanel';
import { getHighlights } from './AIHighlighter';
import { classifyBehavior, BEHAVIOR_CONFIG, type Behavior } from './BehaviorLabels';
import { API_BASE } from '../../config';
import type { MassiveOrganism } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// ContextSidebar — adapts panel content based on zoom band
//
// Population zoom: divine interventions, world controls
// Colony zoom: cluster analysis, organism comparison
// Organism zoom: consciousness metrics, neural detail (Phase 2)
// ---------------------------------------------------------------------------

interface ContextSidebarProps {
  massiveId: string;
  sendCommand: (cmd: Record<string, unknown>) => void;
  notify?: (msg: string, duration?: number) => void;
}

export function ContextSidebar({
  massiveId,
  sendCommand,
  notify,
}: ContextSidebarProps) {
  const zoomBand = useWorldStore((s) => s.zoomBand);
  const selectedOrganism = useWorldStore((s) => s.selectedOrganism);
  const organisms = useWorldStore((s) => s.organisms);
  const populationStats = useWorldStore((s) => s.populationStats);
  const neuralStats = useWorldStore((s) => s.neuralStats);
  const [open, setOpen] = useState(false);

  const handleNotify = useCallback(
    (msg: string) => notify?.(msg),
    [notify],
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'rgba(6,8,18,0.9)',
          border: '1px solid rgba(80,130,200,0.15)',
          borderRight: 'none',
          borderRadius: '8px 0 0 8px',
          color: 'rgba(140,170,200,0.6)',
          cursor: 'pointer',
          padding: '12px 6px',
          fontSize: 11,
          zIndex: 20,
          writingMode: 'vertical-rl',
        }}
      >
        {zoomBand === 'population'
          ? 'Controls'
          : zoomBand === 'colony'
            ? 'Colony'
            : 'Organism'}
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 24,
        width: 260,
        background: 'rgba(6, 8, 18, 0.92)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(80,130,200,0.1)',
        overflow: 'auto',
        padding: 12,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(140,170,200,0.5)',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {zoomBand === 'population'
            ? 'World Controls'
            : zoomBand === 'colony'
              ? 'Colony Analysis'
              : 'Organism Detail'}
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(140,170,200,0.4)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          {'\u00d7'}
        </button>
      </div>

      {/* Content adapts to zoom level */}
      {zoomBand === 'population' && (
        <PopulationPanels
          massiveId={massiveId}
          notify={handleNotify}
          populationStats={populationStats}
          neuralStats={neuralStats}
          organismCount={organisms.length}
          organisms={organisms}
        />
      )}

      {zoomBand === 'colony' && (
        <ColonyPanels
          organisms={organisms}
          populationStats={populationStats}
        />
      )}

      {zoomBand === 'organism' && selectedOrganism && (
        <OrganismPanels organism={selectedOrganism} />
      )}

      {zoomBand === 'organism' && !selectedOrganism && (
        <div
          style={{
            fontSize: 11,
            color: 'rgba(140,170,200,0.4)',
            textAlign: 'center',
            padding: 20,
            lineHeight: 1.6,
          }}
        >
          Click an organism to inspect its neural activity, consciousness
          metrics, and evolutionary lineage.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Population Panels
// ---------------------------------------------------------------------------

function PopulationPanels({
  massiveId,
  notify,
  populationStats,
  neuralStats,
  organismCount,
  organisms,
}: {
  massiveId: string;
  notify: (msg: string) => void;
  populationStats: any;
  neuralStats: any;
  organismCount: number;
  organisms: MassiveOrganism[];
}) {
  return (
    <>
      <CoCreatorPanel
        massiveId={massiveId}
        apiBase={API_BASE}
        onNotify={notify}
      />

      {/* AI Highlights — interesting organisms */}
      <AIHighlightsPanel organisms={organisms} />

      {/* Population summary */}
      {populationStats && (
        <div className="glass">
          <div
            className="glass-label"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Population Summary
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Stat label="Alive" value={organismCount} color="#00d4ff" />
            <Stat
              label="Generation"
              value={populationStats.max_generation ?? 0}
              color="#ffcc88"
            />
            <Stat
              label="Lineages"
              value={populationStats.n_lineages ?? 0}
              color="#88ffcc"
            />
            <Stat
              label="Avg Age"
              value={(populationStats.mean_age ?? 0).toFixed(0)}
              color="#aabbcc"
            />
            <Stat
              label="Mean Energy"
              value={(populationStats.mean_energy ?? 0).toFixed(1)}
              color="#ff8888"
            />
            <Stat
              label="Avg Food"
              value={(populationStats.mean_lifetime_food ?? 0).toFixed(1)}
              color="#88ccff"
            />
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Colony Panels
// ---------------------------------------------------------------------------

function ColonyPanels({
  organisms,
  populationStats,
}: {
  organisms: MassiveOrganism[];
  populationStats: any;
}) {
  // Simple species breakdown
  const elegansCount = organisms.filter((o) => o.species === 0).length;
  const drosophilaCount = organisms.length - elegansCount;

  // Top organisms by energy
  const topOrganisms = [...organisms]
    .sort((a, b) => b.energy - a.energy)
    .slice(0, 5);

  return (
    <>
      {/* Species breakdown */}
      <div className="glass">
        <div className="glass-label">Species Composition</div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              background: 'rgba(0,212,255,0.05)',
              borderRadius: 6,
              border: '1px solid rgba(0,212,255,0.1)',
            }}
          >
            <div style={{ color: '#00d4ff', fontSize: 16, fontWeight: 600 }}>
              {elegansCount}
            </div>
            <div style={{ color: 'rgba(0,212,255,0.5)', fontSize: 9 }}>
              C. elegans
            </div>
          </div>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              background: 'rgba(255,170,34,0.05)',
              borderRadius: 6,
              border: '1px solid rgba(255,170,34,0.1)',
            }}
          >
            <div style={{ color: '#ffaa22', fontSize: 16, fontWeight: 600 }}>
              {drosophilaCount}
            </div>
            <div style={{ color: 'rgba(255,170,34,0.5)', fontSize: 9 }}>
              Drosophila
            </div>
          </div>
        </div>
      </div>

      {/* Top performers */}
      <div className="glass">
        <div className="glass-label">Top Performers</div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {topOrganisms.map((org, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 6px',
                background: i === 0 ? 'rgba(255,200,100,0.05)' : 'transparent',
                borderRadius: 4,
                border:
                  i === 0
                    ? '1px solid rgba(255,200,100,0.1)'
                    : '1px solid transparent',
              }}
            >
              <span
                style={{
                  color: org.species === 0 ? '#00d4ff' : '#ffaa22',
                }}
              >
                {org.species === 0 ? 'C.e.' : 'D.m.'} Gen{' '}
                {org.generation ?? 0}
              </span>
              <span style={{ color: 'rgba(200,220,240,0.6)' }}>
                E:{org.energy.toFixed(0)} F:
                {(org.lifetime_food_eaten ?? 0).toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Behavior breakdown */}
      <BehaviorBreakdown organisms={organisms} />

      {/* Lineage diversity hint */}
      {populationStats?.n_lineages && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(100, 130, 200, 0.04)',
            border: '1px solid rgba(100, 130, 200, 0.08)',
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: 'rgba(140,170,200,0.4)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {populationStats.n_lineages} unique lineages competing.
            {populationStats.n_lineages < 5
              ? ' Diversity is low — consider a Mutation Burst.'
              : populationStats.n_lineages > 20
                ? ' Rich diversity — natural selection in action.'
                : ' Moderate diversity.'}
          </p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Organism Panels (placeholder for Phase 2 — will include consciousness
// dashboard, STDP, raster plot)
// ---------------------------------------------------------------------------

function OrganismPanels({ organism }: { organism: MassiveOrganism }) {
  const isCelegans = organism.species === 0;
  const detail = useWorldStore((s) => s.organismDetail);
  const loading = useWorldStore((s) => s.organismDetailLoading);

  return (
    <>
      {/* Basic info */}
      <div className="glass">
        <div
          className="glass-label"
          style={{ color: isCelegans ? '#00d4ff' : '#ffaa22' }}
        >
          {isCelegans ? 'C. elegans' : 'Drosophila melanogaster'}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 12px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Stat label="Energy" value={organism.energy.toFixed(1)} color="#ff8888" />
          <Stat label="Age" value={(organism.age ?? 0).toFixed(0)} color="#aabbcc" />
          <Stat label="Generation" value={organism.generation ?? 0} color="#ffcc88" />
          <Stat label="Food Eaten" value={(organism.lifetime_food_eaten ?? 0).toFixed(0)} color="#88ccff" />
        </div>
      </div>

      {/* Neural activity (from backend detail) */}
      {loading && (
        <div className="glass" style={{ textAlign: 'center', padding: 12 }}>
          <div style={{ fontSize: 10, color: 'rgba(140,170,200,0.5)' }}>
            Loading neural data...
          </div>
        </div>
      )}

      {detail?.neural && (
        <div className="glass">
          <div className="glass-label">Neural Activity</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Stat
              label="Active Neurons"
              value={detail.neural.active_neurons}
              color="#00ccff"
            />
            <Stat
              label="Mean Rate"
              value={detail.neural.mean_firing_rate.toFixed(1) + ' Hz'}
              color="#00ff88"
            />
            <Stat
              label="Sensory"
              value={avgRate(detail.neural.sensory_rates)}
              color="#44ff88"
            />
            <Stat
              label="Motor"
              value={avgRate(detail.neural.motor_rates)}
              color="#ff4466"
            />
          </div>

          {/* Mini firing rate bar chart */}
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              height: 30,
            }}
          >
            {detail.neural.firing_rates.slice(0, 50).map((rate, i) => {
              const h = Math.min(1, rate / 80);
              const t = i / 50;
              const color =
                t < 0.2
                  ? 'rgba(68,255,136,0.8)'
                  : t < 0.8
                    ? 'rgba(34,136,255,0.8)'
                    : 'rgba(255,68,102,0.8)';
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h * 100}%`,
                    background: color,
                    borderRadius: '1px 1px 0 0',
                    minHeight: 1,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 8,
              color: 'rgba(140,170,200,0.3)',
              marginTop: 2,
            }}
          >
            <span>Sensory</span>
            <span>Interneuron</span>
            <span>Motor</span>
          </div>
        </div>
      )}

      {/* STDP Learning */}
      {detail?.neural?.stdp && (
        <div className="glass">
          <div className="glass-label">STDP Learning</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Stat
              label="Synapses"
              value={detail.neural.stdp.n_synapses}
              color="#aabbcc"
            />
            <Stat
              label="Mean Weight"
              value={detail.neural.stdp.mean_weight.toFixed(3)}
              color="#ffcc88"
            />
            <Stat
              label="Weight Std"
              value={detail.neural.stdp.std_weight.toFixed(3)}
              color="#88aacc"
            />
            <Stat
              label="Weight Range"
              value={`${detail.neural.stdp.min_weight.toFixed(1)}..${detail.neural.stdp.max_weight.toFixed(1)}`}
              color="#88ccff"
            />
          </div>
        </div>
      )}

      {/* Behavior */}
      {detail?.behavior && (
        <div className="glass">
          <div className="glass-label">Behavior</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Stat
              label="Speed"
              value={detail.behavior.speed.toFixed(2)}
              color="#00d4ff"
            />
            <Stat
              label="Linearity"
              value={(detail.behavior.linearity * 100).toFixed(0) + '%'}
              color="#ffaa22"
            />
            <Stat
              label="Forward"
              value={detail.behavior.forward_rate.toFixed(1)}
              color="#00ff88"
            />
            <Stat
              label="Turn"
              value={detail.behavior.turn_rate.toFixed(1)}
              color="#ff8888"
            />
          </div>
        </div>
      )}

      {/* Lineage info */}
      <div className="glass">
        <div className="glass-label">Lineage</div>
        <div
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'rgba(160,180,210,0.7)',
          }}
        >
          <div>
            ID: <span style={{ color: '#88ffcc' }}>{organism.lineage_id ?? 'unknown'}</span>
          </div>
          <div>
            Position: ({organism.x.toFixed(1)}, {organism.y.toFixed(1)})
          </div>
        </div>
      </div>
    </>
  );
}

/** Helper: compute average firing rate string */
function avgRate(rates: number[]): string {
  if (rates.length === 0) return '0 Hz';
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  return avg.toFixed(1) + ' Hz';
}

// ---------------------------------------------------------------------------
// Behavior Breakdown
// ---------------------------------------------------------------------------

function BehaviorBreakdown({ organisms }: { organisms: MassiveOrganism[] }) {
  const breakdown = useMemo(() => {
    if (organisms.length === 0) return {};

    let meanEnergy = 0;
    for (const org of organisms) meanEnergy += org.energy;
    meanEnergy /= organisms.length;

    const counts: Record<Behavior, number> = {
      foraging: 0,
      exploring: 0,
      thriving: 0,
      struggling: 0,
      elder: 0,
      newborn: 0,
    };

    for (const org of organisms) {
      if (org.energy < 1) continue;
      counts[classifyBehavior(org, meanEnergy)]++;
    }

    return counts;
  }, [organisms]);

  const total = (Object.values(breakdown) as number[]).reduce((a: number, b: number) => a + (b || 0), 0);
  if (total === 0) return null;

  return (
    <div className="glass">
      <div className="glass-label">Behavior Distribution</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {(Object.entries(breakdown) as [Behavior, number][])
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([behavior, count]) => {
            const config = BEHAVIOR_CONFIG[behavior];
            const pct = ((count / total) * 100).toFixed(0);
            return (
              <div
                key={behavior}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 12 }}>{config.icon}</span>
                <span style={{ color: config.color, flex: 1 }}>
                  {config.label}
                </span>
                <span style={{ color: 'rgba(180,200,220,0.5)' }}>
                  {count} ({pct}%)
                </span>
                {/* Mini bar */}
                <div
                  style={{
                    width: 40,
                    height: 4,
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(count / total) * 100}%`,
                      height: '100%',
                      background: config.color,
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Highlights Panel
// ---------------------------------------------------------------------------

function AIHighlightsPanel({ organisms }: { organisms: MassiveOrganism[] }) {
  const highlights = getHighlights();
  const selectOrganism = useWorldStore((s) => s.selectOrganism);

  if (highlights.length === 0 || organisms.length === 0) return null;

  return (
    <div className="glass">
      <div
        className="glass-label"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ color: 'rgba(180,140,255,0.7)' }}>AI Highlights</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {highlights.map((h) => {
          const org = organisms[h.index];
          if (!org) return null;
          return (
            <button
              key={h.index}
              onClick={() => selectOrganism(h.index, org)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '6px 8px',
                background: 'rgba(180, 140, 255, 0.04)',
                border: '1px solid rgba(180, 140, 255, 0.1)',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'inherit',
                width: '100%',
              }}
            >
              <div
                style={{
                  color: org.species === 0 ? '#00d4ff' : '#ffaa22',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {org.species === 0 ? 'C. elegans' : 'Drosophila'} #{h.index}
              </div>
              <div style={{ color: 'rgba(180, 140, 255, 0.7)', fontSize: 9 }}>
                {h.reason}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat helper
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 8,
          color: 'rgba(140,170,200,0.4)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ color, fontSize: 12, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
