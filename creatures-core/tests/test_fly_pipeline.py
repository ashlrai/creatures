"""End-to-end tests for the Drosophila simulation pipeline.

Tests the full flow: FlyWire connectome -> Brian2 network -> FlyBody -> SimulationRunner.
"""

import pytest
import numpy as np

from creatures.connectome.flywire import load as load_fly, NEUROPIL_PRESETS
from creatures.connectome.types import NeuronType
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.base import MonitorConfig, NeuralConfig


class TestFlyWireLoader:
    """Tests for the FlyWire connectome loader."""

    @pytest.fixture
    def locomotion_connectome(self):
        return load_fly("locomotion", max_neurons=100, min_synapse_count=5)

    def test_neuropil_presets_valid(self):
        """All presets should be lists of strings."""
        for name, neuropils in NEUROPIL_PRESETS.items():
            assert isinstance(neuropils, list), f"{name} is not a list"
            assert all(isinstance(n, str) for n in neuropils)

    def test_locomotion_preset_no_vnc_regions(self):
        """Locomotion preset should not include VNC regions (T1-T3)."""
        for neuropil in NEUROPIL_PRESETS["locomotion"]:
            assert not neuropil.startswith("T"), f"VNC region {neuropil} in locomotion preset"

    def test_load_locomotion(self, locomotion_connectome):
        """Should load a valid connectome from locomotion neuropils."""
        c = locomotion_connectome
        assert c.n_neurons > 0
        assert c.n_synapses > 0
        assert "drosophila" in c.name.lower()

    def test_descending_neurons_classified_as_motor(self):
        """Descending neurons should be classified as MOTOR."""
        # Need enough neurons to include descending ones
        c = load_fly("locomotion", max_neurons=300, min_synapse_count=5)
        motor = c.neurons_by_type(NeuronType.MOTOR)
        assert len(motor) > 0, "No motor neurons found in locomotion preset"

    def test_vectorized_synapse_building(self, locomotion_connectome):
        """Synapses should have valid pre/post IDs."""
        c = locomotion_connectome
        neuron_ids = set(c.neurons.keys())
        for s in c.synapses[:100]:  # spot check
            assert s.pre_id in neuron_ids
            assert s.post_id in neuron_ids
            assert s.weight > 0

    def test_locomotion_compact_preset(self):
        """locomotion_compact preset should exist and load."""
        c = load_fly("locomotion_compact", max_neurons=50, min_synapse_count=5)
        assert c.n_neurons > 0


class TestFlyNeuronMap:
    """Tests for the fly neuron-to-body mapping."""

    def test_build_motor_map(self):
        from creatures.body.fly_neuron_map import build_motor_map
        c = load_fly("locomotion", max_neurons=100, min_synapse_count=5)
        actuators = [
            f"actuator_position_joint_{leg}leg_{joint}"
            for leg in ["LF", "LM", "LH", "RF", "RM", "RH"]
            for joint in ["Coxa", "Femur", "Tibia"]
        ]
        motor_map = build_motor_map(c, actuators)
        assert len(motor_map) > 0, "No motor neurons mapped"
        for nid, targets in motor_map.items():
            assert nid in c.neurons
            assert len(targets) > 0
            for t in targets:
                assert t in actuators

    def test_build_sensor_map(self):
        from creatures.body.fly_neuron_map import build_sensor_map
        c = load_fly("locomotion", max_neurons=100, min_synapse_count=5)
        sensors = ["sensor_LF_tarsus", "sensor_RF_tarsus", "sensor_head"]
        sensory_neurons = c.neurons_by_type(NeuronType.SENSORY)
        if not sensory_neurons:
            pytest.skip("No sensory neurons in locomotion preset")
        sensor_map = build_sensor_map(c, sensors)
        assert len(sensor_map) == len(sensors)


