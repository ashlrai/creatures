"""Tests for the rich sensory world environment model.

Validates chemical gradients (Gaussian diffusion), temperature interpolation,
toxic zone damage, social signals, and integration with the ecosystem.
"""

from __future__ import annotations

import math

import pytest

from creatures.environment.sensory_world import (
    ChemicalGradient,
    SensoryWorld,
    SocialSignal,
    TemperatureField,
    ToxicZone,
)
from creatures.environment.ecosystem import Ecosystem, EcosystemConfig


# --- Chemical gradient tests ---


class TestChemicalGradient:
    """Chemical concentration follows Gaussian diffusion:
    C = peak * exp(-d^2 / (2 * sigma^2))
    """

    def test_peak_concentration_at_source(self):
        """Concentration at the source equals peak_concentration."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 0.5),
                             peak_concentration=1.0, diffusion_radius=1.5)
        )
        sensory = world.sense_at((1.0, 0.5))
        assert sensory["chemicals"]["NaCl"] == pytest.approx(1.0)

    def test_concentration_decays_with_distance(self):
        """Concentration decreases monotonically away from source."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(0.0, 0.0),
                             peak_concentration=1.0, diffusion_radius=1.5)
        )
        c_close = world.sense_at((0.1, 0.0))["chemicals"]["NaCl"]
        c_mid = world.sense_at((0.5, 0.0))["chemicals"]["NaCl"]
        c_far = world.sense_at((1.0, 0.0))["chemicals"]["NaCl"]
        assert c_close > c_mid > c_far > 0.0

    def test_gaussian_diffusion_formula(self):
        """Concentration matches C = peak * exp(-d^2 / (2*sigma^2))."""
        peak = 2.5
        radius = 1.5
        sigma = radius / 3.0
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="X", source_position=(0.0, 0.0),
                             peak_concentration=peak, diffusion_radius=radius)
        )
        # Test at distance 0.6
        d = 0.6
        expected = peak * math.exp(-d * d / (2 * sigma * sigma))
        actual = world.sense_at((d, 0.0))["chemicals"]["X"]
        assert actual == pytest.approx(expected, rel=1e-6)

    def test_concentration_negligible_far_away(self):
        """At 3 sigma (the diffusion radius), concentration is ~0.01 * peak."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(0.0, 0.0),
                             peak_concentration=1.0, diffusion_radius=1.5)
        )
        # At distance = diffusion_radius = 3*sigma, exp(-9/2) ~ 0.011
        c = world.sense_at((1.5, 0.0))["chemicals"]["NaCl"]
        assert c < 0.02
        assert c > 0.0

    def test_multiple_gradients(self):
        """Multiple chemicals are independently sensed."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 0.0))
        )
        world.add_gradient(
            ChemicalGradient(name="isoamyl_alcohol", source_position=(-1.0, 0.0))
        )
        sensory = world.sense_at((0.0, 0.0))
        assert "NaCl" in sensory["chemicals"]
        assert "isoamyl_alcohol" in sensory["chemicals"]
        assert len(sensory["chemicals"]) == 2


class TestGradientDirection:
    """Gradient direction should point toward the source."""

    def test_gradient_points_toward_source(self):
        """From a point left of the source, gradient should point right."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 0.0),
                             peak_concentration=1.0, diffusion_radius=1.5)
        )
        gx, gy = world.get_gradient_at((0.0, 0.0), "NaCl")
        # Should point toward (1, 0) -- positive x
        assert gx > 0.5  # mostly in +x direction
        assert abs(gy) < 0.1  # minimal y component

    def test_gradient_is_unit_vector(self):
        """Gradient direction should be a unit vector."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 1.0),
                             peak_concentration=1.0, diffusion_radius=2.0)
        )
        gx, gy = world.get_gradient_at((0.0, 0.0), "NaCl")
        mag = math.sqrt(gx * gx + gy * gy)
        assert mag == pytest.approx(1.0, abs=1e-6)

    def test_gradient_at_source_is_zero(self):
        """At the source, gradient is zero (we're at the peak)."""
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 0.5))
        )
        gx, gy = world.get_gradient_at((1.0, 0.5), "NaCl")
        assert gx == 0.0
        assert gy == 0.0

    def test_gradient_unknown_name_is_zero(self):
        """Querying a nonexistent gradient returns (0, 0)."""
        world = SensoryWorld()
        gx, gy = world.get_gradient_at((0.0, 0.0), "nonexistent")
        assert gx == 0.0
        assert gy == 0.0


