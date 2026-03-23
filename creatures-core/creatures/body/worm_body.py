"""MuJoCo-based C. elegans worm body model.

A simplified biomechanical model of C. elegans as a chain of 12 capsule
segments connected by hinge joints, with dorsal/ventral muscle groups
and touch sensors.

The worm moves on a 2D plane (XY), with Z as the vertical axis.
Dorsal-ventral bending is modeled as rotation around the Z axis at
each joint (lateral undulation for forward/backward crawling).
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

import mujoco
import numpy as np

from creatures.body.base import BodyConfig, BodyModel, BodyState

logger = logging.getLogger(__name__)

# Number of body segments
N_SEGMENTS = 12
# Number of joints (between segments)
N_JOINTS = N_SEGMENTS - 1

# Segment dimensions
SEGMENT_LENGTH = 0.08  # meters (worm is ~1mm, but scale up for simulation)
SEGMENT_RADIUS = 0.015
TOTAL_LENGTH = SEGMENT_LENGTH * N_SEGMENTS

# Joint limits
JOINT_RANGE = 0.35  # radians (~20 degrees)

# Motor neuron → segment mapping for C. elegans
# DA/VA neurons drive backward locomotion (segments numbered anterior→posterior)
# DB/VB neurons drive forward locomotion
# DD/VD neurons are inhibitory (dorsal/ventral inhibitors)
# Mapping: motor neuron → (segment_indices, side)
# Side: "dorsal" or "ventral"

# Backward motor neurons (VA drives ventral, DA drives dorsal)
_VA_SEGMENTS = {
    "VA1": [0, 1], "VA2": [1, 2], "VA3": [2, 3], "VA4": [3, 4],
    "VA5": [4, 5], "VA6": [5, 6], "VA7": [6, 7], "VA8": [7, 8],
    "VA9": [8, 9], "VA10": [9, 10], "VA11": [10, 11], "VA12": [11],
}
_DA_SEGMENTS = {
    "DA1": [0, 1], "DA2": [1, 2], "DA3": [2, 3], "DA4": [3, 4],
    "DA5": [4, 5], "DA6": [5, 6], "DA7": [6, 7], "DA8": [7, 8],
    "DA9": [8, 9],
}

# Forward motor neurons (VB drives ventral, DB drives dorsal)
_VB_SEGMENTS = {
    "VB1": [0, 1], "VB2": [1, 2], "VB3": [2, 3], "VB4": [3, 4],
    "VB5": [4, 5], "VB6": [5, 6], "VB7": [6, 7], "VB8": [7, 8],
    "VB9": [8, 9], "VB10": [9, 10], "VB11": [10, 11],
}
_DB_SEGMENTS = {
    "DB1": [0, 1], "DB2": [1, 2], "DB3": [2, 3], "DB4": [3, 4],
    "DB5": [4, 5], "DB6": [5, 6], "DB7": [6, 7],
}

# Inhibitory motor neurons (DD/VD relax opposing muscles)
_DD_SEGMENTS = {
    "DD01": [0, 1], "DD02": [1, 2, 3], "DD03": [3, 4, 5],
    "DD04": [5, 6, 7], "DD05": [7, 8, 9], "DD06": [9, 10, 11],
}
_VD_SEGMENTS = {
    "VD01": [0], "VD02": [0, 1], "VD03": [1, 2], "VD04": [2, 3],
    "VD05": [3, 4], "VD06": [4, 5], "VD07": [5, 6], "VD08": [6, 7],
    "VD09": [7, 8], "VD10": [8, 9], "VD11": [9, 10],
    "VD12": [10, 11], "VD13": [11],
}

# Touch sensor neurons → body regions
# ALM: anterior lateral mechanosensory (segments 0-4)
# PLM: posterior lateral mechanosensory (segments 7-11)
# AVM: anterior ventral mechanosensory (segments 2-5)
_TOUCH_SENSOR_MAP = {
    "seg_0": "ALML", "seg_1": "ALML", "seg_2": "ALML",
    "seg_3": "ALMR", "seg_4": "ALMR",
    "seg_5": "AVM",
    "seg_6": "AVM",
    "seg_7": "PLML", "seg_8": "PLML",
    "seg_9": "PLMR", "seg_10": "PLMR", "seg_11": "PLMR",
}


def _generate_mjcf() -> str:
    """Generate MJCF XML for the worm body."""
    segments_xml = []
    joints_xml = []
    actuators_xml = []
    sensors_xml = []

    # Build chain of capsule segments
    for i in range(N_SEGMENTS):
        x_pos = i * SEGMENT_LENGTH
        name = f"seg_{i}"

        if i == 0:
            # First segment: free joint to world
            segments_xml.append(f"""
        <body name="{name}" pos="{x_pos:.4f} 0 {SEGMENT_RADIUS + 0.001}">
            <freejoint name="root"/>
            <geom name="{name}_geom" type="capsule" size="{SEGMENT_RADIUS} {SEGMENT_LENGTH/2:.4f}"
                  euler="0 90 0" rgba="0.8 0.6 0.4 1" mass="0.001"
                  friction="0.8 0.005 0.001"/>
            <site name="{name}_touch" pos="0 0 0" size="{SEGMENT_RADIUS*1.1:.4f}" type="sphere" rgba="0 0 0 0"/>""")
        else:
            # Subsequent segments: hinged to previous
            segments_xml.append(f"""
            <body name="{name}" pos="{SEGMENT_LENGTH:.4f} 0 0">
                <joint name="joint_{i-1}" type="hinge" axis="0 0 1"
                       range="{-JOINT_RANGE:.2f} {JOINT_RANGE:.2f}"
                       damping="0.0005" stiffness="0.0002"/>
                <geom name="{name}_geom" type="capsule" size="{SEGMENT_RADIUS} {SEGMENT_LENGTH/2:.4f}"
                      euler="0 90 0" rgba="0.8 0.6 0.4 1" mass="0.001"
                      friction="0.8 0.005 0.001"/>
                <site name="{name}_touch" pos="0 0 0" size="{SEGMENT_RADIUS*1.1:.4f}" type="sphere" rgba="0 0 0 0"/>""")

            # Actuators: dorsal (+) and ventral (-) muscles at each joint
            actuators_xml.append(
                f'        <motor name="dorsal_{i-1}" joint="joint_{i-1}" '
                f'gear="1" ctrlrange="-0.5 0.5" ctrllimited="true"/>'
            )
            actuators_xml.append(
                f'        <motor name="ventral_{i-1}" joint="joint_{i-1}" '
                f'gear="-1" ctrlrange="-0.5 0.5" ctrllimited="true"/>'
            )

        # Touch sensor
        sensors_xml.append(
            f'        <touch name="{name}_contact" site="{name}_touch"/>'
        )

    # Close body tags (nested structure)
    close_tags = ""
    for i in range(N_SEGMENTS - 1, 0, -1):
        close_tags += "            </body>\n"
    close_tags += "        </body>"

    actuators_str = "\n".join(actuators_xml)
    sensors_str = "\n".join(sensors_xml)
    first_segment = segments_xml[0]
    rest_segments = "\n".join(segments_xml[1:])

    mjcf = f"""<?xml version="1.0" ?>
