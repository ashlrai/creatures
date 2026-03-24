"""Mapping between FlyWire neuron IDs and NeuroMechFly actuators/sensors.

Descending neurons (DNs) are the brain's motor output to the ventral nerve cord.
Since FlyWire only covers the brain (not VNC), we use DNs as proxy motor neurons
and map them to NeuroMechFly leg actuators based on their functional role.

References:
    - Namiki et al., 2018: descending neuron classification
    - FlyWire annotations: cell_type, flow, super_class fields
"""

from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from creatures.connectome.types import Connectome

logger = logging.getLogger(__name__)

# Leg prefixes in NeuroMechFly MJCF
_LEG_PREFIXES = ["LF", "LM", "LH", "RF", "RM", "RH"]
_LEG_JOINTS = ["Coxa", "Coxa_roll", "Coxa_yaw", "Femur", "Femur_roll", "Tibia", "Tarsus1"]

# Extension joints (stance phase / power stroke)
_EXTENSION_JOINTS = ["Femur", "Tibia", "Tarsus1"]
# Swing joints (swing phase / protraction)
_SWING_JOINTS = ["Coxa", "Coxa_roll", "Coxa_yaw"]

# DN cell_type prefix -> functional role -> leg actuator targets
# Based on Namiki et al. 2018 and FlyWire annotations
_DN_ROLES: dict[str, dict] = {
    # DNa: fast escape / takeoff — all legs extend simultaneously
    "DNa": {
        "legs": _LEG_PREFIXES,
        "joints": _EXTENSION_JOINTS,
        "description": "escape/fast locomotion",
    },
    # DNb: bilateral turning — ipsilateral legs
    "DNb": {
        "legs": ["LF", "LM", "LH"],  # left-biased by default
        "joints": _LEG_JOINTS,
        "description": "turning/steering",
    },
    # DNg: general forward locomotion
    "DNg": {
        "legs": _LEG_PREFIXES,
        "joints": _SWING_JOINTS + _EXTENSION_JOINTS,
        "description": "forward walking",
    },
    # DNp: proboscis extension / feeding — head actuators (if any)
    "DNp": {
        "legs": [],  # no leg control
        "joints": [],
        "description": "proboscis/feeding",
    },
}

# Default role for unrecognized DN types
_DEFAULT_DN_ROLE = {
    "legs": _LEG_PREFIXES,
    "joints": _LEG_JOINTS,
    "description": "general motor",
}


def _get_dn_role(cell_type: str | None) -> dict:
    """Look up the functional role of a descending neuron by cell_type prefix."""
    if not cell_type:
        return _DEFAULT_DN_ROLE
    for prefix, role in _DN_ROLES.items():
        if cell_type.startswith(prefix):
            return role
    return _DEFAULT_DN_ROLE


def _actuator_names_for_role(role: dict, all_actuator_names: list[str]) -> list[str]:
    """Return actuator names matching a DN role's leg/joint specification."""
    if not role["legs"] or not role["joints"]:
        return []

    matched = []
    for act_name in all_actuator_names:
        if "position" not in act_name:
            continue
        for leg in role["legs"]:
            for joint in role["joints"]:
                # Actuator format: actuator_position_joint_{leg}leg_{joint}
                if f"_{leg}" in act_name and joint in act_name:
                    matched.append(act_name)
                    break
            else:
                continue
            break
    return matched


def build_motor_map(
    connectome: "Connectome",
    actuator_names: list[str],
) -> dict[str, list[str]]:
    """Build motor neuron map: neuron_id -> [actuator_names].

    Maps descending neurons (and motor-typed neurons) in the connectome
    to NeuroMechFly actuators based on their cell_type annotation.

    Args:
        connectome: Loaded FlyWire connectome with neuron annotations.
        actuator_names: All actuator names from FlyBody.

    Returns:
        {neuron_id: [actuator_name, ...]} for motor/descending neurons.
    """
    from creatures.connectome.types import NeuronType

    motor_map: dict[str, list[str]] = {}
    position_actuators = [a for a in actuator_names if "position" in a]

    for nid, neuron in connectome.neurons.items():
        if neuron.neuron_type != NeuronType.MOTOR:
            continue

        cell_type = neuron.metadata.get("cell_type")
        flow = neuron.metadata.get("flow", "")

        # Only map descending and motor flow neurons
        if flow not in ("descending", "motor") and cell_type is None:
            continue

        role = _get_dn_role(cell_type)
        targets = _actuator_names_for_role(role, position_actuators)

        if not targets:
            # Fallback: distribute across all position actuators
            # Use hash of neuron ID to pick a subset (3 actuators per neuron)
            h = hash(nid) % len(position_actuators) if position_actuators else 0
            n_targets = min(3, len(position_actuators))
            targets = [
                position_actuators[(h + i) % len(position_actuators)]
                for i in range(n_targets)
            ]

        if targets:
            motor_map[nid] = targets

    logger.info(
        f"Built fly motor map: {len(motor_map)} motor neurons -> "
        f"{len(set(a for acts in motor_map.values() for a in acts))} unique actuators"
    )
    return motor_map


