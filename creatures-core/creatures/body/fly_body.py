"""MuJoCo-based Drosophila melanogaster body model.

Uses the NeuroMechFly v2 MJCF model from flygym, loaded directly
with MuJoCo (bypassing dm_control for compatibility).

The fly has 6 legs with 7 degrees of freedom each, plus head and
abdominal joints. Total: 87 joints, 189 actuators (position, velocity,
torque for each joint).
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path

import mujoco
import numpy as np

from creatures.body.base import BodyConfig, BodyModel, BodyState
from creatures.body.fly_neuron_map import build_motor_map, build_sensor_map

logger = logging.getLogger(__name__)

# Leg prefixes in the MJCF model
_LEG_PREFIXES = ["LF", "LM", "LH", "RF", "RM", "RH"]  # Left/Right, Front/Mid/Hind
_LEG_JOINTS = [
    "Coxa", "Coxa_roll", "Coxa_yaw", "Femur", "Femur_roll", "Tibia", "Tarsus1"
]

# Map motor neuron-like names to actuator groups
# Descending neurons control specific leg movements
_MOTOR_MAP = {
    # Forward walking: all legs push backward
    "forward": {f"actuator_position_joint_{leg}leg_{joint}": 0.0
                for leg in _LEG_PREFIXES for joint in _LEG_JOINTS},
    # Each leg can be controlled independently
}


def _find_flygym_data() -> Path:
    """Find flygym's data directory."""
    try:
        from flygym.common import get_data_path
        return get_data_path("flygym", "data")
    except ImportError:
        # Try common paths
        import site
        for sp in site.getsitepackages():
            p = Path(sp) / "flygym" / "data"
            if p.exists():
                return p
    raise FileNotFoundError("flygym data directory not found. pip install flygym")


def _load_fly_mjcf() -> mujoco.MjModel:
    """Load the NeuroMechFly MJCF model, patching compatibility issues."""
    flygym_data = _find_flygym_data().resolve()
    mjcf_path = flygym_data / "mjcf" / "groundwalking_nmf_mjcf_nofloor_230518__bendTarsus_scaled.xml"

    if not mjcf_path.exists():
        raise FileNotFoundError(f"NeuroMechFly MJCF not found at {mjcf_path}")

    with open(mjcf_path) as f:
        xml = f.read()

    # Remove attributes not supported in MuJoCo 3.6+
    for pattern in [
        r' convexhull="[^"]*"',
        r' collision="[^"]*"',
        r' mpr_iterations="[^"]*"',
    ]:
        xml = re.sub(pattern, "", xml)

    # Replace relative mesh paths with absolute
    mesh_dir = str(flygym_data / "mesh")
    xml = xml.replace('file="../mesh/', f'file="{mesh_dir}/')

    # Write patched MJCF to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".xml", mode="w", delete=False)
    tmp.write(xml)
    tmp.flush()

    try:
        model = mujoco.MjModel.from_xml_path(tmp.name)
    finally:
        # Clean up temp file — MuJoCo copies data at load time
        os.unlink(tmp.name)
    logger.info(
        f"Loaded NeuroMechFly: {model.nbody} bodies, {model.njnt} joints, "
        f"{model.nu} actuators"
    )
    return model


