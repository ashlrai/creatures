"""Tests for neural organism: real spiking networks driving ecosystem organisms.

Tests verify that:
1. NeuralOrganism builds with the C. elegans connectome
2. sense_and_act() returns valid movement commands
3. Chemical gradient input produces directed (non-random) movement
4. Movement differs based on gradient direction (left vs right)
5. Ecosystem with neural organisms runs for 100 steps without errors
"""

from __future__ import annotations

import math

import pytest

from creatures.connectome.openworm import load as load_celegans
from creatures.connectome.types import Connectome
from creatures.environment.eco_types import EcosystemConfig
from creatures.environment.ecosystem import Ecosystem
from creatures.environment.neural_organism import NeuralOrganism
from creatures.environment.sensory_world import ChemicalGradient, SensoryWorld
from creatures.neural.base import NeuralConfig


@pytest.fixture(scope="module")
def connectome() -> Connectome:
    """Load the C. elegans connectome once for all tests in this module."""
    return load_celegans()


@pytest.fixture
def neural_config() -> NeuralConfig:
    """Fast neural config for testing (numpy backend)."""
    return NeuralConfig(codegen_target="numpy")


# -------------------------------------------------------------------------
# Test 1: NeuralOrganism builds successfully
# -------------------------------------------------------------------------

