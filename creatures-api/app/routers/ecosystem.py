"""REST API endpoints for multi-organism ecosystem simulation."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from creatures.environment.ecosystem import Ecosystem, EcosystemConfig
from creatures.environment.sensory_world import (
    ChemicalGradient,
    SensoryWorld,
    TemperatureField,
    ToxicZone,
)

router = APIRouter(prefix="/api/ecosystem", tags=["ecosystem"])
logger = logging.getLogger(__name__)

# In-memory store of active ecosystems
ecosystems: dict[str, Ecosystem] = {}

# Timeline history: eco_id -> list of {step, time_ms, populations}
_timeline_history: dict[str, list[dict]] = {}


# --- Request / Response models ---


class EcosystemCreateRequest(BaseModel):
    arena_radius: float = 2.0
    n_food_sources: int = 10
    populations: dict[str, int] = {"c_elegans": 20, "drosophila": 5}
    predation_enabled: bool = True
    auto_start: bool = False


class AddOrganismRequest(BaseModel):
    species: str = "c_elegans"
    position: list[float] | None = None  # [x, y] or null for random
    energy: float = 100.0


class DrugRequest(BaseModel):
    species: str
    drug: str
    dose: float = 1.0


class EnvironmentalEventRequest(BaseModel):
    type: Literal["food_scarcity", "predator_surge", "mutation_burst", "climate_shift"]


class GradientRequest(BaseModel):
    name: str = "NaCl"
    source_position: list[float] = [1.0, 0.5]  # [x, y]
    peak_concentration: float = 1.0
    diffusion_radius: float = 1.5
    chemical_type: str = "attractant"  # or "repellent"


class ToxinRequest(BaseModel):
    position: list[float] = [-0.5, -0.5]  # [x, y]
    radius: float = 0.3
    damage_rate: float = 5.0
    name: str = "toxin"


class TemperatureRequest(BaseModel):
    cold_position: list[float] = [-1.5, 0.0]
    hot_position: list[float] = [1.5, 0.0]
    cold_temp: float = 15.0
    hot_temp: float = 25.0
    preferred_temp: float = 20.0


class StepResponse(BaseModel):
    time_ms: float
    steps_run: int
    events_count: int
    events: list[dict]


# --- Helper ---

_step_counters: dict[str, int] = {}


def _record_timeline(eco_id: str, eco: Ecosystem) -> None:
    """Record a timeline snapshot every 100 steps."""
    counter = _step_counters.get(eco_id, 0) + 1
    _step_counters[eco_id] = counter
    if counter % 100 == 0:
        stats = eco.get_stats()
        snapshot = {
            "step": counter,
            "time_ms": eco.time_ms,
            "populations": {
                species: info["count"]
                for species, info in stats.get("by_species", {}).items()
            },
            "total_alive": stats.get("total_alive", 0),
            "total_food_energy": stats.get("total_food_energy", 0),
        }
        _timeline_history.setdefault(eco_id, []).append(snapshot)


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
    _step_counters[eco_id] = 0
    _timeline_history[eco_id] = []

    logger.info(f"Created ecosystem {eco_id} with populations {req.populations}")
    return {"id": eco_id, "auto_start": req.auto_start, **eco.get_state()}


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
        _record_timeline(eco_id, eco)

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


# --- WebSocket streaming ---


@router.websocket("/ws/{eco_id}")
async def ecosystem_ws(websocket: WebSocket, eco_id: str):
    """Stream ecosystem state in real-time at ~10 FPS."""
    await websocket.accept()

    eco = ecosystems.get(eco_id)
    if not eco:
        await websocket.close(code=4004, reason="Ecosystem not found")
        return

    try:
        while True:
            # Step the ecosystem
            events = eco.step(1.0)
            _record_timeline(eco_id, eco)

            # Send state every 100ms (10 FPS)
            state = eco.get_state()
            state["events"] = events  # include events from this step

            await websocket.send_json(state)
            await asyncio.sleep(0.1)  # 10 FPS
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for ecosystem {eco_id}")
    except Exception as e:
        logger.error(f"WebSocket error for ecosystem {eco_id}: {e}")
        try:
            await websocket.close(code=1011, reason=str(e)[:120])
        except Exception:
            pass


# --- Population control endpoints ---


@router.post("/{eco_id}/drug")
async def apply_drug(eco_id: str, req: DrugRequest):
    """Apply a drug to all organisms of a species (conceptual — logs event)."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    affected = [
        o for o in eco.organisms.values()
        if o.alive and o.species == req.species
    ]
    if not affected:
        raise HTTPException(404, f"No alive organisms of species '{req.species}'")

    event = {
        "type": "drug_applied",
        "time_ms": eco.time_ms,
        "species": req.species,
        "drug": req.drug,
        "dose": req.dose,
        "organisms_affected": len(affected),
    }
    eco.events.append(event)
    logger.info(
        f"Drug '{req.drug}' (dose={req.dose}) applied to {len(affected)} "
        f"{req.species} in {eco_id}"
    )
    return event