# --- Temperature field tests ---


class TestTemperatureField:
    """Temperature interpolates linearly between cold and hot positions."""

    def test_cold_end(self):
        """Temperature at the cold position equals cold_temp."""
        world = SensoryWorld()
        world.set_temperature(
            TemperatureField(cold_position=(-1.5, 0.0),
                             hot_position=(1.5, 0.0),
                             cold_temp=15.0, hot_temp=25.0)
        )
        temp = world.sense_at((-1.5, 0.0))["temperature"]
        assert temp == pytest.approx(15.0)

    def test_hot_end(self):
        """Temperature at the hot position equals hot_temp."""
        world = SensoryWorld()
        world.set_temperature(
            TemperatureField(cold_position=(-1.5, 0.0),
                             hot_position=(1.5, 0.0),
                             cold_temp=15.0, hot_temp=25.0)
        )
        temp = world.sense_at((1.5, 0.0))["temperature"]
        assert temp == pytest.approx(25.0)

    def test_midpoint(self):
        """Temperature at midpoint is average of cold and hot."""
        world = SensoryWorld()
        world.set_temperature(
            TemperatureField(cold_position=(-1.0, 0.0),
                             hot_position=(1.0, 0.0),
                             cold_temp=10.0, hot_temp=30.0)
        )
        temp = world.sense_at((0.0, 0.0))["temperature"]
        assert temp == pytest.approx(20.0)

    def test_interpolation_off_axis(self):
        """Points off the axis project onto it; same x gives same temp."""
        world = SensoryWorld()
        world.set_temperature(
            TemperatureField(cold_position=(-1.0, 0.0),
                             hot_position=(1.0, 0.0),
                             cold_temp=10.0, hot_temp=30.0)
        )
        # Point at (0.5, 0.8) projects to x=0.5 on the axis -> t=0.75
        temp = world.sense_at((0.5, 0.8))["temperature"]
        expected = 10.0 + 0.75 * (30.0 - 10.0)  # 25.0
        assert temp == pytest.approx(expected)

    def test_no_temperature_field(self):
        """Without a temperature field, temperature is None."""
        world = SensoryWorld()
        assert world.sense_at((0.0, 0.0))["temperature"] is None

    def test_clamping_beyond_cold(self):
        """Position beyond cold end clamps to cold_temp."""
        world = SensoryWorld()
        world.set_temperature(
            TemperatureField(cold_position=(-1.0, 0.0),
                             hot_position=(1.0, 0.0),
                             cold_temp=10.0, hot_temp=30.0)
        )
        temp = world.sense_at((-5.0, 0.0))["temperature"]
        assert temp == pytest.approx(10.0)


# --- Toxic zone tests ---


