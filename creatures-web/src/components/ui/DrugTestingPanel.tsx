import { useState, useEffect, useCallback } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import { DoseResponseChart } from './DoseResponseChart';

// ── Drug definitions ─────────────────────────────────────────────────────────

interface DrugAction {
  type: string;
  neurotransmitter?: string;
  neuron_type?: string;
  current?: number;
  scale?: number;
}

interface Drug {
  name: string;
  mechanism: string;
  effect: string;
  action: DrugAction;
  color: string;
}

const DRUGS: Drug[] = [
  {
    name: 'Picrotoxin',
    mechanism: 'GABA receptor blocker',
    effect: 'Removes inhibition -- hyperactivity',
    action: { type: 'lesion_by_nt', neurotransmitter: 'GABA' },
    color: '#ff4422',
  },
  {
    name: 'Aldicarb',
    mechanism: 'Acetylcholinesterase inhibitor',
    effect: 'Enhances cholinergic signaling -- increased motor drive',
    action: { type: 'stimulate_by_nt', neurotransmitter: 'ACh', current: 15 },
    color: '#00d4ff',
  },
  {
    name: 'Levamisole',
    mechanism: 'Nicotinic ACh receptor agonist',
    effect: 'Directly activates motor neurons -- paralysis at high dose',
    action: { type: 'stimulate_type', neuron_type: 'motor', current: 20 },
    color: '#ffaa22',
  },
  {
    name: 'Nembutal',
    mechanism: 'General anesthetic',
    effect: 'Reduces all synaptic transmission -- near silence',
    action: { type: 'reduce_all_weights', scale: 0.2 },
    color: '#8855cc',
  },
];

// ── Known neuron lists for drug application ──────────────────────────────────

const GABA_NEURONS = [
  'DD1', 'DD2', 'DD3', 'DD4', 'DD5', 'DD6',
  'VD1', 'VD2', 'VD3', 'VD4', 'VD5', 'VD6', 'VD7', 'VD8', 'VD9', 'VD10', 'VD11', 'VD12', 'VD13',
  'AVL', 'DVA', 'DVB', 'DVC', 'RIAL', 'RIAR', 'RIS', 'RIVL', 'RIVR', 'RMED', 'RMEL', 'RMER', 'RMEV', 'RID', 'BDUL', 'BDUR',
];

// ── Drug name → REST API key mapping ─────────────────────────────────────────

const DRUG_API_KEYS: Record<string, string> = {
  'Picrotoxin': 'picrotoxin',
  'Aldicarb': 'aldicarb',
  'Levamisole': 'levamisole',
  'Nembutal': 'nemadipine',  // Nembutal maps to Nemadipine in the API
};

// ── Pharmacokinetic parameters for dose-response curves ─────────────────────

const DRUG_PK: Record<string, { ec50: number; hill: number }> = {
  Picrotoxin: { ec50: 0.5, hill: 1.8 },
  Aldicarb: { ec50: 0.8, hill: 1.2 },
  Levamisole: { ec50: 0.3, hill: 2.0 },
  Nembutal: { ec50: 1.2, hill: 1.3 },
};

// ── Component ────────────────────────────────────────────────────────────────

interface DrugTestingPanelProps {
  isDemo: boolean;
  /** Controlled expanded state (optional — falls back to internal state) */
  expanded?: boolean;
  onToggleExpanded?: (v: boolean) => void;
}

