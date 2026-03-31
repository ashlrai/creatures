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

from creatures.analysis.trajectory_recorder import TrajectoryRecorder
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
        arena_size: float = 0,
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

        # If arena_size is 0 or not provided, auto-scale based on population
        if arena_size <= 0:
            arena_size = max(50.0, float(int(n_organisms ** 0.5) * 3))

        # Food moderate — organisms with baseline movement can find food
        # but must evolve efficient seeking to thrive. ~2 food per organism.
        n_food = max(20, n_organisms * 2)
        self.ecosystem = MassiveEcosystem(n_organisms, arena_size, n_food=n_food, seed=seed)

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
        # Divide sensory neurons evenly across 5 channels
        ch_size = self.n_sensory // 5
        self.sensory_channels = {
            "chemical": (0, ch_size),
            "temperature": (ch_size, 2 * ch_size),
            "danger": (2 * ch_size, 3 * ch_size),
            "food": (3 * ch_size, 4 * ch_size),
            "neighbor_density": (4 * ch_size, self.n_sensory),
        }

        # Motor decoding: forward, backward, turn, pitch (4 groups for 3D)
        motor_start = neurons_per_organism - self.n_motor
        n_quarter = self.n_motor // 4
        self.motor_forward = list(range(motor_start, motor_start + n_quarter))
        self.motor_backward = list(range(motor_start + n_quarter, motor_start + 2 * n_quarter))
        self.motor_turn = list(range(motor_start + 2 * n_quarter, motor_start + 3 * n_quarter))
        # Pitch motor neurons (up/down for 3D movement)
        self.motor_pitch = list(range(motor_start + 3 * n_quarter, neurons_per_organism))

        # Time tracking (MassiveEcosystem doesn't track time_ms)
        self.time_ms: float = 0.0
        self._step_count: int = 0

        # Neural evolution: mutation strength for inherited weights
        self._mutation_sigma = mutation_sigma

        # Precompute organism index array (reused every step)
        self._org_indices = np.arange(n_organisms)

        # Trajectory recording for scientific analysis
        self.trajectory_recorder = TrajectoryRecorder()

        # Disable hardcoded food-seeking in ecosystem — neural network drives ALL movement
        self.ecosystem._neural_control = True

        # No innate reflexes — evolution must discover sensory-motor coupling
        # from scratch. Organisms start with random weights and must evolve
        # food-seeking behavior through natural selection alone.
        # (Previously: _seed_innate_reflexes() injected hardcoded food→forward,
        # chemical→turn, danger→backward couplings that bypassed the neural network.)
        self._innate_food_forward = ([], [], 0)
        self._innate_chem_turn = ([], [], 0)
        self._innate_danger_backward = ([], [], 0)

        logger.info(
            "BrainWorld built: %d organisms x %d neurons = %d total, "
            "sensory=%d motor=%d, world=%s",
            n_organisms, neurons_per_organism,
            self.engine.n_total, self.n_sensory, self.n_motor, world_type,
        )

    def _seed_innate_reflexes(self) -> None:
        """Bias initial synaptic weights to create a baseline food-seeking reflex.

        Without this, random neural networks produce random movement and organisms
        starve before evolution can find useful circuits. This is biologically
        realistic — real animals are born with innate reflexes (e.g., C. elegans
        chemotaxis circuit is genetically specified).
        """
        n_per = self.n_per

        # Food sensory → forward motor pathway
        food_start, food_end = self.sensory_channels["food"]
        motor_start = n_per - self.n_motor
        n_third = self.n_motor // 3
        forward_neurons = list(range(motor_start, motor_start + n_third))

        # Chemical sensory → turn motor pathway (for gradient following)
        chem_start, chem_end = self.sensory_channels["chemical"]
        turn_neurons = list(range(motor_start + 2 * n_third, n_per))

        # Instead of adding synapses (which breaks the per-organism blocking),
        # implement the innate reflex as a DIRECT CURRENT COUPLING in the
        # sensory injection step. When food-sensory neurons fire, we directly
        # inject current into forward-motor neurons. This is like a hardwired
        # reflex arc that evolution can modulate by strengthening/weakening
        # the synaptic connections that feed INTO the motor neurons.
        danger_start, danger_end = self.sensory_channels["danger"]
        self._innate_food_forward = (
            list(range(food_start, food_end)),
            forward_neurons,
            0.5,  # weak coupling — enough to bias movement, not dominate
        )
        self._innate_chem_turn = (
            list(range(chem_start, chem_end)),
            turn_neurons,
            0.3,
        )
        self._innate_danger_backward = (
            list(range(danger_start, danger_end)),
            list(range(motor_start + n_third, motor_start + 2 * n_third)),
            0.3,
        )

        logger.info("Seeded innate reflexes as direct current coupling: food→forward, chemical→turn, danger→backward")

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
        # Only for organisms within engine range (overcapacity slots have no neural net)
        n_engine_org = self.engine.n_organisms
        if hasattr(eco, '_last_births') and eco._last_births:
            valid = [(p, o) for p, o in eco._last_births if p < n_engine_org and o < n_engine_org]
            if valid:
                parents = np.array([p for p, _ in valid])
                offspring = np.array([o for _, o in valid])
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

        # 8. Trajectory recording
        self.trajectory_recorder.record_step(self)

        return result

    # ------------------------------------------------------------------
    # Trajectory data persistence
    # ------------------------------------------------------------------

    def flush_trajectories(self, filepath: str) -> int:
        """Flush recorded trajectory data to an HDF5 file.

        Delegates to :pyclass:`TrajectoryRecorder.flush_to_hdf5`.
        Returns the number of samples written.
        """
        return self.trajectory_recorder.flush_to_hdf5(filepath)

    # ------------------------------------------------------------------
    # Chemotaxis measurement
    # ------------------------------------------------------------------

    def get_chemotaxis_index(self) -> dict[str, float]:
        """Measure how effectively organisms navigate toward food.

        Returns chemotaxis index (0.5 = random walk, >0.5 = directed food-seeking).
        Tracks positions by organism INDEX (not alive-mask) so births/deaths
        don't corrupt the measurement.
        """
        from creatures.evolution.analytics import measure_chemotaxis_index

        eco = self.ecosystem
        n_eng = self.engine.n_organisms
        alive_mask = eco.alive[:n_eng]
        alive_idx = np.where(alive_mask)[0]

        if len(alive_idx) == 0:
            return {"chemotaxis_index": 0.0, "mean_food_distance": 0.0,
                    "approaching_fraction": 0.0, "random_walk_baseline": 0.5}

        # Store ALL positions by index (not just alive) for stable tracking
        all_pos = np.column_stack([eco.x[:n_eng], eco.y[:n_eng]])

        # Food positions
        food_alive = np.where(eco.food_alive)[0]
        if len(food_alive) == 0:
            return {"chemotaxis_index": 0.0, "mean_food_distance": 0.0,
                    "approaching_fraction": 0.0, "random_walk_baseline": 0.5}
        food_pos = np.column_stack([eco.food_x[food_alive], eco.food_y[food_alive]])

        # Previous positions (indexed by organism, not by alive-mask)
        prev_all = getattr(self, '_prev_all_positions', None)

        # Store current for next call
        self._prev_all_positions = all_pos.copy()

        if prev_all is None or len(prev_all) != len(all_pos):
            # First call — compute food distance only
            alive_pos = all_pos[alive_idx]
            dx = alive_pos[:, 0:1] - food_pos[:, 0]
            dy = alive_pos[:, 1:2] - food_pos[:, 1]
            dists = np.sqrt(dx ** 2 + dy ** 2)
            return {"chemotaxis_index": 0.0,
                    "mean_food_distance": float(np.mean(np.min(dists, axis=1))),
                    "approaching_fraction": 0.0, "random_walk_baseline": 0.5}

        # Compute CI only for organisms alive in BOTH this step and previous
        # (use same indices — positions are stored per-index)
        current_alive = all_pos[alive_idx]
        prev_alive = prev_all[alive_idx]

        return measure_chemotaxis_index(current_alive, food_pos, prev_alive)

    # ------------------------------------------------------------------
    # Neural weight inheritance
    # ------------------------------------------------------------------

    def _inherit_neural_weights(self, parent_indices: np.ndarray, offspring_indices: np.ndarray) -> None:
        """Copy parent neural weights to offspring with adaptive mutation.

        Mutation rate starts high (sigma=0.5) for exploration and decays
        toward sigma_min (0.05) as the population evolves, following:
          sigma = sigma_min + (sigma_max - sigma_min) * exp(-generation / tau)
        """
        eco = self.ecosystem
        # Adaptive mutation: high early (exploration), low late (exploitation)
        max_gen = int(eco.generation[eco.alive].max()) if eco.alive.any() else 0
        sigma_max = 0.5
        sigma_min = 0.05
        tau = 50  # half-life in generations
        mutation_sigma = sigma_min + (sigma_max - sigma_min) * np.exp(-max_gen / tau)

        for parent_idx, offspring_idx in zip(parent_indices, offspring_indices):
            self.engine.inherit_weights(int(parent_idx), int(offspring_idx), mutation_sigma)

    # ------------------------------------------------------------------
    # Sensory injection (fully vectorized -- no loops over organisms)
    # ------------------------------------------------------------------

    def _inject_sensory_input(self, alive: np.ndarray) -> None:
        """Convert environment signals to neural currents for all organisms.

        Uses SensoryWorld / world.sense_at() when available to provide rich
        multi-modal input (chemical gradients, temperature fields, toxic zones).
        Falls back to hardcoded heuristics when the world lacks sense_at().

        Builds the full I_ext array in numpy, then converts to backend
        format in one shot (avoids per-element MLX conversions).
        """
        eco = self.ecosystem
        org_idx = self._org_indices
        n_org = len(org_idx)  # engine organisms (may be < total ecosystem slots)

        # Build I_ext as numpy, convert at the end
        I_ext_np = np.zeros(self.engine.n_total, dtype=np.float32)

        alive_org = alive[:n_org]

        # Check if the world supports rich sensory queries
        has_sense_at = hasattr(self.world, 'sense_at')

        # --- Sample SensoryWorld for a sparse set of organisms ---
        # Calling sense_at() per-organism is expensive at scale, so we sample
        # a subset and interpolate / broadcast for the rest. For the vectorized
        # channels (food proximity, chemical alignment) we keep the existing
        # fast numpy path and ADD the SensoryWorld signal on top.
        sensory_cache: dict[int, dict] | None = None
        if has_sense_at:
            # Sample up to 200 organisms for SensoryWorld queries
            alive_indices = np.where(alive_org)[0]
            n_sample = min(len(alive_indices), 200)
            if n_sample > 0:
                if len(alive_indices) > n_sample:
                    sample_idx = np.sort(
                        np.random.default_rng(self._step_count).choice(
                            alive_indices, n_sample, replace=False
                        )
                    )
                else:
                    sample_idx = alive_indices

                # Detect sense_at signature once: worlds.py classes use
                # sense_at(x, y) while SensoryWorld uses sense_at((x, y)).
                if not hasattr(self, '_sense_at_uses_tuple'):
                    test_x, test_y = float(eco.x[sample_idx[0]]), float(eco.y[sample_idx[0]])
                    try:
                        self.world.sense_at(test_x, test_y)
                        self._sense_at_uses_tuple = False
                    except TypeError:
                        self._sense_at_uses_tuple = True

                sensory_cache = {}
                for i in sample_idx:
                    xi, yi = float(eco.x[i]), float(eco.y[i])
                    if self._sense_at_uses_tuple:
                        sensory_cache[int(i)] = self.world.sense_at((xi, yi))
                    else:
                        sensory_cache[int(i)] = self.world.sense_at(xi, yi)

        # --- Food proximity signal (primary food channel — always active) ---
        food_alive_idx = np.where(eco.food_alive)[0]
        if len(food_alive_idx) > 0:
            max_food = min(len(food_alive_idx), 500)
            if len(food_alive_idx) > max_food:
                food_sample = eco._rng.choice(food_alive_idx, max_food, replace=False)
            else:
                food_sample = food_alive_idx

            # Only compute for engine organisms (first n_org), not overcapacity slots
            dx = eco.x[:n_org, None] - eco.food_x[food_sample][None, :]
            dy = eco.y[:n_org, None] - eco.food_y[food_sample][None, :]
            dist = np.sqrt(dx * dx + dy * dy)
            nearest_dist = np.min(dist, axis=1)

            food_signal = np.clip(1.0 - nearest_dist / 5.0, 0.0, 1.0) * 30.0
            food_signal *= alive_org

            nearest_idx = np.argmin(dist, axis=1)
            best_dx = dx[np.arange(n_org), nearest_idx]
            best_dy = dy[np.arange(n_org), nearest_idx]
            best_dist = nearest_dist + 1e-8

            heading = eco.heading[:n_org]
            food_dir_x = -best_dx / best_dist
            food_dir_y = -best_dy / best_dist
            alignment = np.cos(heading) * food_dir_x + np.sin(heading) * food_dir_y
            chemical_signal = np.clip(alignment, -1.0, 1.0) * 20.0 * alive_org

            # Food channel
            food_start, food_end = self.sensory_channels["food"]
            food_offsets = np.arange(food_start, food_end)
            global_food = (org_idx[:, None] * self.n_per + food_offsets[None, :]).ravel()
            I_ext_np[global_food] = np.repeat(food_signal, food_end - food_start)

            # Chemical channel: food-heading alignment (always present)
            chem_start, chem_end = self.sensory_channels["chemical"]
            chem_offsets = np.arange(chem_start, chem_end)
            global_chem = (org_idx[:, None] * self.n_per + chem_offsets[None, :]).ravel()
            I_ext_np[global_chem] = np.repeat(chemical_signal, chem_end - chem_start)

        # --- Chemical channel enhancement from SensoryWorld gradients ---
        # Add chemical gradient direction signal on top of food-alignment signal.
        # Gradient direction from SensoryWorld tells organisms which way to turn
        # to climb the chemical concentration hill toward food clusters.
        if sensory_cache:
            chem_start, chem_end = self.sensory_channels["chemical"]
            n_chem = chem_end - chem_start
            chem_offsets = np.arange(chem_start, chem_end)
            heading = eco.heading[:n_org]

            for org_i, sensory in sensory_cache.items():
                grad_dirs = sensory.get("gradient_direction", {})
                if not grad_dirs:
                    continue
                # Aggregate all chemical gradient directions into one signal:
                # how well is the organism's heading aligned with the gradient?
                total_gx, total_gy = 0.0, 0.0
                for _name, (gx, gy) in grad_dirs.items():
                    total_gx += gx
                    total_gy += gy
                gmag = (total_gx ** 2 + total_gy ** 2) ** 0.5
                if gmag < 1e-10:
                    continue
                # Normalize and compute alignment with organism heading
                gx_n = total_gx / gmag
                gy_n = total_gy / gmag
                h = float(heading[org_i])
                grad_alignment = np.cos(h) * gx_n + np.sin(h) * gy_n
                # Scale: +/- 15 pA additional current (additive to food alignment)
                grad_current = float(np.clip(grad_alignment, -1.0, 1.0)) * 15.0
                global_neurons = org_i * self.n_per + chem_offsets
                I_ext_np[global_neurons] += grad_current

        # --- Temperature signal ---
        # Use SensoryWorld temperature field if available; otherwise fall back
        # to y-position heuristic.
        temp_start, temp_end = self.sensory_channels["temperature"]
        temp_offsets = np.arange(temp_start, temp_end)
        global_temp = (org_idx[:, None] * self.n_per + temp_offsets[None, :]).ravel()

        if sensory_cache:
            # Build temperature signal from SensoryWorld for sampled organisms,
            # fall back to y-position for non-sampled organisms.
            half = eco.arena_size / 2.0
            temp_signal = (eco.y[:n_org] + half) / eco.arena_size * 15.0 * alive_org

            for org_i, sensory in sensory_cache.items():
                temp_val = sensory.get("temperature")
                if temp_val is not None:
                    # Normalize temperature to neural current. Temperature fields
                    # typically range 15-25 C. Map to 0-30 pA current range so
                    # organisms can distinguish warm from cold regions.
                    temp_signal[org_i] = float(
                        np.clip((temp_val - 10.0) / 20.0, 0.0, 1.0)
                    ) * 30.0 * float(alive_org[org_i])

            I_ext_np[global_temp] = np.repeat(temp_signal, temp_end - temp_start)
        else:
            # Fallback: y-position as temperature proxy
            half = eco.arena_size / 2.0
            temp_normalized = (eco.y[:n_org] + half) / eco.arena_size
            temp_signal = temp_normalized * 15.0 * alive_org
            I_ext_np[global_temp] = np.repeat(temp_signal, temp_end - temp_start)

        # --- Danger signal ---
        # Base signal: low energy = danger (interoception / hunger)
        danger_signal = np.clip(1.0 - eco.energy[:n_org] / 50.0, 0.0, 1.0) * 25.0 * alive_org

        # Add toxic zone sensing from SensoryWorld if available.
        # Toxin exposure creates a nociceptive (pain) signal that organisms
        # must evolve to avoid — selection pressure for pain avoidance.
        if sensory_cache:
            for org_i, sensory in sensory_cache.items():
                toxin = sensory.get("toxin_exposure", 0.0)
                if toxin > 0.0:
                    # Toxin damage rate scaled to neural current (0-30 pA).
                    # Typical damage_rate is 5.0 at zone center, so /5 * 30 = 30 pA max.
                    toxin_current = min(toxin / 5.0, 1.0) * 30.0
                    danger_signal[org_i] = min(
                        danger_signal[org_i] + toxin_current, 50.0
                    ) * float(alive_org[org_i])

        danger_start, danger_end = self.sensory_channels["danger"]
        danger_offsets = np.arange(danger_start, danger_end)
        global_danger = (org_idx[:, None] * self.n_per + danger_offsets[None, :]).ravel()
        I_ext_np[global_danger] = np.repeat(danger_signal, danger_end - danger_start)

        # --- Neighbor density signal ---
        # Count how many other organisms are within radius 3 of each organism.
        # This is the foundation for social behavior — organisms can "sense"
        # nearby conspecifics, enabling aggregation, avoidance, and mating.
        neighbor_radius = 3.0
        nd_start, nd_end = self.sensory_channels["neighbor_density"]
        nd_offsets = np.arange(nd_start, nd_end)
        global_nd = (org_idx[:, None] * self.n_per + nd_offsets[None, :]).ravel()

        # Efficient neighbor counting: use a random subsample of alive organisms
        # as "probe" positions to avoid O(n^2) all-pairs distance computation.
        alive_indices = np.where(alive_org)[0]
        if len(alive_indices) > 1:
            max_probes = min(len(alive_indices), 500)
            if len(alive_indices) > max_probes:
                probe_idx = np.random.default_rng(self._step_count).choice(
                    alive_indices, max_probes, replace=False
                )
            else:
                probe_idx = alive_indices

            # Distance from each organism to each probe organism
            ox = eco.x[:n_org]
            oy = eco.y[:n_org]
            px = eco.x[probe_idx]
            py = eco.y[probe_idx]
            ddx = ox[:, None] - px[None, :]
            ddy = oy[:, None] - py[None, :]
            probe_dist = np.sqrt(ddx * ddx + ddy * ddy)

            # Count neighbors within radius (exclude self — distance ~0)
            neighbors_in_range = np.sum(
                (probe_dist < neighbor_radius) & (probe_dist > 1e-6), axis=1
            ).astype(np.float32)

            # Scale by sampling ratio if we subsampled
            if len(alive_indices) > max_probes:
                neighbors_in_range *= float(len(alive_indices)) / float(max_probes)

            # Normalize to neural current: 0 neighbors = 0, 10+ neighbors = 25 pA
            nd_signal = np.clip(neighbors_in_range / 10.0, 0.0, 1.0) * 25.0 * alive_org
            I_ext_np[global_nd] = np.repeat(nd_signal, nd_end - nd_start)

        # --- Innate reflex coupling ---
        # Directly inject current into motor neurons proportional to sensory activation.
        # This creates a baseline food-seeking reflex that evolution can modulate.
        for sensory_ids, motor_ids, strength in [
            getattr(self, '_innate_food_forward', ([], [], 0)),
            getattr(self, '_innate_chem_turn', ([], [], 0)),
            getattr(self, '_innate_danger_backward', ([], [], 0)),
        ]:
            if sensory_ids and motor_ids and strength > 0:
                for m_n in motor_ids:
                    # Sum sensory current for each organism, inject into motor neuron
                    sensory_sum = np.zeros(n_org)
                    for s_n in sensory_ids:
                        global_s = org_idx * self.n_per + s_n
                        sensory_sum += I_ext_np[global_s]
                    avg_sensory = sensory_sum / max(len(sensory_ids), 1)
                    global_m = org_idx * self.n_per + m_n
                    I_ext_np[global_m] += avg_sensory * strength

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
        org_idx = self._org_indices
        n_org = len(org_idx)

        # Read firing rates — convert to numpy if needed
        fr = self.engine._to_numpy(self.engine.firing_rate)

        # Pool motor neuron rates (loop over ~7 neuron indices, not organisms)
        forward_rate = np.zeros(n_org)
        for n_idx in self.motor_forward:
            forward_rate += fr[org_idx * self.n_per + n_idx]

        backward_rate = np.zeros(n_org)
        for n_idx in self.motor_backward:
            backward_rate += fr[org_idx * self.n_per + n_idx]

        turn_rate = np.zeros(n_org)
        for n_idx in self.motor_turn:
            turn_rate += fr[org_idx * self.n_per + n_idx]

        pitch_rate = np.zeros(n_org)
        for n_idx in self.motor_pitch:
            pitch_rate += fr[org_idx * self.n_per + n_idx]

        alive_f = alive[:n_org].astype(np.float64)

        # Motor decode for 3D world:
        # Base speed from morphology (if available), otherwise 0.3
        if hasattr(eco, 'morphology'):
            from creatures.evolution.morphology import compute_speed
            morph_speed = compute_speed(eco.morphology[:n_org])
            base_speed = morph_speed * 0.3  # scale to arena units
        else:
            base_speed = np.full(n_org, 0.3)

        neural_speed = (forward_rate - backward_rate) * 0.003
        speed = (base_speed + neural_speed) * alive_f
        speed = np.clip(speed, 0.05, 2.0) * alive_f

        # Turn + pitch: neural activity + jitter for exploration
        neural_turn = turn_rate * 0.015
        jitter = np.random.default_rng().normal(0, 0.1, n_org) * alive_f
        turn = (neural_turn + jitter) * alive_f

        neural_pitch = (pitch_rate - np.mean(pitch_rate)) * 0.008
        pitch_change = neural_pitch * alive_f

        # Update orientation
        eco.heading[:n_org] += turn
        eco.pitch[:n_org] = np.clip(eco.pitch[:n_org] + pitch_change, -0.5, 0.5)

        # 3D movement: heading + pitch → direction vector
        cos_h = np.cos(eco.heading[:n_org])
        sin_h = np.sin(eco.heading[:n_org])
        cos_p = np.cos(eco.pitch[:n_org])
        sin_p = np.sin(eco.pitch[:n_org])

        eco.x[:n_org] += cos_h * cos_p * speed
        eco.y[:n_org] += sin_h * cos_p * speed
        eco.z[:n_org] += sin_p * speed

        # Arena boundary wrapping (x, y) and ground clamping (z)
        half = eco.arena_size / 2.0
        eco.x = ((eco.x + half) % eco.arena_size) - half
        eco.y = ((eco.y + half) % eco.arena_size) - half
        eco.z = np.maximum(eco.z, 0.0)  # can't go below ground

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

    def get_organism_detail(self, org_idx: int) -> dict[str, Any]:
        """Extract detailed neural and ecological data for a single organism.

        Parameters
        ----------
        org_idx:
            Integer index of the organism (0-based, must be within engine range).

        Returns
        -------
        dict with neural firing rates, STDP weight stats, ecosystem state,
        and simple behavior classification for the organism.
        """
        eco = self.ecosystem
        engine = self.engine
        n_per = self.n_per

        # Validate index
        if org_idx < 0 or org_idx >= engine.n_organisms:
            raise IndexError(
                f"org_idx {org_idx} out of range [0, {engine.n_organisms})"
            )

        # --- Neural data ---
        neuron_start = org_idx * n_per
        neuron_end = (org_idx + 1) * n_per

        fr_np = engine._to_numpy(engine.firing_rate)
        org_firing_rates = fr_np[neuron_start:neuron_end].tolist()

        fired_np = engine._to_numpy(engine.fired)
        org_fired = fired_np[neuron_start:neuron_end]

        # Break firing rates into roles
        sensory_rates = fr_np[neuron_start:neuron_start + self.n_sensory].tolist()
        motor_start_idx = neuron_start + n_per - self.n_motor
        motor_rates = fr_np[motor_start_idx:neuron_end].tolist()
        inter_rates = fr_np[neuron_start + self.n_sensory:motor_start_idx].tolist()

        neural_data: dict[str, Any] = {
            "firing_rates": org_firing_rates,
            "active_neurons": int(np.sum(org_fired)),
            "mean_firing_rate": float(np.mean(fr_np[neuron_start:neuron_end])),
            "sensory_rates": sensory_rates,
            "inter_rates": inter_rates,
            "motor_rates": motor_rates,
        }

        # --- STDP weight data (if enabled) ---
        if engine.enable_stdp:
            w_start, w_end = engine.get_organism_weight_range(org_idx)
            syn_w_np = engine._to_numpy(engine.syn_w)
            org_weights = syn_w_np[w_start:w_end]

            apre_np = engine._to_numpy(engine.apre)
            apost_np = engine._to_numpy(engine.apost)
            org_apre = apre_np[w_start:w_end]
            org_apost = apost_np[w_start:w_end]

            neural_data["stdp"] = {
                "n_synapses": int(w_end - w_start),
                "mean_weight": float(np.mean(org_weights)) if len(org_weights) > 0 else 0.0,
                "std_weight": float(np.std(org_weights)) if len(org_weights) > 0 else 0.0,
                "min_weight": float(np.min(org_weights)) if len(org_weights) > 0 else 0.0,
                "max_weight": float(np.max(org_weights)) if len(org_weights) > 0 else 0.0,
                "mean_apre": float(np.mean(org_apre)) if len(org_apre) > 0 else 0.0,
                "mean_apost": float(np.mean(org_apost)) if len(org_apost) > 0 else 0.0,
            }

        # --- Ecosystem data ---
        alive = bool(eco.alive[org_idx])
        eco_data = {
            "alive": alive,
            "x": float(eco.x[org_idx]),
            "y": float(eco.y[org_idx]),
            "heading": float(eco.heading[org_idx]),
            "energy": float(eco.energy[org_idx]),
            "age": float(eco.age[org_idx]),
            "generation": int(eco.generation[org_idx]),
            "lineage_id": int(eco.lineage_id[org_idx]),
            "parent_id": int(eco.parent_id[org_idx]),
            "species": "c_elegans" if eco.species[org_idx] == 0 else "drosophila",
            "lifetime_food": float(eco.lifetime_food[org_idx]),
        }

        # --- Behavior classification ---
        # Speed: derived from motor neuron firing rates (same logic as _decode_motor_output)
        forward_rate = sum(
            fr_np[org_idx * n_per + n_idx] for n_idx in self.motor_forward
        )
        backward_rate = sum(
            fr_np[org_idx * n_per + n_idx] for n_idx in self.motor_backward
        )
        turn_rate = sum(
            fr_np[org_idx * n_per + n_idx] for n_idx in self.motor_turn
        )
        speed = float(abs(forward_rate - backward_rate) * 0.005)

        # Linearity: net displacement from origin / (speed * age + epsilon)
        # Approximation — true path-length requires trajectory history
        displacement = float(np.sqrt(eco.x[org_idx] ** 2 + eco.y[org_idx] ** 2))
        estimated_path = speed * float(eco.age[org_idx]) + 1e-8
        linearity = min(float(displacement / estimated_path), 1.0)

        behavior = {
            "speed": speed,
            "forward_rate": float(forward_rate),
            "backward_rate": float(backward_rate),
            "turn_rate": float(turn_rate),
            "displacement": displacement,
            "linearity": linearity,
        }

        return {
            "org_idx": org_idx,
            "neural": neural_data,
            "ecosystem": eco_data,
            "behavior": behavior,
        }

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