def build_sensor_map(
    connectome: "Connectome",
    sensor_names: list[str],
) -> dict[str, str]:
    """Build sensor map: sensor_name -> neuron_id.

    Maps MuJoCo sensors to sensory neurons in the connectome.
    Prioritizes mechanosensory neurons in GNG (gnathal ganglia)
    which receive leg sensory input.

    Args:
        connectome: Loaded FlyWire connectome with neuron annotations.
        sensor_names: All sensor names from FlyBody MuJoCo model.

    Returns:
        {sensor_name: neuron_id} for sensors with matching neurons.
    """
    from creatures.connectome.types import NeuronType

    # Collect sensory neurons, prefer mechanosensory
    sensory_neurons = []
    for nid, neuron in connectome.neurons.items():
        if neuron.neuron_type != NeuronType.SENSORY:
            continue
        cell_class = neuron.metadata.get("cell_class", "")
        # Prioritize mechanosensory for body sensors
        priority = 0 if "mechano" in cell_class.lower() else 1
        sensory_neurons.append((priority, nid))

    sensory_neurons.sort()
    available = [nid for _, nid in sensory_neurons]

    if not available or not sensor_names:
        return {}

    # Distribute sensors across available sensory neurons round-robin
    sensor_map: dict[str, str] = {}
    for i, sensor_name in enumerate(sensor_names):
        neuron_id = available[i % len(available)]
        sensor_map[sensor_name] = neuron_id

    logger.info(
        f"Built fly sensor map: {len(sensor_map)} sensors -> "
        f"{len(set(sensor_map.values()))} unique sensory neurons"
    )
    return sensor_map


# Tripod gait groups
_TRIPOD_1 = {"LF", "RM", "LH"}  # swing when phase < 0.5
_TRIPOD_2 = {"RF", "LM", "RH"}  # swing when phase >= 0.5

_GAIT_PERIOD_MS = 100.0  # ~10 Hz gait cycle


def apply_tripod_gait(
    muscle_activations: dict[str, float], t_ms: float
) -> dict[str, float]:
    """Apply alternating tripod gait pattern to muscle activations.

    Real Drosophila use an alternating tripod gait: three legs swing
    while the other three provide stance. This modulates the raw neural
    output to enforce that pattern.

    Tripod 1 (LF, RM, LH): swing when phase < 0.5, stance otherwise
    Tripod 2 (RF, LM, RH): swing when phase >= 0.5, stance otherwise

    Args:
        muscle_activations: Raw {actuator_name: activation} from the neural net.
        t_ms: Current simulation time in milliseconds.

    Returns:
        Modified activations with gait modulation applied.
    """
    phase = (t_ms % _GAIT_PERIOD_MS) / _GAIT_PERIOD_MS
    # Smooth sinusoidal modulation (0..1) instead of hard switching
    # phase_signal = 0 at phase=0, 1 at phase=0.5, 0 at phase=1
    swing_signal = 0.5 * (1.0 + math.cos(2.0 * math.pi * phase))
    # tripod1 swings when swing_signal is high, tripod2 when low
    tripod1_swing = swing_signal        # high at phase=0
    tripod2_swing = 1.0 - swing_signal  # high at phase=0.5

    modulated: dict[str, float] = {}

    for act_name, activation in muscle_activations.items():
        # Determine which leg this actuator belongs to
        leg_prefix = None
        for prefix in _LEG_PREFIXES:
            if f"_{prefix}" in act_name:
                leg_prefix = prefix
                break

        if leg_prefix is None:
            # Not a leg actuator, pass through unmodified
            modulated[act_name] = activation
            continue

        # Determine if this is a swing or extension joint
        is_swing_joint = any(j in act_name for j in _SWING_JOINTS)

        if leg_prefix in _TRIPOD_1:
            swing_factor = tripod1_swing
        else:
            swing_factor = tripod2_swing

        if is_swing_joint:
            # Enhance swing joints during swing phase, suppress during stance
            modulated[act_name] = activation * (0.2 + 0.8 * swing_factor)
        else:
            # Extension joints: enhance during stance, suppress during swing
            stance_factor = 1.0 - swing_factor
            modulated[act_name] = activation * (0.2 + 0.8 * stance_factor)

    return modulated
