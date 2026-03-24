"""REST API endpoints for multi-organism ecosystem simulation."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from creatures.environment.ecosystem import Ecosystem, EcosystemConfig

router = APIRouter(prefix="/api/ecosystem", tags=["ecosystem"])
logger = logging.getLogger(__name__)

# In-memory store of active ecosystems
ecosystems: dict[str, Ecosystem] = {}


# --- Request / Response models ---


class EcosystemCreateRequest(BaseModel):
    arena_radius: float = 2.0
    n_food_sources: int = 10
    populations: dict[str, int] = {"c_elegans": 20, "drosophila": 5}
    predation_enabled: bool = True


class AddOrganismRequest(BaseModel):
    species: str = "c_elegans"
    position: list[float] | None = None  # [x, y] or null for random
    energy: float = 100.0


class StepResponse(BaseModel):
    time_ms: float
    steps_run: int
    events_count: int
    events: list[dict]


# --- Endpoints ---


@router.post("")
async def create_ecosystem(req: EcosystemCreateRequest):
    """Create a new ecosystem with initial populations."""
    eco_id = f"eco_{uuid.uuid4().hex[:8]}"
    config = EcosystemConfig(
        arena_radius=req.arena_radius,
        n_food_sources=req.n_food_sources,
        predation_enabled=req.predation_enabled,
    )
    eco = Ecosystem(config)
    eco.initialize(req.populations)
    ecosystems[eco_id] = eco

    logger.info(f"Created ecosystem {eco_id} with populations {req.populations}")
    return {"id": eco_id, **eco.get_state()}


@router.get("/{eco_id}")
async def get_ecosystem(eco_id: str):
    """Get full ecosystem state."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")
    return {"id": eco_id, **eco.get_state()}


@router.post("/{eco_id}/step")
async def step_ecosystem(eco_id: str, steps: int = 1):
    """Advance ecosystem by N steps (default 1)."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    if steps < 1 or steps > 10000:
        raise HTTPException(400, "steps must be between 1 and 10000")

    all_events: list[dict] = []
    for _ in range(steps):
        events = eco.step()
        all_events.extend(events)

    return StepResponse(
        time_ms=eco.time_ms,
        steps_run=steps,
        events_count=len(all_events),
        events=all_events[-50:],  # cap at last 50 events
    )


@router.post("/{eco_id}/add-organism")
async def add_organism(eco_id: str, req: AddOrganismRequest):
    """Add a new organism to an existing ecosystem."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    pos = tuple(req.position) if req.position else None
    org = eco.add_organism(species=req.species, position=pos, energy=req.energy)
    return {
        "organism_id": org.id,
        "species": org.species,
        "position": org.position,
        "energy": org.energy,
    }


@router.get("/{eco_id}/stats")
async def get_stats(eco_id: str):
    """Get population statistics for the ecosystem."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")
    return eco.get_stats()


@router.get("/{eco_id}/events")
async def get_events(eco_id: str, limit: int = 50):
    """Get recent ecosystem events."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    if limit < 1:
        limit = 1
    elif limit > 500:
        limit = 500

    return {"events": eco.events[-limit:], "total_events": len(eco.events)}
