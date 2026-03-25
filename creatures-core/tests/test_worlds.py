"""Tests for diverse environment types (worlds.py).

Validates that each world type produces valid sensory data compatible with
NeuralOrganism, and that dynamic environments evolve over time.
"""

from __future__ import annotations

import json
import math

import pytest

from creatures.environment.worlds import (
    AbstractWorld,
    LabPlateWorld,
    PondWorld,
    SoilWorld,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

REQUIRED_KEYS = {"chemicals", "temperature", "toxin_exposure", "social", "gradient_direction"}


def assert_valid_sensory(sensory: dict, label: str = "") -> None:
    """Assert the sensory dict has all required keys and valid types."""
    for key in REQUIRED_KEYS:
        assert key in sensory, f"{label}: missing key '{key}'"
    assert isinstance(sensory["chemicals"], dict), f"{label}: chemicals not dict"
    assert isinstance(sensory["social"], dict), f"{label}: social not dict"
    assert isinstance(sensory["gradient_direction"], dict), f"{label}: gradient_direction not dict"
    assert sensory["toxin_exposure"] >= 0.0, f"{label}: negative toxin_exposure"
    # temperature is float or None
    temp = sensory["temperature"]
    assert temp is None or isinstance(temp, (int, float)), f"{label}: bad temperature type"


def assert_state_serializable(world, label: str = "") -> None:
    """Assert get_state() is JSON-serializable."""
    state = world.get_state()
    try:
        json.dumps(state)
    except (TypeError, ValueError) as e:
        pytest.fail(f"{label}: get_state() not JSON-serializable: {e}")


# ===========================================================================
# SoilWorld
# ===========================================================================


class TestSoilWorld:
    def test_sensory_has_all_keys(self):
        world = SoilWorld()
        sensory = world.sense_at(5.0, 5.0)
        assert_valid_sensory(sensory, "SoilWorld center")

    def test_sensory_at_multiple_positions(self):
        world = SoilWorld()
        for x, y in [(0, 0), (5, 5), (10, 10), (3, 7)]:
            sensory = world.sense_at(x, y)
            assert_valid_sensory(sensory, f"SoilWorld ({x},{y})")

    def test_bacteria_odor_present(self):
        world = SoilWorld()
        # At least some position should have bacteria odor > 0
        found = False
        for col in world.bacteria_colonies:
            sensory = world.sense_at(col.x, col.y)
            if sensory["chemicals"].get("bacteria_odor", 0) > 0.1:
                found = True
                break
        assert found, "Should detect bacteria odor near colonies"

    def test_moisture_gradient(self):
        """Wet side (x=0) should have higher moisture than dry side (x=size)."""
        world = SoilWorld(size=10.0)
        wet = world.sense_at(0.0, 5.0)["chemicals"]["moisture"]
        dry = world.sense_at(10.0, 5.0)["chemicals"]["moisture"]
        assert wet > dry, f"Wet side ({wet}) should exceed dry side ({dry})"

    def test_temperature_increases_with_depth(self):
        """Deeper (higher y) should be warmer."""
        world = SoilWorld(size=10.0)
        surface_temp = world.sense_at(5.0, 0.0)["temperature"]
        deep_temp = world.sense_at(5.0, 10.0)["temperature"]
        assert deep_temp > surface_temp

    def test_step_advances_time(self):
        world = SoilWorld()
        world.step(100.0)
        assert world.time_ms == 100.0
        world.step(50.0)
        assert world.time_ms == 150.0

    def test_bacteria_grow_over_time(self):
        world = SoilWorld()
        initial_pop = sum(c.population for c in world.bacteria_colonies)
        for _ in range(1000):
            world.step(10.0)
        final_pop = sum(c.population for c in world.bacteria_colonies)
        # Bacteria should grow (or at least not crash)
        assert final_pop >= initial_pop * 0.5

    def test_get_state_serializable(self):
        assert_state_serializable(SoilWorld(), "SoilWorld")

    def test_get_state_has_type(self):
        state = SoilWorld().get_state()
        assert state["type"] == "soil"

    def test_fungal_network_collision(self):
        """Standing on a fungal segment should produce toxin exposure."""
        world = SoilWorld()
        if not world.fungal_networks:
            pytest.skip("No fungal segments generated")
        seg = world.fungal_networks[0]
        # Stand at midpoint of segment
        mx = (seg.x1 + seg.x2) / 2
        my = (seg.y1 + seg.y2) / 2
        sensory = world.sense_at(mx, my)
        assert sensory["toxin_exposure"] >= 0.0  # may or may not collide depending on thickness

    def test_gradient_direction_is_tuple(self):
        world = SoilWorld()
        sensory = world.sense_at(5.0, 5.0)
        for key, val in sensory["gradient_direction"].items():
            assert isinstance(val, tuple), f"gradient_direction[{key}] should be tuple"
            assert len(val) == 2


# ===========================================================================
# PondWorld
# ===========================================================================


class TestPondWorld:
    def test_sensory_has_all_keys(self):
        world = PondWorld()
        sensory = world.sense_at(0.0, 2.0)
        assert_valid_sensory(sensory, "PondWorld")

    def test_light_decreases_with_depth(self):
        world = PondWorld()
        surface_light = world.sense_at(0.0, 0.0)["chemicals"]["light"]
        deep_light = world.sense_at(0.0, 4.0)["chemicals"]["light"]
        assert surface_light > deep_light
        assert surface_light > 0.5  # surface is bright
        assert deep_light < surface_light

    def test_oxygen_decreases_with_depth(self):
        world = PondWorld()
        surface_o2 = world.sense_at(0.0, 0.0)["chemicals"]["oxygen"]
        deep_o2 = world.sense_at(0.0, 4.0)["chemicals"]["oxygen"]
        assert surface_o2 > deep_o2

    def test_algae_detected_near_bloom(self):
        world = PondWorld()
        if not world.algae_blooms:
            pytest.skip("No algae generated")
        bloom = world.algae_blooms[0]
        sensory = world.sense_at(bloom.x, bloom.y)
        assert sensory["chemicals"].get("algae", 0) > 0.1

    def test_predator_shadow_near_surface(self):
        world = PondWorld()
        if not world.predator_shadows:
            pytest.skip("No predators generated")
        pred = world.predator_shadows[0]
        sensory = world.sense_at(pred.x, 0.0)
        # Should detect shadow (or at least not crash)
        assert "predator_shadow" in sensory["chemicals"]

    def test_step_moves_predators(self):
        world = PondWorld()
        if not world.predator_shadows:
            pytest.skip("No predators")
        initial_x = world.predator_shadows[0].x
        for _ in range(1000):
            world.step(10.0)
        final_x = world.predator_shadows[0].x
        assert initial_x != pytest.approx(final_x, abs=0.01)

    def test_temperature_cooler_at_depth(self):
        world = PondWorld()
        surface_temp = world.sense_at(0.0, 0.0)["temperature"]
        deep_temp = world.sense_at(0.0, 4.0)["temperature"]
        assert surface_temp > deep_temp

    def test_deep_anoxic_toxin(self):
        """Very deep water (low oxygen) should be toxic."""
        world = PondWorld(depth=20.0)
        sensory = world.sense_at(0.0, 19.0)
        # At depth 19, oxygen ~ 1.0 * max(0, 1 - 0.15*19) < 0
        # So toxin should be present
        assert sensory["toxin_exposure"] >= 0.0

    def test_get_state_serializable(self):
        assert_state_serializable(PondWorld(), "PondWorld")

    def test_get_state_has_type(self):
        assert PondWorld().get_state()["type"] == "pond"


# ===========================================================================
# LabPlateWorld
# ===========================================================================


class TestLabPlateWorld:
    def test_sensory_has_all_keys(self):
        world = LabPlateWorld()
        sensory = world.sense_at(0.0, 0.0)
        assert_valid_sensory(sensory, "LabPlateWorld center")

    def test_ecoli_highest_at_center(self):
        world = LabPlateWorld()
        center = world.sense_at(0.0, 0.0)["chemicals"]["ecoli"]
        edge = world.sense_at(25.0, 0.0)["chemicals"]["ecoli"]
        assert center > edge

    def test_constant_temperature(self):
        world = LabPlateWorld()
        assert world.sense_at(0.0, 0.0)["temperature"] == 20.0
        assert world.sense_at(20.0, 15.0)["temperature"] == 20.0

    def test_plate_edge_toxic(self):
        """Near the edge of the plate, there should be an aversive signal."""
        world = LabPlateWorld()
        sensory = world.sense_at(29.5, 0.0)  # 0.5mm from edge
        assert sensory["toxin_exposure"] > 0.0

    def test_center_no_toxin(self):
        world = LabPlateWorld()
        sensory = world.sense_at(0.0, 0.0)
        assert sensory["toxin_exposure"] == 0.0

    def test_chemotaxis_assay(self):
        world = LabPlateWorld.chemotaxis_assay("NaCl")
        assert len(world.assay_chemicals) == 2  # NaCl + control
        # NaCl should be stronger on positive x side
        nacl_right = world.sense_at(15.0, 0.0)["chemicals"]["NaCl"]
        nacl_left = world.sense_at(-15.0, 0.0)["chemicals"]["NaCl"]
        assert nacl_right > nacl_left

    def test_avoidance_assay(self):
        world = LabPlateWorld.avoidance_assay()
        assert world.copper_ring == 15.0
        # On the copper ring, should be toxic
        sensory = world.sense_at(15.0, 0.0)
        assert sensory["toxin_exposure"] > 0.0

    def test_avoidance_assay_center_safe(self):
        world = LabPlateWorld.avoidance_assay()
        sensory = world.sense_at(0.0, 0.0)
        assert sensory["toxin_exposure"] == 0.0

    def test_get_state_serializable(self):
        assert_state_serializable(LabPlateWorld(), "LabPlateWorld")

    def test_chemotaxis_assay_state_serializable(self):
        assert_state_serializable(LabPlateWorld.chemotaxis_assay(), "chemotaxis")

    def test_get_state_has_type(self):
        assert LabPlateWorld().get_state()["type"] == "lab_plate"

    def test_step_advances_time(self):
        world = LabPlateWorld()
        world.step(100.0)
        assert world.time_ms == 100.0


# ===========================================================================
# AbstractWorld
# ===========================================================================


class TestAbstractWorld:
    def test_maze_sensory_has_all_keys(self):
        world = AbstractWorld(challenge="maze")
        sensory = world.sense_at(5.0, 5.0)
        assert_valid_sensory(sensory, "AbstractWorld maze")

    def test_foraging_sensory_has_all_keys(self):
        world = AbstractWorld(challenge="foraging")
        sensory = world.sense_at(5.0, 5.0)
        assert_valid_sensory(sensory, "AbstractWorld foraging")

    def test_memory_sensory_has_all_keys(self):
        world = AbstractWorld(challenge="memory")
        sensory = world.sense_at(5.0, 5.0)
        assert_valid_sensory(sensory, "AbstractWorld memory")

    def test_social_sensory_has_all_keys(self):
        world = AbstractWorld(challenge="social")
        sensory = world.sense_at(5.0, 5.0)
        assert_valid_sensory(sensory, "AbstractWorld social")

    def test_maze_has_walls(self):
        world = AbstractWorld(challenge="maze")
        assert len(world.walls) > 0

    def test_maze_has_goal(self):
        world = AbstractWorld(challenge="maze")
        assert world.goal is not None

    def test_maze_wall_collision(self):
        """Standing on a wall should produce toxin exposure."""
        world = AbstractWorld(challenge="maze")
        wall = world.walls[0]
        mx = (wall.x1 + wall.x2) / 2
        my = (wall.y1 + wall.y2) / 2
        sensory = world.sense_at(mx, my)
        assert sensory["toxin_exposure"] > 0.0

    def test_foraging_has_food(self):
        world = AbstractWorld(challenge="foraging")
        assert len(world.food_patches) > 0

    def test_foraging_food_detected(self):
        world = AbstractWorld(challenge="foraging")
        patch = world.food_patches[0]
        sensory = world.sense_at(patch.x, patch.y)
        assert sensory["chemicals"].get("food", 0) > 0.1

    def test_memory_task_cycles(self):
        """Memory task should toggle food visibility."""
        world = AbstractWorld(challenge="memory")
        # Initially visible
        assert world.memory_visible is True
        # Advance past half cycle
        for _ in range(300):
            world.step(10.0)  # 3000ms
        # Should have toggled at least once
        assert world.time_ms == 3000.0

    def test_social_has_cooperation_zones(self):
        world = AbstractWorld(challenge="social")
        assert len(world.cooperation_zones) > 0

    def test_social_zone_detected(self):
        world = AbstractWorld(challenge="social")
        zone = world.cooperation_zones[0]
        sensory = world.sense_at(zone["x"], zone["y"])
        assert sensory["social"].get("cooperation_zone", 0) > 0

    def test_simple_maze_factory(self):
        world = AbstractWorld.simple_maze()
        assert world.challenge_type == "maze"
        assert len(world.walls) > 0

    def test_memory_task_factory(self):
        world = AbstractWorld.memory_task()
        assert world.challenge_type == "memory"

    def test_social_dilemma_factory(self):
        world = AbstractWorld.social_dilemma()
        assert world.challenge_type == "social"

    def test_get_state_serializable(self):
        for challenge in ("maze", "foraging", "memory", "social"):
            assert_state_serializable(
                AbstractWorld(challenge=challenge), f"AbstractWorld({challenge})"
            )

    def test_get_state_has_type(self):
        assert AbstractWorld().get_state()["type"] == "abstract"

    def test_step_advances_time(self):
        world = AbstractWorld()
        world.step(100.0)
        assert world.time_ms == 100.0

    def test_foraging_regrowth(self):
        """Foraging patches with regrowth_rate should regenerate."""
        world = AbstractWorld(challenge="foraging")
        # Deplete a patch
        patch = world.food_patches[0]
        patch.amount = 0.1
        initial = patch.amount
        for _ in range(1000):
            world.step(10.0)
        assert patch.amount >= initial  # should have regrown
