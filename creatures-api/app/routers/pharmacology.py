"""REST endpoints for pharmacology / drug testing."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from creatures.neural.pharmacology import DRUG_LIBRARY, PharmacologyEngine

from app.models.schemas import DrugApplyRequest, DrugApplyResult, DrugInfo
from app.services.simulation_manager import SimulationManager

router = APIRouter(prefix="/api/pharmacology", tags=["pharmacology"])

# Shared simulation manager (injected from main.py)
manager: SimulationManager | None = None


def _get_manager() -> SimulationManager:
    if manager is None:
        raise RuntimeError("SimulationManager not initialized")
    return manager


def _get_pharma(sim_id: str) -> PharmacologyEngine:
    """Look up a simulation and return its PharmacologyEngine (lazy-create)."""
    m = _get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    if sim.pharma_engine is None:
        sim.pharma_engine = PharmacologyEngine(sim.engine, sim.connectome)
    return sim.pharma_engine


# ── Drug catalogue (no simulation required) ─────────────────────────

@router.get("/drugs", response_model=list[DrugInfo])
async def list_drugs() -> list[DrugInfo]:
    """List all available drugs from the library."""
    return [
        DrugInfo(
            key=key,
            name=drug.name,
            target_nt=drug.target_nt,
            target_type=drug.target_type,
            weight_scale=drug.weight_scale,
            current_injection=drug.current_injection,
            description=drug.description,
        )
        for key, drug in sorted(DRUG_LIBRARY.items())
    ]


@router.get("/drugs/{drug_name}", response_model=DrugInfo)
async def get_drug(drug_name: str) -> DrugInfo:
    """Get info about a specific drug."""
    if drug_name not in DRUG_LIBRARY:
        raise HTTPException(404, f"Drug {drug_name!r} not found")
    drug = DRUG_LIBRARY[drug_name]
    return DrugInfo(
        key=drug_name,
        name=drug.name,
        target_nt=drug.target_nt,
        target_type=drug.target_type,
        weight_scale=drug.weight_scale,
        current_injection=drug.current_injection,
        description=drug.description,
    )


# ── Per-simulation drug application ─────────────────────────────────

@router.post("/{sim_id}/apply", response_model=DrugApplyResult)
async def apply_drug(sim_id: str, req: DrugApplyRequest) -> DrugApplyResult:
    """Apply a drug to a running simulation."""
    pharma = _get_pharma(sim_id)
    try:
        result = pharma.apply_drug(req.drug_name, req.dose)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    return DrugApplyResult(**result)


@router.delete("/{sim_id}/reset")
async def reset_drugs(sim_id: str):
    """Reset all drug effects on a simulation."""
    pharma = _get_pharma(sim_id)
    pharma.reset()
    return {"reset": True, "sim_id": sim_id}


@router.get("/{sim_id}/active")
async def active_drugs(sim_id: str):
    """List currently active drugs on a simulation."""
    pharma = _get_pharma(sim_id)
    return [
        {"drug": name, "dose": dose}
        for name, dose in pharma.applied_drugs
    ]
