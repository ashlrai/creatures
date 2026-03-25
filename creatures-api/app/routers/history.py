"""REST endpoints for browsing persisted experiment and evolution history."""

from __future__ import annotations

import json

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


# ── Shareable URLs ──────────────────────────────────────────────────


def _ensure_dict(value: object) -> object:
    """Parse a JSON string to a dict if needed, otherwise return as-is."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    return value


@router.get("/share/{experiment_id}")
async def get_shareable_experiment(experiment_id: str) -> dict:
    """Get a shareable experiment result with all data needed to display it."""
    exp = get_store().get_experiment(experiment_id)
    if exp is None:
        raise HTTPException(404, f"Experiment {experiment_id} not found")
    return {
        "id": exp["id"],
        "name": exp["name"],
        "organism": exp["organism"],
        "config": _ensure_dict(exp.get("config")),
        "results": _ensure_dict(exp.get("results")),
        "status": exp["status"],
        "share_url": f"/app#/experiment/{experiment_id}",
    }


@router.get("/evolution/{run_id}/share")
async def get_shareable_evolution(run_id: str) -> dict:
    """Get full evolution run with world_log for sharing."""
    run = get_store().get_evolution_run(run_id)
    if run is None:
        raise HTTPException(404, f"Evolution run {run_id} not found")
    return {
        "id": run["id"],
        "organism": run["organism"],
        "status": run["status"],
        "generations": run["generations"],
        "best_fitness": run["best_fitness"],
        "config": _ensure_dict(run.get("config")),
        "world_log": _ensure_dict(run.get("world_log")),
        "final_report": run.get("final_report"),
        "share_url": f"/app#/evolution/{run_id}",
    }
