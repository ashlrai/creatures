"""God Agent endpoints — oversees evolution with analysis and interventions."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.evolution_manager import EvolutionManager

router = APIRouter(prefix="/god", tags=["god-agent"])
logger = logging.getLogger(__name__)

# Set by main.py lifespan
manager: EvolutionManager | None = None


def _mgr() -> EvolutionManager:
    if manager is None:
        raise RuntimeError("EvolutionManager not initialized")
    return manager


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Extract a field from either a dict or an object with attributes."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


class InterventionRequest(BaseModel):
    run_id: str
    intervention_type: str  # "evolution", "fitness", "diversity", "selection"
    action: str
    parameters: dict = {}


class AnalyzeRequest(BaseModel):
    run_id: str
    prompt: str | None = None


class GodReportResponse(BaseModel):
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


@router.post("/analyze", response_model=GodReportResponse)
async def analyze(req: AnalyzeRequest):
    """Trigger God Agent analysis on a running evolution.

    Uses the real God Agent instance from the evolution run if available,
    falls back to a deterministic stub otherwise.
    """
    mgr = _mgr()
    run = mgr.get_run(req.run_id)

    if run is None:
        raise HTTPException(404, f"Run {req.run_id} not found")

    report_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow().isoformat() + "Z"

    # Try to use the real God Agent from the evolution run
    if hasattr(run, 'god_agent') and run.god_agent is not None:
        god = run.god_agent
        # Feed latest stats if available
        if hasattr(run, 'history') and run.history:
            latest = run.history[-1]
            god.observe(
                latest,
                {'size': run.population_size, 'n_species': latest.get('n_species', 1)},
                {'generation': run.generation},
            )

        try:
            result = await god.analyze_and_intervene()
        except Exception as exc:
            logger.exception("God Agent analysis failed: %s", exc)
            raise HTTPException(500, f"God Agent analysis failed: {exc}") from exc

        # Extract fields uniformly whether result is a dict or dataclass
        analysis = _get(result, 'analysis', 'No analysis available')
        trend = _get(result, 'fitness_trend', 'unknown')
        interventions = _get(result, 'interventions', [])
        hypothesis = _get(result, 'hypothesis', 'No hypothesis')
        report_text = _get(result, 'report', analysis)

        # Convert intervention objects to dicts if needed
        intervention_dicts = []
        for iv in interventions:
            if isinstance(iv, dict):
                intervention_dicts.append(iv)
            else:
                intervention_dicts.append({
                    'type': getattr(iv, 'type', 'unknown'),
                    'action': getattr(iv, 'action', ''),
                    'parameters': getattr(iv, 'parameters', {}),
                    'reasoning': getattr(iv, 'reasoning', ''),
                })
    else:
        # Fallback: deterministic stub for frontend development
        analysis = (
            "Population shows moderate diversity with fitness plateauing. "
            "The dominant genome has strong motor-sensory connectivity but "
            "lacks novel inter-neuron pathways for complex behaviors."
        )
        trend = "plateauing"
        intervention_dicts = [{
            "type": "mutation_rate",
            "action": "increase",
            "parameters": {"factor": 1.5},
            "reasoning": "Increase exploration to escape local optimum.",
        }]
        hypothesis = (
            "Increasing mutation pressure will break the current fitness "
            "plateau by introducing novel neural topologies."
        )
        report_text = f"God Agent stub report for run {req.run_id}"

    report = {
        "id": report_id,
        "run_id": req.run_id,
        "timestamp": now,
        "analysis": analysis,
        "fitness_trend": trend,
        "interventions": intervention_dicts,
        "hypothesis": hypothesis,
        "report": report_text,
    }

    return GodReportResponse(**report)


@router.get("/reports/{run_id}")
async def get_reports(run_id: str):
    """Get all God Agent reports for a given evolution run."""
    mgr = _mgr()
    run = mgr.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")

    # Get reports from the run's god_reports list
    reports = getattr(run, 'god_reports', []) or []
    return reports


@router.get("/status")
async def get_status():
    """Get the current God Agent status."""
    mgr = _mgr()
    runs = mgr.list_runs()
    active_runs = [r for r in runs if r.status == 'running']

    has_god = any(hasattr(r, 'god_agent') and r.god_agent for r in active_runs)
    total = sum(len(getattr(r, 'god_reports', []) or []) for r in runs)

    latest_hypothesis = None
    for r in reversed(runs):
        reports = getattr(r, 'god_reports', []) or []
        if reports:
            latest_hypothesis = _get(reports[-1], 'hypothesis')
            break

    return {
        "active": has_god,
        "total_interventions": total,
        "current_hypothesis": latest_hypothesis,
        "active_runs": len(active_runs),
    }


@router.post("/intervene")
async def manual_intervene(req: InterventionRequest):
    """Manually apply a God Agent intervention to a running evolution."""
    mgr = _mgr()
    run = mgr.get_run(req.run_id)
    if run is None:
        raise HTTPException(404, f"Run {req.run_id} not found")

    # Find the God Agent for this run
    god = getattr(run, "god_agent", None)
    if god is None:
        god_agents = getattr(mgr, "_god_agents", {})
        god = god_agents.get(req.run_id)

    if god is None:
        raise HTTPException(400, "No God Agent for this run")

    # Build intervention dict in the format apply_interventions expects
    intervention = {
        "interventions": [
            {
                "type": req.intervention_type,
                "action": req.action,
                "parameters": req.parameters,
            }
        ]
    }

    # Gather simulation objects for the intervention
    population = getattr(run, "population", None)
    mutation_config = getattr(population, "_mutation_config", None) if population else None

    # Try to get fitness_config from the run's evolution thread context
    fitness_config = getattr(run, "fitness_config", None)

    applied = god.apply_interventions(
        intervention,
        mutation_config=mutation_config,
        fitness_config=fitness_config,
        population=population,
    )

    # Record the manual intervention
    god_event = {
        "type": "god_intervention",
        "manual": True,
        "generation": getattr(run, "generation", 0),
        "analysis": f"Manual intervention: {req.action}",
        "interventions": intervention["interventions"],
        "applied": applied,
    }
    god_reports = getattr(run, "god_reports", None)
    if god_reports is not None:
        god_reports.append(god_event)

    return {"applied": applied, "run_id": req.run_id}


# ── Discovery endpoints ──────────────────────────────────────────────

# In-memory store for discovery sessions (persists for the lifetime of
# the API process).  A production deployment would back this with a DB.
_discovery_sessions: dict[str, Any] = {}


class DiscoverRequest(BaseModel):
    organism: str = "c_elegans"
    max_hypotheses: int | None = None


class DiscoveryResponse(BaseModel):
    session_id: str
    status: str
    n_hypotheses: int
    n_discoveries: int
    report: str


class DiscoverySummary(BaseModel):
    id: str
    title: str
    significance: float
    category: str
    timestamp: str


class DiscoveryDetail(BaseModel):
    id: str
    title: str
    description: str
    significance: float
    category: str
    timestamp: str
    evidence: dict[str, Any]
    hypothesis_statement: str


@router.post("/discover", response_model=DiscoveryResponse)
async def start_discovery(req: DiscoverRequest):
    """Start an autonomous discovery session.

    Generates hypotheses about the specified organism's neural circuit,
    runs experiments, and returns a scientific report of findings.
    """
    import asyncio

    from creatures.discovery.engine import DiscoveryEngine

    session_id = str(uuid.uuid4())[:8]

    engine = DiscoveryEngine()

    # Run the CPU-heavy discovery in a thread pool so we don't block
    # the async event loop.
    loop = asyncio.get_running_loop()

    def _run() -> None:
        engine.generate_hypotheses(req.organism)
        # Optionally limit how many we test
        if req.max_hypotheses is not None:
            engine.hypotheses = engine.hypotheses[: req.max_hypotheses]
        engine.run_all()

    await loop.run_in_executor(None, _run)

    # Persist results for later retrieval
    _discovery_sessions[session_id] = engine

    report = engine.generate_report()

    return DiscoveryResponse(
        session_id=session_id,
        status="complete",
        n_hypotheses=len(engine.hypotheses),
        n_discoveries=len(engine.discoveries),
        report=report,
    )


@router.get("/discoveries", response_model=list[DiscoverySummary])
async def list_discoveries():
    """List all discoveries across all sessions."""
    all_discoveries: list[DiscoverySummary] = []
    for engine in _discovery_sessions.values():
        for d in engine.discoveries:
            all_discoveries.append(
                DiscoverySummary(
                    id=d.id,
                    title=d.title,
                    significance=d.significance,
                    category=d.hypothesis.category,
                    timestamp=d.timestamp,
                )
            )
    # Sort by significance descending
    all_discoveries.sort(key=lambda x: -x.significance)
    return all_discoveries


@router.get("/discoveries/{discovery_id}", response_model=DiscoveryDetail)
async def get_discovery(discovery_id: str):
    """Get detailed information about a specific discovery."""
    for engine in _discovery_sessions.values():
        for d in engine.discoveries:
            if d.id == discovery_id:
                return DiscoveryDetail(
                    id=d.id,
                    title=d.title,
                    description=d.description,
                    significance=d.significance,
                    category=d.hypothesis.category,
                    timestamp=d.timestamp,
                    evidence=d.evidence,
                    hypothesis_statement=d.hypothesis.statement,
                )
    raise HTTPException(404, f"Discovery {discovery_id} not found")
