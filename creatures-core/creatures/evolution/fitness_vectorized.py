"""Batch vectorized fitness evaluation using VectorizedEngine + MLX GPU.

Evaluates an entire population in a single simulation by building one engine
with n_organisms = population_size, each organism slot loaded from its genome's
connectome. Runs ~250ms for 50 organisms x 302 neurons on Apple Silicon.

Scoring (0-100 scale):
  - Sensory-motor response (30 pts)
  - Neural dynamics quality (30 pts)
  - Firing pattern diversity (20 pts)
  - Environment interaction (20 pts) — differential response to food vs toxic
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from creatures.evolution.environment_config import EnvironmentConfig
from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


class BatchVectorizedFitness:
    """Evaluate a batch of genomes using a single VectorizedEngine instance.

    Each genome's connectome is loaded into a separate organism slot in
    the engine's block-diagonal weight matrix.
    """

    def __init__(
        self,
        env_config: EnvironmentConfig | None = None,
        use_gpu: bool = True,
        sim_ms: float = 500.0,
    ):
        self.env_config = env_config or EnvironmentConfig()
        self.use_gpu = use_gpu
        self.sim_ms = sim_ms

    def evaluate_batch(
        self,
        genomes: list[Genome],
        neuron_model: str = "izhikevich",
    ) -> dict[str, float]:
        """Evaluate all genomes and return {genome.id: fitness_score}.

        Falls back to per-genome evaluation if batch build fails.
        """
        from creatures.neural.vectorized_engine import NeuronModel, VectorizedEngine

        if not genomes:
            return {}

        # Find a common neuron count (use the first genome's size)
        n_per = genomes[0].n_neurons
        if n_per == 0:
            return {g.id: 0.0 for g in genomes}

        n_organisms = len(genomes)

        model = NeuronModel(neuron_model)
        engine = VectorizedEngine(use_gpu=self.use_gpu, neuron_model=model)

        # Build from genome connectomes
        try:
            self._build_from_genomes(engine, genomes, neuron_model)
        except Exception as e:
            logger.warning(f"Batch build failed ({e}), falling back to sequential evaluation")
            return self._evaluate_sequential(genomes, neuron_model)

        # Classify sensory/motor neurons using first genome as reference
        from creatures.connectome.types import NeuronType
        sensory_idx_template = [
            i for i, nid in enumerate(genomes[0].neuron_ids)
            if genomes[0].neuron_types.get(nid) == NeuronType.SENSORY
        ]
        motor_idx_template = [
            i for i, nid in enumerate(genomes[0].neuron_ids)
            if genomes[0].neuron_types.get(nid) == NeuronType.MOTOR
        ]

        # Run simulation
        n_steps = int(self.sim_ms / engine.dt)
        rng = np.random.default_rng(42)

        # Track per-organism metrics
        motor_responses = [[] for _ in range(n_organisms)]
        first_motor_spike = [None] * n_organisms
        food_stimulus_responses = [0] * n_organisms
        toxic_stimulus_responses = [0] * n_organisms

        for step_i in range(n_steps):
            t_ms = step_i * engine.dt

            # Stimulus: poke sensory neurons at t=100ms
            if 100.0 <= t_ms < 120.0 and sensory_idx_template:
                for org_i in range(n_organisms):
                    offset = org_i * n_per
                    n_stim = min(len(sensory_idx_template), 20)
                    global_idx = [offset + s for s in sensory_idx_template[:n_stim]]
                    engine.inject_stimulus([0], global_idx, 25.0)
            elif step_i == int(120.0 / engine.dt):
                engine.clear_input()

            # Environment-driven stimulus at t=300ms
            if 300.0 <= t_ms < 400.0:
                food_positions = self.env_config.get_food_positions()
                toxic_positions = self.env_config.get_toxic_positions()

                for org_i in range(n_organisms):
                    offset = org_i * n_per
                    # Simulate organism position (spread organisms across arena)
                    angle = (org_i / n_organisms) * 2 * np.pi
                    org_x = np.cos(angle) * 0.3
                    org_y = np.sin(angle) * 0.3

                    if sensory_idx_template:
                        stim = self.env_config.compute_stimulus_for_position(
                            org_x, org_y, len(sensory_idx_template)
                        )
                        for si, s_idx in enumerate(sensory_idx_template[:len(stim)]):
                            if abs(stim[si]) > 0.1:
                                engine.inject_stimulus([0], [offset + s_idx], float(stim[si]))

            # Clear environment stimulus after window ends
            elif step_i == int(400.0 / engine.dt):
                engine.clear_input()

            # Background noise every 20 steps
            if step_i % 20 == 0:
                for org_i in range(n_organisms):
                    offset = org_i * n_per
                    noise_n = max(1, n_per // 20)
                    noise_idx = rng.choice(n_per, noise_n, replace=False)
                    global_idx = [offset + int(ni) for ni in noise_idx]
                    engine.inject_stimulus([0], global_idx, float(rng.uniform(5, 12)))

            engine.step()

            # Track motor responses per organism
            if motor_idx_template:
                fired_np = engine._to_numpy(engine.fired)
                for org_i in range(n_organisms):
                    offset = org_i * n_per
                    motor_fired = sum(1 for m in motor_idx_template if fired_np[offset + m])
                    motor_responses[org_i].append(motor_fired)
                    if motor_fired > 0 and first_motor_spike[org_i] is None:
                        first_motor_spike[org_i] = step_i

                    # Track environment responses (during env stimulus window)
                    if 300.0 <= t_ms < 400.0 and motor_fired > 0:
                        # Check if this organism is near food or toxic zones
                        angle = (org_i / n_organisms) * 2 * np.pi
                        org_x, org_y = np.cos(angle) * 0.3, np.sin(angle) * 0.3
                        for fx, fy in self.env_config.get_food_positions():
                            if np.sqrt((org_x - fx)**2 + (org_y - fy)**2) < 0.5:
                                food_stimulus_responses[org_i] += motor_fired
                        for tx, ty, tr in self.env_config.get_toxic_positions():
                            if np.sqrt((org_x - tx)**2 + (org_y - ty)**2) < 0.5:
                                toxic_stimulus_responses[org_i] += motor_fired

        # === SCORING ===
        indices, times = engine.get_spike_history()
        results: dict[str, float] = {}

        for org_i, genome in enumerate(genomes):
            offset = org_i * n_per

            # Count spikes for this organism
            org_spikes = sum(1 for idx in indices if offset <= idx < offset + n_per)
            org_unique = len(set(
                idx - offset for idx in indices if offset <= idx < offset + n_per
            ))

            # 1. Sensory-motor response (30 pts)
            sm_pts = 0.0
            if first_motor_spike[org_i] is not None:
                latency_steps = first_motor_spike[org_i] - int(100.0 / engine.dt)
                latency_ms = latency_steps * engine.dt
                if 0 < latency_ms < 50:
                    sm_pts += 15 * (1 - latency_ms / 50)
                elif latency_ms >= 50:
                    sm_pts += 5 * max(0, 1 - latency_ms / 200)

                # Motor activation diversity
                if motor_responses[org_i]:
                    active_steps = sum(1 for m in motor_responses[org_i] if m > 0)
                    participation = active_steps / max(1, len(motor_responses[org_i]))
                    sm_pts += 15 * min(1, participation * 2)

            # 2. Neural dynamics (30 pts)
            dynamics_pts = 0.0
            if n_steps > 0:
                spike_rate = org_spikes / max(1, n_per * n_steps)
                # Reward moderate firing (~5-15% rate)
                ideal_rate = 0.08
                rate_score = np.exp(-((spike_rate - ideal_rate) ** 2) / (2 * 0.04 ** 2))
                dynamics_pts += 15 * rate_score

                # Neural participation
                if n_per > 0:
                    participation = org_unique / n_per
                    dynamics_pts += 15 * min(1, participation * 1.5)

            # 3. Firing diversity (20 pts)
            diversity_pts = 0.0
            if motor_responses[org_i]:
                motor_rates = [float(m) for m in motor_responses[org_i] if m > 0]
                if len(motor_rates) > 5:
                    cv = float(np.std(motor_rates)) / max(0.001, float(np.mean(motor_rates)))
                    diversity_pts = 20 * min(1, cv / 1.5)

            # 4. Environment interaction (20 pts)
            env_pts = 0.0
            food_resp = food_stimulus_responses[org_i]
            toxic_resp = toxic_stimulus_responses[org_i]
            # Reward organisms that respond MORE to food and LESS to toxins
            if food_resp > 0:
                env_pts += 10 * min(1, food_resp / 20)
            if food_resp > toxic_resp:
                env_pts += 10 * min(1, (food_resp - toxic_resp) / max(1, food_resp))
            elif food_resp == 0 and toxic_resp == 0:
                env_pts += 2  # Some baseline for no response

            fitness = sm_pts + dynamics_pts + diversity_pts + env_pts

            genome.fitness = fitness
            genome.metadata["fitness_breakdown"] = {
                "sensory_motor": round(sm_pts, 2),
                "neural_dynamics": round(dynamics_pts, 2),
                "firing_diversity": round(diversity_pts, 2),
                "environment": round(env_pts, 2),
            }
            results[genome.id] = fitness

        logger.info(
            "Batch evaluation: %d genomes, %.1fms sim, best=%.1f, mean=%.1f",
            n_organisms, self.sim_ms,
            max(results.values()) if results else 0,
            sum(results.values()) / max(1, len(results)),
        )
        return results

    def _build_from_genomes(
        self,
        engine: Any,
        genomes: list[Genome],
        neuron_model: str,
    ) -> None:
        """Build a VectorizedEngine from a list of genomes.

        Constructs a block-diagonal weight matrix where each organism slot
        gets its genome's connectome weights.
        """
        from creatures.neural.vectorized_engine import NeuronModel

        n_organisms = len(genomes)
        n_per = genomes[0].n_neurons
        xp = engine.xp
        fdtype = engine._float_dtype
        np_fdtype = np.float32 if engine._backend == "mlx" else np.float64
        np_idtype = np.int32 if engine._backend == "mlx" else np.int64

        engine.n_organisms = n_organisms
        engine.n_per = n_per
        engine.n_total = n_organisms * n_per

        # State arrays
        if engine._neuron_model == NeuronModel.LIF:
            engine.v = xp.full(engine.n_total, engine.v_rest, dtype=fdtype)
        else:
            engine.v = xp.full(engine.n_total, -65.0, dtype=fdtype)
            engine.u = xp.full(engine.n_total, -65.0 * 0.2, dtype=fdtype)
            engine._init_izhikevich_params(neuron_model if neuron_model != "izhikevich" else "regular_spiking")

        engine.fired = xp.zeros(engine.n_total, dtype=xp.bool_)
        engine.firing_rate = xp.zeros(engine.n_total, dtype=fdtype)
        engine.I_ext = xp.zeros(engine.n_total, dtype=fdtype)

        # Build block-diagonal synapses from genome connectomes
        all_pre = []
        all_post = []
        all_w = []
        synapse_offsets = [0]

        for org_i, genome in enumerate(genomes):
            offset = org_i * n_per
            connectome = genome.to_connectome()

            try:
                b2_params = connectome.to_brian2_params()
                pre = np.asarray(b2_params["i"], dtype=np_idtype) + offset
                post = np.asarray(b2_params["j"], dtype=np_idtype) + offset
                w = np.asarray(b2_params["w"], dtype=np_fdtype)
            except Exception:
                # Fallback: use genome arrays directly
                pre = genome.pre_indices.astype(np_idtype) + offset
                post = genome.post_indices.astype(np_idtype) + offset
                w = genome.weights.astype(np_fdtype)

            all_pre.append(pre)
            all_post.append(post)
            all_w.append(w)
            synapse_offsets.append(synapse_offsets[-1] + len(pre))

            # Load Izhikevich params from genome if available
            if (engine._neuron_model == NeuronModel.IZHIKEVICH
                    and genome.iz_a is not None):
                iz_len = min(len(genome.iz_a), n_per)
                engine.iz_a[offset:offset + iz_len] = xp.array(
                    genome.iz_a[:iz_len].astype(np_fdtype))
                engine.iz_b[offset:offset + iz_len] = xp.array(
                    genome.iz_b[:iz_len].astype(np_fdtype))
                engine.iz_c[offset:offset + iz_len] = xp.array(
                    genome.iz_c[:iz_len].astype(np_fdtype))
                engine.iz_d[offset:offset + iz_len] = xp.array(
                    genome.iz_d[:iz_len].astype(np_fdtype))

        engine.syn_pre = xp.array(np.concatenate(all_pre))
        engine.syn_post = xp.array(np.concatenate(all_post))
        engine.syn_w = xp.array(np.concatenate(all_w))
        engine.n_synapses = len(engine.syn_pre)
        engine._synapse_offsets = np.array(synapse_offsets, dtype=np_idtype)

        engine._eval(
            engine.v, engine.fired, engine.firing_rate, engine.I_ext,
            engine.u, engine.iz_a, engine.iz_b, engine.iz_c, engine.iz_d,
            engine.syn_pre, engine.syn_post, engine.syn_w,
        )

        logger.info(
            "BatchVectorizedFitness built: %d organisms x %d neurons = %d total, %d synapses",
            n_organisms, n_per, engine.n_total, engine.n_synapses,
        )

    def _evaluate_sequential(
        self,
        genomes: list[Genome],
        neuron_model: str,
    ) -> dict[str, float]:
        """Fallback: evaluate one genome at a time."""
        from creatures.evolution.fitness import FitnessConfig, evaluate_genome_vectorized

        config = FitnessConfig(lifetime_ms=self.sim_ms)
        results = {}
        for genome in genomes:
            try:
                fitness = evaluate_genome_vectorized(
                    genome, config, use_gpu=self.use_gpu, neuron_model=neuron_model
                )
                results[genome.id] = fitness
            except Exception as e:
                logger.warning(f"Sequential eval failed for {genome.id}: {e}")
                results[genome.id] = 0.0
        return results
