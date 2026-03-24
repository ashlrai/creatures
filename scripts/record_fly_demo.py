"""Record Drosophila demo frames from the FlyWire central complex connectome.

Loads a subset of the central complex (FB, EB, PB, NO neuropils),
builds a Brian2 LIF simulation, runs 400 frames with periodic stimuli,
and saves the output as demo-frames-fly.json for the web frontend.

Usage:
    python scripts/record_fly_demo.py
"""

import json
import logging
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "creatures-core"))

from creatures.connectome.flywire import load as load_fly
from creatures.connectome.types import NeuronType
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.base import MonitorConfig, NeuralConfig

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_PATH = Path(__file__).resolve().parents[1] / "creatures-web" / "public" / "demo-frames-fly.json"
NUM_FRAMES = 800
STEP_MS = 1.0  # each frame = 1ms of simulation


def generate_fly_body_positions(n_neurons: int, frame_idx: int, firing_rates: list[float]) -> list[list[float]]:
    """Generate synthetic body positions for visualization.

    The fly doesn't have a MuJoCo body in demo mode, so we generate
    plausible body segment positions (thorax + 6 leg tips + head + abdomen).
    Activity in the firing rates creates subtle movement.
    """
    # 10 body segments: head, prothorax, mesothorax, metathorax, abdomen,
    # plus 6 leg endpoints (LF, LM, LH, RF, RM, RH)
    # Arranged roughly as a fly viewed from above
    mean_rate = np.mean(firing_rates) if firing_rates else 0.0
    wiggle = 0.002 * mean_rate  # subtle movement from neural activity
    t = frame_idx * 0.05  # slow oscillation

    segments = [
        # Head
        [0.0, 0.0, 0.02 + wiggle * np.sin(t)],
        # Prothorax
        [0.08, 0.0, 0.02],
        # Mesothorax
        [0.16, 0.0, 0.02],
        # Metathorax
        [0.24, 0.0, 0.02],
        # Abdomen tip
        [0.40, 0.0, 0.02 + wiggle * 0.5 * np.sin(t + 1.0)],
        # Left front leg
        [0.06, 0.06 + wiggle * np.sin(t + 0.5), 0.0],
        # Left mid leg
        [0.14, 0.08 + wiggle * np.sin(t + 1.0), 0.0],
        # Left hind leg
        [0.22, 0.06 + wiggle * np.sin(t + 1.5), 0.0],
        # Right front leg
        [0.06, -0.06 - wiggle * np.sin(t + 0.5), 0.0],
        # Right mid leg
        [0.14, -0.08 - wiggle * np.sin(t + 1.0), 0.0],
        # Right hind leg
        [0.22, -0.06 - wiggle * np.sin(t + 1.5), 0.0],
    ]
    return segments


def generate_joint_angles(n_joints: int, frame_idx: int, firing_rates: list[float]) -> list[float]:
    """Generate synthetic joint angles based on neural activity."""
    mean_rate = np.mean(firing_rates) if firing_rates else 0.0
    t = frame_idx * 0.05
    angles = []
    for i in range(n_joints):
        base = 0.0
        osc = 0.1 * mean_rate * np.sin(t + i * 0.7)
        angles.append(float(base + osc))
    return angles


def generate_muscle_activations(firing_rates: list[float], n_neurons: int) -> dict[str, float]:
    """Map firing rates to fly leg muscle activations."""
    mean_rate = np.mean(firing_rates) if firing_rates else 0.0
    legs = ["LF", "LM", "LH", "RF", "RM", "RH"]
    joints = ["Coxa", "Femur", "Tibia"]
    activations = {}
    for i, leg in enumerate(legs):
        for j, joint in enumerate(joints):
            # Each leg-joint pair gets a slightly different activation
            idx = (i * 3 + j) % max(1, n_neurons)
            rate = firing_rates[idx] if idx < len(firing_rates) else 0.0
            act = float(np.clip(rate / 100.0 + 0.01 * mean_rate, -1.0, 1.0))
            activations[f"{leg}_{joint}"] = act
    return activations


