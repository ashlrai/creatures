"""REST + WebSocket endpoints for evolutionary runs."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.services.evolution_manager import EvolutionManager

router = APIRouter(prefix="/evolution", tags=["evolution"])
logger = logging.getLogger(__name__)

# Set by main.py lifespan
manager: EvolutionManager | None = None


def _mgr() -> EvolutionManager:
    if manager is None:
        raise RuntimeError("EvolutionManager not initialized")
    return manager


class EvolutionCreateRequest(BaseModel):
    organism: str = "c_elegans"
    population_size: int = 50
    n_generations: int = 100
    lifetime_ms: float = 5000.0
    n_workers: int = 4
    seed: int = 42


class EvolutionRunInfo(BaseModel):
    id: str
    organism: str
    status: str
    generation: int
    n_generations: int
    population_size: int
    best_fitness: float
    mean_fitness: float
    elapsed_seconds: float


@router.post("/runs", response_model=EvolutionRunInfo)
async def create_evolution_run(req: EvolutionCreateRequest):
    """Create a new evolutionary run (loads connectome, initializes population)."""
    run = _mgr().create_run(req.model_dump())
    if run.status == "failed":
        raise HTTPException(500, f"Failed to create run: {run.error}")
    return EvolutionRunInfo(**run.to_info())


@router.get("/runs", response_model=list[EvolutionRunInfo])
async def list_runs():
    """List all evolution runs."""
    return [EvolutionRunInfo(**r.to_info()) for r in _mgr().list_runs()]


@router.get("/runs/{run_id}", response_model=EvolutionRunInfo)
async def get_run(run_id: str):
    """Get evolution run status."""
    run = _mgr().get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")
    return EvolutionRunInfo(**run.to_info())


@router.get("/runs/{run_id}/history")
async def get_history(run_id: str):
    """Get fitness history for an evolution run."""
    try:
        return _mgr().get_history(run_id)
    except KeyError:
        raise HTTPException(404, f"Run {run_id} not found")


@router.post("/runs/{run_id}/start")
async def start_run(run_id: str):
    """Start or resume an evolution run."""
    try:
        run = _mgr().start_run(run_id)
        return {"status": run.status}
    except KeyError:
        raise HTTPException(404, f"Run {run_id} not found")
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.get("/runs/{run_id}/events")
async def get_world_log(run_id: str):
    """Get narrative world_log events for an evolution run."""
    mgr = _mgr()
    run = mgr.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")
    return run.world_log.to_dict_list()


@router.post("/runs/{run_id}/pause")
async def pause_run(run_id: str):
    """Pause an evolution run."""
    try:
        run = _mgr().pause_run(run_id)
        return {"status": "pausing", "message": "Will pause after current generation"}
    except KeyError:
        raise HTTPException(404, f"Run {run_id} not found")


@router.websocket("/ws/{run_id}")
async def evolution_ws(websocket: WebSocket, run_id: str):
    """Stream evolution progress via WebSocket."""
    mgr = _mgr()
    run = mgr.get_run(run_id)
    if run is None:
        await websocket.close(code=1008, reason="Run not found")
        return

    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    mgr.subscribe(run_id, queue)

    try:
        while True:
            data = await queue.get()
            await websocket.send_json(data)
    except WebSocketDisconnect:
        pass
    finally:
        mgr.unsubscribe(run_id, queue)