export function DrugTestingPanel({ isDemo, expanded: controlledExpanded, onToggleExpanded }: DrugTestingPanelProps) {
  const connected = useSimulationStore((s) => s.connected);
  const [doses, setDoses] = useState<Record<string, number>>({});
  const [appliedDrug, setAppliedDrug] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [neuronTypes, setNeuronTypes] = useState<Record<string, { type: string; nt: string | null }>>({});
  const [motorNeurons, setMotorNeurons] = useState<string[]>([]);
  const [achNeurons, setAchNeurons] = useState<string[]>([]);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = onToggleExpanded ?? setInternalExpanded;

  // Load neuron types to resolve which neurons to target
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}neuron-types.json`)
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, { type: string; nt: string | null }>) => {
        setNeuronTypes(data);

        const motors: string[] = [];
        const achs: string[] = [];
        for (const [id, info] of Object.entries(data)) {
          if (info.type === 'motor') motors.push(id);
          if (info.nt === 'Acetylcholine' || info.nt === 'ACh') achs.push(id);
        }
        setMotorNeurons(motors);
        setAchNeurons(achs);
      })
      .catch(() => {});
  }, []);

  const getDose = (name: string) => doses[name] ?? 1.0;

  const setDose = (name: string, value: number) => {
    setDoses((prev) => ({ ...prev, [name]: value }));
  };

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const sendWsCommand = useCallback((cmd: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent('neurevo-command', { detail: cmd }));
  }, []);

  const applyDrugRest = useCallback(async (drugKey: string, dose: number) => {
    const simId = useSimulationStore.getState().experiment?.id;
    if (!simId) return;

    const res = await fetch(`/api/pharmacology/${simId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drug_name: drugKey, dose }),
    });
    if (res.ok) {
      const result = await res.json();
      notify(`${result.drug} applied (dose=${dose.toFixed(1)}): ${result.synapses_affected} synapses affected`);
      setAppliedDrug(drugKey);
    }
  }, []);

  const applyDrugWs = useCallback((drug: Drug) => {
    const dose = getDose(drug.name);
    const current = (drug.action.current ?? 15) * dose;

    switch (drug.action.type) {
      case 'lesion_by_nt': {
        // Lesion all GABA neurons
        const neurons = GABA_NEURONS;
        // At low dose, only lesion a fraction
        const count = Math.max(1, Math.round(neurons.length * Math.min(dose, 1)));
        const targets = neurons.slice(0, count);
        for (const id of targets) {
          sendWsCommand({ type: 'lesion_neuron', neuron_id: id });
        }
        notify(`Picrotoxin applied (${dose.toFixed(1)}x) -- lesioned ${targets.length} GABA neurons`);
        break;
      }
      case 'stimulate_by_nt': {
        // Stimulate all ACh neurons
        const neurons = achNeurons.length > 0 ? achNeurons : Object.entries(neuronTypes)
          .filter(([, info]) => info.nt === 'Acetylcholine' || info.nt === 'ACh')
          .map(([id]) => id);
        sendWsCommand({ type: 'stimulate', neuron_ids: neurons, current });
        notify(`Aldicarb applied (${dose.toFixed(1)}x) -- stimulating ${neurons.length} cholinergic neurons at ${current.toFixed(0)}mV`);
        break;
      }
      case 'stimulate_type': {
        // Stimulate all motor neurons
        const neurons = motorNeurons.length > 0 ? motorNeurons : Object.entries(neuronTypes)
          .filter(([, info]) => info.type === 'motor')
          .map(([id]) => id);
        sendWsCommand({ type: 'stimulate', neuron_ids: neurons, current });
        notify(`Levamisole applied (${dose.toFixed(1)}x) -- stimulating ${neurons.length} motor neurons at ${current.toFixed(0)}mV`);
        break;
      }
      case 'reduce_all_weights': {
        notify('Nembutal: requires backend support for weight scaling (not yet implemented)');
        break;
      }
    }
    setAppliedDrug(drug.name);
  }, [doses, neuronTypes, motorNeurons, achNeurons, sendWsCommand]);

  const applyDrug = useCallback(async (drug: Drug) => {
    const dose = getDose(drug.name);
    const apiKey = DRUG_API_KEYS[drug.name];

    if (connected && apiKey) {
      await applyDrugRest(apiKey, dose);
      return;
    }

    // Fall back to WebSocket commands (demo mode or missing API key)
    applyDrugWs(drug);
  }, [connected, doses, applyDrugRest, applyDrugWs]);

  const handleReset = useCallback(async () => {
    const simId = useSimulationStore.getState().experiment?.id;
    if (connected && simId) {
      await fetch(`/api/pharmacology/${simId}/reset`, { method: 'DELETE' });
      notify('All drug effects reset');
    } else {
      sendWsCommand({ type: 'reset_network' });
      notify('Network reset');
    }
    setAppliedDrug(null);
  }, [connected, sendWsCommand]);

  const canApply = connected || isDemo;

  return (
    <div className="glass" style={{ padding: expanded ? undefined : '6px 12px' }}>
      <div
        className="glass-label"
        style={{ cursor: 'pointer', userSelect: 'none', marginBottom: expanded ? 8 : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span>Drug Testing</span>
        <span style={{ fontSize: 10, color: 'var(--text-label)' }}>{expanded ? '\u25BE' : '\u25B8'}</span>
      </div>

      {expanded && (
        <>
          {!canApply && (
            <div style={{
              fontSize: 10,
              color: 'var(--accent-amber)',
              padding: '4px 8px',
              background: 'rgba(255, 170, 34, 0.06)',
              borderRadius: 6,
              marginBottom: 8,
              textAlign: 'center',
            }}>
              Connect to server for live drug testing
            </div>
          )}

          {canApply && !connected && isDemo && (
            <div style={{
              fontSize: 10,
              color: 'var(--accent-amber)',
              padding: '4px 8px',
              background: 'rgba(255, 170, 34, 0.06)',
              borderRadius: 6,
              marginBottom: 8,
              textAlign: 'center',
            }}>
              Demo mode — drugs will use WebSocket commands
            </div>
          )}

          {notification && (
            <div style={{
              fontSize: 10,
              color: 'var(--accent-cyan)',
              padding: '4px 8px',
              background: 'rgba(0, 212, 255, 0.06)',
              borderRadius: 6,
              marginBottom: 8,
            }}>
              {notification}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DRUGS.map((drug) => (
              <div key={drug.name} className="drug-card" style={{ borderLeftColor: drug.color }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {drug.name}
                      {appliedDrug === drug.name && (
                        <span style={{ fontSize: 9, color: drug.color, marginLeft: 6 }}>ACTIVE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-label)', marginTop: 1 }}>
                      {drug.mechanism}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.3 }}>
                  {drug.effect}
                </div>
                {DRUG_PK[drug.name] && (
                  <div style={{ marginTop: 6, borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
                    <DoseResponseChart
                      drugName={drug.name}
                      ec50={DRUG_PK[drug.name].ec50}
                      hillCoefficient={DRUG_PK[drug.name].hill}
                      maxDose={3.0}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-label)', whiteSpace: 'nowrap' }}>
                    {getDose(drug.name).toFixed(1)}x
                  </span>
                  <input
                    type="range"
                    min="0.1"
                    max="3.0"
                    step="0.1"
                    value={getDose(drug.name)}
                    onChange={(e) => setDose(drug.name, parseFloat(e.target.value))}
                    style={{
                      flex: 1,
                      height: 3,
                      accentColor: drug.color,
                      cursor: 'pointer',
                    }}
                  />
                  <button
                    className="drug-apply-btn"
                    style={{ background: canApply ? drug.color : 'rgba(255,255,255,0.05)' }}
                    disabled={!canApply}
                    onClick={() => applyDrug(drug)}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 8, fontSize: 11 }}
            onClick={handleReset}
            disabled={!canApply}
          >
            Reset Network
          </button>
        </>
      )}
    </div>
  );
}
