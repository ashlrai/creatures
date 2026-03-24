"""Creatures API — FastAPI server for virtual organism simulation."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add creatures-core to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "creatures-core"))

import asyncio

from app.routers import evolution, experiments, export, god, morphology, neurons, pharmacology, ws
from app.services.evolution_manager import EvolutionManager
from app.services.simulation_manager import SimulationManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize shared state on startup."""
    manager = SimulationManager()
    experiments.manager = manager
    neurons.manager = manager
    pharmacology.manager = manager
    ws.manager = manager

    evo_manager = EvolutionManager()
    evo_manager.set_loop(asyncio.get_running_loop())
    evolution.manager = evo_manager
    export.manager = evo_manager
    god.manager = evo_manager

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

app.include_router(evolution.router)
app.include_router(experiments.router)
app.include_router(export.router)
app.include_router(god.router)
app.include_router(morphology.router)
app.include_router(neurons.router)
app.include_router(pharmacology.router)
app.include_router(ws.router)


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
