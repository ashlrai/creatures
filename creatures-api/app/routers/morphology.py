"""REST endpoints for neuron morphology mesh data."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/morphology", tags=["morphology"])

_POSITIONS_PATH = Path(__file__).resolve().parents[3] / "data" / "openworm" / "neuron_positions.json"


@router.get("/connectome-graph")
async def get_connectome_graph():
    """Get a simplified connectome graph for 3D visualization.

    Returns neurons as nodes with 3D positions and synapses as edges.
    Positions are from real OpenWorm NeuroML anatomical data, scaled
    to match the MuJoCo body coordinate system.
    """
    if not _POSITIONS_PATH.exists():
        raise HTTPException(404, "Neuron position data not found")

    with open(_POSITIONS_PATH) as f:
        raw_positions = json.load(f)

    # Load connectome for edge data
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "creatures-core"))
    from creatures.connectome.openworm import load

    connectome = load("edge_list")

    # Scale positions to match MuJoCo body (x=0 to x=0.88)
    y_min, y_max = -320, 420
    body_start, body_end = 0.0, 0.88

    nodes = []
    for nid, neuron in connectome.neurons.items():
        pos = raw_positions.get(nid)
        if not pos:
            continue
        nx, ny, nz = pos
        body_frac = (ny - y_min) / (y_max - y_min)
        x = body_start + body_frac * (body_end - body_start)
        y = nz * 0.0003 + 0.015
        z = -nx * 0.0003

        nodes.append({
            "id": nid,
            "type": neuron.neuron_type.value,
            "nt": neuron.neurotransmitter,
            "x": round(x, 5),
            "y": round(y, 5),
            "z": round(z, 5),
        })

    # Top connections (by weight) for visualization
    edges = []
    for syn in sorted(connectome.synapses, key=lambda s: -s.weight)[:500]:
        if syn.pre_id in raw_positions and syn.post_id in raw_positions:
            edges.append({
                "pre": syn.pre_id,
                "post": syn.post_id,
                "weight": syn.weight,
                "type": syn.synapse_type.value,
            })

    return {
        "nodes": nodes,
        "edges": edges,
        "n_neurons": len(nodes),
        "n_edges": len(edges),
    }