class TestToxicZone:
    """Toxic zones damage organisms based on proximity."""

    def test_damage_at_center(self):
        """Full damage rate at the center of a toxic zone."""
        world = SensoryWorld()
        world.add_toxic_zone(ToxicZone(position=(0.0, 0.0), radius=0.5,
                                       damage_rate=10.0))
        exposure = world.sense_at((0.0, 0.0))["toxin_exposure"]
        assert exposure == pytest.approx(10.0)

    def test_no_damage_outside(self):
        """No damage outside the toxic zone radius."""
        world = SensoryWorld()
        world.add_toxic_zone(ToxicZone(position=(0.0, 0.0), radius=0.3))
        exposure = world.sense_at((0.5, 0.5))["toxin_exposure"]
        assert exposure == 0.0

    def test_damage_linear_falloff(self):
        """Damage falls off linearly from center to edge."""
        world = SensoryWorld()
        world.add_toxic_zone(ToxicZone(position=(0.0, 0.0), radius=1.0,
                                       damage_rate=10.0))
        # At distance 0.5 (halfway), damage should be 50%
        exposure = world.sense_at((0.5, 0.0))["toxin_exposure"]
        assert exposure == pytest.approx(5.0)

    def test_multiple_toxic_zones_stack(self):
        """Overlapping toxic zones sum their damage."""
        world = SensoryWorld()
        world.add_toxic_zone(ToxicZone(position=(0.0, 0.0), radius=1.0,
                                       damage_rate=5.0))
        world.add_toxic_zone(ToxicZone(position=(0.1, 0.0), radius=1.0,
                                       damage_rate=3.0))
        exposure = world.sense_at((0.0, 0.0))["toxin_exposure"]
        assert exposure > 5.0  # at least the first zone's full damage


# --- Social signal tests ---


class TestSocialSignal:
    def test_social_signal_in_range(self):
        """Social signals are detected within range."""
        world = SensoryWorld()
        world.add_social_signal(
            SocialSignal(emitter_species="c_elegans",
                         signal_type="aggregation",
                         range=1.0, intensity=2.0,
                         position=(0.0, 0.0))
        )
        social = world.sense_at((0.3, 0.0))["social"]
        assert "aggregation" in social
        assert social["aggregation"] > 0.0

    def test_social_signal_out_of_range(self):
        """Social signals are not detected outside range."""
        world = SensoryWorld()
        world.add_social_signal(
            SocialSignal(emitter_species="c_elegans",
                         signal_type="alarm",
                         range=0.5, intensity=1.0,
                         position=(0.0, 0.0))
        )
        social = world.sense_at((2.0, 2.0))["social"]
        assert social.get("alarm", 0.0) == 0.0


# --- sense_at integration ---


class TestSenseAt:
    """sense_at should return all modalities in a single dict."""

    def test_returns_all_keys(self):
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 0.0))
        )
        world.set_temperature(TemperatureField())
        world.add_toxic_zone(ToxicZone(position=(-1.0, -1.0)))
        world.add_social_signal(
            SocialSignal(emitter_species="c_elegans",
                         signal_type="aggregation",
                         position=(0.0, 0.0))
        )

        sensory = world.sense_at((0.0, 0.0))
        assert "chemicals" in sensory
        assert "temperature" in sensory
        assert "toxin_exposure" in sensory
        assert "social" in sensory
        assert "gradient_direction" in sensory


# --- Factory arenas ---


class TestFactoryArenas:
    def test_chemotaxis_arena(self):
        """create_chemotaxis_arena produces a valid world with NaCl gradient."""
        world = SensoryWorld.create_chemotaxis_arena()
        assert len(world.chemical_gradients) == 1
        assert world.chemical_gradients[0].name == "NaCl"
        # NaCl concentration at source should be 1.0
        sensory = world.sense_at((1.0, 0.5))
        assert sensory["chemicals"]["NaCl"] == pytest.approx(1.0)

    def test_survival_arena(self):
        """create_survival_arena has food, toxin, and temperature."""
        world = SensoryWorld.create_survival_arena()
        assert len(world.chemical_gradients) >= 1
        assert len(world.toxic_zones) >= 1
        assert world.temperature_field is not None


# --- get_state serialization ---


class TestGetState:
    def test_state_includes_all_elements(self):
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(name="NaCl", source_position=(1.0, 0.0))
        )
        world.set_temperature(TemperatureField())
        world.add_toxic_zone(ToxicZone(position=(0.0, 0.0)))
        state = world.get_state()
        assert "chemical_gradients" in state
        assert "temperature_field" in state
        assert "toxic_zones" in state
        assert len(state["chemical_gradients"]) == 1
        assert state["temperature_field"] is not None
        assert len(state["toxic_zones"]) == 1

    def test_state_serializable(self):
        """State should be JSON-serializable (lists, not tuples)."""
        import json
        world = SensoryWorld.create_survival_arena()
        state = world.get_state()
        # Should not raise
        json.dumps(state)


