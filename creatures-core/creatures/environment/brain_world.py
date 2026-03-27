"""Unified brain + ecosystem: every organism has a spiking neural brain.

Connects VectorizedEngine (massively parallel LIF/Izhikevich neurons) to
MassiveEcosystem (100K+ organisms as numpy arrays) so that organisms
make decisions using real spiking neural networks.

Pipeline each step:
    Environment state -> sensory neurons -> interneurons -> motor neurons -> movement

Supports MLX (Apple Silicon GPU), CuPy (NVIDIA GPU), and numpy (CPU).

Scale targets:
    numpy:  10K organisms x 100 neurons = 1M neurons at ~20 FPS
    MLX:    100K organisms x 100 neurons = 10M neurons at ~10 FPS
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from creatures.environment.massive_ecosystem import MassiveEcosystem
from creatures.environment.worlds import SoilWorld, PondWorld, LabPlateWorld
from creatures.neural.vectorized_engine import NeuronModel, VectorizedEngine

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
        use_gpu: bool = True,
        neuron_model: NeuronModel | str = NeuronModel.LIF,
        connectome: Any = None,
        enable_stdp: bool = False,
        enable_consciousness: bool = False,
        consciousness_interval: int = 500,
        mutation_sigma: float = 0.02,
    ) -> None:
        self.engine = VectorizedEngine(use_gpu=use_gpu, neuron_model=neuron_model)
        if connectome is not None:
            self.engine.build_from_connectome(connectome, n_organisms, seed=seed)
        else:
            self.engine.build(n_organisms, neurons_per_organism, seed=seed)

        # Enable STDP for online learning
        if enable_stdp:
            self.engine.init_stdp()

        self.ecosystem = MassiveEcosystem(n_organisms, arena_size, seed=seed)

        # Consciousness tracking
        self._enable_consciousness = enable_consciousness
        self._consciousness_interval = consciousness_interval
        self._last_consciousness: dict[str, Any] = {}
        self._consciousness_history: list[dict] = []
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

        # Neural evolution: mutation strength for inherited weights
        self._mutation_sigma = mutation_sigma

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

        # 4b. INHERIT: Copy parent neural weights to offspring with mutation
        if hasattr(eco, '_last_births') and eco._last_births:
            parents = np.array([p for p, _ in eco._last_births])
            offspring = np.array([o for _, o in eco._last_births])
            self._inherit_neural_weights(parents, offspring)
            eco._last_births = []  # Clear after processing

        # 5. Step the world environment (dynamic features)
        if hasattr(self.world, "step"):
            self.world.step(dt)

        # 6. Time tracking
        self.time_ms += dt
        self._step_count += 1

        # 7. Periodic consciousness measurement
        result = {**eco_stats, **neural_stats, "time_ms": self.time_ms}
        if (self._enable_consciousness
                and self._step_count % self._consciousness_interval == 0):
            self._measure_consciousness()
            result["consciousness"] = self._last_consciousness

        return result

    # ------------------------------------------------------------------
    # Neural weight inheritance
    # ------------------------------------------------------------------

    def _inherit_neural_weights(self, parent_indices: np.ndarray, offspring_indices: np.ndarray) -> None:
        """Copy parent neural weights to offspring with mutation."""
        mutation_sigma = getattr(self, '_mutation_sigma', 0.02)
        for parent_idx, offspring_idx in zip(parent_indices, offspring_indices):
            self.engine.inherit_weights(int(parent_idx), int(offspring_idx), mutation_sigma)

    # ------------------------------------------------------------------
    # Sensory injection (fully vectorized -- no loops over organisms)
    # ------------------------------------------------------------------

    def _inject_sensory_input(self, alive: np.ndarray) -> None:
        """Convert environment signals to neural currents for all organisms.

        Builds the full I_ext array in numpy, then converts to backend
        format in one shot (avoids per-element MLX conversions).
        """
        eco = self.ecosystem
        n = eco.n
        org_idx = self._org_indices

        # Build I_ext as numpy, convert at the end
        I_ext_np = np.zeros(self.engine.n_total, dtype=np.float32)

        # --- Food proximity signal ---
        food_alive_idx = np.where(eco.food_alive)[0]
        if len(food_alive_idx) > 0:
            max_food = min(len(food_alive_idx), 500)
            if len(food_alive_idx) > max_food:
                food_sample = eco._rng.choice(food_alive_idx, max_food, replace=False)
            else:
                food_sample = food_alive_idx

            dx = eco.x[:, None] - eco.food_x[food_sample][None, :]
            dy = eco.y[:, None] - eco.food_y[food_sample][None, :]
            dist = np.sqrt(dx * dx + dy * dy)
            nearest_dist = np.min(dist, axis=1)

            food_signal = np.clip(1.0 - nearest_dist / 5.0, 0.0, 1.0) * 30.0
            food_signal *= alive

            nearest_idx = np.argmin(dist, axis=1)
            best_dx = dx[org_idx, nearest_idx]
            best_dy = dy[org_idx, nearest_idx]
            best_dist = nearest_dist + 1e-8

            heading = eco.heading
            food_dir_x = -best_dx / best_dist
            food_dir_y = -best_dy / best_dist
            alignment = np.cos(heading) * food_dir_x + np.sin(heading) * food_dir_y
            chemical_signal = np.clip(alignment, -1.0, 1.0) * 20.0 * alive

            # Food channel
            food_start, food_end = self.sensory_channels["food"]
            food_offsets = np.arange(food_start, food_end)
            global_food = (org_idx[:, None] * self.n_per + food_offsets[None, :]).ravel()
            I_ext_np[global_food] = np.repeat(food_signal, food_end - food_start)

            # Chemical channel
            chem_start, chem_end = self.sensory_channels["chemical"]
            chem_offsets = np.arange(chem_start, chem_end)
            global_chem = (org_idx[:, None] * self.n_per + chem_offsets[None, :]).ravel()
            I_ext_np[global_chem] = np.repeat(chemical_signal, chem_end - chem_start)

        # --- Danger signal ---
        danger_signal = np.clip(1.0 - eco.energy / 50.0, 0.0, 1.0) * 25.0 * alive
        danger_start, danger_end = self.sensory_channels["danger"]
        danger_offsets = np.arange(danger_start, danger_end)
        global_danger = (org_idx[:, None] * self.n_per + danger_offsets[None, :]).ravel()
        I_ext_np[global_danger] = np.repeat(danger_signal, danger_end - danger_start)

        # --- Temperature signal ---
        half = eco.arena_size / 2.0
        temp_normalized = (eco.y + half) / eco.arena_size
        temp_signal = temp_normalized * 15.0 * alive
        temp_start, temp_end = self.sensory_channels["temperature"]
        temp_offsets = np.arange(temp_start, temp_end)
        global_temp = (org_idx[:, None] * self.n_per + temp_offsets[None, :]).ravel()
        I_ext_np[global_temp] = np.repeat(temp_signal, temp_end - temp_start)

        # Convert to backend format in one shot
        self.engine.I_ext = self.engine.xp.array(I_ext_np)

    # ------------------------------------------------------------------
    # Motor decoding (loops over neuron indices, NOT organisms)
    # ------------------------------------------------------------------

    def _decode_motor_output(self, alive: np.ndarray) -> None:
        """Convert motor neuron firing rates to movement commands.

        Reads firing rates from the engine (may be MLX/CuPy arrays),
        converts to numpy for ecosystem movement computation.
        """
        eco = self.ecosystem
        n = eco.n
        org_idx = self._org_indices

        # Read firing rates — convert to numpy if needed
        fr = self.engine._to_numpy(self.engine.firing_rate)

        # Pool motor neuron rates (loop over ~7 neuron indices, not organisms)
        forward_rate = np.zeros(n)
        for n_idx in self.motor_forward:
            forward_rate += fr[org_idx * self.n_per + n_idx]

        backward_rate = np.zeros(n)
        for n_idx in self.motor_backward:
            backward_rate += fr[org_idx * self.n_per + n_idx]

        turn_rate = np.zeros(n)
        for n_idx in self.motor_turn:
            turn_rate += fr[org_idx * self.n_per + n_idx]

        alive_f = alive.astype(np.float64)
        speed = (forward_rate - backward_rate) * 0.0005 * alive_f
        turn = turn_rate * 0.005 * alive_f

        eco.heading += turn
        eco.x += np.cos(eco.heading) * speed
        eco.y += np.sin(eco.heading) * speed

        half = eco.arena_size / 2.0
        eco.x = ((eco.x + half) % eco.arena_size) - half
        eco.y = ((eco.y + half) % eco.arena_size) - half

    # ------------------------------------------------------------------
    # Consciousness measurement
    # ------------------------------------------------------------------

    def _measure_consciousness(self) -> None:
        """Compute consciousness metrics from recent spike history."""
        from creatures.neural.consciousness import compute_phi, compute_neural_complexity

        indices, times = self.engine.get_spike_history()
        if len(indices) < 100:
            return

        spike_idx = np.array(indices)
        spike_t = np.array(times)
        duration = float(spike_t.max() - spike_t.min()) + 1.0

        phi_result = compute_phi(
            spike_idx, spike_t, self.engine.n_total, duration,
            bin_ms=10.0, n_partitions=20,
        )
        cn_result = compute_neural_complexity(
            spike_idx, spike_t, self.engine.n_total, duration,
            bin_ms=10.0, max_scale=5,
        )

        self._last_consciousness = {
            "phi": phi_result["phi"],
            "complexity": cn_result["complexity"],
            "n_spikes": len(indices),
            "step": self._step_count,
        }
        self._consciousness_history.append(self._last_consciousness.copy())

        # Keep last 100 measurements
        if len(self._consciousness_history) > 100:
            self._consciousness_history = self._consciousness_history[-100:]

    # ------------------------------------------------------------------
    # Population statistics
    # ------------------------------------------------------------------

    def get_population_stats(self) -> dict[str, Any]:
        """Rich statistics for the God Agent and frontend."""
        eco = self.ecosystem
        alive = eco.alive
        alive_idx = alive.nonzero()[0]

        if len(alive_idx) == 0:
            return {'alive': 0, 'extinct': True}

        return {
            'alive': int(alive.sum()),
            'mean_energy': float(eco.energy[alive].mean()),
            'max_generation': int(eco.generation[alive].max()),
            'mean_generation': float(eco.generation[alive].mean()),
            'n_lineages': int(len(np.unique(eco.lineage_id[alive]))),
            'mean_lifetime_food': float(eco.lifetime_food[alive].mean()),
            'oldest_age': float(eco.age[alive].max()),
            'mean_age': float(eco.age[alive].mean()),
            'species_counts': {
                'c_elegans': int((eco.species[alive] == 0).sum()),
                'drosophila': int((eco.species[alive] == 1).sum()),
            },
        }

    # ------------------------------------------------------------------
    # State for visualization
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        """Get state for visualization."""
        eco_state = self.ecosystem.get_state_summary()
        eco_state["time_ms"] = self.time_ms
        eco_state["step_count"] = self._step_count
        eco_state["n_alive"] = eco_state.get("total_alive", 0)
        eco_state["n_total"] = self.ecosystem.n
        fired_np = self.engine._to_numpy(self.engine.fired)
        fr_np = self.engine._to_numpy(self.engine.firing_rate)
        eco_state["neural_stats"] = {
            "total_neurons": self.engine.n_total,
            "neurons_per_organism": self.n_per,
            "n_organisms": self.engine.n_organisms,
            "total_synapses": self.engine.n_synapses,
            "backend": self.engine._backend,
            "neuron_model": self.engine._neuron_model.value,
            "stdp_enabled": self.engine.enable_stdp,
            "total_fired": int(np.sum(fired_np)),
            "mean_firing_rate": float(np.mean(fr_np)),
        }
        if self._last_consciousness:
            eco_state["consciousness"] = self._last_consciousness
        if self._consciousness_history:
            eco_state["consciousness_history"] = self._consciousness_history[-10:]
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
