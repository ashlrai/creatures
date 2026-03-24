"""Fitness evaluation: run a genome through Brian2 + MuJoCo simulation.

Measures how well a genome-encoded neural network drives the worm body.
Fitness = weighted combination of distance traveled, neural activity,
and efficiency.

Three tiers:
  - evaluate_genome_fast()   : topology + weight analysis, <0.01s
  - evaluate_genome_medium() : short Brian2 sim (100ms), ~5-10s
  - evaluate_genome()        : full Brian2 + MuJoCo sim, ~200s+
"""

from __future__ import annotations

import hashlib
import logging
from collections import deque
from dataclasses import dataclass

import numpy as np

from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


@dataclass
class FitnessConfig:
    """Weights and parameters for fitness evaluation."""

    organism: str = "c_elegans"  # "c_elegans" or "drosophila"
    lifetime_ms: float = 10000.0  # 10 seconds sim time
    w_distance: float = 1.0  # reward for distance traveled
    w_food: float = 2.0  # placeholder for future food reward
    w_efficiency: float = 0.5  # reward for neural efficiency (penalize silence)

    # Poke stimulus to get things moving
    poke_at_ms: float = 100.0
    poke_segment: str = "seg_8"  # overridden to "Thorax" for drosophila
    poke_force: tuple[float, float, float] = (0, 0.1, 0)


@dataclass
class FitnessResult:
    """Detailed breakdown of a fitness evaluation."""

    total: float
    distance: float
    energy: float  # neural activity score
    n_spikes: int


def evaluate_genome(genome: Genome, config: FitnessConfig | None = None) -> float:
    """Evaluate a genome's fitness by running it through the full simulation.

    Builds a Brian2 spiking network from the genome's connectome,
    couples it to a MuJoCo body (worm or fly), runs for ``config.lifetime_ms``,
    and scores based on distance traveled and neural activity.

    Args:
        genome: The genome to evaluate.
        config: Fitness evaluation parameters.

    Returns:
        Scalar fitness value (higher is better).
    """
    from creatures.experiment.runner import CouplingConfig, SimulationRunner
    from creatures.neural.brian2_engine import Brian2Engine

    config = config or FitnessConfig()

    # Convert genome to connectome
    connectome = genome.to_connectome()

    # Build neural engine
    engine = Brian2Engine()
    engine.build(connectome)

    # Build body and runner based on organism
    if config.organism == "drosophila":
        from creatures.body.base import BodyConfig
        from creatures.body.fly_body import FlyBody
        from creatures.neural.base import MonitorConfig

        body = FlyBody(BodyConfig(dt=0.5), connectome=connectome)
        runner = SimulationRunner(engine, body, CouplingConfig(), connectome=connectome)
        # Override poke segment for fly
        poke_segment = "Thorax"
    else:
        from creatures.body.worm_body import WormBody

        body = WormBody()
        runner = SimulationRunner(engine, body, CouplingConfig())
        poke_segment = config.poke_segment

    # Run simulation with a poke stimulus to provoke movement
    frames = runner.run(
        duration_ms=config.lifetime_ms,
        poke_at_ms=config.poke_at_ms,
        poke_segment=poke_segment,
        poke_force=config.poke_force,
    )

    if not frames:
        genome.fitness = 0.0
        return 0.0

    # Measure distance traveled (from first to last center of mass)
    start_com = np.array(frames[0].body_state.center_of_mass)
    end_com = np.array(frames[-1].body_state.center_of_mass)
    distance = float(np.linalg.norm(end_com[:2] - start_com[:2]))

    # Count total spikes across all frames
    total_spikes = sum(len(f.active_neurons) for f in frames)

    # Neural activity score: reward active networks, penalize silent ones.
    # A completely silent network gets 0; moderate activity is best.
    n_steps = len(frames)
    spikes_per_step = total_spikes / max(n_steps, 1)
    n_neurons = genome.n_neurons
    # Ideal: ~5-20% of neurons active per step
    ideal_rate = n_neurons * 0.1
    if spikes_per_step < 0.1:
        # Nearly silent: heavy penalty
        activity_score = 0.0
    else:
        # Gaussian-shaped reward centered on ideal rate
        activity_score = float(np.exp(-0.5 * ((spikes_per_step - ideal_rate) / max(ideal_rate, 1)) ** 2))

    # Compute total fitness
    fitness = (
        config.w_distance * distance * 1000  # scale distance (meters) up
        + config.w_efficiency * activity_score
    )

    # Ensure non-negative
    fitness = max(fitness, 0.0)

    genome.fitness = fitness
    logger.debug(
        f"Genome {genome.id}: distance={distance:.4f}m, "
        f"spikes={total_spikes}, activity_score={activity_score:.3f}, "
        f"fitness={fitness:.3f}"
    )

    return fitness


