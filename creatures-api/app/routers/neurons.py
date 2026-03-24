"""REST endpoints for neuron data (positions, types, connectivity, genes)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.services.simulation_manager import SimulationManager
from creatures.connectome.gene_expression import (
    NEURON_RECEPTORS,
    RECEPTOR_DRUG_TARGETS,
    get_neuron_receptors,
    get_drug_targets,
    find_neurons_expressing,
    get_neurons_affected_by_drug,
)

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


# ---------------------------------------------------------------------------
# Gene expression / receptor endpoints
# ---------------------------------------------------------------------------


@router.get("/genes/summary")
async def get_gene_summary():
    """Get summary of available gene expression data."""
    return {
        "neurons_with_data": len(NEURON_RECEPTORS),
        "drug_targets": len(RECEPTOR_DRUG_TARGETS),
        "neuron_ids": sorted(NEURON_RECEPTORS.keys()),
    }


@router.get("/genes/drug/{drug_name}")
async def get_drug_affected_neurons(drug_name: str):
    """Find all neurons affected by a given drug."""
    affected = get_neurons_affected_by_drug(drug_name)
    if not affected:
        raise HTTPException(404, f"No neurons found affected by drug '{drug_name}'")
    return {"drug": drug_name, "affected_neurons": affected}


@router.get("/genes/receptor/{receptor_id}")
async def get_receptor_info(receptor_id: str):
    """Get drug target info for a specific receptor gene."""
    info = get_drug_targets(receptor_id)
    expressing = find_neurons_expressing(receptor_id)
    if not info and not expressing:
        raise HTTPException(404, f"Receptor '{receptor_id}' not found")
    return {
        "receptor": receptor_id,
        "drug_target": info,
        "expressing_neurons": expressing,
    }


@router.get("/{neuron_id}/profile")
async def get_neuron_profile(neuron_id: str):
    """Get a full profile for a neuron: type, connections, graph metrics."""
    # Load the static connectome graph for connectivity data
    graph_path = Path(__file__).resolve().parents[3] / "creatures-web" / "public" / "connectome-graph.json"
    if not graph_path.exists():
        raise HTTPException(404, f"Connectome graph data not found")

    with open(graph_path) as f:
        graph = json.load(f)

    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    # Find the neuron node
    node = None
    for n in nodes:
        if n["id"] == neuron_id:
            node = n
            break
    if node is None:
        raise HTTPException(404, f"Neuron '{neuron_id}' not found in connectome")

    # Compute connections
    pre_edges = sorted(
        [e for e in edges if e["post"] == neuron_id],
        key=lambda e: e["weight"],
        reverse=True,
    )[:10]
    post_edges = sorted(
        [e for e in edges if e["pre"] == neuron_id],
        key=lambda e: e["weight"],
        reverse=True,
    )[:10]

    in_degree = sum(1 for e in edges if e["post"] == neuron_id)
    out_degree = sum(1 for e in edges if e["pre"] == neuron_id)
    total_degree = in_degree + out_degree
    max_possible = (len(nodes) - 1) * 2
    hub_score = total_degree / max_possible if max_possible > 0 else 0

    # BFS layer depth from sensory neurons
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e["pre"], []).append(e["post"])

    sensory_ids = [n["id"] for n in nodes if n.get("type") == "sensory"]
    depth_map: dict[str, int] = {}
    queue = list(sensory_ids)
    for sid in sensory_ids:
        depth_map[sid] = 0

    head = 0
    while head < len(queue):
        current = queue[head]
        head += 1
        d = depth_map[current]
        for neighbor in adj.get(current, []):
            if neighbor not in depth_map:
                depth_map[neighbor] = d + 1
                queue.append(neighbor)

    layer_depth = depth_map.get(neuron_id, -1)

    return JSONResponse({
        "id": neuron_id,
        "type": node.get("type", "unknown"),
        "neurotransmitter": node.get("nt"),
        "firing_rate": 0,  # Static endpoint — no live simulation data
        "presynaptic": [
            {"neuronId": e["pre"], "weight": e["weight"], "type": e.get("type", "chemical")}
            for e in pre_edges
        ],
        "postsynaptic": [
            {"neuronId": e["post"], "weight": e["weight"], "type": e.get("type", "chemical")}
            for e in post_edges
        ],
        "in_degree": in_degree,
        "out_degree": out_degree,
        "hub_score": round(hub_score, 6),
        "layer_depth": layer_depth,
    })


@router.get("/{neuron_id}/genes")
async def get_neuron_genes(neuron_id: str):
    """Get gene expression / receptor data for a specific neuron."""
    data = get_neuron_receptors(neuron_id)
    if not data:
        raise HTTPException(
            404,
            f"No gene expression data available for neuron '{neuron_id}'",
        )
    # Enrich with drug target info for each receptor
    drug_info = {}
    for gene in data.get("receptors", []) + data.get("ion_channels", []):
        target = get_drug_targets(gene)
        if target:
            drug_info[gene] = target
    return {
        "neuron_id": neuron_id,
        **data,
        "drug_targets": drug_info,
    }