def main():
    logger.info("Loading Drosophila locomotion connectome...")
    connectome = load_fly(
        neuropils="locomotion",
        min_synapse_count=5,
        max_neurons=500,
    )
    logger.info(f"Connectome: {connectome.n_neurons} neurons, {connectome.n_synapses} synapses")

    # Identify sensory and motor neurons for stimulation
    sensory_ids = [n.id for n in connectome.neurons_by_type(NeuronType.SENSORY)]
    inter_ids = [n.id for n in connectome.neurons_by_type(NeuronType.INTER)]
    all_ids = connectome.neuron_ids

    # Pick stimulus targets: sensory neurons if available, else random subset
    stim_pool = sensory_ids if sensory_ids else all_ids[:50]
    logger.info(f"Stimulus pool: {len(stim_pool)} neurons (sensory={len(sensory_ids)})")

    # Build Brian2 simulation with tuned parameters for the fly
    config = NeuralConfig(
        weight_scale=0.5,
        tau_syn=5.0,
        tau_m=10.0,
        v_thresh=-45.0,
        v_rest=-52.0,
        v_reset=-52.0,
    )
    engine = Brian2Engine()
    monitor = MonitorConfig(record_voltages=False)  # save memory
    engine.build(connectome, config, monitor=monitor)

    # Try to set up real brain-body coupling
    runner = None
    try:
        from creatures.body.fly_body import FlyBody
        from creatures.body.base import BodyConfig
        from creatures.experiment.runner import SimulationRunner, CouplingConfig

        body = FlyBody(BodyConfig(dt=0.5), connectome=connectome)
        body.reset()
        coupling = CouplingConfig(
            firing_rate_to_torque_gain=0.002,
            sensor_to_current_gain=30.0,
        )
        runner = SimulationRunner(engine, body, coupling, connectome=connectome)
        logger.info("Using real FlyBody + brain-body coupling for demo frames")
    except Exception as e:
        logger.warning(f"FlyBody unavailable ({e}), using synthetic body positions")

    n_neurons = connectome.n_neurons
    n_joints = 11  # matching the body segment count

    frames = []
    random.seed(42)
    np.random.seed(42)

    logger.info(f"Recording {NUM_FRAMES} frames...")
    for i in range(NUM_FRAMES):
        # Periodic stimulation: inject current into random sensory neurons
        if i % 20 == 0:
            n_stim = random.randint(5, min(15, len(stim_pool)))
            stim_neurons = random.sample(stim_pool, n_stim)
            currents = {nid: random.uniform(15.0, 30.0) for nid in stim_neurons}
            if runner:
                for nid, current in currents.items():
                    runner.set_stimulus(nid, current)
            else:
                engine.set_input_currents(currents)
            if i % 100 == 0:
                logger.info(f"  Frame {i}: stimulating {n_stim} neurons")
        elif i % 20 == 5:
            if runner:
                runner.clear_stimuli()
            else:
                engine.set_input_currents({})

        if runner:
            # Real brain-body coupling
            sim_frame = runner.step()
            state = sim_frame.neural_state
            body_state = sim_frame.body_state
            firing_rates = state.firing_rates
            body_positions = [list(p) for p in body_state.positions[:11]]
            joint_angles = body_state.joint_angles[:n_joints]
            muscle_activations = sim_frame.muscle_activations
            center_of_mass = list(body_state.center_of_mass)
        else:
            # Synthetic fallback
            state = engine.step(STEP_MS)
            firing_rates = state.firing_rates
            body_positions = generate_fly_body_positions(n_neurons, i, firing_rates)
            joint_angles = generate_joint_angles(n_joints, i, firing_rates)
            muscle_activations = generate_muscle_activations(firing_rates, n_neurons)
            center_of_mass = [0.18, 0.0, 0.01]
            mean_rate = float(np.mean(firing_rates))
            center_of_mass[0] += 0.001 * mean_rate * np.sin(i * 0.03)
            center_of_mass[1] += 0.0005 * mean_rate * np.cos(i * 0.03)

        frame = {
            "t_ms": float(state.t_ms),
            "n_active": len(state.spikes),
            "spikes": [int(s) for s in state.spikes],
            "firing_rates": [round(r, 4) for r in firing_rates],
            "body_positions": [[round(v, 6) for v in p] for p in body_positions],
            "joint_angles": [round(a, 6) for a in joint_angles],
            "center_of_mass": [round(v, 6) for v in center_of_mass],
            "muscle_activations": {k: round(v, 6) for k, v in muscle_activations.items()},
        }
        frames.append(frame)

        if (i + 1) % 100 == 0:
            active_counts = [f["n_active"] for f in frames[-100:]]
            logger.info(
                f"  Frame {i + 1}/{NUM_FRAMES} — "
                f"avg active: {np.mean(active_counts):.1f}, "
                f"max active: {max(active_counts)}"
            )

    # Build output matching DemoData interface
    demo_data = {
        "experiment": {
            "id": "demo-fly",
            "name": "Drosophila Central Complex Demo",
            "organism": "drosophila",
            "n_neurons": n_neurons,
            "n_synapses": connectome.n_synapses,
            "status": "running",
            "t_ms": 0.0,
        },
        "frames": frames,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(demo_data, f)

    size_mb = OUTPUT_PATH.stat().st_size / 1e6
    logger.info(f"Saved {len(frames)} frames to {OUTPUT_PATH} ({size_mb:.1f}MB)")

    # Summary stats
    active_counts = [f["n_active"] for f in frames]
    logger.info(
        f"Activity stats: mean={np.mean(active_counts):.1f}, "
        f"max={max(active_counts)}, "
        f"frames_with_activity={sum(1 for a in active_counts if a > 0)}/{len(frames)}"
    )


if __name__ == "__main__":
    main()
