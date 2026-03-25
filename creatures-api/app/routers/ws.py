"""WebSocket endpoint for real-time simulation streaming."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.simulation_manager import SimulationManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

manager: SimulationManager | None = None


@router.websocket("/ws/{sim_id}")
async def simulation_ws(websocket: WebSocket, sim_id: str):
    """Stream simulation frames via WebSocket.

    Also accepts commands from the client:
    - {"type": "poke", "segment": "seg_8", "force": [0, 0.15, 0]}
    - {"type": "stimulate", "neuron_ids": ["PLML"], "current": 25.0}
    - {"type": "speed", "value": 2.0}
    - {"type": "pause"}
    - {"type": "resume"}
    """
    if manager is None:
        await websocket.close(code=1011, reason="Server not ready")
        return

    sim = manager.get(sim_id)
    if not sim:
        await websocket.close(code=1008, reason=f"Experiment {sim_id} not found")
        return

    await websocket.accept()

    # Create a queue for this subscriber
    queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    sim.subscribers.append((websocket, queue))

    # Start simulation if not already running
    if sim.status != "running":
        manager.start(sim)

    try:
        # Two concurrent tasks: send frames + receive commands
        async def send_frames():
            while True:
                frame = await queue.get()
                try:
                    await websocket.send_json(frame.model_dump())
                except Exception:
                    break

        async def receive_commands():
            while True:
                try:
                    data = await websocket.receive_json()
                except WebSocketDisconnect:
                    break
                except Exception:
                    break

                cmd_type = data.get("type")
                if cmd_type == "poke":
                    segment = data.get("segment", "seg_8")
                    force = data.get("force", [0, 0.15, 0])
                    sim.runner.poke(segment, tuple(force))
                elif cmd_type == "stimulate":
                    for nid in data.get("neuron_ids", []):
                        sim.runner.set_stimulus(nid, data.get("current", 25.0))
                elif cmd_type == "clear_stimuli":
                    sim.runner.clear_stimuli()
                elif cmd_type == "pause":
                    manager.pause(sim)
                elif cmd_type == "resume":
                    manager.start(sim, data.get("speed", 1.0))
                elif cmd_type == "lesion_neuron":
                    nid = data.get("neuron_id")
                    if nid:
                        sim.engine.lesion_neuron(nid)

                elif cmd_type == "silence_neuron":
                    nid = data.get("neuron_id")
                    if nid and sim.engine:
                        sim.engine.silence_neuron(nid)

                elif cmd_type == "undo_lesion":
                    nid = data.get("neuron_id")
                    if nid and sim.engine:
                        sim.engine.undo_lesion(nid)

                elif cmd_type == "enable_stdp":
                    if sim.engine:
                        enabled = data.get("enabled", True)
                        a_plus = data.get("a_plus", 0.01)
                        a_minus = data.get("a_minus", 0.012)
                        w_max = data.get("w_max", 10.0)
                        sim.engine.set_stdp_params(enabled, a_plus, a_minus, w_max)

                elif cmd_type == "get_weights":
                    if sim.engine:
                        try:
                            weights = sim.engine.get_synapse_weights()
                            changes = sim.engine.get_weight_changes()
                            await websocket.send_json({
                                "type": "weight_snapshot",
                                "weights": weights.tolist() if hasattr(weights, 'tolist') else list(weights),
                                "changes": changes,
                            })
                        except Exception as e:
                            await websocket.send_json({"type": "error", "message": str(e)})

                elif cmd_type == "record_neuron":
                    nids = data.get("neuron_ids", [])
                    if nids and sim.engine:
                        sim.engine.record_neurons(nids)

        send_task = asyncio.create_task(send_frames())
        recv_task = asyncio.create_task(receive_commands())

        # Wait for either to finish
        done, pending = await asyncio.wait(
            [send_task, recv_task], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        pass
    finally:
        # Remove subscriber
        sim.subscribers = [
            (ws, q) for ws, q in sim.subscribers if ws is not websocket
        ]
        logger.info(f"WebSocket disconnected from {sim_id}")