def evaluate_genome_medium(genome: Genome, config: FitnessConfig | None = None) -> float:
    """Medium-speed fitness: run Brian2 for 100ms with a standard stimulus.

    Injects current into tail sensory neurons and measures motor neuron
    response. Avoids the MuJoCo body entirely -- pure neural evaluation.

    Takes ~5-10 seconds per genome. Gives biologically meaningful scores
    without the full 224s coupled simulation.

    Scoring (0-100 scale):
      - Time to first motor spike (faster = better, up to 25 pts)
      - Number of active motor neurons (more = better, up to 25 pts)
      - Firing rate variance across motors (diverse = better, up to 20 pts)
      - Total neural activity level (moderate is best, up to 15 pts)
      - Sensory-to-motor propagation (signal reaches motors, up to 15 pts)
    """
    from creatures.connectome.types import NeuronType
    from creatures.neural.brian2_engine import Brian2Engine

    config = config or FitnessConfig()

    connectome = genome.to_connectome()

    # Build neural engine
    # Note: for fly-scale networks (drosophila), voltage recording is already
    # disabled by default in MonitorConfig to avoid memory exhaustion.
    engine = Brian2Engine()
    engine.build(connectome)

    n_neurons = genome.n_neurons
    if n_neurons == 0:
        genome.fitness = 0.0
        return 0.0

    # Identify sensory and motor neurons
    sensory_ids = [
        nid for nid in genome.neuron_ids
        if genome.neuron_types.get(nid) == NeuronType.SENSORY
    ]
    motor_ids = [
        nid for nid in genome.neuron_ids
        if genome.neuron_types.get(nid) == NeuronType.MOTOR
    ]

    if not motor_ids:
        genome.fitness = 0.0
        return 0.0

    # Inject stimulus into tail sensory neurons (simulate a poke)
    # Pick last 20% of sensory neurons as "tail" sensory
    n_tail = max(1, len(sensory_ids) // 5)
    tail_sensory = sensory_ids[-n_tail:]
    stim_currents = {nid: 30.0 for nid in tail_sensory}
    engine.set_input_currents(stim_currents)

    # Run for 100ms in 10ms steps, tracking motor neuron activity
    sim_duration_ms = 100.0
    step_ms = 10.0
    n_steps = int(sim_duration_ms / step_ms)

    motor_idx_set = {engine.get_neuron_index(nid) for nid in motor_ids if engine.get_neuron_index(nid) is not None}
    first_motor_spike_ms = None
    motor_spike_counts = {nid: 0 for nid in motor_ids}
    total_spikes_per_step = []

    for step_i in range(n_steps):
        # Turn off stimulus after 30ms
        if step_i * step_ms >= 30.0:
            engine.set_input_currents({})

        state = engine.step(step_ms)

        # Track motor spikes
        motor_spikes_this_step = [
            idx for idx in state.spikes if idx in motor_idx_set
        ]
        total_spikes_per_step.append(len(state.spikes))

        if motor_spikes_this_step and first_motor_spike_ms is None:
            first_motor_spike_ms = (step_i + 1) * step_ms

        # Count per-motor-neuron spikes
        for idx in motor_spikes_this_step:
            nid = engine.neuron_ids[idx]
            if nid in motor_spike_counts:
                motor_spike_counts[nid] += 1

    # --- Score components ---

    # 1. Time to first motor spike (25 pts): faster is better
    if first_motor_spike_ms is not None:
        # 10ms = perfect, 100ms = 0
        latency_score = max(0.0, 1.0 - (first_motor_spike_ms - 10.0) / 90.0)
    else:
        latency_score = 0.0

    # 2. Number of active motor neurons (25 pts)
    active_motors = sum(1 for c in motor_spike_counts.values() if c > 0)
    motor_activation_score = active_motors / max(len(motor_ids), 1)

    # 3. Firing rate variance across motors (20 pts): diverse activation patterns
    motor_rates = np.array([float(c) for c in motor_spike_counts.values()])
    if active_motors > 1:
        rate_cv = float(np.std(motor_rates) / max(np.mean(motor_rates), 0.01))
        # Coefficient of variation ~0.5-1.5 is ideal
        variance_score = float(np.clip(rate_cv / 1.5, 0, 1))
    else:
        variance_score = 0.0

    # 4. Overall neural activity (15 pts): moderate is best
    mean_spikes_per_step = float(np.mean(total_spikes_per_step))
    ideal_activity = n_neurons * 0.08  # ~8% active per step
    if mean_spikes_per_step < 0.1:
        activity_score = 0.0
    else:
        activity_score = float(np.exp(
            -0.5 * ((mean_spikes_per_step - ideal_activity) / max(ideal_activity * 0.5, 1)) ** 2
        ))

    # 5. Sensory-to-motor propagation (15 pts): did the signal reach motors?
    # Check if motor activity increased after stimulus
    if n_steps >= 4:
        early_motor = sum(total_spikes_per_step[:2])
        late_motor = sum(total_spikes_per_step[2:5])
        propagation_score = 1.0 if late_motor > early_motor else 0.3
    else:
        propagation_score = 0.5

    fitness = (
        latency_score * 25.0
        + motor_activation_score * 25.0
        + variance_score * 20.0
        + activity_score * 15.0
        + propagation_score * 15.0
    )

    genome.fitness = fitness
    logger.debug(
        f"Genome {genome.id} [medium]: latency={latency_score:.2f}, "
        f"motors={motor_activation_score:.2f}, variance={variance_score:.2f}, "
        f"activity={activity_score:.2f}, propagation={propagation_score:.2f}, "
        f"fitness={fitness:.1f}"
    )
    return fitness


def evaluate_genome_fast(genome: Genome, config: FitnessConfig | None = None) -> float:
    """Fast fitness proxy using topology, weights, and path analysis.

    Scores based on connectome structure with enough variation for
    evolution to differentiate genomes. Takes <0.01s per genome.

    Design principle: topology metrics (connectivity, paths) provide a
    stable baseline, while weight-sensitive metrics provide the gradient
    that evolution can optimize over generations. The weight-sensitive
    components are deliberately tuned so that the unmodified biological
    connectome scores ~80-85, with room to improve to ~95+ through
    weight optimization.

    Scoring breakdown (0-100 scale):
      - Topology baseline              (30 pts) -- mostly saturated from start
      - Weight optimization metrics     (40 pts) -- room for improvement
      - Structural quality metrics      (15 pts) -- moderate improvement possible
      - Weight-derived differentiation  (15 pts) -- ensures genome uniqueness
    """
    from creatures.connectome.types import NeuronType

    config = config or FitnessConfig()

    n_neurons = genome.n_neurons
    n_synapses = genome.n_synapses

    if n_neurons == 0 or n_synapses == 0:
        genome.fitness = 0.0
        return 0.0

    weights = genome.weights
    pre = genome.pre_indices
    post = genome.post_indices

    # --- Classify neurons ---
    motor_ids = {
        nid for nid, nt in genome.neuron_types.items()
        if nt == NeuronType.MOTOR
    }
    sensory_ids = {
        nid for nid, nt in genome.neuron_types.items()
        if nt == NeuronType.SENSORY
    }
    motor_indices = {
        i for i, nid in enumerate(genome.neuron_ids) if nid in motor_ids
    }
    sensory_indices = {
        i for i, nid in enumerate(genome.neuron_ids) if nid in sensory_ids
    }
    pre_set = set(pre.tolist())
    post_set = set(post.tolist())

    # ===================================================================
    # TOPOLOGY BASELINE (30 pts) -- stable foundation, hard to lose
    # ===================================================================

    # 1. Motor neuron input coverage (10 pts)
    connected_motors = len(motor_indices & post_set)
    motor_score = connected_motors / max(len(motor_indices), 1)

    # 2. Sensory neuron output coverage (5 pts)
    connected_sensory = len(sensory_indices & pre_set)
    sensory_score = connected_sensory / max(len(sensory_indices), 1)

    # 3. Sensory-to-motor path existence (15 pts)
    # BFS up to 4 hops from sensory to motor neurons
    adj: dict[int, list[int]] = {}
    for i in range(n_synapses):
        p = int(pre[i])
        q = int(post[i])
        if p not in adj:
            adj[p] = []
        adj[p].append(q)

    reachable_motors = set()
    sensory_motor_paths = 0
    max_hops = 4

    for s_idx in sensory_indices:
        visited = {s_idx}
        frontier = deque([(s_idx, 0)])
        while frontier:
            node, depth = frontier.popleft()
            if depth >= max_hops:
                continue
            for neighbor in adj.get(node, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    if neighbor in motor_indices:
                        reachable_motors.add(neighbor)
                        sensory_motor_paths += 1
                    frontier.append((neighbor, depth + 1))

    path_coverage = len(reachable_motors) / max(len(motor_indices), 1)
    path_redundancy = float(np.clip(sensory_motor_paths / max(len(motor_indices) * 2, 1), 0, 1))
    path_score = path_coverage * 0.7 + path_redundancy * 0.3

    topology_pts = (
        motor_score * 10.0
        + sensory_score * 5.0
        + path_score * 15.0
    )

    # ===================================================================
    # WEIGHT OPTIMIZATION METRICS (40 pts) -- the evolutionary gradient
    # ===================================================================

    abs_weights = np.abs(weights)
    mean_abs_w = float(np.mean(abs_weights))
    weight_std = float(np.std(abs_weights))
    mean_signed = float(np.mean(weights))

    # 4. Motor neuron total input drive (10 pts)
    # Sum of absolute input weights per motor neuron, then take mean.
    # This is the key metric evolution can improve: each mutation that
    # increases a motor-input weight contributes directly to this score.
    motor_total_input: dict[int, float] = {m: 0.0 for m in motor_indices}
    for i in range(n_synapses):
        q = int(post[i])
        if q in motor_total_input:
            motor_total_input[q] += abs(weights[i])
    if motor_total_input:
        motor_drives = np.array(list(motor_total_input.values()))
        mean_motor_drive = float(np.mean(motor_drives))
        # Bio starts at ~15-20; ideal is ~35+ (strong convergent input)
        motor_drive_score = float(np.clip(mean_motor_drive / 40.0, 0, 1))
    else:
        motor_drive_score = 0.0

    # 5. Weight concentration on strong synapses (8 pts)
    # Fraction of total |weight| carried by top 20% of synapses.
    # Higher = more specialized network with clear strong/weak connections.
    sorted_abs = np.sort(abs_weights)[::-1]
    top_20_count = max(1, n_synapses // 5)
    top_20_sum = float(np.sum(sorted_abs[:top_20_count]))
    total_abs_sum = float(np.sum(sorted_abs))
    concentration = top_20_sum / max(total_abs_sum, 1e-10)
    # Bio starts at ~0.55; ideal is ~0.70+ (more concentrated)
    weight_conc_score = float(np.clip((concentration - 0.3) / 0.5, 0, 1))

    # 6. Excitatory/inhibitory balance (7 pts)
    # Fraction of total weight magnitude that is inhibitory.
    # Evolution can shift this by flipping weight signs.
    exc_weight_sum = float(np.sum(np.abs(weights[weights > 0])))
    inh_weight_sum = float(np.sum(np.abs(weights[weights < 0])))
    total_weight_sum = exc_weight_sum + inh_weight_sum
    if total_weight_sum > 0:
        inh_fraction = inh_weight_sum / total_weight_sum
        # Bio starts at ~5% inhibitory; ideal is ~18% (balanced circuits)
        ei_score = float(np.exp(-30.0 * (inh_fraction - 0.18) ** 2))
    else:
        ei_score = 0.0

    # 7. Sensory-to-motor signal gain (8 pts)
    # Max product of weights along 2-hop sensory->inter->motor paths.
    # This rewards evolution for strengthening specific pathways.
    sensory_out_max: dict[int, float] = {}
    for i in range(n_synapses):
        p = int(pre[i])
        q = int(post[i])
        if p in sensory_indices and q not in motor_indices:
            old = sensory_out_max.get(q, 0.0)
            sensory_out_max[q] = max(old, abs(weights[i]))
    path_gains = []
    for i in range(n_synapses):
        p = int(pre[i])
        q = int(post[i])
        if q in motor_indices and p in sensory_out_max:
            path_gains.append(sensory_out_max[p] * abs(weights[i]))
    # Direct sensory->motor
    for i in range(n_synapses):
        p = int(pre[i])
        q = int(post[i])
        if p in sensory_indices and q in motor_indices:
            path_gains.append(abs(weights[i]) * abs(weights[i]))

    if path_gains:
        # Use 90th percentile of path gains (top pathways matter most)
        top_path_gain = float(np.percentile(path_gains, 90))
        # Bio starts at ~10-15; ideal is ~30+ for strong signal propagation
        path_gain_score = float(np.clip(top_path_gain / 35.0, 0, 1))
    else:
        path_gain_score = 0.0

    # 8. Weight heterogeneity across neuron types (7 pts)
    # Motor inputs should be stronger than interneuron-interneuron weights.
    # This measures functional specialization.
    inter_indices = {
        i for i, nid in enumerate(genome.neuron_ids)
        if genome.neuron_types.get(nid) not in (NeuronType.MOTOR, NeuronType.SENSORY)
    }
    inter_weights = []
    motor_weights_only = []
    for i in range(n_synapses):
        p, q = int(pre[i]), int(post[i])
        if q in motor_indices:
            motor_weights_only.append(abs(weights[i]))
        elif p in inter_indices and q in inter_indices:
            inter_weights.append(abs(weights[i]))
    if motor_weights_only and inter_weights:
        motor_mean = float(np.mean(motor_weights_only))
        inter_mean = float(np.mean(inter_weights))
        # Reward motor weights being larger than interneuron weights
        specialization = motor_mean / max(inter_mean, 0.01)
        # Bio starts at ~1.0; ideal is ~1.5+ (motor specialization)
        specialization_score = float(np.clip((specialization - 0.5) / 1.5, 0, 1))
    else:
        specialization_score = 0.0

    weight_pts = (
        motor_drive_score * 10.0
        + weight_conc_score * 8.0
        + ei_score * 7.0
        + path_gain_score * 8.0
        + specialization_score * 7.0
    )

    # ===================================================================
    # STRUCTURAL QUALITY (15 pts) -- moderate improvement possible
    # ===================================================================

    # 9. Clustering coefficient / modularity (8 pts)
    sample_size = min(50, n_neurons)
    sampled_nodes = list(range(n_neurons))[:sample_size]

    neighbor_sets: dict[int, set[int]] = {}
    for i in range(n_synapses):
        p = int(pre[i])
        q = int(post[i])
        if p not in neighbor_sets:
            neighbor_sets[p] = set()
        neighbor_sets[p].add(q)
        if q not in neighbor_sets:
            neighbor_sets[q] = set()
        neighbor_sets[q].add(p)

    clustering_coeffs = []
    for node in sampled_nodes:
        neighbors = neighbor_sets.get(node, set())
        k = len(neighbors)
        if k < 2:
            continue
        neighbor_list = list(neighbors)
        n_links = 0
        for i_n in range(len(neighbor_list)):
            for j_n in range(i_n + 1, len(neighbor_list)):
                n1, n2 = neighbor_list[i_n], neighbor_list[j_n]
                if n2 in neighbor_sets.get(n1, set()):
                    n_links += 1
        max_links = k * (k - 1) / 2
        clustering_coeffs.append(n_links / max_links)

    if clustering_coeffs:
        mean_clustering = float(np.mean(clustering_coeffs))
        modularity_score = float(np.exp(-3.0 * (mean_clustering - 0.2) ** 2))
    else:
        modularity_score = 0.0

    # 10. Connectivity density (7 pts)
    max_possible = n_neurons * (n_neurons - 1) if n_neurons > 1 else 1
    density = n_synapses / max_possible
    # Ideal density ~3-5%
    density_score = float(np.exp(-200.0 * (density - 0.04) ** 2))

    structural_pts = (
        modularity_score * 8.0
        + density_score * 7.0
    )

    # ===================================================================
    # WEIGHT-DERIVED DIFFERENTIATION (15 pts) -- genome uniqueness
    # ===================================================================
    # Deterministic but genome-specific: uses weight content as signal
    # so that each mutation produces a meaningfully different score.

    weight_hash = hashlib.md5(weights.tobytes()).hexdigest()
    noise_seed = int(weight_hash[:8], 16) % (2**31)
    noise_rng = np.random.default_rng(noise_seed)

    # Higher-order weight statistics that change with mutations
    weight_kurtosis = float(np.mean((weights - mean_signed) ** 4) /
                           max(np.std(weights) ** 4, 1e-10)) if n_synapses > 1 else 0.0

    # Percentile-based metric: fraction of weights in "strong" range (|w| > 1.5)
    frac_strong = float(np.mean(abs_weights > 1.5))

    # Combine into smooth score that rewards certain weight distributions
    diff_base = float(np.clip(
        0.3
        + 0.15 * np.tanh(mean_abs_w - 1.5)
        + 0.15 * np.tanh(weight_std - 1.0)
        + 0.10 * np.tanh(weight_kurtosis - 3.0)
        + 0.15 * frac_strong,
        0.0, 1.0
    ))
    # Small deterministic noise for uniqueness
    diff_noise = float(noise_rng.normal(0, 0.08))
    differentiation_score = float(np.clip(diff_base + diff_noise, 0.0, 1.0))

    differentiation_pts = differentiation_score * 15.0

    # ===================================================================
    # TOTAL FITNESS
    # ===================================================================
    fitness = topology_pts + weight_pts + structural_pts + differentiation_pts

    genome.fitness = fitness
    genome.metadata["fitness_breakdown"] = {
        "topology": round(topology_pts, 2),
        "weight_optimization": round(weight_pts, 2),
        "structural": round(structural_pts, 2),
        "differentiation": round(differentiation_pts, 2),
        # Detail
        "motor_coverage": round(motor_score * 10, 2),
        "sensory_coverage": round(sensory_score * 5, 2),
        "path": round(path_score * 15, 2),
        "motor_drive": round(motor_drive_score * 10, 2),
        "weight_conc": round(weight_conc_score * 8, 2),
        "ei_balance": round(ei_score * 7, 2),
        "path_gain": round(path_gain_score * 8, 2),
        "specialization": round(specialization_score * 7, 2),
    }

    return fitness
