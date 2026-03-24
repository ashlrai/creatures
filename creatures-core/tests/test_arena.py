"""Tests for Arena and SensoryMapper."""

import math
import sys
import os

# Ensure the package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from creatures.environment.arena import Arena, ArenaConfig, ArenaState
from creatures.environment.sensors import SensoryMapper, CHEMOSENSORY_NEURONS


def test_food_gradient_points_right():
    """Food at (0.5, 0) with worm at origin facing +X: ASER > ASEL."""
    config = ArenaConfig(
        size=(2.0, 2.0),
        n_food=1,
        food_radius=0.1,
        food_gradient_range=0.5,
        n_obstacles=0,
        seed=42,
    )
    arena = Arena(config)

    # Manually place food
    arena._food_positions = [(0.5, 0.0)]
    arena._obstacle_positions = []

    # Set heading to +X (facing right) and prime previous position
    arena.heading = 0.0
    arena._prev_pos = (-0.01, 0.0)  # moving in +X direction

    # Step with worm at origin
    state = arena.step(center_of_mass=(0.0, 0.0, 0.0))

    print(f"Food gradient: left={state.food_gradient[0]:.4f}, right={state.food_gradient[1]:.4f}")
    print(f"Nearest food distance: {state.nearest_food_distance:.4f}")
    print(f"Food consumed: {state.food_consumed}")

    # Food is directly ahead (+X), so when facing +X with rel_angle ~0,
    # signal should be roughly equal or slightly split.
    # Actually, with the worm at (0,0) and food at (0.5,0), food angle = 0,
    # heading = 0, rel_angle = 0 -> both sides get equal signal.
    # Let's verify gradient is nonzero.
    assert state.food_gradient[0] > 0 or state.food_gradient[1] > 0, \
        "Should detect food gradient"
    assert state.nearest_food_distance < 0.51, "Nearest food should be ~0.5"
    assert state.food_consumed == 0, "Food should not be consumed at distance 0.5"

    # Now test with food off to the right: food at (0.3, -0.2) with heading +X
    arena._food_positions = [(0.3, -0.2)]
    arena.heading = 0.0
    arena._prev_pos = (-0.01, 0.0)

    state = arena.step(center_of_mass=(0.0, 0.0, 0.0))
    left, right = state.food_gradient

    print(f"\nFood at (0.3, -0.2) facing +X:")
    print(f"Food gradient: left={left:.4f}, right={right:.4f}")
    assert right > left, f"ASER side should be stronger: right={right:.4f} > left={left:.4f}"

    # Verify sensory mapper produces correct currents
    mapper = SensoryMapper(organism="c_elegans")
    currents = mapper.compute_currents(state)

    print(f"\nSensory currents:")
    for nid, current in sorted(currents.items()):
        side = CHEMOSENSORY_NEURONS.get(nid, "?")
        print(f"  {nid} ({side}): {current:.2f} mV")

    # Right-side neurons should have higher current
    aser_current = currents.get("ASER", 0.0)
    asel_current = currents.get("ASEL", 0.0)
    print(f"\nASER={aser_current:.2f} mV, ASEL={asel_current:.2f} mV")
    assert aser_current > asel_current, \
        f"ASER should be > ASEL: {aser_current:.2f} vs {asel_current:.2f}"

    print("\n--- Gradient direction test PASSED ---")


def test_food_consumption():
    """Move worm to food position, verify it's consumed."""
    config = ArenaConfig(
        size=(2.0, 2.0),
        n_food=1,
        food_radius=0.1,
        food_gradient_range=0.5,
        n_obstacles=0,
        seed=42,
    )
    arena = Arena(config)
    arena._food_positions = [(0.5, 0.0)]
    arena._obstacle_positions = []
    arena._prev_pos = (0.0, 0.0)

    # Step 1: worm at origin, food at (0.5, 0) -- too far
    state = arena.step(center_of_mass=(0.0, 0.0, 0.0))
    assert state.food_consumed == 0
    assert arena.active_food_count == 1

    # Step 2: worm at (0.5, 0) -- within food_radius
    state = arena.step(center_of_mass=(0.5, 0.0, 0.0))
    assert state.food_consumed == 1, f"Expected 1 food consumed, got {state.food_consumed}"
    assert state.total_food_consumed == 1
    assert arena.active_food_count == 0

    # Step 3: no more food
    state = arena.step(center_of_mass=(0.5, 0.0, 0.0))
    assert state.food_consumed == 0
    assert state.total_food_consumed == 1
    assert state.nearest_food_distance == float("inf")

    print("--- Food consumption test PASSED ---")


def test_obstacle_collision():
    """Verify collision detection with obstacles."""
    config = ArenaConfig(
        size=(2.0, 2.0),
        n_food=0,
        food_radius=0.1,
        food_gradient_range=0.5,
        n_obstacles=1,
        obstacle_radius=0.15,
        seed=42,
    )
    arena = Arena(config)
    arena._obstacle_positions = [(1.0, 0.0)]
    arena._food_positions = []
    arena._prev_pos = (0.0, 0.0)

    # Far from obstacle
    state = arena.step(center_of_mass=(0.0, 0.0, 0.0))
    assert state.collisions == 0

    # Within obstacle radius
    state = arena.step(center_of_mass=(0.9, 0.0, 0.0))
    assert state.collisions == 1, f"Expected collision, got {state.collisions}"
    assert state.total_collisions == 1

    print("--- Obstacle collision test PASSED ---")


def test_sensory_mapper_touch_passthrough():
    """Touch data should be passed through to currents."""
    mapper = SensoryMapper(organism="c_elegans")

    # No food gradient, just touch
    state = ArenaState(
        food_consumed=0,
        total_food_consumed=0,
        nearest_food_distance=float("inf"),
        food_gradient=(0.0, 0.0),
        collisions=0,
        total_collisions=0,
    )
    touch_data = {"ALML": 5.0, "PLMR": 3.0}
    currents = mapper.compute_currents(state, touch_data=touch_data)

    assert currents["ALML"] == 5.0, f"Expected ALML=5.0, got {currents.get('ALML')}"
    assert currents["PLMR"] == 3.0, f"Expected PLMR=3.0, got {currents.get('PLMR')}"
    # No chemosensory neurons should fire with zero gradient
    for nid in CHEMOSENSORY_NEURONS:
        assert nid not in currents, f"{nid} should not be in currents with zero gradient"

    print("--- Touch passthrough test PASSED ---")


def test_arena_reset():
    """Reset should re-randomize positions and clear counters."""
    config = ArenaConfig(n_food=5, n_obstacles=3, seed=42)
    arena = Arena(config)

    # Consume some food
    arena._food_positions[0] = None
    arena._total_food_consumed = 1

    arena.reset()
    assert arena.active_food_count == 5
    assert arena._total_food_consumed == 0
    assert len(arena.obstacle_positions) == 3

    print("--- Arena reset test PASSED ---")


if __name__ == "__main__":
    test_food_gradient_points_right()
    print()
    test_food_consumption()
    print()
    test_obstacle_collision()
    print()
    test_sensory_mapper_touch_passthrough()
    print()
    test_arena_reset()
    print()
    print("=== ALL TESTS PASSED ===")
