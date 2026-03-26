"""REST endpoints for consciousness metrics on neural simulations."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.simulation_manager import SimulationManager

import numpy as np

from creatures.neural.consciousness import (
    ConsciousnessReport,
    compute_all_consciousness_metrics,
    compute_phi,
    compute_neural_complexity,
    compute_pci,
    detect_ignition_events,
)

router = APIRouter(prefix="/api/consciousness", tags=["consciousness"])
manager: SimulationManager | None = None


def _get_sim(sim_id: str):
    if manager is None:
        raise HTTPException(503, "Server not ready")
    sim = manager.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    return sim


@router.get("/{sim_id}/report")
async def get_consciousness_report(
    sim_id: str,
    bin_ms: float = Query(default=5.0, ge=1.0, le=100.0),
    top_k: int = Query(default=30, ge=5, le=100),
):
    """Compute all four consciousness metrics for a running simulation.

    Returns Φ (IIT), ignition events (GWT), neural complexity (CN),
    and perturbational complexity index (PCI).
    """
    sim = _get_sim(sim_id)
    engine = sim.engine

    indices, times_ms = engine.get_spike_history()
    if not times_ms or len(times_ms) < 10:
        raise HTTPException(400, "Not enough spike data yet — run simulation longer")

    spike_indices = np.asarray(indices)
    spike_times = np.asarray(times_ms)
    n_neurons = engine.n_neurons
    duration_ms = float(np.max(spike_times) - np.min(spike_times)) + 1.0

    report = compute_all_consciousness_metrics(
        spike_indices, spike_times, n_neurons, duration_ms,
        bin_ms=bin_ms, top_k=top_k,
    )

    return {
        "phi": report.phi,
        "phi_details": report.phi_partition,
        "ignition_events": report.ignition_events[:20],
        "ignition_rate_per_second": report.ignition_rate,
        "neural_complexity": report.neural_complexity,
        "complexity_profile": report.complexity_profile,
        "pci": report.pci,
        "pci_details": report.pci_details,
        "summary": report.summary(),
        "n_neurons": n_neurons,
        "n_spikes": len(spike_indices),
        "duration_ms": round(duration_ms, 1),
    }


@router.get("/{sim_id}/phi")
async def get_phi(
    sim_id: str,
    bin_ms: float = Query(default=5.0, ge=1.0, le=100.0),
    top_k: int = Query(default=30, ge=5, le=100),
    n_partitions: int = Query(default=50, ge=10, le=500),
):
    """Compute Integrated Information (Φ) only."""
    sim = _get_sim(sim_id)
    engine = sim.engine
    indices, times_ms = engine.get_spike_history()

    if not times_ms:
        return {"phi": 0.0, "n_spikes": 0}

    result = compute_phi(
        np.asarray(indices), np.asarray(times_ms), engine.n_neurons,
        float(np.max(times_ms)), bin_ms=bin_ms, top_k=top_k,
        n_partitions=n_partitions,
    )
    return result


@router.get("/{sim_id}/ignition")
async def get_ignition_events(
    sim_id: str,
    threshold: float = Query(default=0.05, ge=0.001, le=0.5),
    window_ms: float = Query(default=50.0, ge=5.0, le=500.0),
):
    """Detect Global Workspace ignition events."""
    sim = _get_sim(sim_id)
    engine = sim.engine
    indices, times_ms = engine.get_spike_history()

    if not times_ms:
        return {"events": [], "rate": 0.0}

    events = detect_ignition_events(
        np.asarray(indices), np.asarray(times_ms), engine.n_neurons,
        activation_threshold=threshold, window_ms=window_ms,
    )
    duration_s = (max(times_ms) - min(times_ms)) / 1000.0
    return {
        "events": events[:50],
        "rate_per_second": len(events) / max(duration_s, 0.001),
        "n_total": len(events),
    }
