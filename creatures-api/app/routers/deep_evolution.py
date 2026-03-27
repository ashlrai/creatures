"""Deep Evolution API — long-running evolution experiments."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/deep-evolution", tags=["deep-evolution"])

# Lazy-init runner (shared singleton)
_runner = None

def _get_runner():
    global _runner
    if _runner is None:
        from app.services.deep_evolution import DeepEvolutionRunner
        _runner = DeepEvolutionRunner()
    return _runner


class StartRunRequest(BaseModel):
    n_organisms: int = 5000
    neurons_per: int = 100
    world_type: str = "pond"
    target_generations: int = 1000
    snapshot_interval: int = 50
    enable_stdp: bool = True
    mutation_sigma: float = 0.02


@router.post("/start")
async def start_run(req: StartRunRequest):
    """Start a new deep evolution run."""
    runner = _get_runner()
    run_id = await runner.start_run(
        n_organisms=req.n_organisms,
        neurons_per=req.neurons_per,
        world_type=req.world_type,
        target_generations=req.target_generations,
        snapshot_interval=req.snapshot_interval,
        enable_stdp=req.enable_stdp,
        mutation_sigma=req.mutation_sigma,
    )
    return {"run_id": run_id, "status": "running"}


@router.get("/runs")
async def list_runs():
    """List all deep evolution runs."""
    runner = _get_runner()
    return {"runs": runner.list_runs()}


@router.get("/{run_id}")
async def get_run_status(run_id: str):
    """Get status of a deep evolution run."""
    runner = _get_runner()
    status = runner.get_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Run not found")
    return status


@router.get("/{run_id}/snapshots")
async def get_snapshots(run_id: str):
    """Get all snapshots from a deep evolution run."""
    runner = _get_runner()
    snapshots = runner.get_snapshots(run_id)
    return {"run_id": run_id, "snapshots": snapshots}


@router.get("/{run_id}/timeline")
async def get_timeline(run_id: str):
    """Get evolution timeline data for graphing."""
    runner = _get_runner()
    snapshots = runner.get_snapshots(run_id)
    timeline = []
    for s in snapshots:
        pop = s.get("population", {})
        timeline.append({
            "generation": s.get("generation", 0),
            "step": s.get("step", 0),
            "alive": pop.get("alive", 0),
            "max_generation": pop.get("max_generation", 0),
            "n_lineages": pop.get("n_lineages", 0),
            "mean_energy": pop.get("mean_energy", 0),
            "mean_lifetime_food": pop.get("mean_lifetime_food", 0),
            "emergent_behaviors": s.get("emergent_behaviors", []),
        })
    return {"run_id": run_id, "timeline": timeline}


@router.post("/{run_id}/stop")
async def stop_run(run_id: str):
    """Stop a running deep evolution experiment."""
    runner = _get_runner()
    stopped = await runner.stop_run(run_id)
    if not stopped:
        raise HTTPException(status_code=400, detail="Run not found or not running")
    return {"run_id": run_id, "status": "stopped"}
