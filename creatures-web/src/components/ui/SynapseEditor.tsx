import { useState, useCallback, useMemo } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';

// ── Types ────────────────────────────────────────────────────────────────────

type NTType = 'ACh' | 'GABA' | 'Glu' | 'DA' | '5-HT';

interface SynapseRow {
  partnerId: string;
  weight: number;
  nt: NTType;
  direction: 'input' | 'output';
}

// ── Constants ────────────────────────────────────────────────────────────────

const NT_BADGE_COLORS: Record<NTType, string> = {
  ACh: '#1ad4f0',
  GABA: '#cc33aa',
  Glu: '#33dd55',
  DA: '#ff8822',
  '5-HT': '#ddbb22',
};

const NT_LIST: NTType[] = ['ACh', 'GABA', 'Glu', 'DA', '5-HT'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function seededRand(seed: number): number {
  let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Generate mock synapse data for a given neuron index in a network of nNeurons */
function generateMockSynapses(neuronId: string, nNeurons: number): SynapseRow[] {
  // Parse numeric index from neuron ID
  const idxMatch = neuronId.match(/\d+/);
  const neuronIdx = idxMatch ? parseInt(idxMatch[0], 10) : 0;

  const rows: SynapseRow[] = [];
  const nInputs = 3 + Math.floor(seededRand(neuronIdx * 7 + 1) * 8);
  const nOutputs = 2 + Math.floor(seededRand(neuronIdx * 11 + 3) * 6);

  for (let i = 0; i < nInputs; i++) {
    const partnerIdx = Math.floor(seededRand(neuronIdx * 37 + i * 13 + 5) * nNeurons);
    if (partnerIdx === neuronIdx) continue;
    const w = (seededRand(neuronIdx * 41 + i * 17 + 7) * 2 - 0.5) * 5;
    const nt = NT_LIST[Math.floor(seededRand(neuronIdx * 43 + i * 19 + 9) * NT_LIST.length)];
    rows.push({
      partnerId: `n${partnerIdx}`,
      weight: parseFloat(w.toFixed(2)),
      nt,
      direction: 'input',
    });
  }

  for (let i = 0; i < nOutputs; i++) {
    const partnerIdx = Math.floor(seededRand(neuronIdx * 53 + i * 23 + 11) * nNeurons);
    if (partnerIdx === neuronIdx) continue;
    const w = (seededRand(neuronIdx * 59 + i * 29 + 13) * 2 - 0.3) * 5;
    const nt = NT_LIST[Math.floor(seededRand(neuronIdx * 61 + i * 31 + 15) * NT_LIST.length)];
    rows.push({
      partnerId: `n${partnerIdx}`,
      weight: parseFloat(w.toFixed(2)),
      nt,
      direction: 'output',
    });
  }

  return rows;
}

function sendWsCommand(cmd: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('neurevo-command', { detail: cmd }));
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function NTBadge({ nt }: { nt: NTType }) {
  return (
    <span
      style={{
        fontSize: 8,
        fontWeight: 700,
        padding: '1px 4px',
        borderRadius: 3,
        background: NT_BADGE_COLORS[nt] ?? '#555',
        color: '#000',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {nt}
    </span>
  );
}

function WeightBar({ weight, maxAbs }: { weight: number; maxAbs: number }) {
  const frac = Math.abs(weight) / (maxAbs || 1);
  const isExcitatory = weight >= 0;
  const color = isExcitatory ? '#ff4444' : '#4488ff';
  const barW = Math.max(2, frac * 60);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 80,
      }}
    >
      <div
        style={{
          width: 60,
          height: 6,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: isExcitatory ? '50%' : `calc(50% - ${barW / 2}px)`,
            width: barW / 2,
            height: '100%',
            background: color,
            borderRadius: 3,
            opacity: 0.8,
          }}
        />
      </div>
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary, #99a)', minWidth: 36, textAlign: 'right' }}>
        {weight.toFixed(2)}
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SynapseEditor() {
  const selectedNeuron = useSimulationStore((s) => s.selectedNeuron);
  const experiment = useSimulationStore((s) => s.experiment);
  const setSelectedNeuron = useSimulationStore((s) => s.setSelectedNeuron);

  const nNeurons = experiment?.n_neurons ?? 302;

  const [synapses, setSynapses] = useState<SynapseRow[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTarget, setNewTarget] = useState('');
  const [newWeight, setNewWeight] = useState(1.0);
  const [newNT, setNewNT] = useState<NTType>('ACh');

  // Regenerate synapses when selected neuron changes
  useMemo(() => {
    if (!selectedNeuron) {
      setSynapses([]);
      return;
    }
    const mock = generateMockSynapses(selectedNeuron, nNeurons);
    setSynapses(mock);
    setShowAddForm(false);
  }, [selectedNeuron, nNeurons]);

  const inputs = useMemo(() => synapses.filter((s) => s.direction === 'input'), [synapses]);
  const outputs = useMemo(() => synapses.filter((s) => s.direction === 'output'), [synapses]);

  const totalIn = useMemo(() => inputs.reduce((acc, s) => acc + s.weight, 0), [inputs]);
  const totalOut = useMemo(() => outputs.reduce((acc, s) => acc + s.weight, 0), [outputs]);
  const maxAbs = useMemo(
    () => Math.max(0.1, ...synapses.map((s) => Math.abs(s.weight))),
    [synapses],
  );

  const handleWeightChange = useCallback(
    (idx: number, value: number) => {
      setSynapses((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], weight: value };
        return next;
      });
      // Dispatch WS command
      const syn = synapses[idx];
      if (syn && selectedNeuron) {
        sendWsCommand({
          type: 'modify_weight',
          pre: syn.direction === 'input' ? syn.partnerId : selectedNeuron,
          post: syn.direction === 'input' ? selectedNeuron : syn.partnerId,
          weight: value,
        });
      }
    },
    [synapses, selectedNeuron],
  );

  const handleDelete = useCallback(
    (idx: number) => {
      const syn = synapses[idx];
      if (syn && selectedNeuron) {
        sendWsCommand({
          type: 'modify_weight',
          pre: syn.direction === 'input' ? syn.partnerId : selectedNeuron,
          post: syn.direction === 'input' ? selectedNeuron : syn.partnerId,
          weight: 0,
        });
      }
      setSynapses((prev) => prev.filter((_, i) => i !== idx));
    },
    [synapses, selectedNeuron],
  );

  const handleAddSynapse = useCallback(() => {
    if (!newTarget.trim() || !selectedNeuron) return;
    const row: SynapseRow = {
      partnerId: newTarget.trim(),
      weight: newWeight,
      nt: newNT,
      direction: 'output',
    };
    setSynapses((prev) => [...prev, row]);
    sendWsCommand({
      type: 'modify_weight',
      pre: selectedNeuron,
      post: newTarget.trim(),
      weight: newWeight,
    });
    setShowAddForm(false);
    setNewTarget('');
    setNewWeight(1.0);
  }, [newTarget, newWeight, newNT, selectedNeuron]);

  const handleSelectPartner = useCallback(
    (id: string) => {
      setSelectedNeuron(id);
    },
    [setSelectedNeuron],
  );

  if (!selectedNeuron) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '16px 12px',
          color: 'var(--text-label, #667)',
          fontSize: 11,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Select a neuron to edit synapses
      </div>
    );
  }

  const renderRow = (syn: SynapseRow, globalIdx: number) => (
    <div
      key={`${syn.direction}-${syn.partnerId}-${globalIdx}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Partner ID (clickable) */}
      <button
        onClick={() => handleSelectPartner(syn.partnerId)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--accent-cyan, #0ff)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10,
          padding: 0,
          minWidth: 42,
          textAlign: 'left',
        }}
        title={`Select ${syn.partnerId}`}
      >
        {syn.partnerId}
      </button>

      {/* NT badge */}
      <NTBadge nt={syn.nt} />

      {/* Weight bar */}
      <WeightBar weight={syn.weight} maxAbs={maxAbs} />

      {/* Slider */}
      <input
        type="range"
        min={-10}
        max={10}
        step={0.1}
        value={syn.weight}
        onChange={(e) => handleWeightChange(globalIdx, parseFloat(e.target.value))}
        style={{
          width: 50,
          height: 10,
          accentColor: syn.weight >= 0 ? '#ff4444' : '#4488ff',
          cursor: 'pointer',
        }}
      />

      {/* Delete */}
      <button
        onClick={() => handleDelete(globalIdx)}
        title="Delete synapse"
        style={{
          background: 'rgba(255,50,50,0.15)',
          border: '1px solid rgba(255,50,50,0.3)',
          borderRadius: 3,
          color: '#ff4444',
          fontSize: 9,
          fontWeight: 700,
          cursor: 'pointer',
          padding: '1px 4px',
          lineHeight: 1.2,
        }}
      >
        X
      </button>
    </div>
  );

  return (
    <div
      className="glass-panel"
      style={{
        maxHeight: 350,
        overflowY: 'auto',
        padding: '8px 10px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary, #ccd)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          Synapses: {selectedNeuron}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-label, #667)' }}>
          {synapses.length} connections
        </span>
      </div>

      {/* Input synapses */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--text-secondary, #99a)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 3,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Pre-synaptic (inputs)</span>
          <span style={{ color: 'var(--text-label, #667)', fontWeight: 400, textTransform: 'none' }}>
            sum: {totalIn.toFixed(2)}
          </span>
        </div>
        {inputs.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--text-label, #667)', fontStyle: 'italic', padding: '4px 0' }}>
            No inputs
          </div>
        ) : (
          inputs.map((syn, i) => renderRow(syn, i))
        )}
      </div>

      {/* Output synapses */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--text-secondary, #99a)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 3,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Post-synaptic (outputs)</span>
          <span style={{ color: 'var(--text-label, #667)', fontWeight: 400, textTransform: 'none' }}>
            sum: {totalOut.toFixed(2)}
          </span>
        </div>
        {outputs.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--text-label, #667)', fontStyle: 'italic', padding: '4px 0' }}>
            No outputs
          </div>
        ) : (
          outputs.map((syn, i) => renderRow(syn, inputs.length + i))
        )}
      </div>

      {/* Add Synapse */}
      {showAddForm ? (
        <div
          style={{
            padding: '6px 8px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary, #99a)' }}>
            Add Synapse
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Target neuron ID"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3,
                color: 'var(--text-primary, #ccd)',
                fontSize: 10,
                padding: '3px 6px',
                fontFamily: 'var(--font-mono, monospace)',
                outline: 'none',
              }}
            />
            <select
              value={newNT}
              onChange={(e) => setNewNT(e.target.value as NTType)}
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3,
                color: 'var(--text-primary, #ccd)',
                fontSize: 10,
                padding: '3px 4px',
                outline: 'none',
              }}
            >
              {NT_LIST.map((nt) => (
                <option key={nt} value={nt}>{nt}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-label, #667)', minWidth: 32 }}>
              w={newWeight.toFixed(1)}
            </span>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.1}
              value={newWeight}
              onChange={(e) => setNewWeight(parseFloat(e.target.value))}
              style={{ flex: 1, height: 10, accentColor: 'var(--accent-cyan, #0ff)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleAddSynapse}
              style={{
                flex: 1,
                background: 'rgba(0,255,200,0.15)',
                border: '1px solid rgba(0,255,200,0.3)',
                borderRadius: 3,
                color: '#0fc',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 3,
                color: 'var(--text-secondary, #99a)',
                fontSize: 10,
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.12)',
            borderRadius: 4,
            color: 'var(--text-label, #667)',
            fontSize: 10,
            cursor: 'pointer',
            padding: '6px 0',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
        >
          + Add Synapse
        </button>
      )}
    </div>
  );
}