class FlyBody(BodyModel):
    """MuJoCo-based Drosophila body using NeuroMechFly v2.

    87 joints across 6 legs + head + abdomen, with position/velocity/torque
    actuators for each joint (189 total actuators).
    """

    def __init__(self, config: BodyConfig | None = None, connectome=None) -> None:
        self._config = config or BodyConfig(dt=0.1)  # fly needs faster physics
        self._connectome = connectome
        self._model = _load_fly_mjcf()
        self._model.opt.timestep = self._config.dt / 1000.0
        self._data = mujoco.MjData(self._model)
        mujoco.mj_forward(self._model, self._data)

        # Cache joint and actuator info
        self._joint_names = []
        for i in range(self._model.njnt):
            name = mujoco.mj_id2name(self._model, mujoco.mjtObj.mjOBJ_JOINT, i)
            if name:
                self._joint_names.append(name)

        self._actuator_names = []
        for i in range(self._model.nu):
            name = mujoco.mj_id2name(self._model, mujoco.mjtObj.mjOBJ_ACTUATOR, i)
            if name:
                self._actuator_names.append(name)

        # Identify position actuators (for joint control)
        self._pos_actuators = {
            name: i for i, name in enumerate(self._actuator_names)
            if "position" in name
        }

        # Identify leg joints for each leg (naming: joint_LFCoxa, joint_RMFemur, etc.)
        self._leg_joints: dict[str, list[str]] = {}
        for leg in _LEG_PREFIXES:
            self._leg_joints[leg] = [
                name for name in self._joint_names
                if f"joint_{leg}" in name
            ]

        # Settle the body to a stable initial state (prevents NaN/Inf at startup)
        for _ in range(200):
            self._data.ctrl[:] = 0
            mujoco.mj_step(self._model, self._data)
        # Store the settled configuration as the initial state
        self._initial_qpos = self._data.qpos.copy()
        self._initial_qvel = self._data.qvel.copy()

        # Build neural maps from connectome (if provided)
        self._sensor_map: dict[str, str] = {}
        self._motor_map: dict[str, list[str]] = {}
        if connectome is not None:
            sensor_names = []
            for i in range(self._model.nsensor):
                name = mujoco.mj_id2name(self._model, mujoco.mjtObj.mjOBJ_SENSOR, i)
                if name:
                    sensor_names.append(name)
            self._motor_map = build_motor_map(connectome, self._actuator_names)
            self._sensor_map = build_sensor_map(connectome, sensor_names)

        logger.info(
            f"FlyBody: {len(self._pos_actuators)} position actuators, "
            f"{len(self._leg_joints)} legs, "
            f"{len(self._motor_map)} motor neurons, "
            f"{len(self._sensor_map)} sensors mapped"
        )

    def reset(self) -> BodyState:
        self._data.qpos[:] = self._initial_qpos
        self._data.qvel[:] = 0
        self._data.ctrl[:] = 0
        mujoco.mj_forward(self._model, self._data)
        return self.get_state()

    def get_sensory_input(self) -> dict[str, float]:
        # Simplified: return leg contact forces
        # In full implementation, would map to fly sensory neurons
        result: dict[str, float] = {}
        gain = self._config.sensor_gain
        for i in range(self._model.nsensor):
            name = mujoco.mj_id2name(self._model, mujoco.mjtObj.mjOBJ_SENSOR, i)
            if name and self._data.sensordata[i] > 0.01:
                result[name] = float(self._data.sensordata[i]) * gain
        return result

    def step(self, muscle_activations: dict[str, float]) -> BodyState:
        for name, activation in muscle_activations.items():
            if name in self._pos_actuators:
                act_id = self._pos_actuators[name]
                self._data.ctrl[act_id] = activation
        # Clip all controls to safe range to prevent extreme actuator forces
        self._data.ctrl[:] = np.clip(self._data.ctrl, -1.0, 1.0)
        mujoco.mj_step(self._model, self._data)
        return self.get_state()

    def apply_external_force(
        self, segment: str, force: tuple[float, float, float]
    ) -> None:
        body_id = mujoco.mj_name2id(
            self._model, mujoco.mjtObj.mjOBJ_BODY, segment
        )
        if body_id >= 0:
            self._data.xfrc_applied[body_id, :3] = force

    def get_state(self) -> BodyState:
        positions = []
        orientations = []
        # Get positions for key bodies (thorax, head, legs)
        for i in range(self._model.nbody):
            pos = tuple(float(x) for x in self._data.xpos[i])
            quat = tuple(float(x) for x in self._data.xquat[i])
            positions.append(pos)
            orientations.append(quat)

        joint_angles = [float(self._data.qpos[self._model.jnt_qposadr[i]])
                        for i in range(self._model.njnt)]
        contacts = []

        com = tuple(float(x) for x in np.mean(
            [self._data.xpos[i] for i in range(1, min(10, self._model.nbody))],
            axis=0
        ))

        return BodyState(
            positions=positions,
            orientations=orientations,
            joint_angles=joint_angles,
            contacts=contacts,
            center_of_mass=com,
        )

    @property
    def sensor_neuron_map(self) -> dict[str, str]:
        return self._sensor_map

    @property
    def motor_neuron_map(self) -> dict[str, list[str]]:
        return self._motor_map

    @property
    def leg_joints(self) -> dict[str, list[str]]:
        """Get joint names grouped by leg."""
        return self._leg_joints

    @property
    def position_actuators(self) -> dict[str, int]:
        """Get position actuator name → index mapping."""
        return self._pos_actuators

    @property
    def model(self) -> mujoco.MjModel:
        return self._model

    @property
    def data(self) -> mujoco.MjData:
        return self._data

    @staticmethod
    def default_coupling_gains() -> dict:
        """Recommended CouplingConfig values for FlyBody.

        Lower gains reduce chaotic movement from simultaneous DN firing.
        """
        return {
            "firing_rate_to_torque_gain": 0.001,
            "inhibitory_gain": -0.0005,
            "sensor_to_current_gain": 20.0,
            "sync_interval_ms": 1.0,
        }