@router.post("/{eco_id}/event")
async def trigger_event(eco_id: str, req: EnvironmentalEventRequest):
    """Trigger an environmental event in the ecosystem."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    event_type = req.type
    result: dict = {
        "type": f"env_{event_type}",
        "time_ms": eco.time_ms,
    }

    if event_type == "food_scarcity":
        # Remove 50% of food sources
        food_ids = list(eco.food_sources.keys())
        to_remove = food_ids[: len(food_ids) // 2]
        for fid in to_remove:
            del eco.food_sources[fid]
        result["food_removed"] = len(to_remove)
        result["food_remaining"] = len(eco.food_sources)

    elif event_type == "predator_surge":
        # Add 5 drosophila
        added = []
        for _ in range(5):
            org = eco.add_organism(species="drosophila")
            added.append(org.id)
        result["organisms_added"] = added
        result["species"] = "drosophila"

    elif event_type == "mutation_burst":
        # Increase energy of all alive organisms by 50
        count = 0
        for org in eco.organisms.values():
            if org.alive:
                org.energy += 50.0
                count += 1
        result["organisms_boosted"] = count
        result["energy_added"] = 50.0

    elif event_type == "climate_shift":
        # Move all food to one side of the arena (positive x)
        r = eco.config.arena_radius
        for food in eco.food_sources.values():
            # Shift x to positive half, keep y random-ish
            new_x = abs(food.position[0]) * 0.5 + r * 0.3
            new_x = min(new_x, r * 0.95)
            food.position = (new_x, food.position[1])
        result["food_shifted"] = len(eco.food_sources)
        result["direction"] = "positive_x"

    eco.events.append(result)
    logger.info(f"Environmental event '{event_type}' triggered in {eco_id}")
    return result


# --- Sensory world endpoints ---


def _ensure_world(eco: Ecosystem) -> SensoryWorld:
    """Lazily create a SensoryWorld if the ecosystem doesn't have one."""
    if eco.world is None:
        eco.world = SensoryWorld(arena_radius=eco.config.arena_radius)
    return eco.world


@router.post("/{eco_id}/gradient")
async def add_gradient(eco_id: str, req: GradientRequest):
    """Add a chemical gradient to the ecosystem's sensory world."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    world = _ensure_world(eco)
    gradient = ChemicalGradient(
        name=req.name,
        source_position=tuple(req.source_position),
        peak_concentration=req.peak_concentration,
        diffusion_radius=req.diffusion_radius,
        chemical_type=req.chemical_type,
    )
    world.add_gradient(gradient)
    logger.info(f"Added gradient '{req.name}' to {eco_id}")
    return {
        "name": gradient.name,
        "source_position": list(gradient.source_position),
        "peak_concentration": gradient.peak_concentration,
        "diffusion_radius": gradient.diffusion_radius,
        "chemical_type": gradient.chemical_type,
        "total_gradients": len(world.chemical_gradients),
    }


@router.post("/{eco_id}/toxin")
async def add_toxin(eco_id: str, req: ToxinRequest):
    """Add a toxic zone to the ecosystem's sensory world."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    world = _ensure_world(eco)
    zone = ToxicZone(
        position=tuple(req.position),
        radius=req.radius,
        damage_rate=req.damage_rate,
        name=req.name,
    )
    world.add_toxic_zone(zone)
    logger.info(f"Added toxic zone '{req.name}' to {eco_id}")
    return {
        "name": zone.name,
        "position": list(zone.position),
        "radius": zone.radius,
        "damage_rate": zone.damage_rate,
        "total_toxic_zones": len(world.toxic_zones),
    }


@router.post("/{eco_id}/temperature")
async def set_temperature(eco_id: str, req: TemperatureRequest):
    """Set the temperature field for the ecosystem's sensory world."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    world = _ensure_world(eco)
    field = TemperatureField(
        cold_position=tuple(req.cold_position),
        hot_position=tuple(req.hot_position),
        cold_temp=req.cold_temp,
        hot_temp=req.hot_temp,
        preferred_temp=req.preferred_temp,
    )
    world.set_temperature(field)
    logger.info(f"Set temperature field in {eco_id}: {req.cold_temp}C - {req.hot_temp}C")
    return {
        "cold_position": list(field.cold_position),
        "hot_position": list(field.hot_position),
        "cold_temp": field.cold_temp,
        "hot_temp": field.hot_temp,
        "preferred_temp": field.preferred_temp,
    }


@router.get("/{eco_id}/world")
async def get_world(eco_id: str):
    """Get the full sensory world state for visualization."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    if eco.world is None:
        return {"eco_id": eco_id, "world": None, "message": "No sensory world configured"}

    return {"eco_id": eco_id, "world": eco.world.get_state()}


# --- Timeline endpoint for dashboard ---


@router.get("/{eco_id}/timeline")
async def get_timeline(eco_id: str):
    """Return time series of population counts (sampled every 100 steps)."""
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    history = _timeline_history.get(eco_id, [])
    return {
        "eco_id": eco_id,
        "current_step": _step_counters.get(eco_id, 0),
        "sample_interval": 100,
        "snapshots": history,
    }
