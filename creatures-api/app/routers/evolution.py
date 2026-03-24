"""REST + WebSocket endpoints for evolutionary runs."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(prefix="/evolution", tags=["evolution"])
logger = logging.getLogger(__name__)

# In-memory evolution state (replaced by proper manager later)
_runs: dict[str, dict] = {}
_subscribers: dict[str, list[asyncio.Queue]] = {}


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
    """Create and start a new evolutionary run."""
    import uuid
    run_id = str(uuid.uuid4())[:8]

    run = {
        "id": run_id,
        "organism": req.organism,
        "status": "created",
        "generation": 0,
        "n_generations": req.n_generations,
        "population_size": req.population_size,
        "best_fitness": 0.0,
        "mean_fitness": 0.0,
        "elapsed_seconds": 0.0,
        "config": req.model_dump(),
        "history": [],
    }
    _runs[run_id] = run
    _subscribers[run_id] = []

    # TODO: Launch evolution in background process
    # For now, return the created run
    run["status"] = "ready"

    return EvolutionRunInfo(**{k: v for k, v in run.items() if k in EvolutionRunInfo.model_fields})


@router.get("/runs", response_model=list[EvolutionRunInfo])
async def list_runs():
    """List all evolution runs."""
    return [
        EvolutionRunInfo(**{k: v for k, v in r.items() if k in EvolutionRunInfo.model_fields})
        for r in _runs.values()
    ]


@router.get("/runs/{run_id}", response_model=EvolutionRunInfo)
async def get_run(run_id: str):
    """Get evolution run status."""
    if run_id not in _runs:
        raise HTTPException(404, f"Run {run_id} not found")
    r = _runs[run_id]
    return EvolutionRunInfo(**{k: v for k, v in r.items() if k in EvolutionRunInfo.model_fields})


@router.get("/runs/{run_id}/history")
async def get_history(run_id: str):
    """Get fitness history for an evolution run."""
    if run_id not in _runs:
        raise HTTPException(404, f"Run {run_id} not found")
    return _runs[run_id].get("history", [])


@router.post("/runs/{run_id}/start")
async def start_run(run_id: str):
    """Start or resume an evolution run."""
    if run_id not in _runs:
        raise HTTPException(404, f"Run {run_id} not found")
    _runs[run_id]["status"] = "running"
    return {"status": "running"}


@router.post("/runs/{run_id}/pause")
async def pause_run(run_id: str):
    """Pause an evolution run."""
    if run_id not in _runs:
        raise HTTPException(404, f"Run {run_id} not found")
    _runs[run_id]["status"] = "paused"
    return {"status": "paused"}


@router.websocket("/ws/{run_id}")
async def evolution_ws(websocket: WebSocket, run_id: str):
    """Stream evolution progress via WebSocket."""
    if run_id not in _runs:
        await websocket.close(code=1008, reason="Run not found")
        return

    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    _subscribers.setdefault(run_id, []).append(queue)

    try:
        while True:
            data = await queue.get()
            await websocket.send_json(data)
    except WebSocketDisconnect:
        pass
    finally:
        if run_id in _subscribers:
            _subscribers[run_id] = [q for q in _subscribers[run_id] if q is not queue]
