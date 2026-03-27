"""REST API endpoints for multi-organism ecosystem simulation."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

import numpy as np

from creatures.environment.brain_world import BrainWorld
from creatures.environment.ecosystem import Ecosystem, EcosystemConfig
from creatures.environment.emergent_detector import EmergentBehaviorDetector
from creatures.god.agent import GodAgent, GodConfig
from creatures.god.ecosystem_integration import apply_all_interventions
from creatures.environment.sensory_world import (
    ChemicalGradient,
    SensoryWorld,
    TemperatureField,
    ToxicZone,
)
from creatures.environment.worlds import (
    AbstractWorld,
    LabPlateWorld,
    PondWorld,
    SoilWorld,
)

router = APIRouter(prefix="/api/ecosystem", tags=["ecosystem"])
logger = logging.getLogger(__name__)

# In-memory store of active ecosystems
ecosystems: dict[str, Ecosystem] = {}

# In-memory store of massive brain-worlds
_brain_worlds: dict[str, BrainWorld] = {}
_brain_world_detectors: dict[str, EmergentBehaviorDetector] = {}
_brain_world_emergent: dict[str, list[dict]] = {}

# God Agent per brain-world + narrative log
_brain_world_god: dict[str, GodAgent] = {}
_brain_world_narratives: dict[str, list[dict]] = {}

# Active auto-run tasks and subscriber sets for massive brain-worlds
_brain_world_tasks: dict[str, asyncio.Task] = {}
_brain_world_subscribers: dict[str, dict[str, WebSocket]] = {}

# Speed multiplier per brain-world (1.0 = real-time)
_brain_world_speed: dict[str, float] = {}

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


class MassiveCreateRequest(BaseModel):
    n_organisms: int = 10_000
    neurons_per: int = 100
    world_type: str = "soil"
    arena_size: float = 50.0
    neuron_model: str = "lif"  # "lif" or "izhikevich"
    use_gpu: bool = True
    enable_stdp: bool = False
    enable_consciousness: bool = False
    consciousness_interval: int = 500


class WorldRequest(BaseModel):
    type: Literal["soil", "pond", "lab_plate", "abstract"] = "soil"
    challenge: str | None = None  # for abstract world: "maze", "foraging", "memory", "social"
    size: float | None = None  # optional size override


class UpgradeBrainResponse(BaseModel):
    organism_id: str
    species: str
    n_neurons: int
    n_synapses: int
    active_neurons: int
    sensor_groups: list[str]
    motor_groups: list[str]


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


@router.post("/{eco_id}/upgrade-brain/{organism_id}")
async def upgrade_brain(eco_id: str, organism_id: str, species: str = "c_elegans"):
    """Upgrade a specific organism to have a real spiking neural network brain.

    This replaces the organism's simple gradient-following movement rules with
    a 299-neuron Brian2 simulation of the C. elegans connectome. Sensory
    inputs from the environment are injected into biologically identified
    sensory neurons, and motor neuron firing rates drive movement.

    Returns:
        Neural stats including neuron/synapse counts and sensor/motor mappings.
    """
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    if organism_id not in eco.organisms:
        raise HTTPException(404, f"Organism {organism_id} not found in ecosystem {eco_id}")

    if not eco.organisms[organism_id].alive:
        raise HTTPException(400, f"Organism {organism_id} is dead")

    if organism_id in eco.neural_organisms:
        raise HTTPException(400, f"Organism {organism_id} already has a neural brain")

    try:
        neural_org = eco.add_neural_organism(organism_id, species=species)
    except Exception as e:
        logger.error(f"Failed to upgrade brain for {organism_id}: {e}")
        raise HTTPException(500, f"Failed to build neural network: {str(e)[:200]}")

    stats = neural_org.get_neural_stats()
    logger.info(f"Upgraded {organism_id} in {eco_id}: {stats['n_neurons']} neurons")
    return UpgradeBrainResponse(**stats)


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


@router.post("/{eco_id}/world")
async def set_world(eco_id: str, req: WorldRequest):
    """Set the world type for an ecosystem.

    Replaces any existing sensory world with a specialized environment.
    Supported types: soil, pond, lab_plate, abstract.
    """
    eco = ecosystems.get(eco_id)
    if eco is None:
        raise HTTPException(404, f"Ecosystem {eco_id} not found")

    world_type = req.type
    if world_type == "soil":
        size = req.size or 10.0
        world = SoilWorld(size=size)
    elif world_type == "pond":
        world = PondWorld()
    elif world_type == "lab_plate":
        world = LabPlateWorld()
    elif world_type == "abstract":
        challenge = req.challenge or "maze"
        if challenge not in ("maze", "foraging", "memory", "social"):
            raise HTTPException(
                400, f"Unknown challenge '{challenge}'. "
                     f"Options: maze, foraging, memory, social"
            )
        size = req.size or 10.0
        world = AbstractWorld(challenge=challenge, size=size)
    else:
        raise HTTPException(400, f"Unknown world type '{world_type}'")

    # Attach the specialized world -- it quacks like SensoryWorld
    # (has sense_at, step, get_state) so the ecosystem can use it
    eco.world = world  # type: ignore[assignment]
    logger.info(f"Set world type '{world_type}' for ecosystem {eco_id}")

    return {
        "eco_id": eco_id,
        "world_type": world_type,
        "world": world.get_state(),
    }


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


# ======================================================================
# Massive brain-world endpoints
# ======================================================================


@router.post("/massive")
async def create_massive(req: MassiveCreateRequest):
    """Create a massive brain-world: every organism has a spiking neural brain."""
    bw_id = f"bw_{uuid.uuid4().hex[:8]}"

    if req.n_organisms < 1 or req.n_organisms > 500_000:
        raise HTTPException(400, "n_organisms must be between 1 and 500,000")
    if req.neurons_per < 10 or req.neurons_per > 1000:
        raise HTTPException(400, "neurons_per must be between 10 and 1,000")

    try:
        bw = BrainWorld(
            n_organisms=req.n_organisms,
            neurons_per_organism=req.neurons_per,
            arena_size=req.arena_size,
            world_type=req.world_type,
            use_gpu=req.use_gpu,
            neuron_model=req.neuron_model,
            enable_stdp=req.enable_stdp,
            enable_consciousness=req.enable_consciousness,
            consciousness_interval=req.consciousness_interval,
        )
    except Exception as e:
        logger.error(f"Failed to create brain-world: {e}")
        raise HTTPException(500, f"Failed to create brain-world: {str(e)[:200]}")

    _brain_worlds[bw_id] = bw
    arena_area = req.arena_size * req.arena_size
    _brain_world_detectors[bw_id] = EmergentBehaviorDetector(
        history_window=500, arena_area=arena_area
    )
    _brain_world_emergent[bw_id] = []

    logger.info(
        f"Created brain-world {bw_id}: {req.n_organisms} organisms x "
        f"{req.neurons_per} neurons = {bw.engine.n_total} total"
    )

    return {
        "id": bw_id,
        "n_organisms": req.n_organisms,
        "neurons_per": req.neurons_per,
        "total_neurons": bw.engine.n_total,
        "total_synapses": bw.engine.n_synapses,
        "world_type": req.world_type,
        "backend": bw.engine._backend,
        "neuron_model": bw.engine._neuron_model.value,
        "stdp_enabled": bw.engine.enable_stdp,
        "consciousness_enabled": bw._enable_consciousness,
    }


@router.post("/massive/{bw_id}/step")
async def step_massive(bw_id: str, steps: int = 1):
    """Advance a massive brain-world by N steps."""
    bw = _brain_worlds.get(bw_id)
    if bw is None:
        raise HTTPException(404, f"Brain-world {bw_id} not found")

    if steps < 1 or steps > 100_000:
        raise HTTPException(400, "steps must be between 1 and 100,000")

    detector = _brain_world_detectors.get(bw_id)
    emergent_log = _brain_world_emergent.setdefault(bw_id, [])

    last_stats = {}
    new_emergent: list[dict] = []
    for i in range(1, steps + 1):
        last_stats = bw.step(dt=1.0)

        # Run emergent detection every 100 steps
        if detector and i % 100 == 0:
            state = bw.get_emergent_state()
            events = detector.observe(state)
            if events:
                new_emergent.extend(events)
                emergent_log.extend(events)

    return {
        "id": bw_id,
        "steps_run": steps,
        "stats": last_stats,
        "new_emergent_behaviors": len(new_emergent),
    }


@router.get("/massive/{bw_id}")
async def get_massive(bw_id: str):
    """Get massive brain-world state (subsampled for visualization)."""
    bw = _brain_worlds.get(bw_id)
    if bw is None:
        raise HTTPException(404, f"Brain-world {bw_id} not found")

    return {"id": bw_id, **bw.get_state()}


@router.get("/massive/{bw_id}/emergent")
async def get_massive_emergent(bw_id: str):
    """Get detected emergent behaviors for a massive brain-world."""
    if bw_id not in _brain_worlds:
        raise HTTPException(404, f"Brain-world {bw_id} not found")

    events = _brain_world_emergent.get(bw_id, [])
    return {
        "id": bw_id,
        "total_events": len(events),
        "events": events[-100:],  # most recent 100
    }


# ======================================================================
# Massive brain-world auto-run loop + WebSocket
# ======================================================================


async def _massive_run_loop(bw_id: str) -> None:
    """Background loop: steps BrainWorld continuously, broadcasts state,
    runs emergent detection every 100 steps, and God Agent every 500 steps."""
    bw = _brain_worlds.get(bw_id)
    if bw is None:
        return

    detector = _brain_world_detectors.get(bw_id)
    emergent_log = _brain_world_emergent.setdefault(bw_id, [])
    narrative_log = _brain_world_narratives.setdefault(bw_id, [])

    # Lazily create God Agent for this brain-world (heuristic fallback —
    # no LLM key required)
    if bw_id not in _brain_world_god:
        _brain_world_god[bw_id] = GodAgent(
            config=GodConfig(provider="auto"),
            run_id=bw_id,
        )
    god = _brain_world_god[bw_id]

    step_count = 0
    pending_events: list[dict] = []
    pending_narratives: list[dict] = []

    try:
        while True:
            # Read current speed multiplier
            speed = _brain_world_speed.get(bw_id, 1.0)
            batch_size = max(1, int(10 * speed))  # 10 steps at 1x, 100 at 10x

            for _ in range(batch_size):
                # Step the brain-world
                bw.step(dt=1.0)
                step_count += 1

                # --- Emergent detection every 100 steps ---
                if detector and step_count % 100 == 0:
                    state = bw.get_emergent_state()
                    events = detector.observe(state)
                    if events:
                        pending_events.extend(events)
                        emergent_log.extend(events)

                # --- God Agent analysis every 500 steps ---
                if step_count % 500 == 0:
                    eco = bw.ecosystem
                    n_alive = int(eco.alive.sum())
                    mean_energy = (
                        float(eco.energy[eco.alive].mean()) if n_alive > 0 else 0.0
                    )

                    # Get rich population stats
                    pop_stats = bw.get_population_stats() if hasattr(bw, 'get_population_stats') else {}

                    # Emergent behaviors
                    recent_events = pending_events[-5:] if pending_events else []
                    event_descriptions = [str(e.get('description', e.get('behavior_type', ''))) for e in recent_events]

                    god.observe(
                        generation_stats={
                            "step": step_count,
                            "best_fitness": pop_stats.get("mean_lifetime_food", 0),
                            "mean_fitness": pop_stats.get("mean_energy", 0),
                            "std_fitness": 0,
                            "max_generation": pop_stats.get("max_generation", 0),
                            "n_lineages": pop_stats.get("n_lineages", 0),
                            "mean_age": pop_stats.get("mean_age", 0),
                        },
                        population_summary={
                            "total_alive": pop_stats.get("alive", n_alive),
                            "births_total": eco._total_born,
                            "deaths_total": eco._total_died,
                            **pop_stats.get("species_counts", {}),
                        },
                        environment_state={
                            "arena_size": eco.arena_size,
                            "food_alive": int(eco.food_alive.sum()),
                            "emergent_behaviors": event_descriptions,
                        },
                    )

                    report = await god.analyze_and_intervene()

                    # Apply interventions to the ecosystem
                    descriptions = apply_all_interventions(eco, report)

                    narrative_entry = {
                        "step": step_count,
                        "analysis": report.get("analysis", ""),
                        "interventions_applied": descriptions,
                        "hypothesis": report.get("hypothesis", ""),
                    }
                    pending_narratives.append(narrative_entry)
                    narrative_log.append(narrative_entry)
                    # Cap narrative log
                    if len(narrative_log) > 200:
                        del narrative_log[:len(narrative_log) - 200]

            # --- Broadcast to subscribers every 10 steps ---
            if step_count % 10 == 0:
                subscribers = _brain_world_subscribers.get(bw_id, {})
                if subscribers:
                    state_data = bw.get_state()
                    # Get rich population stats
                    pop_stats = bw.get_population_stats() if hasattr(bw, 'get_population_stats') else {}

                    # Add food positions (capped at 300 for performance)
                    eco = bw.ecosystem
                    food_data = []
                    alive_food = np.where(eco.food_alive)[0]
                    sample_food = alive_food[:300] if len(alive_food) > 300 else alive_food
                    for idx in sample_food:
                        food_data.append({"x": float(eco.food_x[idx]), "y": float(eco.food_y[idx])})

                    message = {
                        "type": "ecosystem_state",
                        "organisms": state_data.get("organisms", []),
                        "stats": {
                            k: v
                            for k, v in state_data.items()
                            if k not in ("organisms", "consciousness_history")
                        },
                        "population_stats": pop_stats,
                        "events": pending_events[-50:],
                        "narratives": pending_narratives[-10:],
                        "step": step_count,
                        "speed": speed,
                        "food": food_data,
                    }

                    dead_ids: list[str] = []
                    for ws_id, ws in list(subscribers.items()):
                        try:
                            await ws.send_json(message)
                        except Exception:
                            dead_ids.append(ws_id)
                    for ws_id in dead_ids:
                        subscribers.pop(ws_id, None)

                    # Clear pending after broadcast
                    pending_events.clear()
                    pending_narratives.clear()

                # If no subscribers remain, stop the loop
                if not _brain_world_subscribers.get(bw_id):
                    logger.info(
                        "No subscribers for brain-world %s, stopping auto-run",
                        bw_id,
                    )
                    break

            # Yield to event loop — sleep less at higher speeds
            sleep_time = max(0.02, 0.1 / speed)
            await asyncio.sleep(sleep_time)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error("Auto-run loop error for %s: %s", bw_id, e)
    finally:
        _brain_world_tasks.pop(bw_id, None)


_brain_world_starting: set[str] = set()  # guard against double-launch


async def _ensure_run_loop(bw_id: str) -> None:
    """Start the background auto-run loop for bw_id if not already running."""
    if bw_id in _brain_world_starting:
        return
    existing = _brain_world_tasks.get(bw_id)
    if existing and not existing.done():
        return  # already running
    _brain_world_starting.add(bw_id)
    try:
        _brain_world_tasks[bw_id] = asyncio.create_task(_massive_run_loop(bw_id))
    finally:
        _brain_world_starting.discard(bw_id)


@router.post("/massive/{bw_id}/speed")
async def set_massive_speed(bw_id: str, speed: float = 1.0):
    """Set the simulation speed multiplier for a massive brain-world."""
    if bw_id not in _brain_worlds:
        raise HTTPException(404, f"Brain-world {bw_id} not found")
    clamped = max(0.1, min(speed, 50.0))
    _brain_world_speed[bw_id] = clamped
    logger.info("Set speed for brain-world %s to %.1fx", bw_id, clamped)
    return {"speed": clamped}


@router.websocket("/massive/ws/{bw_id}")
async def massive_ecosystem_ws(websocket: WebSocket, bw_id: str):
    """Stream massive brain-world state in real-time with auto-run.

    On connect the server starts a background loop that:
    - Steps the BrainWorld continuously
    - Broadcasts state every 10 steps
    - Runs emergent behavior detection every 100 steps
    - Runs God Agent analysis every 500 steps and applies interventions
    - Includes narrative events in each broadcast
    """
    await websocket.accept()

    bw = _brain_worlds.get(bw_id)
    if bw is None:
        await websocket.close(code=4004, reason="Brain-world not found")
        return

    # Register subscriber
    ws_id = uuid.uuid4().hex[:8]
    _brain_world_subscribers.setdefault(bw_id, {})[ws_id] = websocket

    # Ensure the auto-run loop is active
    await _ensure_run_loop(bw_id)

    try:
        # Keep the connection alive — listen for client commands
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                if data.get("type") == "speed":
                    value = float(data.get("value", 1.0))
                    _brain_world_speed[bw_id] = max(0.1, min(value, 50.0))
                    logger.info("WS %s set speed for %s to %.1f", ws_id, bw_id, _brain_world_speed[bw_id])
                else:
                    logger.debug("Received from WS %s: %s", ws_id, raw[:100])
            except (ValueError, TypeError):
                logger.debug("Received non-JSON from WS %s: %s", ws_id, raw[:100])
    except WebSocketDisconnect:
        logger.info("WebSocket %s disconnected from brain-world %s", ws_id, bw_id)
    except Exception as e:
        logger.error("WebSocket error for %s/%s: %s", bw_id, ws_id, e)
        try:
            await websocket.close(code=1011, reason=str(e)[:120])
        except Exception:
            pass
    finally:
        # Unsubscribe
        subs = _brain_world_subscribers.get(bw_id, {})
        subs.pop(ws_id, None)
        if not subs:
            # Last subscriber gone — loop will stop itself on next broadcast check
            _brain_world_subscribers.pop(bw_id, None)
