"""Manages running simulation instances."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field

from creatures.connectome.openworm import load as load_celegans
from creatures.connectome.flywire import load as load_drosophila
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.base import NeuralConfig
from creatures.body.worm_body import WormBody
from creatures.body.fly_body import FlyBody
from creatures.body.base import BodyConfig
from creatures.experiment.runner import SimulationRunner, CouplingConfig

from app.models.schemas import ExperimentCreate, SimulationFrame

logger = logging.getLogger(__name__)


@dataclass
class SimulationInstance:
    """A running simulation with its engine, body, and runner."""

    id: str
    name: str
    organism: str
    runner: SimulationRunner
    engine: Brian2Engine
    connectome: object  # Connectome
    pharma_engine: object | None = None  # PharmacologyEngine, lazily created
    status: str = "ready"  # ready, running, paused, stopped
    speed: float = 1.0  # multiplier read by run_loop each iteration
    subscribers: dict = field(default_factory=dict)
    _task: asyncio.Task | None = None


class SimulationManager:
    """Manages creation and lifecycle of simulation instances."""

    def __init__(self) -> None:
        self._simulations: dict[str, SimulationInstance] = {}

    def create(self, config: ExperimentCreate) -> SimulationInstance:
        """Create a new simulation from config."""
        sim_id = str(uuid.uuid4())[:8]

        if config.organism == "c_elegans":
            connectome = load_celegans(config.connectome_source)
            body = WormBody(BodyConfig(dt=1.0))
        elif config.organism == "drosophila":
            neuropils = config.neuropils or "central_complex"
            connectome = load_drosophila(
                neuropils=neuropils,
                min_synapse_count=5,
                max_neurons=config.max_neurons,
            )
            try:
                body = FlyBody(BodyConfig(dt=0.5), connectome=connectome)
            except (FileNotFoundError, ImportError):
                # flygym data not available — use worm body as fallback for physics
                logger.warning("flygym not available, using WormBody fallback for Drosophila")
                body = WormBody(BodyConfig(dt=0.5))
        elif config.organism == "zebrafish":
            from creatures.connectome.zebrafish import load as load_zebrafish
            from creatures.body.fish_body import FishBody
            circuit = config.connectome_source if config.connectome_source != "edge_list" else "mauthner"
            connectome = load_zebrafish(circuit=circuit)
            body = FishBody(BodyConfig(dt=1.0))
        else:
            raise ValueError(f"Organism '{config.organism}' not yet supported")

        neural_config = NeuralConfig(
            weight_scale=config.weight_scale,
            tau_syn=config.tau_syn,
            tau_m=config.tau_m,
        )
        engine = Brian2Engine()
        engine.build(connectome, neural_config)
        body.reset()

        coupling = CouplingConfig(
            poke_current=config.poke_current,
            poke_duration_ms=config.poke_duration_ms,
            firing_rate_to_torque_gain=config.firing_rate_to_torque_gain,
            inhibitory_gain=config.inhibitory_gain,
        )
        runner = SimulationRunner(engine, body, coupling, connectome=connectome)

        sim = SimulationInstance(
            id=sim_id,
            name=config.name,
            organism=config.organism,
            runner=runner,
            engine=engine,
            connectome=connectome,
        )
        self._simulations[sim_id] = sim
        logger.info(f"Created simulation {sim_id}: {connectome.n_neurons} neurons")
        return sim

    def get(self, sim_id: str) -> SimulationInstance | None:
        return self._simulations.get(sim_id)

    def list_all(self) -> list[SimulationInstance]:
        return list(self._simulations.values())

    def delete(self, sim_id: str) -> bool:
        sim = self._simulations.pop(sim_id, None)
        if sim and sim._task:
            sim._task.cancel()
        return sim is not None

    async def run_loop(self, sim: SimulationInstance, speed: float = 1.0) -> None:
        """Run the simulation loop, broadcasting frames to subscribers."""
        sim.status = "running"
        sim.speed = speed

        try:
            while sim.status == "running":
                step_interval = 1.0 / (30 * max(sim.speed, 0.01))  # re-read each iteration
                frame_data = sim.runner.step()

                # Build frame for broadcast
                frame = SimulationFrame(
                    t_ms=frame_data.t_ms,
                    n_active=len(frame_data.active_neurons),
                    spikes=[
                        idx for n in frame_data.active_neurons
                        if (idx := sim.engine.get_neuron_index(n)) is not None
                    ],
                    firing_rates=list(sim.engine.get_firing_rates_array()),
                    body_positions=[
                        list(p) for p in frame_data.body_state.positions
                    ],
                    joint_angles=frame_data.body_state.joint_angles,
                    center_of_mass=list(frame_data.body_state.center_of_mass),
                    muscle_activations=frame_data.muscle_activations,
                )

                # Broadcast to subscribers using put_nowait so a slow or
                # dead consumer never blocks the simulation loop.  If the
                # queue is full the oldest frame is discarded to make room.
                dead = []
                for ws_id, (ws, queue) in list(sim.subscribers.items()):
                    try:
                        try:
                            queue.put_nowait(frame)
                        except asyncio.QueueFull:
                            # Drop oldest frame to make room for the newest
                            try:
                                queue.get_nowait()
                            except asyncio.QueueEmpty:
                                pass
                            queue.put_nowait(frame)
                    except Exception:
                        dead.append(ws_id)
                for ws_id in dead:
                    del sim.subscribers[ws_id]

                await asyncio.sleep(step_interval)

        except asyncio.CancelledError:
            pass
        finally:
            sim.status = "paused"

    def set_speed(self, sim: SimulationInstance, speed: float) -> None:
        """Update the speed of a running simulation."""
        sim.speed = speed

    def start(self, sim: SimulationInstance, speed: float = 1.0) -> None:
        """Start the simulation loop as an async task."""
        if sim._task and not sim._task.done():
            sim.speed = speed
            return
        sim._task = asyncio.create_task(self.run_loop(sim, speed))

    def pause(self, sim: SimulationInstance) -> None:
        """Pause the simulation."""
        sim.status = "paused"

    def stop(self, sim: SimulationInstance) -> None:
        """Stop the simulation."""
        sim.status = "stopped"
        if sim._task:
            sim._task.cancel()
