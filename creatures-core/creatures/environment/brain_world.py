"""Unified brain + ecosystem: every organism has a spiking neural brain.

Connects VectorizedEngine (massively parallel LIF neurons) to
MassiveEcosystem (100K+ organisms as numpy arrays) so that organisms
make decisions using real spiking neural networks.

Pipeline each step:
    Environment state -> sensory neurons -> interneurons -> motor neurons -> movement

Scale target: 10K organisms x 100 neurons = 1M neurons at ~20 FPS.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from creatures.environment.massive_ecosystem import MassiveEcosystem
from creatures.environment.worlds import SoilWorld, PondWorld, LabPlateWorld
from creatures.neural.vectorized_engine import VectorizedEngine

logger = logging.getLogger(__name__)

# World type -> constructor mapping
_WORLD_BUILDERS = {
    "soil": lambda size: SoilWorld(size=size),
    "pond": lambda size: PondWorld(),
    "lab_plate": lambda size: LabPlateWorld(),
}


class BrainWorld:
    """Massive-scale ecosystem where every organism has a neural brain.

    Connects VectorizedEngine to MassiveEcosystem so organisms make
    decisions using real spiking neural networks.

    Scale: 10K organisms x 100 neurons = 1M neurons, running at ~20 FPS.
    """

    def __init__(
        self,
        n_organisms: int = 10_000,
        neurons_per_organism: int = 100,
        arena_size: float = 50.0,
        world_type: str = "soil",
        seed: int = 42,
    ) -> None:
        self.engine = VectorizedEngine()
        self.engine.build(n_organisms, neurons_per_organism, seed=seed)
        self.ecosystem = MassiveEcosystem(n_organisms, arena_size, seed=seed)
        self.world = self._create_world(world_type, arena_size)

        # Neuron role assignments per organism
        # First 20% = sensory, middle 60% = inter, last 20% = motor
        self.n_per = neurons_per_organism
        self.n_sensory = int(neurons_per_organism * 0.2)
        self.n_motor = int(neurons_per_organism * 0.2)

        # Sensory channel mapping (which sensory neurons respond to what)
        # Divide sensory neurons evenly across 4 channels
        ch_size = self.n_sensory // 4
        self.sensory_channels = {
            "chemical": (0, ch_size),
            "temperature": (ch_size, 2 * ch_size),
            "danger": (2 * ch_size, 3 * ch_size),
            "food": (3 * ch_size, self.n_sensory),
        }

        # Motor decoding: forward neurons, backward neurons, turn neurons
        motor_start = neurons_per_organism - self.n_motor
        n_third = self.n_motor // 3
        self.motor_forward = list(range(motor_start, motor_start + n_third))
        self.motor_backward = list(range(motor_start + n_third, motor_start + 2 * n_third))
        self.motor_turn = list(range(motor_start + 2 * n_third, neurons_per_organism))

        # Time tracking (MassiveEcosystem doesn't track time_ms)
        self.time_ms: float = 0.0
        self._step_count: int = 0

        # Precompute organism index array (reused every step)
        self._org_indices = np.arange(n_organisms)

        logger.info(
            "BrainWorld built: %d organisms x %d neurons = %d total, "
            "sensory=%d motor=%d, world=%s",
            n_organisms, neurons_per_organism,
            self.engine.n_total, self.n_sensory, self.n_motor, world_type,
        )

    @staticmethod
    def _create_world(world_type: str, arena_size: float) -> Any:
        """Create the environment world by type."""
        builder = _WORLD_BUILDERS.get(world_type)
        if builder is None:
            logger.warning("Unknown world_type '%s', defaulting to soil", world_type)
            builder = _WORLD_BUILDERS["soil"]
        return builder(arena_size)

    # ------------------------------------------------------------------
    # Main simulation step
    # ------------------------------------------------------------------

    def step(self, dt: float = 1.0) -> dict[str, Any]:
        """One step: sense -> think -> act for ALL organisms simultaneously."""
        eco = self.ecosystem
        alive = eco.alive

        # 1. SENSE: Convert environment state to neural input
        self.engine.clear_input()
        self._inject_sensory_input(alive)

        # 2. THINK: Step the neural engine (all organisms simultaneously)
        neural_stats = self.engine.step()

        # 3. ACT: Decode motor neuron output into movement
        self._decode_motor_output(alive)

        # 4. WORLD: Step the ecosystem (food, death, reproduction)
        eco_stats = eco.step(dt)

        # 5. Step the world environment (dynamic features)
        if hasattr(self.world, "step"):
            self.world.step(dt)

        # 6. Time tracking
        self.time_ms += dt
        self._step_count += 1

        return {**eco_stats, **neural_stats, "time_ms": self.time_ms}

    # ------------------------------------------------------------------
    # Sensory injection (fully vectorized -- no loops over organisms)
    # ------------------------------------------------------------------

    def _inject_sensory_input(self, alive: np.ndarray) -> None:
        """Convert environment signals to neural currents for all organisms."""
        eco = self.ecosystem
        n = eco.n
        org_idx = self._org_indices

        # --- Food proximity signal ---
        # Distance from each organism to each food source
        # Use alive food only, subsample if too many to avoid memory explosion
        food_alive_idx = np.where(eco.food_alive)[0]
        if len(food_alive_idx) > 0:
            max_food = min(len(food_alive_idx), 500)
            if len(food_alive_idx) > max_food:
                food_sample = eco._rng.choice(food_alive_idx, max_food, replace=False)
            else:
                food_sample = food_alive_idx

            # (n_org, n_food_sample) distance matrix via broadcasting
            dx = eco.x[:, None] - eco.food_x[food_sample][None, :]
            dy = eco.y[:, None] - eco.food_y[food_sample][None, :]
            dist = np.sqrt(dx * dx + dy * dy)
            nearest_dist = np.min(dist, axis=1)  # (n_org,)

            # Signal strength: closer = stronger, range 0-30 mV
            food_signal = np.clip(1.0 - nearest_dist / 5.0, 0.0, 1.0) * 30.0
            food_signal *= alive  # zero for dead organisms

            # Direction to nearest food for chemical gradient
            nearest_idx = np.argmin(dist, axis=1)
            best_dx = dx[org_idx, nearest_idx]
            best_dy = dy[org_idx, nearest_idx]
            best_dist = nearest_dist + 1e-8

            # Chemical signal: differential based on heading
            # Organisms facing food get stronger signal on "left" chemical neurons
            heading = eco.heading
            # Dot product of heading with food direction = alignment
            food_dir_x = -best_dx / best_dist  # toward food
            food_dir_y = -best_dy / best_dist
            alignment = np.cos(heading) * food_dir_x + np.sin(heading) * food_dir_y
            chemical_signal = np.clip(alignment, -1.0, 1.0) * 20.0 * alive

            # --- Inject into sensory neurons (vectorized over all organisms) ---
            # Food channel
            food_start, food_end = self.sensory_channels["food"]
            food_neuron_offsets = np.arange(food_start, food_end)
            # Global indices: (n_org, n_food_neurons) via broadcasting
            global_food = (org_idx[:, None] * self.n_per + food_neuron_offsets[None, :])
            self.engine.I_ext[global_food.ravel()] = np.repeat(
                food_signal, food_end - food_start
            )

            # Chemical channel (differential: stronger for aligned organisms)
            chem_start, chem_end = self.sensory_channels["chemical"]
            chem_offsets = np.arange(chem_start, chem_end)
            global_chem = (org_idx[:, None] * self.n_per + chem_offsets[None, :])
            self.engine.I_ext[global_chem.ravel()] = np.repeat(
                chemical_signal, chem_end - chem_start
            )

        # --- Danger signal (low energy = danger) ---
        danger_signal = np.clip(1.0 - eco.energy / 50.0, 0.0, 1.0) * 25.0 * alive
        danger_start, danger_end = self.sensory_channels["danger"]
        danger_offsets = np.arange(danger_start, danger_end)
        global_danger = (org_idx[:, None] * self.n_per + danger_offsets[None, :])
        self.engine.I_ext[global_danger.ravel()] = np.repeat(
            danger_signal, danger_end - danger_start
        )

        # --- Temperature signal (from world if available) ---
        # Use a simple y-based gradient as proxy (cooler at top, warmer at bottom)
        half = eco.arena_size / 2.0
        temp_normalized = (eco.y + half) / eco.arena_size  # 0-1
        temp_signal = temp_normalized * 15.0 * alive  # 0-15 mV
        temp_start, temp_end = self.sensory_channels["temperature"]
        temp_offsets = np.arange(temp_start, temp_end)
        global_temp = (org_idx[:, None] * self.n_per + temp_offsets[None, :])
        self.engine.I_ext[global_temp.ravel()] = np.repeat(
            temp_signal, temp_end - temp_start
        )

    # ------------------------------------------------------------------
    # Motor decoding (loops over neuron indices, NOT organisms)
    # ------------------------------------------------------------------

    def _decode_motor_output(self, alive: np.ndarray) -> None:
        """Convert motor neuron firing rates to movement commands."""
        eco = self.ecosystem
        n = eco.n
        org_idx = self._org_indices

        # Read motor neuron firing rates for all organisms
        # Loop over small number of neuron indices (~7 each), not organisms
        forward_rate = np.zeros(n)
        for n_idx in self.motor_forward:
            global_indices = org_idx * self.n_per + n_idx
            forward_rate += self.engine.firing_rate[global_indices]

        backward_rate = np.zeros(n)
        for n_idx in self.motor_backward:
            global_indices = org_idx * self.n_per + n_idx
            backward_rate += self.engine.firing_rate[global_indices]

        turn_rate = np.zeros(n)
        for n_idx in self.motor_turn:
            global_indices = org_idx * self.n_per + n_idx
            turn_rate += self.engine.firing_rate[global_indices]

        # Convert to movement (only for alive organisms)
        alive_f = alive.astype(np.float64)
        speed = (forward_rate - backward_rate) * 0.0005 * alive_f
        turn = turn_rate * 0.005 * alive_f

        # Override ecosystem's simple movement with brain-driven movement
        eco.heading += turn
        eco.x += np.cos(eco.heading) * speed
        eco.y += np.sin(eco.heading) * speed

        # Wrap around arena
        half = eco.arena_size / 2.0
        eco.x = ((eco.x + half) % eco.arena_size) - half
        eco.y = ((eco.y + half) % eco.arena_size) - half

    # ------------------------------------------------------------------
    # State for visualization
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        """Get state for visualization."""
        eco_state = self.ecosystem.get_state_summary()
        eco_state["time_ms"] = self.time_ms
        eco_state["step"] = self._step_count
        eco_state["neural_stats"] = {
            "total_neurons": self.engine.n_total,
            "neurons_per_organism": self.n_per,
            "n_organisms": self.engine.n_organisms,
            "total_synapses": self.engine.n_synapses,
            "total_fired": int(np.sum(self.engine.fired)),
            "mean_firing_rate": float(np.mean(self.engine.firing_rate)),
        }
        return eco_state

    def get_emergent_state(self) -> dict[str, Any]:
        """Build a state dict compatible with EmergentBehaviorDetector.observe().

        Subsamples to max 1000 organisms for the detector (it needs per-organism
        dicts with id, x, y, species, alive).
        """
        eco = self.ecosystem
        alive_idx = np.where(eco.alive)[0]
        n_alive = len(alive_idx)

        max_sample = min(n_alive, 1000)
        if n_alive > max_sample:
            sample = eco._rng.choice(alive_idx, max_sample, replace=False)
        else:
            sample = alive_idx

        organisms = [
            {
                "id": f"org_{int(i)}",
                "x": float(eco.x[i]),
                "y": float(eco.y[i]),
                "species": "c_elegans" if eco.species[i] == 0 else "drosophila",
                "alive": True,
                "energy": float(eco.energy[i]),
            }
            for i in sample
        ]

        return {
            "organisms": organisms,
            "time_ms": self.time_ms,
            "total_alive": n_alive,
        }