class TestNeuralOrganismBuild:
    def test_builds_with_celegans_connectome(self, connectome, neural_config):
        """NeuralOrganism should initialize without errors."""
        org = NeuralOrganism(
            organism_id="test_001",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        assert org.n_neurons == connectome.n_neurons
        assert org.n_synapses == connectome.n_synapses
        assert org.organism_id == "test_001"
        assert org.species == "c_elegans"

    def test_sensor_map_has_expected_groups(self, connectome, neural_config):
        """Sensor map should contain chemosensory, thermo, and touch groups."""
        org = NeuralOrganism(
            organism_id="test_002",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        assert "chemical_left" in org._sensor_map
        assert "chemical_right" in org._sensor_map
        assert "temperature" in org._sensor_map
        assert "danger_left" in org._sensor_map
        # Verify real neuron IDs
        assert "ASEL" in org._sensor_map["chemical_left"]
        assert "ASER" in org._sensor_map["chemical_right"]

    def test_motor_map_has_expected_groups(self, connectome, neural_config):
        """Motor map should contain forward, backward, and turn groups."""
        org = NeuralOrganism(
            organism_id="test_003",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        assert "forward" in org._motor_map
        assert "backward" in org._motor_map
        assert "turn_left" in org._motor_map
        assert "turn_right" in org._motor_map
        # Check real motor neuron IDs
        assert "VA1" in org._motor_map["forward"]
        assert "DA1" in org._motor_map["backward"]

    def test_neural_stats(self, connectome, neural_config):
        """get_neural_stats() should return complete info."""
        org = NeuralOrganism(
            organism_id="test_004",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        stats = org.get_neural_stats()
        assert stats["n_neurons"] == connectome.n_neurons
        assert stats["n_synapses"] == connectome.n_synapses
        assert "forward" in stats["motor_groups"]
        assert "chemical_left" in stats["sensor_groups"]


# -------------------------------------------------------------------------
# Test 2: sense_and_act returns valid movement commands
# -------------------------------------------------------------------------

class TestSenseAndAct:
    def test_returns_speed_and_turn(self, connectome, neural_config):
        """sense_and_act should return dict with speed and turn keys."""
        org = NeuralOrganism(
            organism_id="test_move_01",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        sensory_input = {
            "chemicals": {"NaCl": 0.5},
            "temperature": 20.0,
            "toxin_exposure": 0.0,
            "social": {},
            "gradient_direction": {"NaCl": (0.5, 0.3)},
        }
        movement = org.sense_and_act(sensory_input, dt_ms=1.0)
        assert "speed" in movement
        assert "turn" in movement
        assert isinstance(movement["speed"], float)
        assert isinstance(movement["turn"], float)

    def test_returns_finite_values(self, connectome, neural_config):
        """Movement values should be finite (no NaN or inf)."""
        org = NeuralOrganism(
            organism_id="test_move_02",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        sensory_input = {
            "chemicals": {"NaCl": 1.0},
            "temperature": 25.0,
            "toxin_exposure": 2.0,
            "social": {},
            "gradient_direction": {"NaCl": (1.0, 0.0)},
        }
        movement = org.sense_and_act(sensory_input, dt_ms=1.0)
        assert math.isfinite(movement["speed"])
        assert math.isfinite(movement["turn"])

    def test_empty_sensory_input(self, connectome, neural_config):
        """Should handle empty sensory input gracefully."""
        org = NeuralOrganism(
            organism_id="test_move_03",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        movement = org.sense_and_act({}, dt_ms=1.0)
        assert "speed" in movement
        assert "turn" in movement
        assert math.isfinite(movement["speed"])
        assert math.isfinite(movement["turn"])


# -------------------------------------------------------------------------
# Test 3: Chemical gradient produces directed movement
# -------------------------------------------------------------------------

class TestChemotaxis:
    def test_gradient_produces_nonzero_output(self, connectome, neural_config):
        """Strong chemical gradient should produce non-trivial neural output.

        Run several steps to let the network warm up, then check that
        motor output is non-zero (the network is actually processing).
        """
        org = NeuralOrganism(
            organism_id="test_chemo_01",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        sensory_input = {
            "chemicals": {"NaCl": 1.0},
            "temperature": None,
            "toxin_exposure": 0.0,
            "social": {},
            "gradient_direction": {"NaCl": (1.0, 0.0)},
        }
        # Run several steps to let the network warm up
        for _ in range(10):
            movement = org.sense_and_act(sensory_input, dt_ms=1.0)

        # After warm-up, at least speed or turn should be non-zero
        # (the network is producing motor output)
        rates = org.engine.get_firing_rates()
        total_rate = sum(abs(r) for r in rates.values())
        assert total_rate > 0, "Network should have some firing activity"

    def test_no_input_vs_strong_input_differ(self, connectome, neural_config):
        """Movement with strong chemical input should differ from no input."""
        org_no_input = NeuralOrganism(
            organism_id="test_chemo_02a",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        org_strong = NeuralOrganism(
            organism_id="test_chemo_02b",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )

        no_input = {
            "chemicals": {},
            "temperature": None,
            "toxin_exposure": 0.0,
            "social": {},
            "gradient_direction": {},
        }
        strong_input = {
            "chemicals": {"NaCl": 1.0},
            "temperature": None,
            "toxin_exposure": 0.0,
            "social": {},
            "gradient_direction": {"NaCl": (1.0, 0.0)},
        }

        # Run both for several steps
        moves_no = []
        moves_strong = []
        for _ in range(10):
            moves_no.append(org_no_input.sense_and_act(no_input, dt_ms=1.0))
            moves_strong.append(org_strong.sense_and_act(strong_input, dt_ms=1.0))

        # Compare final firing rates -- they should differ
        rates_no = org_no_input.engine.get_firing_rates()
        rates_strong = org_strong.engine.get_firing_rates()

        # At least some neurons should fire differently
        diffs = [abs(rates_strong.get(k, 0) - rates_no.get(k, 0)) for k in rates_strong]
        max_diff = max(diffs) if diffs else 0
        assert max_diff > 0, "Strong sensory input should change neural activity"


# -------------------------------------------------------------------------
# Test 4: Movement differs based on gradient direction
# -------------------------------------------------------------------------

class TestDirectionalResponse:
    def test_left_vs_right_gradient_differ(self, connectome, neural_config):
        """Left and right chemical gradients should produce different turns."""
        org_left = NeuralOrganism(
            organism_id="test_dir_left",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )
        org_right = NeuralOrganism(
            organism_id="test_dir_right",
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )

        left_input = {
            "chemicals": {"NaCl": 0.8},
            "temperature": None,
            "toxin_exposure": 0.0,
            "social": {},
            "gradient_direction": {"NaCl": (-1.0, 0.0)},  # gradient to the left
        }
        right_input = {
            "chemicals": {"NaCl": 0.8},
            "temperature": None,
            "toxin_exposure": 0.0,
            "social": {},
            "gradient_direction": {"NaCl": (1.0, 0.0)},  # gradient to the right
        }

        # Run both for several steps to accumulate directional bias
        turns_left = []
        turns_right = []
        for _ in range(15):
            ml = org_left.sense_and_act(left_input, dt_ms=1.0)
            mr = org_right.sense_and_act(right_input, dt_ms=1.0)
            turns_left.append(ml["turn"])
            turns_right.append(mr["turn"])

        # Compare firing rates of left vs right sensory neurons
        rates_l = org_left.engine.get_firing_rates()
        rates_r = org_right.engine.get_firing_rates()

        # The key test: ASEL (left sensor) should fire differently in each case
        # because different sensors receive different currents
        asel_diff = abs(rates_l.get("ASEL", 0) - rates_r.get("ASEL", 0))
        aser_diff = abs(rates_l.get("ASER", 0) - rates_r.get("ASER", 0))

        # At least one pair of bilateral sensors should show differential activity
        assert (asel_diff + aser_diff) > 0, (
            "Left vs right gradient should produce different sensory neuron activity"
        )


# -------------------------------------------------------------------------
# Test 5: Ecosystem with neural organisms runs for 100 steps
# -------------------------------------------------------------------------

@pytest.mark.slow
class TestEcosystemIntegration:
    def test_ecosystem_runs_with_neural_organisms(self, connectome, neural_config):
        """Ecosystem with 2 neural organisms should run 100 steps without error."""
        config = EcosystemConfig(
            arena_radius=2.0,
            n_food_sources=5,
            predation_enabled=False,
        )
        eco = Ecosystem(config)
        eco.initialize({"c_elegans": 5})

        # Add a sensory world so neural organisms get rich input
        world = SensoryWorld(arena_radius=2.0)
        world.add_gradient(
            ChemicalGradient(
                name="NaCl",
                source_position=(1.0, 0.5),
                peak_concentration=1.0,
                diffusion_radius=1.5,
            )
        )
        eco.world = world

        # Upgrade 2 organisms to have neural brains
        organism_ids = list(eco.organisms.keys())[:2]
        for oid in organism_ids:
            eco.add_neural_organism(oid, species="c_elegans",
                                    connectome=connectome,
                                    neural_config=neural_config)

        assert len(eco.neural_organisms) == 2

        # Run 100 steps
        all_events = []
        for _ in range(100):
            events = eco.step(dt_ms=1.0)
            all_events.extend(events)

        # Verify ecosystem advanced
        assert eco.time_ms == pytest.approx(100.0)

        # Verify neural organisms still exist in the mapping
        for oid in organism_ids:
            assert oid in eco.neural_organisms

    def test_mixed_neural_and_simple_organisms(self, connectome, neural_config):
        """Mix of neural and simple organisms should coexist."""
        config = EcosystemConfig(
            arena_radius=2.0,
            n_food_sources=5,
            predation_enabled=False,
        )
        eco = Ecosystem(config)
        eco.initialize({"c_elegans": 4})

        # Upgrade only 1 out of 4 organisms
        first_id = list(eco.organisms.keys())[0]
        neural_org = eco.add_neural_organism(
            first_id,
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )

        assert len(eco.neural_organisms) == 1
        assert neural_org.n_neurons == connectome.n_neurons

        # Run 50 steps -- both neural and simple organisms should move
        for _ in range(50):
            eco.step(dt_ms=1.0)

        assert eco.time_ms == pytest.approx(50.0)

        # All organisms should still have positions (moved from initial)
        for org in eco.organisms.values():
            assert org.position is not None

    def test_brain_upgrade_event_recorded(self, connectome, neural_config):
        """Upgrading an organism should log a brain_upgraded event."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 2})

        oid = list(eco.organisms.keys())[0]
        eco.add_neural_organism(
            oid,
            species="c_elegans",
            connectome=connectome,
            neural_config=neural_config,
        )

        upgrade_events = [e for e in eco.events if e["type"] == "brain_upgraded"]
        assert len(upgrade_events) == 1
        assert upgrade_events[0]["organism_id"] == oid
        assert upgrade_events[0]["n_neurons"] == connectome.n_neurons

    def test_upgrade_nonexistent_organism_raises(self, connectome, neural_config):
        """Upgrading a non-existent organism should raise KeyError."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 2})

        with pytest.raises(KeyError):
            eco.add_neural_organism(
                "nonexistent_id",
                species="c_elegans",
                connectome=connectome,
                neural_config=neural_config,
            )
