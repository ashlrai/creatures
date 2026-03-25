"""Tests for the zebrafish connectome loader and fish body model."""

import numpy as np
import pytest

from creatures.connectome.types import (
    Connectome,
    Neuron,
    NeuronType,
    Synapse,
    SynapseType,
)
from creatures.connectome.zebrafish import (
    ZEBRAFISH_REGIONS,
    load,
    load_mauthner_circuit,
    load_synthetic,
)
from creatures.body.base import BodyState
from creatures.body.fish_body import FishBody


# -----------------------------------------------------------------------
# Mauthner circuit tests
# -----------------------------------------------------------------------


class TestMauthnerCircuit:
    """Tests for the Mauthner cell escape circuit."""

    @pytest.fixture(scope="class")
    def mauthner(self) -> Connectome:
        return load_mauthner_circuit()

    def test_loads_without_error(self, mauthner: Connectome):
        assert mauthner is not None

    def test_name(self, mauthner: Connectome):
        assert mauthner.name == "zebrafish_mauthner"

    def test_species_metadata(self, mauthner: Connectome):
        assert mauthner.metadata["species"] == "Danio rerio"

    def test_has_expected_neuron_count(self, mauthner: Connectome):
        # 10 AUD + 2 M-cell + 6 CRN + 6 COM + 4 PHP + 6 RS + 16 MN = 50
        assert mauthner.n_neurons == 50

    def test_has_sensory_neurons(self, mauthner: Connectome):
        sensory = mauthner.neurons_by_type(NeuronType.SENSORY)
        assert len(sensory) == 10  # 10 auditory afferents

    def test_has_motor_neurons(self, mauthner: Connectome):
        motor = mauthner.neurons_by_type(NeuronType.MOTOR)
        assert len(motor) == 16  # 8 left + 8 right motor neurons

    def test_has_interneurons(self, mauthner: Connectome):
        inter = mauthner.neurons_by_type(NeuronType.INTER)
        assert len(inter) == 24  # M-cells + CRN + COM + PHP + RS

    def test_mauthner_cells_present(self, mauthner: Connectome):
        assert "M_L" in mauthner.neurons
        assert "M_R" in mauthner.neurons

    def test_mauthner_cells_are_glutamatergic(self, mauthner: Connectome):
        assert mauthner.neurons["M_L"].neurotransmitter == "glutamate"
        assert mauthner.neurons["M_R"].neurotransmitter == "glutamate"

    def test_has_synapses(self, mauthner: Connectome):
        assert mauthner.n_synapses > 50  # expect many connections

    def test_has_electrical_synapses(self, mauthner: Connectome):
        """Mauthner circuit uses mixed electrical/chemical synapses."""
        elec = [s for s in mauthner.synapses if s.synapse_type == SynapseType.ELECTRICAL]
        assert len(elec) > 0, "Expected electrical synapses (gap junctions)"

    def test_has_chemical_synapses(self, mauthner: Connectome):
        chem = [s for s in mauthner.synapses if s.synapse_type == SynapseType.CHEMICAL]
        assert len(chem) > 0

    def test_has_inhibitory_neurons(self, mauthner: Connectome):
        """Commissural and PHP neurons should be glycinergic (inhibitory)."""
        inhibitory = [
            n for n in mauthner.neurons.values()
            if n.neurotransmitter in ("glycine", "GABA")
        ]
        assert len(inhibitory) >= 10  # COM + PHP neurons

    def test_reciprocal_inhibition_exists(self, mauthner: Connectome):
        """M_L should inhibit M_R and vice versa via commissural neurons."""
        # Check that COM neurons connect to contralateral M-cell
        com_to_m = [
            s for s in mauthner.synapses
            if s.pre_id.startswith("COM_L") and s.post_id == "M_R"
        ]
        assert len(com_to_m) > 0, "Missing L->R reciprocal inhibition"

        com_to_m_r = [
            s for s in mauthner.synapses
            if s.pre_id.startswith("COM_R") and s.post_id == "M_L"
        ]
        assert len(com_to_m_r) > 0, "Missing R->L reciprocal inhibition"

    def test_m_cell_to_motor_neurons(self, mauthner: Connectome):
        """M-cell should connect to contralateral motor neurons."""
        m_l_to_mn_r = [
            s for s in mauthner.synapses
            if s.pre_id == "M_L" and s.post_id.startswith("MN_R")
        ]
        assert len(m_l_to_mn_r) > 0, "M_L should connect to MN_R"

    def test_adjacency_matrix_valid(self, mauthner: Connectome):
        mat = mauthner.adjacency_matrix
        assert mat.shape == (50, 50)
        assert np.count_nonzero(mat) > 0

    def test_brian2_params_valid(self, mauthner: Connectome):
        params = mauthner.to_brian2_params()
        assert len(params["i"]) == len(params["j"]) == len(params["w"])
        assert len(params["i"]) == mauthner.n_synapses
        assert np.all(params["i"] >= 0) and np.all(params["i"] < 50)
        assert np.all(params["j"] >= 0) and np.all(params["j"] < 50)


