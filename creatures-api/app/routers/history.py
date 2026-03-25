"""REST endpoints for browsing persisted experiment and evolution history."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from creatures.storage.persistence import NeurevoStore

router = APIRouter(prefix="/api/history", tags=["history"])

# Injected from main.py lifespan
store: NeurevoStore | None = None


def get_store() -> NeurevoStore:
    if store is None:
        raise RuntimeError("NeurevoStore not initialized")
    return store


# ── Experiments ──────────────────────────────────────────────────────


@router.get("/experiments")
async def list_experiments(limit: int = 50) -> list[dict]:
    """List past experiments, most recent first."""
    return get_store().list_experiments(limit=limit)


@router.get("/experiments/{exp_id}")
async def get_experiment(exp_id: str) -> dict:
    """Get experiment details and results."""
    result = get_store().get_experiment(exp_id)
    if result is None:
        raise HTTPException(404, f"Experiment {exp_id} not found")
    return result


# ── Evolution Runs ───────────────────────────────────────────────────


@router.get("/evolution")
async def list_evolution_runs(limit: int = 50) -> list[dict]:
    """List past evolution runs, most recent first."""
    return get_store().list_evolution_runs(limit=limit)


@router.get("/evolution/{run_id}")
async def get_evolution_run(run_id: str) -> dict:
    """Get evolution run details including world_log."""
    result = get_store().get_evolution_run(run_id)
    if result is None:
        raise HTTPException(404, f"Evolution run {run_id} not found")
    return result


# ── Genomes ──────────────────────────────────────────────────────────


@router.get("/genomes/{genome_id}")
async def get_genome(genome_id: str) -> dict:
    """Get a specific evolved genome."""
    result = get_store().get_genome(genome_id)
    if result is None:
        raise HTTPException(404, f"Genome {genome_id} not found")
    return result