class TestFlyBrainSimulation:
    """Tests for Brian2 simulation with fly connectome."""

    def test_build_and_step(self):
        """Should build a Brian2 network from fly connectome and simulate."""
        c = load_fly("locomotion", max_neurons=100, min_synapse_count=5)
        engine = Brian2Engine()
        config = NeuralConfig(weight_scale=0.5, codegen_target="numpy")
        monitor = MonitorConfig(record_voltages=False)
        engine.build(c, config, monitor=monitor)

        assert engine.n_neurons == c.n_neurons
        assert len(engine.neuron_ids) == c.n_neurons

        # Step and check state
        state = engine.step(1.0)
        assert state.t_ms > 0
        assert len(state.firing_rates) == c.n_neurons

    def test_stimulus_produces_spikes(self):
        """Injecting current should produce spikes."""
        c = load_fly("locomotion", max_neurons=100, min_synapse_count=5)
        engine = Brian2Engine()
        config = NeuralConfig(weight_scale=0.5, codegen_target="numpy")
        engine.build(c, config, monitor=MonitorConfig(record_voltages=False))

        # Inject strong current into several neurons
        targets = list(c.neurons.keys())[:10]
        engine.set_input_currents({nid: 30.0 for nid in targets})

        # Run for a few steps
        total_spikes = 0
        for _ in range(10):
            state = engine.step(1.0)
            total_spikes += len(state.spikes)

        assert total_spikes > 0, "No spikes produced after stimulus"


class TestFlyBody:
    """Tests for the FlyBody with connectome coupling."""

    def test_fly_body_with_connectome(self):
        """FlyBody should build motor maps from connectome."""
        from creatures.body.fly_body import FlyBody
        from creatures.body.base import BodyConfig

        c = load_fly("locomotion", max_neurons=100, min_synapse_count=5)
        body = FlyBody(BodyConfig(dt=0.5), connectome=c)
        body.reset()

        assert len(body.motor_neuron_map) > 0, "No motor neurons mapped"
        assert len(body.position_actuators) > 0

        # All motor neuron IDs should exist in connectome
        for nid in body.motor_neuron_map:
            assert nid in c.neurons

    def test_fly_body_without_connectome(self):
        """FlyBody should work without connectome (empty maps)."""
        from creatures.body.fly_body import FlyBody
        body = FlyBody()
        assert body.motor_neuron_map == {}
        assert body.sensor_neuron_map == {}


@pytest.mark.slow
class TestFlyEndToEnd:
    """End-to-end integration test: connectome -> brain -> body."""

    def test_coupled_simulation(self):
        """Full brain-body coupled simulation should produce frames."""
        from creatures.body.fly_body import FlyBody
        from creatures.body.base import BodyConfig
        from creatures.experiment.runner import SimulationRunner, CouplingConfig

        c = load_fly("locomotion", max_neurons=100, min_synapse_count=5)
        engine = Brian2Engine()
        config = NeuralConfig(weight_scale=0.5, codegen_target="numpy")
        engine.build(c, config, monitor=MonitorConfig(record_voltages=False))

        body = FlyBody(BodyConfig(dt=0.5), connectome=c)
        body.reset()

        coupling = CouplingConfig(
            firing_rate_to_torque_gain=0.002,
            sensor_to_current_gain=30.0,
        )
        runner = SimulationRunner(engine, body, coupling, connectome=c)

        # Run 20 steps with stimulus
        targets = list(c.neurons.keys())[:5]
        for nid in targets:
            runner.set_stimulus(nid, 25.0)

        frames = []
        for _ in range(20):
            frame = runner.step()
            frames.append(frame)

        assert len(frames) == 20
        assert frames[-1].t_ms > 0

        # Check that some neurons fired
        total_active = sum(len(f.active_neurons) for f in frames)
        assert total_active > 0, "No neural activity in coupled simulation"

        # Check that body state is valid
        last = frames[-1]
        assert last.body_state.center_of_mass is not None
        assert len(last.body_state.positions) > 0