# -----------------------------------------------------------------------
# Synthetic connectome tests
# -----------------------------------------------------------------------


class TestSyntheticConnectome:
    """Tests for synthetic zebrafish connectome generation."""

    def test_default_generates_1000_neurons(self):
        conn = load_synthetic(n_neurons=1000)
        assert conn.n_neurons == 1000

    def test_custom_neuron_count(self):
        conn = load_synthetic(n_neurons=500)
        assert conn.n_neurons == 500

    def test_region_subset(self):
        conn = load_synthetic(n_neurons=200, regions=["hindbrain", "spinal_cord"])
        assert conn.n_neurons == 200
        # All neurons should be from the requested regions
        for n in conn.neurons.values():
            assert n.metadata["region"] in ("hindbrain", "spinal_cord")

    def test_has_synapses(self):
        conn = load_synthetic(n_neurons=100)
        assert conn.n_synapses > 0

    def test_has_excitatory_and_inhibitory(self):
        conn = load_synthetic(n_neurons=200)
        exc = [n for n in conn.neurons.values() if n.neurotransmitter == "glutamate"]
        inh = [n for n in conn.neurons.values() if n.neurotransmitter == "GABA"]
        assert len(exc) > 0, "Expected excitatory neurons"
        assert len(inh) > 0, "Expected inhibitory neurons"

    def test_has_electrical_synapses(self):
        conn = load_synthetic(n_neurons=200)
        elec = [s for s in conn.synapses if s.synapse_type == SynapseType.ELECTRICAL]
        assert len(elec) > 0, "Expected gap junctions"

    def test_invalid_region_raises(self):
        with pytest.raises(ValueError, match="Unknown region"):
            load_synthetic(regions=["nonexistent_region"])

    def test_small_scale_connectome(self):
        """50-neuron connectome should still be valid."""
        conn = load_synthetic(n_neurons=50)
        assert conn.n_neurons == 50
        assert conn.n_synapses > 0

    def test_metadata_contains_region_info(self):
        conn = load_synthetic(n_neurons=100)
        assert conn.metadata["species"] == "Danio rerio"
        assert conn.metadata["type"] == "synthetic"
        assert "regions" in conn.metadata

    def test_reproducible_with_seed(self):
        c1 = load_synthetic(n_neurons=100, seed=123)
        c2 = load_synthetic(n_neurons=100, seed=123)
        assert c1.n_synapses == c2.n_synapses

    def test_different_seeds_differ(self):
        c1 = load_synthetic(n_neurons=100, seed=1)
        c2 = load_synthetic(n_neurons=100, seed=2)
        # Synapse counts may differ slightly due to stochastic connectivity
        # At minimum the weight values should differ
        w1 = sorted([s.weight for s in c1.synapses])
        w2 = sorted([s.weight for s in c2.synapses])
        assert w1 != w2


# -----------------------------------------------------------------------
# load() dispatch tests
# -----------------------------------------------------------------------


class TestLoadDispatch:
    """Tests for the load() entry point."""

    def test_load_mauthner(self):
        conn = load(circuit="mauthner")
        assert conn.name == "zebrafish_mauthner"

    def test_load_synthetic(self):
        conn = load(circuit="synthetic", n_neurons=100)
        assert conn.n_neurons == 100

    def test_load_hindbrain(self):
        conn = load(circuit="hindbrain")
        assert conn.n_neurons == 1000
        for n in conn.neurons.values():
            assert n.metadata["region"] in ("hindbrain", "spinal_cord")

    def test_load_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown circuit"):
            load(circuit="nonexistent")


# -----------------------------------------------------------------------
# FishBody tests
# -----------------------------------------------------------------------


class TestFishBodyCreation:
    """Tests for FishBody construction."""

    @pytest.fixture(scope="class")
    def fish(self) -> FishBody:
        return FishBody()

    def test_default_segments(self, fish: FishBody):
        assert fish.n_segments == 20

    def test_default_joints(self, fish: FishBody):
        assert fish.n_joints == 19

    def test_custom_segments(self):
        f = FishBody(n_segments=10)
        assert f.n_segments == 10
        assert f.n_joints == 9


class TestFishBodyReset:
    """Tests for FishBody reset."""

    @pytest.fixture
    def fish(self) -> FishBody:
        return FishBody()

    def test_reset_returns_body_state(self, fish: FishBody):
        state = fish.reset()
        assert isinstance(state, BodyState)

    def test_reset_positions_count(self, fish: FishBody):
        state = fish.reset()
        assert len(state.positions) == fish.n_segments

    def test_reset_joint_angles_count(self, fish: FishBody):
        state = fish.reset()
        assert len(state.joint_angles) == fish.n_joints

    def test_reset_angles_zero(self, fish: FishBody):
        state = fish.reset()
        for angle in state.joint_angles:
            assert abs(angle) < 1e-10

    def test_reset_com_at_origin(self, fish: FishBody):
        state = fish.reset()
        assert abs(state.center_of_mass[0]) < 0.01
        assert abs(state.center_of_mass[1]) < 0.01


