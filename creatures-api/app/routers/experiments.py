"""REST endpoints for experiment management."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.schemas import (
    ExperimentCreate,
    ExperimentInfo,
    LesionRequest,
    PokeRequest,
    StimulateRequest,
)
from app.services.simulation_manager import SimulationManager
from creatures.experiment.protocol import (
    ExperimentProtocol,
    ExperimentRunner,
    ExperimentStep,
    PRESET_EXPERIMENTS,
)

logger = logging.getLogger(__name__)

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


# ── Structured Experiment Protocol Endpoints ────────────────────────


class StepSchema(BaseModel):
    """A single step in an experimental protocol."""

    time_ms: float
    action: str  # "stimulus", "drug", "lesion", "measure", "wait", "poke"
    parameters: dict[str, Any] = Field(default_factory=dict)
    label: str = ""


class ProtocolRunRequest(BaseModel):
    """Request to run a preset or custom protocol."""

    # Either specify a preset name...
    preset: str | None = None
    # ...or provide a full custom protocol definition
    name: str | None = None
    description: str | None = None
    organism: str = "c_elegans"
    steps: list[StepSchema] | None = None
    duration_ms: float = 10000.0
    n_repeats: int = 1
    control: bool = True


class MeasurementSchema(BaseModel):
    """A single measurement result."""

    time_ms: float
    metric: str
    value: float | dict
    label: str = ""


class ProtocolResultSchema(BaseModel):
    """Result from running an experiment protocol."""

    protocol_name: str
    description: str
    n_measurements: int
    measurements: list[MeasurementSchema]
    control_measurements: list[MeasurementSchema] | None
    summary: dict[str, Any]
    report_markdown: str


class ProtocolInfoSchema(BaseModel):
    """Info about a preset protocol."""

    name: str
    description: str
    organism: str
    duration_ms: float
    n_repeats: int
    control: bool
    n_steps: int
    steps: list[StepSchema]


@router.get("/protocols", response_model=list[ProtocolInfoSchema])
async def list_protocols() -> list[ProtocolInfoSchema]:
    """List all available preset experiment protocols."""
    result = []
    for key, proto in PRESET_EXPERIMENTS.items():
        result.append(
            ProtocolInfoSchema(
                name=proto.name,
                description=proto.description,
                organism=proto.organism,
                duration_ms=proto.duration_ms,
                n_repeats=proto.n_repeats,
                control=proto.control,
                n_steps=len(proto.steps),
                steps=[
                    StepSchema(
                        time_ms=s.time_ms,
                        action=s.action,
                        parameters=s.parameters,
                        label=s.label,
                    )
                    for s in proto.sorted_steps()
                ],
            )
        )
    return result


@router.get("/protocol/{name}", response_model=ProtocolInfoSchema)
async def get_protocol(name: str) -> ProtocolInfoSchema:
    """Get details of a specific preset protocol by name."""
    if name not in PRESET_EXPERIMENTS:
        available = ", ".join(sorted(PRESET_EXPERIMENTS.keys()))
        raise HTTPException(404, f"Protocol '{name}' not found. Available: {available}")

    proto = PRESET_EXPERIMENTS[name]
    return ProtocolInfoSchema(
        name=proto.name,
        description=proto.description,
        organism=proto.organism,
        duration_ms=proto.duration_ms,
        n_repeats=proto.n_repeats,
        control=proto.control,
        n_steps=len(proto.steps),
        steps=[
            StepSchema(
                time_ms=s.time_ms,
                action=s.action,
                parameters=s.parameters,
                label=s.label,
            )
            for s in proto.sorted_steps()
        ],
    )


@router.post("/protocol", response_model=ProtocolResultSchema)
async def run_protocol(req: ProtocolRunRequest) -> ProtocolResultSchema:
    """Run an experiment protocol (preset or custom).

    To run a preset: ``{"preset": "touch_withdrawal"}``

    To run a custom protocol: provide name, description, steps, duration_ms, etc.

    The protocol runs synchronously in a background thread to avoid blocking
    the event loop (Brian2 simulation is CPU-bound).
    """
    # Resolve the protocol
    if req.preset:
        if req.preset not in PRESET_EXPERIMENTS:
            available = ", ".join(sorted(PRESET_EXPERIMENTS.keys()))
            raise HTTPException(
                404, f"Preset '{req.preset}' not found. Available: {available}"
            )
        protocol = PRESET_EXPERIMENTS[req.preset]
    elif req.name and req.steps:
        # Build custom protocol from request
        protocol = ExperimentProtocol(
            name=req.name,
            description=req.description or "",
            organism=req.organism,
            steps=[
                ExperimentStep(
                    time_ms=s.time_ms,
                    action=s.action,
                    parameters=s.parameters,
                    label=s.label,
                )
                for s in req.steps
            ],
            duration_ms=req.duration_ms,
            n_repeats=req.n_repeats,
            control=req.control,
        )
    else:
        raise HTTPException(
            400,
            "Provide either 'preset' (name of a preset protocol) or "
            "'name' + 'steps' (custom protocol definition)",
        )

    # Run in a thread pool to avoid blocking the event loop
    # (Brian2 simulation is CPU-intensive)
    loop = asyncio.get_event_loop()
    try:
        runner = ExperimentRunner(protocol)
        result = await loop.run_in_executor(None, runner.run)
    except Exception as exc:
        logger.exception(f"Protocol execution failed: {exc}")
        raise HTTPException(500, f"Protocol execution failed: {exc}")

    # Convert to response schema
    measurements = [
        MeasurementSchema(
            time_ms=m.time_ms, metric=m.metric, value=m.value, label=m.label,
        )
        for m in result.measurements
    ]
    control = None
    if result.control_measurements is not None:
        control = [
            MeasurementSchema(
                time_ms=m.time_ms, metric=m.metric, value=m.value, label=m.label,
            )
            for m in result.control_measurements
        ]

    return ProtocolResultSchema(
        protocol_name=result.protocol.name,
        description=result.protocol.description,
        n_measurements=len(measurements),
        measurements=measurements,
        control_measurements=control,
        summary=result.summary,
        report_markdown=result.to_report(),
    )
