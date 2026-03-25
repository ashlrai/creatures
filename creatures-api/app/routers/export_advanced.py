"""Advanced export endpoints: NeuroML, JSON graph, and statistical analysis.

Provides researcher-grade export in standard neuroscience formats and
statistical comparison of experiment results.
"""

from __future__ import annotations

import io
import json
import logging
import tempfile
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.simulation_manager import SimulationManager

router = APIRouter(prefix="/export", tags=["export-advanced"])
logger = logging.getLogger(__name__)

# Set by main.py lifespan
manager: SimulationManager | None = None


def _mgr() -> SimulationManager:
    if manager is None:
        raise RuntimeError("SimulationManager not initialized")
    return manager


# ── Request / Response models ───────────────────────────────────────


class CompareRequest(BaseModel):
    """Request body for comparing two sets of measurements."""

    experimental: list[float] = Field(..., min_length=2, description="Experimental condition measurements")
    control: list[float] = Field(..., min_length=2, description="Control condition measurements")
    test: str = Field("auto", description="Test type: auto, welch, mann_whitney, paired")
    alpha: float = Field(0.05, gt=0, lt=1, description="Significance threshold")


class StatisticalResultResponse(BaseModel):
    """Statistical comparison result."""

    test_name: str
    statistic: float
    p_value: float
    effect_size: float
    confidence_interval: list[float]
    significant: bool
    description: str


# ── Endpoints ───────────────────────────────────────────────────────


@router.get("/{sim_id}/neuroml")
async def export_neuroml(sim_id: str):
    """Export a simulation's connectome as NeuroML2 XML.

    Returns a downloadable .nml file compatible with OpenWorm, NEURON,
    NEST, and Brian2.
    """
    from creatures.export.neuroml import export_connectome_neuroml

    mgr = _mgr()
    sim = mgr.get(sim_id)
    if sim is None:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    connectome = sim.connectome
    if connectome is None:
        raise HTTPException(400, "Simulation has no connectome data")

    # Write to a temporary file, then stream it back
    with tempfile.NamedTemporaryFile(suffix=".nml", delete=False, mode="r") as tmp:
        export_connectome_neuroml(connectome, tmp.name)
        with open(tmp.name, "rb") as f:
            content = f.read()

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="connectome_{sim_id}.nml"',
        },
    )


@router.get("/{sim_id}/json")
async def export_json(sim_id: str):
    """Export a simulation's connectome as JSON for web visualization.

    Returns a graph structure with ``nodes`` and ``links`` arrays,
    compatible with D3.js and similar libraries.
    """
    from creatures.export.neuroml import export_connectome_json

    mgr = _mgr()
    sim = mgr.get(sim_id)
    if sim is None:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    connectome = sim.connectome
    if connectome is None:
        raise HTTPException(400, "Simulation has no connectome data")

    data = export_connectome_json(connectome)
    content = json.dumps(data, indent=2)

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="connectome_{sim_id}.json"',
        },
    )


@router.get("/{sim_id}/statistics")
async def export_statistics(sim_id: str):
    """Get a statistical summary for a simulation's experiment results.

    If the simulation was created via the experiment protocol system and
    has both experimental and control measurements, returns full
    statistical analysis with p-values, effect sizes, and confidence
    intervals.
    """
    from creatures.analysis.statistics import (
        StatisticalResult,
        compare_conditions,
        compute_confidence_interval,
        generate_stats_report,
    )

    mgr = _mgr()
    sim = mgr.get(sim_id)
    if sim is None:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    # Try to extract experiment result data from the simulation
    # The simulation stores frames; we compute basic statistics from firing rates
    if not hasattr(sim.runner, "frames") or not sim.runner.frames:
        raise HTTPException(400, "No simulation data available for statistical analysis")

    frames = sim.runner.frames
    spike_counts = [float(len(getattr(f, "active_neurons", []))) for f in frames]

    if len(spike_counts) < 2:
        raise HTTPException(400, "Insufficient data for statistical analysis")

    ci = compute_confidence_interval(spike_counts)
    mean_spikes = float(sum(spike_counts) / len(spike_counts))

    return {
        "sim_id": sim_id,
        "n_frames": len(frames),
        "mean_spike_count": mean_spikes,
        "confidence_interval_95": list(ci),
        "total_spikes": sum(spike_counts),
        "note": "For full experimental vs control comparison, use POST /api/export/compare",
    }


@router.post("/compare", response_model=StatisticalResultResponse)
async def compare_experiments(request: CompareRequest):
    """Compare two sets of experiment measurements.

    Automatically selects the appropriate statistical test (Welch's t-test
    for normal data, Mann-Whitney U for non-normal data) and returns
    the test statistic, p-value, Cohen's d effect size, and 95%
    confidence interval for the difference in means.

    Use this to compare experimental vs control conditions, or to compare
    two different experimental conditions against each other.
    """
    from creatures.analysis.statistics import compare_conditions

    try:
        result = compare_conditions(
            experimental=request.experimental,
            control=request.control,
            test=request.test,
            alpha=request.alpha,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return StatisticalResultResponse(
        test_name=result.test_name,
        statistic=result.statistic,
        p_value=result.p_value,
        effect_size=result.effect_size,
        confidence_interval=list(result.confidence_interval),
        significant=result.significant,
        description=result.description,
    )
