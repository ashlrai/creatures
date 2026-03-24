"""God Agent endpoints — oversees evolution with high-level analysis and interventions."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/god", tags=["god-agent"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory store (will be replaced by a real persistence layer later)
# ---------------------------------------------------------------------------

_status: dict[str, Any] = {
    "active": False,
    "last_intervention_at": None,
    "total_interventions": 0,
    "current_hypothesis": None,
}

_reports: dict[str, list[dict[str, Any]]] = {}  # run_id -> list of reports


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    run_id: str
    prompt: str | None = None  # optional user question for the God Agent


class InterventionAction(BaseModel):
    type: str
    action: str
    parameters: dict[str, Any] = {}
    reasoning: str = ""


class InterveneRequest(BaseModel):
    run_id: str
    interventions: list[InterventionAction]


class GodReport(BaseModel):
    id: str
    run_id: str
    timestamp: str
    analysis: str
    fitness_trend: str
    interventions: list[dict[str, Any]]
    hypothesis: str
    report: str


class GodStatus(BaseModel):
    active: bool
    last_intervention_at: str | None
    total_interventions: int
    current_hypothesis: str | None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=GodReport)
async def analyze(req: AnalyzeRequest):
    """Manually trigger God Agent analysis on a running evolution.

    In a full implementation this would call an LLM to inspect the
    evolutionary run's fitness curve, population diversity, and genome
    statistics, then return a structured report with optional
    intervention suggestions.  For now we return a deterministic stub
    so the frontend can be developed against a stable contract.
    """
    report_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow().isoformat() + "Z"

    report: dict[str, Any] = {
        "id": report_id,
        "run_id": req.run_id,
        "timestamp": now,
        "analysis": (
            "Population shows moderate diversity with fitness plateauing over "
            "the last 5 generations.  Speciation rate is healthy but the top "
            "performer's genome has become dominant, reducing exploration."
        ),
        "fitness_trend": "plateauing",
        "interventions": [
            {
                "type": "mutation_rate",
                "action": "increase",
                "parameters": {"factor": 1.5},
                "reasoning": "Increase exploration to escape local optimum.",
            }
        ],
        "hypothesis": (
            "Increasing mutation pressure will break the current fitness "
            "plateau by introducing novel neural topologies."
        ),
        "report": (
            f"God Agent report #{report_id} — Run {req.run_id}\n"
            f"Timestamp: {now}\n\n"
            "Summary: fitness trend is plateauing.  Recommend increasing "
            "mutation rate by 1.5x to promote exploration."
        ),
    }

    _reports.setdefault(req.run_id, []).append(report)
    _status["active"] = True
    _status["current_hypothesis"] = report["hypothesis"]

    return GodReport(**report)


@router.get("/reports/{run_id}", response_model=list[GodReport])
async def get_reports(run_id: str):
    """Get all God Agent reports for a given evolution run."""
    reports = _reports.get(run_id, [])
    return [GodReport(**r) for r in reports]


@router.post("/intervene")
async def intervene(req: InterveneRequest):
    """Manually apply specific interventions to a running evolution.

    In production this would forward each intervention to the
    EvolutionManager so it can adjust parameters mid-run.
    """
    now = datetime.utcnow().isoformat() + "Z"
    applied: list[dict[str, Any]] = []

    for action in req.interventions:
        entry = {
            "type": action.type,
            "action": action.action,
            "parameters": action.parameters,
            "reasoning": action.reasoning,
            "applied_at": now,
        }
        applied.append(entry)
        logger.info("God Agent intervention applied: %s", entry)

    _status["last_intervention_at"] = now
    _status["total_interventions"] += len(applied)

    return {
        "status": "applied",
        "count": len(applied),
        "interventions": applied,
    }


@router.get("/status", response_model=GodStatus)
async def get_status():
    """Get the current God Agent status."""
    return GodStatus(**_status)
