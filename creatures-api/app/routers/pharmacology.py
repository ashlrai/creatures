"""REST endpoints for pharmacology / drug testing."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from creatures.neural.pharmacology import (
    DRUG_LIBRARY,
    PharmacologyEngine,
    _hill_response,
)

from app.models.schemas import (
    BatchScreenRequest,
    BatchScreenResult,
    DoseResponseCurve,
    DoseResponsePoint,
    DrugApplyRequest,
    DrugApplyResult,
    DrugInfo,
)
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
            ec50=drug.ec50,
            hill_coefficient=drug.hill_coefficient,
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
        ec50=drug.ec50,
        hill_coefficient=drug.hill_coefficient,
        description=drug.description,
    )


# ── Dose-response curves (no simulation required) ──────────────────

@router.get(
    "/drugs/{drug_name}/dose-response",
    response_model=DoseResponseCurve,
)
async def dose_response_curve(drug_name: str, points: int = 20) -> DoseResponseCurve:
    """Compute a Hill-equation dose-response curve for a drug.

    Returns an array of (dose, response, effective_scale) points suitable
    for plotting sigmoidal dose-response curves.
    """
    if drug_name not in DRUG_LIBRARY:
        raise HTTPException(404, f"Drug {drug_name!r} not found")

    drug = DRUG_LIBRARY[drug_name]
    points = max(2, min(points, 200))  # clamp to sane range
    max_dose = drug.ec50 * 4.0  # go to 4x EC50 for a full curve

    curve: list[DoseResponsePoint] = []
    for i in range(points):
        dose = (i / (points - 1)) * max_dose
        response = _hill_response(dose, drug.ec50, drug.hill_coefficient)

        if drug.weight_scale < 1.0:
            effective_scale = 1.0 - response * (1.0 - drug.weight_scale)
        else:
            effective_scale = 1.0 + response * (drug.weight_scale - 1.0)

        curve.append(DoseResponsePoint(
            dose=round(dose, 4),
            response=round(response, 4),
            effective_scale=round(effective_scale, 4),
        ))

    return DoseResponseCurve(
        drug=drug_name,
        ec50=drug.ec50,
        hill_coefficient=drug.hill_coefficient,
        curve=curve,
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


# ── Batch screening (predictive, does NOT modify simulation) ───────

def _predict_effect(drug_name: str, effective_scale: float) -> str:
    """Generate a human-readable prediction of drug effect."""
    drug = DRUG_LIBRARY[drug_name]

    if effective_scale < 0.1:
        intensity = "complete"
    elif effective_scale < 0.4:
        intensity = "strong"
    elif effective_scale < 0.7:
        intensity = "moderate"
    elif effective_scale < 0.95:
        intensity = "mild"
    else:
        if effective_scale > 2.0:
            intensity = "strong"
        elif effective_scale > 1.5:
            intensity = "moderate"
        elif effective_scale > 1.1:
            intensity = "mild"
        else:
            return "minimal effect"

    if drug.weight_scale < 1.0:
        mechanism = "inhibition block" if drug.target_nt else "global suppression"
    else:
        nt = drug.target_nt or "synaptic"
        mechanism = f"{nt} potentiation"

    return f"{intensity} {mechanism}"


@router.post("/{sim_id}/screen", response_model=dict)
async def batch_screen(sim_id: str, req: BatchScreenRequest):
    """Screen multiple drugs at multiple doses without modifying the simulation.

    Computes predicted effects using the Hill equation and the connectome's
    neurotransmitter distribution. Does NOT apply drugs to the simulation.
    """
    m = _get_manager()
    sim = m.get(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    connectome = sim.connectome

    # Count synapses per neurotransmitter type for prediction
    nt_synapse_counts: dict[str, int] = {}
    total_synapses = 0
    for nid, neuron in connectome.neurons.items():
        nt = neuron.neurotransmitter
        key = nt.upper() if nt else "__GLOBAL__"
        out_degree = sum(
            1 for edge in connectome.synapses if edge.pre_id == nid
        )
        nt_synapse_counts[key] = nt_synapse_counts.get(key, 0) + out_degree
        total_synapses += out_degree

    results: list[dict] = []
    for drug_name in req.drugs:
        if drug_name not in DRUG_LIBRARY:
            raise HTTPException(400, f"Unknown drug: {drug_name!r}")

        drug = DRUG_LIBRARY[drug_name]

        for dose in req.doses:
            response = _hill_response(dose, drug.ec50, drug.hill_coefficient)

            if drug.weight_scale < 1.0:
                effective_scale = 1.0 - response * (1.0 - drug.weight_scale)
            else:
                effective_scale = 1.0 + response * (drug.weight_scale - 1.0)

            # Estimate affected synapses from connectome NT distribution
            if drug.target_nt is not None:
                n_affected = nt_synapse_counts.get(drug.target_nt.upper(), 0)
            else:
                n_affected = total_synapses

            predicted = _predict_effect(drug_name, effective_scale)

            results.append(BatchScreenResult(
                drug=drug_name,
                dose=dose,
                response=round(response, 4),
                effective_scale=round(effective_scale, 4),
                synapses_affected=n_affected,
                predicted_effect=predicted,
            ).model_dump())

    return {"results": results}