<mujoco model="c_elegans">
    <option timestep="0.001" gravity="0 0 -9.81" integrator="implicit">
        <flag contact="enable"/>
    </option>

    <default>
        <geom condim="3" contype="1" conaffinity="1"/>
    </default>

    <worldbody>
        <!-- Ground plane -->
        <geom name="ground" type="plane" size="2 2 0.1" rgba="0.9 0.9 0.9 1"
              friction="0.8 0.005 0.001"/>

        <!-- Worm body: chain of {N_SEGMENTS} capsule segments -->
{first_segment}
{rest_segments}
{close_tags}
    </worldbody>

    <actuator>
{actuators_str}
    </actuator>

    <sensor>
{sensors_str}
    </sensor>
</mujoco>"""

    return mjcf


class WormBody(BodyModel):
    """MuJoCo-based C. elegans body model.

    12 capsule segments connected by hinge joints. Each joint has
    dorsal and ventral muscle actuators. Touch sensors on each segment
    map to sensory neurons (ALM, PLM, AVM).
    """

    def __init__(self, config: BodyConfig | None = None) -> None:
        self._config = config or BodyConfig()
        self._model: mujoco.MjModel | None = None
        self._data: mujoco.MjData | None = None
        self._mjcf_path: str | None = None
        self._external_forces: dict[str, tuple[float, float, float]] = {}
        self._build()

    def _build(self) -> None:
        """Build the MuJoCo model from MJCF."""
        mjcf = _generate_mjcf()

        # Write to temp file for MuJoCo
        tmp = tempfile.NamedTemporaryFile(suffix=".xml", delete=False, mode="w")
        tmp.write(mjcf)
        tmp.flush()
        self._mjcf_path = tmp.name

        self._model = mujoco.MjModel.from_xml_path(self._mjcf_path)
        self._model.opt.timestep = self._config.dt / 1000.0  # ms → seconds
        self._data = mujoco.MjData(self._model)

        # Store initial state
        mujoco.mj_forward(self._model, self._data)
        self._initial_qpos = self._data.qpos.copy()
        self._initial_qvel = self._data.qvel.copy()

        logger.info(
            f"Built worm body: {N_SEGMENTS} segments, {N_JOINTS} joints, "
            f"{self._model.nu} actuators, {self._model.nsensor} sensors"
        )

    def reset(self) -> BodyState:
        """Reset body to initial straight position."""
        self._data.qpos[:] = self._initial_qpos
        self._data.qvel[:] = 0
        self._data.ctrl[:] = 0
        self._external_forces.clear()
        mujoco.mj_forward(self._model, self._data)
        return self.get_state()

    def get_sensory_input(self) -> dict[str, float]:
        """Return touch sensor readings mapped to neuron IDs.

        Returns dict of {neuron_id: scaled_contact_force}.
        """
        result: dict[str, float] = {}
        gain = self._config.sensor_gain

        for i in range(N_SEGMENTS):
            sensor_name = f"seg_{i}_contact"
            sensor_id = mujoco.mj_name2id(
                self._model, mujoco.mjtObj.mjOBJ_SENSOR, sensor_name
            )
            if sensor_id >= 0:
                force = float(self._data.sensordata[sensor_id])
                seg_name = f"seg_{i}"
                neuron_id = _TOUCH_SENSOR_MAP.get(seg_name)
                if neuron_id and force > 0.001:
                    # Accumulate if multiple segments map to same neuron
                    result[neuron_id] = result.get(neuron_id, 0) + force * gain
        return result

    def step(self, muscle_activations: dict[str, float]) -> BodyState:
        """Step the physics simulation with given muscle activations.

        Args:
            muscle_activations: {actuator_name: activation} where
                actuator names are "dorsal_0" through "dorsal_10" and
                "ventral_0" through "ventral_10". Values in [-0.5, 0.5].

        Returns:
            Updated body state.
        """
        # Apply muscle activations
        for name, activation in muscle_activations.items():
            act_id = mujoco.mj_name2id(
                self._model, mujoco.mjtObj.mjOBJ_ACTUATOR, name
            )
            if act_id >= 0:
                self._data.ctrl[act_id] = np.clip(activation, -0.5, 0.5)

        # Apply external forces
        for seg_name, force in self._external_forces.items():
            body_id = mujoco.mj_name2id(
                self._model, mujoco.mjtObj.mjOBJ_BODY, seg_name
            )
            if body_id >= 0:
                self._data.xfrc_applied[body_id, :3] = force

        mujoco.mj_step(self._model, self._data)

        # Clear external forces after step
        self._external_forces.clear()
        self._data.xfrc_applied[:] = 0

        return self.get_state()

    def apply_external_force(
        self, segment: str, force: tuple[float, float, float]
    ) -> None:
        """Apply external force to a segment on next step."""
        self._external_forces[segment] = force

    def get_state(self) -> BodyState:
        """Return current body state."""
        positions = []
        orientations = []
        for i in range(N_SEGMENTS):
            body_id = mujoco.mj_name2id(
                self._model, mujoco.mjtObj.mjOBJ_BODY, f"seg_{i}"
            )
            if body_id >= 0:
                pos = tuple(float(x) for x in self._data.xpos[body_id])
                quat = tuple(float(x) for x in self._data.xquat[body_id])
                positions.append(pos)
                orientations.append(quat)

        joint_angles = []
        for i in range(N_JOINTS):
            jnt_id = mujoco.mj_name2id(
                self._model, mujoco.mjtObj.mjOBJ_JOINT, f"joint_{i}"
            )
            if jnt_id >= 0:
                addr = self._model.jnt_qposadr[jnt_id]
                joint_angles.append(float(self._data.qpos[addr]))

        # Contact forces per segment
        contacts = []
        for i in range(N_SEGMENTS):
            sensor_id = mujoco.mj_name2id(
                self._model, mujoco.mjtObj.mjOBJ_SENSOR, f"seg_{i}_contact"
            )
            if sensor_id >= 0:
                contacts.append(float(self._data.sensordata[sensor_id]))
            else:
                contacts.append(0.0)

        # Center of mass
        com = tuple(float(x) for x in np.mean([p for p in positions], axis=0))

        return BodyState(
            positions=positions,
            orientations=orientations,
            joint_angles=joint_angles,
            contacts=contacts,
            center_of_mass=com,
        )

    @property
    def sensor_neuron_map(self) -> dict[str, str]:
        """Map sensor names to neuron IDs."""
        return dict(_TOUCH_SENSOR_MAP)

    @property
    def motor_neuron_map(self) -> dict[str, list[str]]:
        """Map motor neuron IDs to actuator names.

        Returns {neuron_id: [actuator_names]} for all motor neurons.
        Dorsal motor neurons (DA, DB) map to dorsal actuators.
        Ventral motor neurons (VA, VB) map to ventral actuators.
        Inhibitory neurons (DD, VD) map to opposing actuators.
        """
        mapping: dict[str, list[str]] = {}

        # DA neurons → dorsal actuators (backward)
        for nid, segs in _DA_SEGMENTS.items():
            actuators = [f"dorsal_{s}" for s in segs if s < N_JOINTS]
            if actuators:
                mapping[nid] = actuators

        # VA neurons → ventral actuators (backward)
        for nid, segs in _VA_SEGMENTS.items():
            actuators = [f"ventral_{s}" for s in segs if s < N_JOINTS]
            if actuators:
                mapping[nid] = actuators

        # DB neurons → dorsal actuators (forward)
        for nid, segs in _DB_SEGMENTS.items():
            actuators = [f"dorsal_{s}" for s in segs if s < N_JOINTS]
            if actuators:
                mapping[nid] = actuators

        # VB neurons → ventral actuators (forward)
        for nid, segs in _VB_SEGMENTS.items():
            actuators = [f"ventral_{s}" for s in segs if s < N_JOINTS]
            if actuators:
                mapping[nid] = actuators

        # DD neurons → ventral actuators (inhibit dorsal = activate ventral relaxation)
        for nid, segs in _DD_SEGMENTS.items():
            actuators = [f"ventral_{s}" for s in segs if s < N_JOINTS]
            if actuators:
                mapping[nid] = actuators

        # VD neurons → dorsal actuators (inhibit ventral = activate dorsal relaxation)
        for nid, segs in _VD_SEGMENTS.items():
            actuators = [f"dorsal_{s}" for s in segs if s < N_JOINTS]
            if actuators:
                mapping[nid] = actuators

        return mapping

    @property
    def model(self) -> mujoco.MjModel:
        return self._model

    @property
    def data(self) -> mujoco.MjData:
        return self._data
