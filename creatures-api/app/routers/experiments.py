"""REST endpoints for experiment management."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ExperimentCreate,
    ExperimentInfo,
    LesionRequest,
    PokeRequest,
    StimulateRequest,
)
from app.services.simulation_manager import SimulationManager

router = APIRouter(prefix="/experiments", tags=["experiments"])

# Shared simulation manager (injected from main.py)
manager: SimulationManager | None = None


def get_manager() -> SimulationManager:
    if manager is None:
        raise RuntimeError("SimulationManager not initialized")
    return manager


@router.post("", response_model=ExperimentInfo)
async def create_experiment(config: ExperimentCreate) -> ExperimentInfo:
    """Create a new simulation experiment."""
    m = get_manager()
    sim = m.create(config)
    return ExperimentInfo(
        id=sim.id,
        name=sim.name,
        organism=sim.organism,
        n_neurons=sim.connectome.n_neurons,
        n_synapses=sim.connectome.n_synapses,
        status=sim.status,
        t_ms=sim.runner.t_ms,
    )


@router.get("", response_model=list[ExperimentInfo])
async def list_experiments() -> list[ExperimentInfo]:
    """List all experiments."""
    m = get_manager()
    return [
        ExperimentInfo(
            id=s.id,
            name=s.name,
            organism=s.organism,
            n_neurons=s.connectome.n_neurons,
            n_synapses=s.connectome.n_synapses,
            status=s.status,
            t_ms=s.runner.t_ms,
        )
        for s in m.list_all()
    ]


@router.get("/{sim_id}", response_model=ExperimentInfo)
async def get_experiment(sim_id: str) -> ExperimentInfo:
    """Get experiment info."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    return ExperimentInfo(
        id=sim.id,
        name=sim.name,
        organism=sim.organism,
        n_neurons=sim.connectome.n_neurons,
        n_synapses=sim.connectome.n_synapses,
        status=sim.status,
        t_ms=sim.runner.t_ms,
    )


@router.post("/{sim_id}/start")
async def start_experiment(sim_id: str, speed: float = 1.0):
    """Start or resume the simulation."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    m.start(sim, speed)
    return {"status": "running", "id": sim_id}


@router.post("/{sim_id}/pause")
async def pause_experiment(sim_id: str):
    """Pause the simulation."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    m.pause(sim)
    return {"status": "paused", "id": sim_id}


@router.post("/{sim_id}/stop")
async def stop_experiment(sim_id: str):
    """Stop the simulation."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    m.stop(sim)
    return {"status": "stopped", "id": sim_id}


@router.delete("/{sim_id}")
async def delete_experiment(sim_id: str):
    """Delete an experiment."""
    m = get_manager()
    if not m.delete(sim_id):
        raise HTTPException(404, f"Experiment {sim_id} not found")
    return {"deleted": sim_id}


@router.post("/{sim_id}/poke")
async def poke_experiment(sim_id: str, req: PokeRequest):
    """Poke a body segment."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    sim.runner.poke(req.segment, tuple(req.force))
    return {"poked": req.segment}


@router.post("/{sim_id}/stimulate")
async def stimulate_neurons(sim_id: str, req: StimulateRequest):
    """Inject current into neurons."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    for nid in req.neuron_ids:
        sim.runner.set_stimulus(nid, req.current_mV)
    return {"stimulated": req.neuron_ids}


@router.post("/{sim_id}/lesion")
async def lesion(sim_id: str, req: LesionRequest):
    """Lesion a synapse or neuron."""
    m = get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Experiment {sim_id} not found")
    if req.neuron_id:
        sim.engine.lesion_neuron(req.neuron_id)
        return {"lesioned_neuron": req.neuron_id}
    elif req.pre_id and req.post_id:
        sim.engine.lesion(req.pre_id, req.post_id)
        return {"lesioned_synapse": f"{req.pre_id} → {req.post_id}"}
    else:
        raise HTTPException(400, "Provide neuron_id or both pre_id and post_id")
