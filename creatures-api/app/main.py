"""Creatures API — FastAPI server for virtual organism simulation."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add creatures-core to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "creatures-core"))

from app.routers import experiments, neurons, ws
from app.services.simulation_manager import SimulationManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize shared state on startup."""
    manager = SimulationManager()
    experiments.manager = manager
    neurons.manager = manager
    ws.manager = manager
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(experiments.router)
app.include_router(neurons.router)
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
