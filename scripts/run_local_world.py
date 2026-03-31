#!/usr/bin/env python
"""Run the Neurevo 3D brain-world simulation locally.

Starts the simulation on the M5 Max and exposes a WebSocket server
that streams organism state to any connected viewer (neurevo.dev
or local browser).

Usage:
    python scripts/run_local_world.py
    python scripts/run_local_world.py --organisms 2000 --neurons 100 --port 8765
    python scripts/run_local_world.py --world-type pond --arena-size 40

Connect a viewer:
    Open neurevo.dev and enter ws://localhost:8765 as the data source
    Or use ngrok: ngrok http 8765
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import signal
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

# Ensure creatures-core is importable when running from repo root
_repo = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_repo / "creatures-core"))

from websockets.asyncio.server import ServerConnection, serve
from websockets.http11 import Request, Response
from websockets.datastructures import Headers

from creatures.environment.brain_world import BrainWorld

logger = logging.getLogger("run_local_world")

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_connected_clients: set[ServerConnection] = set()
_shutdown_event: asyncio.Event | None = None

# CORS headers added to every WebSocket handshake response so that
# neurevo.dev (or any other origin) can connect cross-origin.
_CORS_HEADERS = Headers(
    {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "*",
    }
)


# ---------------------------------------------------------------------------
# WebSocket hooks
# ---------------------------------------------------------------------------

def _process_response(
    connection: ServerConnection,
    request: Request,
    response: Response,
) -> Response:
    """Inject CORS headers into the WebSocket upgrade response."""
    for key, value in _CORS_HEADERS.raw_items():
        response.headers[key] = value
    return response


async def _ws_handler(connection: ServerConnection) -> None:
    """Handle a single viewer connection."""
    _connected_clients.add(connection)
    remote = connection.remote_address
    logger.info("Viewer connected: %s", remote)
    try:
        async for _msg in connection:
            # Viewers may send control messages in the future; ignore for now.
            pass
    except Exception:
        pass
    finally:
        _connected_clients.discard(connection)
        logger.info("Viewer disconnected: %s", remote)


async def _broadcast(message: dict[str, Any]) -> None:
    """Send a JSON message to every connected viewer."""
    if not _connected_clients:
        return
    payload = json.dumps(message)
    dead: list[ServerConnection] = []
    for ws in list(_connected_clients):
        try:
            await ws.send(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connected_clients.discard(ws)


# ---------------------------------------------------------------------------
# Simulation loop
# ---------------------------------------------------------------------------

async def _simulation_loop(
    bw: BrainWorld,
    speed: float,
) -> None:
    """Run bw.step() continuously and broadcast every 10 steps."""
    assert _shutdown_event is not None

    step_count = 0
    last_report = time.perf_counter()

    while not _shutdown_event.is_set():
        # --- step the simulation ---
        bw.step(dt=1.0)
        step_count += 1

        # --- broadcast every 10 steps ---
        if step_count % 10 == 0 and _connected_clients:
            state_data = bw.get_state()

            pop_stats = bw.get_population_stats()

            # Food positions (cap at 300 for bandwidth)
            eco = bw.ecosystem
            food_data: list[dict[str, float]] = []
            alive_food = np.where(eco.food_alive)[0]
            sample_food = alive_food[:300] if len(alive_food) > 300 else alive_food
            for idx in sample_food:
                food_data.append({
                    "x": float(eco.food_x[idx]),
                    "y": float(eco.food_y[idx]),
                })

            # Chemotaxis (every 100 steps to reduce overhead)
            chemotaxis: dict[str, Any] = {}
            if step_count % 100 == 0 and hasattr(bw, "get_chemotaxis_index"):
                try:
                    chemotaxis = bw.get_chemotaxis_index()
                except Exception:
                    pass

            message = {
                "type": "ecosystem_state",
                "organisms": state_data.get("organisms", []),
                "stats": {
                    k: v
                    for k, v in state_data.items()
                    if k not in ("organisms", "consciousness_history")
                },
                "population_stats": pop_stats,
                "step": step_count,
                "speed": speed,
                "food": food_data,
                "chemotaxis": chemotaxis,
            }

            await _broadcast(message)

        # --- periodic console report every 100 steps ---
        if step_count % 100 == 0:
            now = time.perf_counter()
            elapsed = now - last_report
            sps = 100.0 / elapsed if elapsed > 0 else 0
            last_report = now

            pop_stats = bw.get_population_stats()
            alive = pop_stats.get("alive", 0)
            max_gen = pop_stats.get("max_generation", 0)
            logger.info(
                "step %6d | pop %5d | gen %3d | %.1f steps/s | %d viewer(s)",
                step_count,
                alive,
                max_gen,
                sps,
                len(_connected_clients),
            )

        # Yield to event loop — sleep less at higher speeds
        sleep_time = max(0.02, 0.1 / speed)
        await asyncio.sleep(sleep_time)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def _main(args: argparse.Namespace) -> None:
    global _shutdown_event
    _shutdown_event = asyncio.Event()

    # Wire Ctrl+C / SIGTERM to the shutdown event
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown_event.set)

    # --- Create BrainWorld ---
    logger.info("Initializing BrainWorld ...")
    logger.info(
        "  organisms=%d  neurons=%d  world=%s  arena=%.0f",
        args.organisms,
        args.neurons,
        args.world_type,
        args.arena_size,
    )
    bw = BrainWorld(
        n_organisms=args.organisms,
        neurons_per_organism=args.neurons,
        arena_size=args.arena_size,
        world_type=args.world_type,
        use_gpu=True,
        enable_stdp=True,
    )
    logger.info(
        "BrainWorld ready: %d neurons, %d synapses, backend=%s",
        bw.engine.n_total,
        bw.engine.n_synapses,
        bw.engine._backend,
    )

    # --- Start WebSocket server ---
    logger.info("Starting WebSocket server on 0.0.0.0:%d ...", args.port)

    async with serve(
        _ws_handler,
        "0.0.0.0",
        args.port,
        process_response=_process_response,
        ping_interval=20,
        ping_timeout=60,
    ) as server:
        logger.info(
            "Listening on ws://0.0.0.0:%d — connect a viewer to start streaming",
            args.port,
        )

        # Run simulation until shutdown
        sim_task = asyncio.create_task(_simulation_loop(bw, args.speed))

        # Wait for shutdown signal
        await _shutdown_event.wait()
        logger.info("Shutting down ...")

        # Cancel the simulation task
        sim_task.cancel()
        try:
            await sim_task
        except asyncio.CancelledError:
            pass

        # Close all viewer connections
        for ws in list(_connected_clients):
            await ws.close(1001, "server shutting down")
        _connected_clients.clear()

    logger.info("Goodbye.")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Neurevo brain-world locally and stream via WebSocket.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--organisms", type=int, default=1000,
        help="Number of organisms (default: 1000)",
    )
    parser.add_argument(
        "--neurons", type=int, default=50,
        help="Neurons per organism (default: 50)",
    )
    parser.add_argument(
        "--port", type=int, default=8765,
        help="WebSocket server port (default: 8765)",
    )
    parser.add_argument(
        "--world-type", type=str, default="pond",
        choices=["soil", "pond", "lab_plate"],
        help="World type (default: pond)",
    )
    parser.add_argument(
        "--arena-size", type=float, default=30.0,
        help="Arena size (default: 30.0, 0 = auto-scale)",
    )
    parser.add_argument(
        "--speed", type=float, default=1.0,
        help="Simulation speed multiplier (default: 1.0)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    args = _parse_args()
    try:
        asyncio.run(_main(args))
    except KeyboardInterrupt:
        pass
