"""Tests for the MuJoCo worm body model."""

import pytest

from creatures.body.base import BodyState
from creatures.body.worm_body import (
    N_JOINTS,
    N_SEGMENTS,
    WormBody,
    _DA_SEGMENTS,
    _DB_SEGMENTS,
    _VA_SEGMENTS,
    _VB_SEGMENTS,
    _TOUCH_SENSOR_MAP,
)


@pytest.fixture(scope="module")
def worm() -> WormBody:
    """Create a WormBody instance (reused across this module)."""
    return WormBody()


class TestWormBodyCreation:
    """Tests for WormBody construction."""

    def test_has_12_segments(self, worm: WormBody):
        assert N_SEGMENTS == 12

    def test_has_11_joints(self, worm: WormBody):
        assert N_JOINTS == 11

    def test_model_loaded(self, worm: WormBody):
        assert worm.model is not None
        assert worm.data is not None


class TestReset:
    """Tests for body reset."""

    def test_reset_returns_body_state(self, worm: WormBody):
        state = worm.reset()
        assert isinstance(state, BodyState)

    def test_reset_has_correct_positions_count(self, worm: WormBody):
        state = worm.reset()
        assert len(state.positions) == N_SEGMENTS

    def test_reset_has_correct_joint_angles_count(self, worm: WormBody):
        state = worm.reset()
        assert len(state.joint_angles) == N_JOINTS

    def test_reset_has_correct_contacts_count(self, worm: WormBody):
        state = worm.reset()
        assert len(state.contacts) == N_SEGMENTS

    def test_reset_joint_angles_near_zero(self, worm: WormBody):
        state = worm.reset()
        for angle in state.joint_angles:
            assert abs(angle) < 0.1, f"Joint angle {angle} not near zero after reset"


class TestStep:
    """Tests for stepping the body with muscle activations."""

    def test_step_with_activation_changes_angles(self, worm: WormBody):
        worm.reset()
        # Apply strong dorsal activation to first joint
        activations = {"dorsal_0": 0.5, "ventral_0": -0.5}
        # Step multiple times to allow physics to respond
        for _ in range(50):
            state = worm.step(activations)
        # Joint 0 should have moved from zero
        assert abs(state.joint_angles[0]) > 1e-4, (
            "Expected joint angle to change after muscle activation"
        )

    def test_step_returns_body_state(self, worm: WormBody):
        worm.reset()
        state = worm.step({})
        assert isinstance(state, BodyState)


class TestMotorNeuronMap:
    """Tests for the motor neuron to actuator mapping."""

    def test_motor_map_covers_VA_neurons(self, worm: WormBody):
        motor_map = worm.motor_neuron_map
        for nid in _VA_SEGMENTS:
            if any(s < N_JOINTS for s in _VA_SEGMENTS[nid]):
                assert nid in motor_map, f"VA neuron {nid} missing from motor map"

    def test_motor_map_covers_DA_neurons(self, worm: WormBody):
        motor_map = worm.motor_neuron_map
        for nid in _DA_SEGMENTS:
            if any(s < N_JOINTS for s in _DA_SEGMENTS[nid]):
                assert nid in motor_map, f"DA neuron {nid} missing from motor map"

    def test_motor_map_covers_VB_neurons(self, worm: WormBody):
        motor_map = worm.motor_neuron_map
        for nid in _VB_SEGMENTS:
            if any(s < N_JOINTS for s in _VB_SEGMENTS[nid]):
                assert nid in motor_map, f"VB neuron {nid} missing from motor map"

    def test_motor_map_covers_DB_neurons(self, worm: WormBody):
        motor_map = worm.motor_neuron_map
        for nid in _DB_SEGMENTS:
            if any(s < N_JOINTS for s in _DB_SEGMENTS[nid]):
                assert nid in motor_map, f"DB neuron {nid} missing from motor map"

    def test_motor_map_values_are_actuator_lists(self, worm: WormBody):
        motor_map = worm.motor_neuron_map
        for nid, actuators in motor_map.items():
            assert isinstance(actuators, list)
            for act in actuators:
                assert act.startswith("dorsal_") or act.startswith("ventral_")


class TestSensorNeuronMap:
    """Tests for the sensor neuron mapping."""

    def test_sensor_map_covers_ALM(self, worm: WormBody):
        sensor_map = worm.sensor_neuron_map
        alm_neurons = {v for v in sensor_map.values() if v.startswith("ALM")}
        assert len(alm_neurons) > 0, "No ALM neurons in sensor map"

    def test_sensor_map_covers_PLM(self, worm: WormBody):
        sensor_map = worm.sensor_neuron_map
        plm_neurons = {v for v in sensor_map.values() if v.startswith("PLM")}
        assert len(plm_neurons) > 0, "No PLM neurons in sensor map"

    def test_sensor_map_has_all_segments(self, worm: WormBody):
        sensor_map = worm.sensor_neuron_map
        assert len(sensor_map) == N_SEGMENTS
