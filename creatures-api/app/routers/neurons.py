"""REST endpoints for neuron data (positions, types, connectivity)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.services.simulation_manager import SimulationManager

router = APIRouter(prefix="/neurons", tags=["neurons"])
manager: SimulationManager | None = None

# Load neuron positions (3D coordinates from OpenWorm NeuroML data)
_POSITIONS_PATH = Path(__file__).resolve().parents[3] / "data" / "openworm" / "neuron_positions.json"
_neuron_positions: dict | None = None


def _get_positions() -> dict:
    global _neuron_positions
    if _neuron_positions is None and _POSITIONS_PATH.exists():
        with open(_POSITIONS_PATH) as f:
            _neuron_positions = json.load(f)
    return _neuron_positions or {}


@router.get("/positions")
async def get_neuron_positions():
    """Get 3D positions for all C. elegans neurons (from OpenWorm NeuroML data)."""
    positions = _get_positions()
    if not positions:
        raise HTTPException(404, "Neuron position data not found")
    return positions


@router.get("/{sim_id}/info")
async def get_neuron_info(sim_id: str):
    """Get neuron metadata for a running experiment."""
    if manager is None:
        raise HTTPException(503, "Server not ready")
    sim = manager.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")

    neurons = []
    for nid, neuron in sim.connectome.neurons.items():
        rate = sim.engine._firing_rates[sim.engine._id_to_idx.get(nid, 0)]
        positions = _get_positions()
        pos = positions.get(nid)
        neurons.append({
            "id": nid,
            "type": neuron.neuron_type.value,
            "neurotransmitter": neuron.neurotransmitter,
            "firing_rate": float(rate),
            "position": pos,
        })

    return neurons
