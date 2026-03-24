"""REST endpoints for real-time neural metrics during simulation."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.simulation_manager import SimulationManager

from creatures.neural.metrics import (
    classify_firing_pattern,
    detect_oscillations,
    network_state_summary,
    synchrony_index,
)

import numpy as np

router = APIRouter(prefix="/api/metrics", tags=["metrics"])
manager: SimulationManager | None = None


def _get_sim(sim_id: str):
    """Retrieve a simulation instance or raise 404."""
    if manager is None:
        raise HTTPException(503, "Server not ready")
    sim = manager.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    return sim


@router.get("/{sim_id}/summary")
async def get_summary(sim_id: str):
    """Network state summary: active neurons, mean rate, synchrony index."""
    sim = _get_sim(sim_id)
    engine = sim.engine

    firing_rates = engine.get_firing_rates()
    n_neurons = engine.n_neurons

    summary = network_state_summary(firing_rates, n_neurons)

    # Compute synchrony from spike history
    indices, times_ms = engine.get_spike_history()
    spike_trains: dict[str, list[float]] = {}
    neuron_ids = engine.neuron_ids
    for nid in neuron_ids:
        spike_trains[nid] = []

    id_to_idx = {nid: i for i, nid in enumerate(neuron_ids)}
    idx_to_id = {i: nid for nid, i in id_to_idx.items()}

    for idx, t in zip(indices, times_ms):
        nid = idx_to_id.get(idx)
        if nid is not None:
            spike_trains[nid].append(t)

    sync = synchrony_index(spike_trains, bin_ms=5.0)
    summary["synchrony_index"] = round(sync, 4)
    summary["n_neurons"] = n_neurons

    return summary


@router.get("/{sim_id}/oscillations")
async def get_oscillations(sim_id: str):
    """FFT analysis of recent population activity: dominant frequency and power."""
    sim = _get_sim(sim_id)
    engine = sim.engine

    # Build a firing rate history from spike data in 10ms bins
    indices, times_ms = engine.get_spike_history()
    if not times_ms:
        return {
            "peak_frequency_hz": 0.0,
            "locomotion_band_power": 0.0,
            "phase_relationships": {},
            "has_data": False,
        }

    indices_arr = np.asarray(indices)
    times_arr = np.asarray(times_ms)
    n_neurons = engine.n_neurons
    neuron_ids = engine.neuron_ids

    # Build binned rate history for FFT: 10ms bins
    bin_ms = 10.0
    t_max = float(np.max(times_arr)) if len(times_arr) > 0 else 0.0
    n_bins = max(1, int(t_max / bin_ms) + 1)

    # Use at most the last 500 bins (5 seconds) for FFT
    max_bins = 500
    start_bin = max(0, n_bins - max_bins)
    start_time = start_bin * bin_ms
    recent_mask = times_arr >= start_time

    if np.sum(recent_mask) == 0:
        return {
            "peak_frequency_hz": 0.0,
            "locomotion_band_power": 0.0,
            "phase_relationships": {},
            "has_data": False,
        }

    recent_indices = indices_arr[recent_mask]
    recent_times = times_arr[recent_mask]

    actual_bins = min(n_bins - start_bin, max_bins)
    rate_history = np.zeros((actual_bins, n_neurons))
    for idx, t in zip(recent_indices, recent_times):
        b = min(int((t - start_time) / bin_ms), actual_bins - 1)
        if 0 <= idx < n_neurons:
            rate_history[b, idx] += 1

    # Convert counts to Hz
    rate_history = rate_history / (bin_ms / 1000.0)

    result = detect_oscillations(rate_history, dt_ms=bin_ms, neuron_labels=neuron_ids)

    # Convert numpy arrays to lists for JSON serialization
    freqs, power = result["power_spectrum"]
    return {
        "peak_frequency_hz": round(result["peak_frequency_hz"], 3),
        "locomotion_band_power": round(result["locomotion_band_power"], 4),
        "phase_relationships": result["phase_relationships"],
        "frequencies": freqs.tolist() if len(freqs) > 0 else [],
        "power": power.tolist() if len(power) > 0 else [],
        "has_data": True,
    }


@router.get("/{sim_id}/firing-patterns")
async def get_firing_patterns(sim_id: str):
    """Classify each neuron's firing pattern: silent, tonic, bursting, irregular, rhythmic."""
    sim = _get_sim(sim_id)
    engine = sim.engine

    indices, times_ms = engine.get_spike_history()
    neuron_ids = engine.neuron_ids
    n_neurons = engine.n_neurons

    # Build per-neuron spike trains
    spike_trains: dict[str, list[float]] = {nid: [] for nid in neuron_ids}
    idx_to_id = {i: nid for i, nid in enumerate(neuron_ids)}
    for idx, t in zip(indices, times_ms):
        nid = idx_to_id.get(idx)
        if nid is not None:
            spike_trains[nid].append(t)

    # Determine duration from the simulation time or spike history
    duration_ms = float(max(times_ms)) if times_ms else 1.0

    patterns: dict[str, str] = {}
    pattern_counts: dict[str, int] = {
        "silent": 0, "tonic": 0, "bursting": 0, "irregular": 0, "rhythmic": 0,
    }

    for nid in neuron_ids:
        pattern = classify_firing_pattern(spike_trains[nid], duration_ms)
        patterns[nid] = pattern
        pattern_counts[pattern] = pattern_counts.get(pattern, 0) + 1

    return {
        "patterns": patterns,
        "counts": pattern_counts,
        "n_neurons": n_neurons,
        "duration_ms": round(duration_ms, 1),
    }


@router.get("/{sim_id}/top-active")
async def get_top_active(sim_id: str, n: int = Query(default=20, ge=1, le=200)):
    """Most active neurons ranked by firing rate."""
    sim = _get_sim(sim_id)
    engine = sim.engine

    firing_rates = engine.get_firing_rates()

    # Sort by rate descending
    sorted_neurons = sorted(firing_rates.items(), key=lambda x: -x[1])[:n]

    return {
        "neurons": [
            {"id": nid, "firing_rate": round(rate, 2)}
            for nid, rate in sorted_neurons
        ],
        "n_total": engine.n_neurons,
        "n_active": sum(1 for r in firing_rates.values() if r > 0.1),
    }
