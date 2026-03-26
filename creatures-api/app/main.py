"""Creatures API — FastAPI server for virtual organism simulation."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add creatures-core to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "creatures-core"))

import asyncio

from app.routers import analysis, consciousness, ecosystem, evolution, experiments, export, export_advanced, god, history, metrics, morphology, neurons, pharmacology, ws
from app.services.evolution_manager import EvolutionManager
from app.services.simulation_manager import SimulationManager
from creatures.storage.persistence import NeurevoStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize shared state on startup."""
    # Persistence store (configurable via NEUREVO_DATA_DIR env var)
    neurevo_store = NeurevoStore()

    manager = SimulationManager()
    analysis.manager = manager
    consciousness.manager = manager
    metrics.manager = manager
    experiments.manager = manager
    experiments.store = neurevo_store
    neurons.manager = manager
    pharmacology.manager = manager
    ws.manager = manager

    evo_manager = EvolutionManager()
    evo_manager.set_loop(asyncio.get_running_loop())
    evo_manager.store = neurevo_store
    evolution.manager = evo_manager
    export.manager = evo_manager
    god.manager = evo_manager

    export_advanced.manager = manager

    history.store = neurevo_store

    yield


app = FastAPI(
    title="Creatures API",
    description="Virtual organism simulation powered by real connectome data",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router)
app.include_router(consciousness.router)
app.include_router(metrics.router)
app.include_router(ecosystem.router)
app.include_router(evolution.router)
app.include_router(experiments.protocol_router)  # Must come before experiments.router to avoid /{sim_id} shadowing
app.include_router(experiments.router)
app.include_router(export.router)
app.include_router(export_advanced.router)
app.include_router(god.router)
app.include_router(morphology.router)
app.include_router(neurons.router)
app.include_router(pharmacology.router)
app.include_router(ws.router)
app.include_router(history.router)


@app.get("/")
async def root():
    return {
        "name": "Creatures API",
        "version": "0.1.0",
        "description": "Virtual organism simulation powered by real connectome data",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve frontend build (after all API routes so they take priority)
frontend_dist = Path(__file__).resolve().parents[2] / "creatures-web" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
