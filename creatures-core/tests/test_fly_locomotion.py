"""Tests for Drosophila locomotion stability and gait patterning.

Validates:
  - FlyBody settles without NaN/Inf after initialization
  - Simulation steps don't produce NaN positions
  - Tripod gait produces phase-dependent activations
  - Body moves under stimulus (COM displacement > 0)
"""

import math

import numpy as np
import pytest

from creatures.body.base import BodyConfig
from creatures.body.fly_body import FlyBody
from creatures.body.fly_neuron_map import apply_tripod_gait


@pytest.fixture(scope="module")
def fly_body():
    """Create a FlyBody instance (expensive, reuse across tests in module)."""
    config = BodyConfig(dt=0.5)  # 0.5ms timestep
    return FlyBody(config=config)


class TestFlyBodyStability:
    """MuJoCo stability tests."""

    def test_initial_state_no_nan(self, fly_body):
        """After settling, initial state should have no NaN or Inf."""
        state = fly_body.get_state()
        for pos in state.positions:
            for v in pos:
                assert math.isfinite(v), f"Non-finite value in position: {pos}"
        com = state.center_of_mass
        for v in com:
            assert math.isfinite(v), f"Non-finite COM: {com}"

    def test_initial_qpos_no_nan(self, fly_body):
        """Settled qpos should be all finite."""
        assert np.all(np.isfinite(fly_body.data.qpos)), "NaN/Inf in initial qpos"
        assert np.all(np.isfinite(fly_body.data.qvel)), "NaN/Inf in initial qvel"

    def test_100_steps_stable(self, fly_body):
        """100 steps with zero control should not produce NaN."""
        fly_body.reset()
        for _ in range(100):
            state = fly_body.step({})
            for pos in state.positions:
                for v in pos:
                    assert math.isfinite(v), f"Non-finite position after step: {pos}"
            com = state.center_of_mass
            for v in com:
                assert math.isfinite(v), f"Non-finite COM after step: {com}"

    def test_control_clipping(self, fly_body):
        """Extreme activations should be clipped to [-1, 1]."""
        fly_body.reset()
        # Build activations with extreme values
        extreme_acts = {}
        for name in list(fly_body.position_actuators.keys())[:5]:
            extreme_acts[name] = 100.0
        fly_body.step(extreme_acts)
        # Controls should have been clipped
        assert np.all(fly_body.data.ctrl <= 1.0), "Controls exceed 1.0 after clipping"
        assert np.all(fly_body.data.ctrl >= -1.0), "Controls below -1.0 after clipping"

    def test_default_coupling_gains(self):
        """default_coupling_gains should return expected keys."""
        gains = FlyBody.default_coupling_gains()
        assert "firing_rate_to_torque_gain" in gains
        assert "inhibitory_gain" in gains
        assert "sensor_to_current_gain" in gains
        assert "sync_interval_ms" in gains
        assert gains["firing_rate_to_torque_gain"] < 0.005, "Gain should be reduced"


class TestTripodGait:
    """Tests for alternating tripod gait modulation."""

    def _make_uniform_activations(self, value: float = 0.5) -> dict[str, float]:
        """Create uniform activations for all leg actuators."""
        legs = ["LF", "LM", "LH", "RF", "RM", "RH"]
        joints = ["Coxa", "Coxa_roll", "Coxa_yaw", "Femur", "Femur_roll", "Tibia", "Tarsus1"]
        acts = {}
        for leg in legs:
            for joint in joints:
                name = f"actuator_position_joint_{leg}leg_{joint}"
                acts[name] = value
        return acts

    def test_different_phases_different_output(self):
        """Activations at phase=0 should differ from phase=50ms (half period)."""
        acts = self._make_uniform_activations(0.5)
        out_0 = apply_tripod_gait(acts, 0.0)
        out_50 = apply_tripod_gait(acts, 50.0)  # half period

        # At least some actuators should have different values
        diffs = [abs(out_0[k] - out_50[k]) for k in out_0]
        assert max(diffs) > 0.01, "Gait modulation should produce different outputs at different phases"

    def test_tripod_groups_alternate(self):
        """Tripod 1 swing joints should be enhanced when Tripod 2 are suppressed."""
        acts = self._make_uniform_activations(0.5)
        out = apply_tripod_gait(acts, 0.0)  # phase=0: tripod1 swing high

        # LF Coxa (tripod 1, swing joint) should be higher than RF Coxa (tripod 2, swing joint)
        lf_coxa = out.get("actuator_position_joint_LFleg_Coxa", 0)
        rf_coxa = out.get("actuator_position_joint_RFleg_Coxa", 0)
        assert lf_coxa > rf_coxa, (
            f"At phase=0, LF swing ({lf_coxa:.3f}) should exceed RF swing ({rf_coxa:.3f})"
        )

    def test_full_period_symmetric(self):
        """Activations at t=0 and t=100ms (full period) should be identical."""
        acts = self._make_uniform_activations(0.5)
        out_0 = apply_tripod_gait(acts, 0.0)
        out_100 = apply_tripod_gait(acts, 100.0)

        for k in out_0:
            assert abs(out_0[k] - out_100[k]) < 1e-9, f"Full period should repeat: {k}"

    def test_zero_input_stays_zero(self):
        """Zero activations should remain zero after gait modulation."""
        acts = self._make_uniform_activations(0.0)
        out = apply_tripod_gait(acts, 25.0)
        for k, v in out.items():
            assert v == 0.0, f"Zero input should produce zero output: {k}={v}"

    def test_non_leg_actuators_pass_through(self):
        """Actuators not matching any leg prefix should pass through unchanged."""
        acts = {"some_head_actuator": 0.42}
        out = apply_tripod_gait(acts, 33.0)
        assert out["some_head_actuator"] == 0.42


class TestFlyLocomotion:
    """Integration test: fly body moves under activation."""

    def test_body_moves_under_activation(self, fly_body):
        """COM should displace after repeated activation steps."""
        fly_body.reset()
        initial_state = fly_body.get_state()
        initial_com = np.array(initial_state.center_of_mass)

        # Apply moderate activations to all position actuators for 50 steps
        for step_i in range(50):
            acts = {}
            for name in fly_body.position_actuators:
                # Use gait-modulated activations
                acts[name] = 0.3
            acts = apply_tripod_gait(acts, step_i * 0.5)
            fly_body.step(acts)

        final_state = fly_body.get_state()
        final_com = np.array(final_state.center_of_mass)

        displacement = np.linalg.norm(final_com - initial_com)
        assert displacement > 0, (
            f"Body should move under activation, but COM displacement = {displacement:.6f}"
        )