class TestFishBodyMovement:
    """Tests for FishBody producing movement from muscle activations."""

    @pytest.fixture
    def fish(self) -> FishBody:
        f = FishBody()
        f.reset()
        return f

    def test_step_returns_body_state(self, fish: FishBody):
        state = fish.step({})
        assert isinstance(state, BodyState)

    def test_muscle_activation_changes_angles(self, fish: FishBody):
        """Activating left muscles should bend the body."""
        activations = {f"left_{i}": 1.0 for i in range(fish.n_joints)}
        for _ in range(100):
            state = fish.step(activations)
        # At least some joint angles should have changed
        assert any(abs(a) > 1e-6 for a in state.joint_angles)

    def test_alternating_activation_produces_movement(self, fish: FishBody):
        """Alternating left-right activation (swimming) should move COM."""
        initial_state = fish.get_state()
        initial_com = initial_state.center_of_mass

        for t in range(200):
            # Sinusoidal muscle activation with traveling wave
            activations = {}
            for j in range(fish.n_joints):
                phase = 2 * np.pi * (t / 20.0 - j / fish.n_joints)
                val = np.sin(phase) * 0.8
                if val > 0:
                    activations[f"left_{j}"] = val
                    activations[f"right_{j}"] = 0.0
                else:
                    activations[f"left_{j}"] = 0.0
                    activations[f"right_{j}"] = -val
            fish.step(activations)

        final_state = fish.get_state()
        final_com = final_state.center_of_mass

        # Should have moved from initial position
        displacement = np.sqrt(
            (final_com[0] - initial_com[0]) ** 2
            + (final_com[1] - initial_com[1]) ** 2
        )
        assert displacement > 1e-10, (
            f"Expected fish to move, but displacement was {displacement}"
        )

    def test_external_force_affects_state(self, fish: FishBody):
        """Applying an external force should change the body state."""
        state_before = fish.get_state()
        fish.apply_external_force("seg_0", (0.001, 0.0, 0.0))
        state_after = fish.step({})
        # COM should have shifted
        dx = state_after.center_of_mass[0] - state_before.center_of_mass[0]
        assert abs(dx) > 0


class TestFishBodyMaps:
    """Tests for sensor/motor neuron mappings."""

    @pytest.fixture(scope="class")
    def fish(self) -> FishBody:
        return FishBody()

    def test_sensor_map_has_entries(self, fish: FishBody):
        sensor_map = fish.sensor_neuron_map
        assert len(sensor_map) > 0

    def test_sensor_map_values_are_aud_neurons(self, fish: FishBody):
        sensor_map = fish.sensor_neuron_map
        for neuron_id in sensor_map.values():
            assert neuron_id.startswith("AUD_")

    def test_motor_map_has_entries(self, fish: FishBody):
        motor_map = fish.motor_neuron_map
        assert len(motor_map) > 0

    def test_motor_map_covers_left_and_right(self, fish: FishBody):
        motor_map = fish.motor_neuron_map
        left_neurons = [k for k in motor_map if "MN_L" in k]
        right_neurons = [k for k in motor_map if "MN_R" in k]
        assert len(left_neurons) > 0
        assert len(right_neurons) > 0

    def test_motor_map_actuator_names_valid(self, fish: FishBody):
        motor_map = fish.motor_neuron_map
        for nid, actuators in motor_map.items():
            for act in actuators:
                assert act.startswith("left_") or act.startswith("right_")


# -----------------------------------------------------------------------
# Integration: connectome + body compatibility
# -----------------------------------------------------------------------


class TestZebrafishIntegration:
    """Tests that connectome and body work together."""

    def test_mauthner_motor_neurons_match_body(self):
        """Motor neurons in Mauthner circuit should appear in FishBody motor map."""
        conn = load_mauthner_circuit()
        fish = FishBody()
        motor_map = fish.motor_neuron_map

        conn_motor = conn.neurons_by_type(NeuronType.MOTOR)
        motor_ids = {n.id for n in conn_motor}

        mapped_ids = set(motor_map.keys())
        overlap = motor_ids & mapped_ids
        assert len(overlap) > 0, (
            f"No overlap between connectome motor neurons {motor_ids} "
            f"and body motor map {mapped_ids}"
        )

    def test_mauthner_sensory_neurons_match_body(self):
        """Sensory neurons in Mauthner circuit should appear in FishBody sensor map."""
        conn = load_mauthner_circuit()
        fish = FishBody()
        sensor_map = fish.sensor_neuron_map

        conn_sensory = conn.neurons_by_type(NeuronType.SENSORY)
        sensory_ids = {n.id for n in conn_sensory}

        mapped_ids = set(sensor_map.values())
        overlap = sensory_ids & mapped_ids
        assert len(overlap) > 0, (
            f"No overlap between connectome sensory neurons {sensory_ids} "
            f"and body sensor map {mapped_ids}"
        )
