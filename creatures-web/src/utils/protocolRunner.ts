import { useProtocolStore } from '../stores/protocolStore';
import { useSimulationStore } from '../stores/simulationStore';
import type { ProtocolBlock, TrialResult } from '../stores/protocolStore';

// Module-level timeout IDs for cancellation
const _pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
let _cancelled = false;

function sendCommand(cmd: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('neurevo-command', { detail: cmd }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    _pendingTimeouts.push(id);
  });
}

/** Capture current firing rates from the latest simulation frame */
function captureFiringRates(): number[] {
  const frame = useSimulationStore.getState().frame;
  if (!frame) return [];
  // firing_rates is directly on the SimulationFrame
  if (frame.firing_rates && Array.isArray(frame.firing_rates)) return [...frame.firing_rates];
  // Last resort: use n_active to create a synthetic rate array
  if (typeof frame.n_active === 'number') {
    return [frame.n_active];
  }
  return [];
}

async function executeBlock(block: ProtocolBlock): Promise<Record<string, number[]>> {
  const measurements: Record<string, number[]> = {};

  switch (block.type) {
    case 'stimulus': {
      const neuronIds = typeof block.params.neuronIds === 'string'
        ? (block.params.neuronIds as string).split(',').map((s) => s.trim()).filter(Boolean)
        : Array.isArray(block.params.neuronIds)
          ? block.params.neuronIds as string[]
          : [];
      const current = (block.params.current as number) ?? 15;
      sendCommand({ type: 'stimulate', neuron_ids: neuronIds, current });
      break;
    }

    case 'drug': {
      const compound = (block.params.compound as string) ?? 'Picrotoxin';
      const dose = (block.params.dose as number) ?? 1.0;
      const simId = useSimulationStore.getState().experiment?.id;
      if (simId) {
        // Try REST API first
        try {
          await fetch(`/api/pharmacology/${simId}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drug_name: compound.toLowerCase(), dose }),
          });
        } catch {
          // Fallback to WS command
          sendCommand({ type: 'apply_drug', compound, dose });
        }
      } else {
        sendCommand({ type: 'apply_drug', compound, dose });
      }
      break;
    }

    case 'optogenetic': {
      const targetNeurons = typeof block.params.targetNeurons === 'string'
        ? (block.params.targetNeurons as string).split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const intensity = ((block.params.intensity as number) ?? 50) / 100;
      const opsin = (block.params.opsin as string) ?? 'ChR2';
      // ChR2 excites (positive current), NpHR inhibits (negative current)
      const sign = opsin === 'NpHR' ? -1 : 1;
      const current = sign * intensity * 30; // Scale to reasonable current
      sendCommand({ type: 'stimulate', neuron_ids: targetNeurons, current });
      break;
    }

    case 'lesion': {
      const targets = typeof block.params.targetNeurons === 'string'
        ? (block.params.targetNeurons as string).split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      for (const id of targets) {
        sendCommand({ type: 'lesion_neuron', neuron_id: id });
      }
      break;
    }

    case 'wait':
      // No action — duration handled by the caller
      break;

    case 'measure': {
      const metric = (block.params.metric as string) ?? 'firing_rate';
      const rates = captureFiringRates();
      measurements[metric] = rates;
      break;
    }

    case 'baseline': {
      // Capture baseline firing rates over duration
      const rates = captureFiringRates();
      measurements['baseline'] = rates;
      break;
    }
  }

  return measurements;
}

export function startProtocolExecution(): void {
  _cancelled = false;
  const store = useProtocolStore.getState();
  const { blocks, nTrials, interTrialIntervalMs } = store;

  if (blocks.length === 0) return;

  store.setRunning(true);
  store.clearResults();

  const sortedBlocks = [...blocks].sort((a, b) => a.startMs - b.startMs);

  (async () => {
    for (let trial = 0; trial < nTrials; trial++) {
      if (_cancelled) break;
      useProtocolStore.getState().setCurrentTrial(trial);

      let baselineRates: number[] = [];
      let postRates: number[] = [];
      const allMeasurements: Record<string, number[]> = {};

      for (let bi = 0; bi < sortedBlocks.length; bi++) {
        if (_cancelled) break;
        const block = sortedBlocks[bi];
        useProtocolStore.getState().setCurrentBlock(bi);

        // Wait until block.startMs relative to trial start
        // For simplicity, compute delay from previous block end
        const prevEnd = bi > 0
          ? sortedBlocks[bi - 1].startMs + sortedBlocks[bi - 1].durationMs
          : 0;
        const delay = Math.max(0, block.startMs - prevEnd);
        if (delay > 0) {
          await wait(delay);
        }
        if (_cancelled) break;

        // Execute block action
        const measurements = await executeBlock(block);

        // Merge measurements
        for (const [key, values] of Object.entries(measurements)) {
          if (key === 'baseline') {
            baselineRates = values;
          } else {
            allMeasurements[key] = [...(allMeasurements[key] ?? []), ...values];
          }
        }

        // Wait for block duration
        if (block.durationMs > 0) {
          await wait(block.durationMs);
        }
        if (_cancelled) break;

        // After stimulus/drug blocks, capture post rates for comparison
        if (block.type === 'stimulus' || block.type === 'drug' || block.type === 'optogenetic') {
          postRates = captureFiringRates();
        }
      }

      if (!_cancelled) {
        useProtocolStore.getState().recordResult({
          trialIndex: trial,
          measurements: allMeasurements,
          baselineRates,
          postRates,
        });
      }

      // Inter-trial interval
      if (trial < nTrials - 1 && !_cancelled) {
        await wait(interTrialIntervalMs);
      }
    }

    useProtocolStore.getState().setRunning(false);
  })();
}

export function stopProtocolExecution(): void {
  _cancelled = true;
  for (const id of _pendingTimeouts) {
    clearTimeout(id);
  }
  _pendingTimeouts.length = 0;
  useProtocolStore.getState().setRunning(false);
}
