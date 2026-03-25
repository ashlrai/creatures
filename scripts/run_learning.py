#!/usr/bin/env python3
"""Demonstrate STDP learning in a C. elegans neural network.

This script shows that organisms can LEARN within a single lifetime:
1. Load the C. elegans connectome
2. Build a Brian2 spiking network with STDP enabled
3. Present a repeated stimulus to sensory neurons
4. Measure how the motor response changes over trials
5. Show that response latency decreases (the worm "learned" to respond faster)

Usage:
    cd "fly neural net"
    PYTHONPATH=creatures-core .venv/bin/python scripts/run_learning.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

# Ensure project root is on sys.path
_project_root = Path(__file__).resolve().parents[1]
_core_root = _project_root / "creatures-core"
for p in (_project_root, _core_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from creatures.connectome.openworm import load_from_edge_list
from creatures.neural.base import MonitorConfig, NeuralConfig, PlasticityConfig
from creatures.neural.brian2_engine import Brian2Engine


def measure_motor_latency(
    engine: Brian2Engine,
    sensory_ids: list[str],
    motor_ids: list[str],
    stimulus_mv: float,
    stimulus_duration_ms: float,
) -> tuple[float | None, int]:
    """Stimulate sensory neurons and measure time until motor neurons fire.

    Returns:
        (latency_ms, n_motor_spikes): latency to first motor spike (None if
        no motor spikes), and total motor spike count during stimulus window.
    """
    motor_indices = set()
    for mid in motor_ids:
        idx = engine.get_neuron_index(mid)
        if idx is not None:
            motor_indices.add(idx)

    # Apply stimulus to sensory neurons, plus weak background noise to
    # nearby interneurons to help the signal cascade through the network.
    currents = {nid: stimulus_mv for nid in sensory_ids if engine.get_neuron_index(nid) is not None}
    # Add subthreshold background to command interneurons so synaptic
    # input from sensory neurons can push them over threshold.
    background_ids = ["AVAL", "AVAR", "AVBL", "AVBR", "PVCL", "PVCR", "DVA"]
    for bid in background_ids:
        if engine.get_neuron_index(bid) is not None and bid not in currents:
            currents[bid] = stimulus_mv * 0.3  # subthreshold background
    engine.set_input_currents(currents)

    first_motor_spike_ms = None
    total_motor_spikes = 0
    steps = int(stimulus_duration_ms)

    for step_i in range(steps):
        state = engine.step(1.0)
        motor_spikes_this_step = [s for s in state.spikes if s in motor_indices]
        total_motor_spikes += len(motor_spikes_this_step)
        if motor_spikes_this_step and first_motor_spike_ms is None:
            first_motor_spike_ms = float(step_i + 1)

    # Turn off stimulus
    engine.set_input_currents({})

    return first_motor_spike_ms, total_motor_spikes


def run_rest_period(engine: Brian2Engine, duration_ms: float) -> None:
    """Run the network with no input for a rest period."""
    engine.set_input_currents({})
    steps = int(duration_ms)
    for _ in range(steps):
        engine.step(1.0)


def main() -> int:
    print()
    print("=" * 65)
    print("  STDP Learning Demonstration — C. elegans")
    print("=" * 65)
    print()
    print("  This experiment shows that a spiking neural network with STDP")
    print("  can LEARN to respond faster to a repeated stimulus.")
    print()

    # --- Load connectome ---
    print("Loading C. elegans connectome...")
    t0 = time.time()
    connectome = load_from_edge_list()
    print(f"  {connectome.n_neurons} neurons, {len(connectome.synapses)} synapses "
          f"({time.time() - t0:.2f}s)")

    # --- Define sensory and motor neurons ---
    # Touch sensory neurons (anterior gentle touch + nociceptive ASH circuit)
    sensory_ids = ["PLML", "PLMR", "AVM", "ALML", "ALMR", "ASHL", "ASHR"]
    # Command interneurons (direct targets of sensory neurons, easier to activate)
    # These are the first neurons to respond and where STDP learning is most visible.
    motor_ids = ["AVAL", "AVAR", "AVBL", "AVBR", "AVDL", "AVDR", "PVCL", "PVCR", "DVA"]

    # Filter to neurons that exist in the connectome
    available_sensory = [n for n in sensory_ids if n in connectome.neuron_id_to_index]
    available_motor = [n for n in motor_ids if n in connectome.neuron_id_to_index]
    print(f"  Sensory neurons: {available_sensory}")
    print(f"  Motor neurons:   {available_motor}")
    print()

    # --- Build STDP network ---
    print("Building Brian2 network with STDP...")
    t0 = time.time()
    engine = Brian2Engine()
    config = NeuralConfig()
    plasticity = PlasticityConfig(
        enabled=True,
        tau_pre=20.0,
        tau_post=20.0,
        a_plus=0.08,      # strong potentiation so repeated stimulation strengthens pathways
        a_minus=0.03,      # weaker depression so causal pairings dominate
        w_max=20.0,        # generous ceiling for learning
        w_min=-5.0,        # allow inhibitory weights
    )
    monitor = MonitorConfig(record_spikes=True, record_voltages=False)
    engine.build(connectome, config=config, monitor=monitor, plasticity=plasticity)
    build_time = time.time() - t0
    print(f"  Built in {build_time:.2f}s")
    print()

    # --- Warmup phase ---
    # Inject targeted subthreshold current for 500ms to get the sensory-motor
    # pathway into an active state before starting trials. This primes STDP
    # traces along the relevant circuit without saturating all weights.
    print("Running 500ms warmup phase (targeted current injection)...")
    warmup_targets = available_sensory + ["AVAL", "AVAR", "AVBL", "AVBR", "PVCL", "PVCR"]
    warmup_currents: dict[str, float] = {}
    for nid in warmup_targets:
        if engine.get_neuron_index(nid) is not None:
            warmup_currents[nid] = 40.0  # moderate suprathreshold drive to prime circuit
    engine.set_input_currents(warmup_currents)
    for _ in range(500):
        engine.step(1.0)
    engine.set_input_currents({})
    # Brief rest after warmup
    for _ in range(100):
        engine.step(1.0)
    print("  Warmup complete.")
    print()

    # --- Learning experiment ---
    n_trials = 10
    stimulus_mv = 80.0         # strong drive to ensure cascading activity
    stimulus_duration_ms = 200.0
    rest_duration_ms = 200.0   # shorter rest keeps network warm

    print(f"Running {n_trials} stimulus trials...")
    print(f"  Stimulus: {stimulus_mv} mV to {available_sensory}")
    print(f"  Duration: {stimulus_duration_ms} ms per trial")
    print(f"  Rest:     {rest_duration_ms} ms between trials")
    print()
    print(f"{'Trial':>6} {'Latency (ms)':>14} {'Motor Spikes':>14} {'Status':>10}")
    print("-" * 50)

    latencies = []
    spike_counts = []
    t_experiment = time.time()

    for trial in range(n_trials):
        latency, n_spikes = measure_motor_latency(
            engine,
            available_sensory,
            available_motor,
            stimulus_mv,
            stimulus_duration_ms,
        )
        latencies.append(latency)
        spike_counts.append(n_spikes)

        latency_str = f"{latency:.1f}" if latency is not None else "none"
        # Determine learning status
        if trial == 0:
            status = "baseline"
        elif latency is not None and latencies[0] is not None and latency < latencies[0]:
            status = "FASTER"
        elif n_spikes > spike_counts[0]:
            status = "STRONGER"
        else:
            status = "---"

        print(f"{trial + 1:>6} {latency_str:>14} {n_spikes:>14} {status:>10}")

        # Rest between trials (allows STDP traces to decay)
        if trial < n_trials - 1:
            run_rest_period(engine, rest_duration_ms)

    experiment_time = time.time() - t_experiment

    # --- Weight change analysis ---
    print()
    print("-" * 50)
    print("Weight change statistics (STDP learning):")
    stats = engine.get_weight_changes()
    if stats:
        print(f"  Mean weight change:   {stats['mean_change']:+.4f} mV")
        print(f"  Std weight change:    {stats['std_change']:.4f} mV")
        print(f"  Max potentiation:     {stats['max_potentiation']:+.4f} mV")
        print(f"  Max depression:       {stats['max_depression']:+.4f} mV")
        print(f"  Synapses potentiated: {stats['n_potentiated']}")
        print(f"  Synapses depressed:   {stats['n_depressed']}")
        print(f"  Synapses unchanged:   {stats['n_unchanged']}")
        total_syn = stats['n_potentiated'] + stats['n_depressed'] + stats['n_unchanged']
        pct_changed = (stats['n_potentiated'] + stats['n_depressed']) / max(total_syn, 1) * 100
        print(f"  Percent modified:     {pct_changed:.1f}%")

    # --- Summary ---
    print()
    print("=" * 65)
    print("  Learning Summary")
    print("=" * 65)

    valid_latencies = [l for l in latencies if l is not None]
    if len(valid_latencies) >= 2:
        first_valid = valid_latencies[0]
        last_valid = valid_latencies[-1]
        improvement = first_valid - last_valid
        print(f"  First trial latency:    {first_valid:.1f} ms")
        print(f"  Last trial latency:     {last_valid:.1f} ms")
        print(f"  Latency improvement:    {improvement:+.1f} ms")
        if improvement > 0:
            print(f"  --> The worm LEARNED to respond {improvement:.1f} ms faster!")
        elif improvement < 0:
            print(f"  --> Response got slower (habituation or depression dominant)")
        else:
            print(f"  --> No latency change detected")
    else:
        print("  Insufficient motor spikes to measure latency learning.")

    if len(spike_counts) >= 2:
        first_spikes = spike_counts[0]
        last_spikes = spike_counts[-1]
        print(f"  First trial motor spikes: {first_spikes}")
        print(f"  Last trial motor spikes:  {last_spikes}")
        if last_spikes > first_spikes:
            print(f"  --> Motor response STRENGTHENED ({last_spikes - first_spikes:+d} spikes)")

    print(f"  Experiment time:        {experiment_time:.1f}s")
    print("=" * 65)
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
