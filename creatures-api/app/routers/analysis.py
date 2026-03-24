"""REST endpoints for connectome circuit analysis."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.simulation_manager import SimulationManager
from creatures.connectome.analysis import (
    circuit_motifs,
    community_detection,
    hub_neurons,
    information_bottleneck,
    layer_analysis,
    neuron_profile,
    shortest_path,
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])
manager: SimulationManager | None = None


def _get_connectome(sim_id: str):
    """Retrieve connectome from a running simulation."""
    if manager is None:
        raise HTTPException(503, "Server not ready")
    sim = manager.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    return sim.connectome


@router.get("/{sim_id}/shortest-path")
async def get_shortest_path(
    sim_id: str,
    source: str = Query(..., description="Source neuron ID"),
    target: str = Query(..., description="Target neuron ID"),
):
    """Find shortest path between two neurons via BFS."""
    connectome = _get_connectome(sim_id)
    path = shortest_path(connectome, source, target)
    if path is None:
        raise HTTPException(404, f"No path found from {source} to {target}")
    return {"source": source, "target": target, "path": path, "length": len(path) - 1}


@router.get("/{sim_id}/hubs")
async def get_hub_neurons(
    sim_id: str,
    top_n: int = Query(10, ge=1, le=100, description="Number of top hub neurons"),
):
    """Find the most connected hub neurons by total degree."""
    connectome = _get_connectome(sim_id)
    return {"hubs": hub_neurons(connectome, top_n=top_n)}


@router.get("/{sim_id}/communities")
async def get_communities(
    sim_id: str,
    n: int = Query(5, ge=2, le=50, description="Number of communities"),
):
    """Detect neuron communities via spectral clustering."""
    connectome = _get_connectome(sim_id)
    communities = community_detection(connectome, n_communities=n)
    # Group neurons by community for a cleaner response
    groups: dict[int, list[str]] = {}
    for nid, cid in communities.items():
        groups.setdefault(cid, []).append(nid)
    return {
        "n_communities": n,
        "assignments": communities,
        "groups": {str(k): v for k, v in sorted(groups.items())},
    }


@router.get("/{sim_id}/motifs")
async def get_motifs(sim_id: str):
    """Count common 3-node circuit motifs."""
    connectome = _get_connectome(sim_id)
    return {"motifs": circuit_motifs(connectome)}


@router.get("/{sim_id}/neuron/{neuron_id}")
async def get_neuron_profile(sim_id: str, neuron_id: str):
    """Get full connectivity profile for a single neuron."""
    connectome = _get_connectome(sim_id)
    try:
        return neuron_profile(connectome, neuron_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{sim_id}/layers")
async def get_layers(sim_id: str):
    """Analyze sensory->inter->motor layer structure."""
    connectome = _get_connectome(sim_id)
    return layer_analysis(connectome)


@router.get("/{sim_id}/bottlenecks")
async def get_bottlenecks(sim_id: str):
    """Find critical information bottleneck neurons."""
    connectome = _get_connectome(sim_id)
    bottlenecks = information_bottleneck(connectome)
    return {"bottlenecks": bottlenecks, "count": len(bottlenecks)}