# --- step ---


class TestStep:
    def test_step_advances_time(self):
        world = SensoryWorld()
        world.step(100.0)
        assert world.time_ms == 100.0
        world.step(50.0)
        assert world.time_ms == 150.0


# --- Ecosystem integration ---


class TestEcosystemIntegration:
    """Organisms in the ecosystem should actually follow gradients."""

    def test_ecosystem_works_without_world(self):
        """Backward compatibility: ecosystem works fine with world=None."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 5})
        for _ in range(100):
            eco.step(1.0)
        alive = [o for o in eco.organisms.values() if o.alive]
        assert len(alive) >= 0  # just confirm it doesn't crash

    def test_ecosystem_with_world_doesnt_crash(self):
        """Ecosystem with a sensory world runs without errors."""
        eco = Ecosystem()
        eco.world = SensoryWorld.create_survival_arena()
        eco.initialize({"c_elegans": 10})
        for _ in range(200):
            eco.step(1.0)

    def test_organisms_follow_chemical_gradient(self):
        """Run 500 steps and check organisms move toward the chemical source.

        Place a strong attractant at (1.5, 0) and start organisms at origin.
        After 500 steps, average x-position should be positive (toward source).
        """
        config = EcosystemConfig(
            arena_radius=3.0,
            n_food_sources=0,  # no food dots, only chemical gradient
            energy_decay_rate=0.0,  # don't let them die
        )
        eco = Ecosystem(config)

        # Create world with strong attractant
        world = SensoryWorld(arena_radius=3.0)
        world.add_gradient(
            ChemicalGradient(
                name="food_odor",
                source_position=(1.5, 0.0),
                peak_concentration=5.0,
                diffusion_radius=3.0,
                chemical_type="attractant",
            )
        )
        eco.world = world

        # Place organisms near origin
        eco.initialize({"c_elegans": 0})  # empty init
        for i in range(10):
            eco.add_organism("c_elegans", position=(0.0, 0.0), energy=200.0)

        # Run 500 steps
        for _ in range(500):
            eco.step(1.0)

        alive = [o for o in eco.organisms.values() if o.alive]
        assert len(alive) > 0, "Some organisms should still be alive"
        avg_x = sum(o.position[0] for o in alive) / len(alive)
        # Organisms should have moved toward positive x (toward source at 1.5)
        assert avg_x > 0.2, f"Expected organisms to move toward source, avg_x={avg_x}"

    def test_toxic_zone_kills_organisms(self):
        """Organisms sitting in a toxic zone lose energy and die."""
        config = EcosystemConfig(
            arena_radius=3.0,
            n_food_sources=0,
            energy_decay_rate=0.0,
            move_speed={"c_elegans": 0.0},  # don't move
        )
        eco = Ecosystem(config)

        world = SensoryWorld(arena_radius=3.0)
        world.add_toxic_zone(ToxicZone(position=(0.0, 0.0), radius=1.0,
                                       damage_rate=2.0))
        eco.world = world

        eco.initialize({"c_elegans": 0})
        eco.add_organism("c_elegans", position=(0.0, 0.0), energy=50.0)

        # Run until the organism dies (damage_rate=2.0/ms at center,
        # 50 energy -> should die in ~25 steps)
        for _ in range(100):
            eco.step(1.0)

        alive = [o for o in eco.organisms.values() if o.alive]
        assert len(alive) == 0, "Organism in toxic zone center should have died"

    def test_ecosystem_state_includes_world(self):
        """get_state includes sensory_world when world is set."""
        eco = Ecosystem()
        eco.world = SensoryWorld.create_chemotaxis_arena()
        eco.initialize({"c_elegans": 3})
        state = eco.get_state()
        assert "sensory_world" in state
        assert len(state["sensory_world"]["chemical_gradients"]) == 1

    def test_ecosystem_state_excludes_world_when_none(self):
        """get_state omits sensory_world when world is None."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 3})
        state = eco.get_state()
        assert "sensory_world" not in state
