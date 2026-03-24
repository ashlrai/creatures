"""Tests for the multi-organism ecosystem model."""

from __future__ import annotations

import math

from creatures.environment.ecosystem import (
    Ecosystem,
    EcosystemConfig,
    FoodSource,
    OrganismInstance,
)
from creatures.environment.interactions import (
    check_food_consumption,
    check_predation,
    check_reproduction,
    compute_food_gradient,
)


# ---------------------------------------------------------------------------
# Initialization tests
# ---------------------------------------------------------------------------


class TestEcosystemInit:
    def test_initialize_populations(self):
        """Initialize with 20 c_elegans + 5 drosophila."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 20, "drosophila": 5})

        alive = [o for o in eco.organisms.values() if o.alive]
        assert len(alive) == 25

        worms = [o for o in alive if o.species == "c_elegans"]
        flies = [o for o in alive if o.species == "drosophila"]
        assert len(worms) == 20
        assert len(flies) == 5

    def test_food_sources_created(self):
        eco = Ecosystem()
        eco.initialize({"c_elegans": 5})
        assert len(eco.food_sources) == eco.config.n_food_sources

    def test_organisms_within_arena(self):
        eco = Ecosystem()
        eco.initialize({"c_elegans": 50})
        r = eco.config.arena_radius
        for org in eco.organisms.values():
            dist = math.sqrt(org.position[0] ** 2 + org.position[1] ** 2)
            assert dist <= r * 1.01, f"Organism placed outside arena: dist={dist}"


# ---------------------------------------------------------------------------
# Simulation step tests
# ---------------------------------------------------------------------------


class TestEcosystemStep:
    def test_organisms_move(self):
        """Organisms change position over time."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 5})

        initial_positions = {
            oid: org.position for oid, org in eco.organisms.items()
        }

        for _ in range(100):
            eco.step()

        moved = 0
        for oid in initial_positions:
            org = eco.organisms[oid]
            if org.alive and org.position != initial_positions[oid]:
                moved += 1

        assert moved > 0, "No organisms moved after 100 steps"

    def test_energy_decays(self):
        """Organisms lose energy over time."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 5})

        initial_energy = {
            oid: org.energy for oid, org in eco.organisms.items()
        }

        for _ in range(50):
            eco.step()

        for oid in initial_energy:
            org = eco.organisms[oid]
            if org.alive:
                # Energy should have decreased (unless they ate a lot)
                # At minimum, 50 steps * 0.01 decay = 0.5 energy lost
                # but food could offset it. Just check it changed.
                assert org.energy != initial_energy[oid], (
                    "Energy unchanged after 50 steps"
                )

    def test_organisms_age(self):
        eco = Ecosystem()
        eco.initialize({"c_elegans": 3})
        for _ in range(100):
            eco.step()
        for org in eco.organisms.values():
            assert org.age_ms > 0

    def test_starvation_death(self):
        """Organisms with no food eventually die."""
        config = EcosystemConfig(
            n_food_sources=0,  # no food at all
            energy_decay_rate=0.5,  # fast decay
        )
        eco = Ecosystem(config)
        eco.initialize({"c_elegans": 5})

        for _ in range(300):
            eco.step()

        alive = [o for o in eco.organisms.values() if o.alive]
        assert len(alive) == 0, "All organisms should have starved"

    def test_food_consumption_occurs(self):
        """Food consumption events happen when organisms are near food."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 20})

        all_events = []
        for _ in range(500):
            events = eco.step()
            all_events.extend(events)

        food_events = [e for e in all_events if e["type"] == "food_consumed"]
        assert len(food_events) > 0, "No food was consumed in 500 steps"


# ---------------------------------------------------------------------------
# Full simulation run
# ---------------------------------------------------------------------------


class TestFullSimulation:
    def test_1000_step_run(self):
        """Run 1000 steps with mixed population, verify dynamics."""
        eco = Ecosystem()
        eco.initialize({"c_elegans": 20, "drosophila": 5})

        all_events = []
        for _ in range(1000):
            events = eco.step()
            all_events.extend(events)

        # Verify time advanced
        assert eco.time_ms == 1000.0

        # Verify some organisms are still alive (food exists)
        stats = eco.get_stats()
        assert stats["total_alive"] > 0, "All organisms died — ecosystem collapsed"

        # Verify events were generated
        event_types = {e["type"] for e in all_events}
        assert "food_consumed" in event_types, "No food consumption events"

        # Verify stats structure
        assert "by_species" in stats
        assert "total_food_energy" in stats

    def test_reproduction_occurs(self):
        """With enough food and time, reproduction should happen."""
        config = EcosystemConfig(
            n_food_sources=30,  # lots of food
            reproduction_threshold=120.0,  # lower threshold
            energy_decay_rate=0.005,  # slow decay
            food_detection_radius=0.5,  # easier to find food
        )
        eco = Ecosystem(config)
        eco.initialize({"c_elegans": 10})

        all_events = []
        for _ in range(2000):
            events = eco.step()
            all_events.extend(events)

        repro_events = [e for e in all_events if e["type"] == "reproduction"]
        assert len(repro_events) > 0, "No reproduction occurred in 2000 steps"

        # Population should have grown
        alive = [o for o in eco.organisms.values() if o.alive]
        assert len(alive) >= 10, "Population should not have shrunk"


# ---------------------------------------------------------------------------
# Predation tests
# ---------------------------------------------------------------------------


class TestPredation:
    def test_predation_check_basic(self):
        """Drosophila (0.15) can eat c_elegans (0.05) when close."""
        config = EcosystemConfig(organism_interaction_radius=0.2)

        predator = OrganismInstance(
            id="fly_1",
            species="drosophila",
            position=(0.0, 0.0),
            heading=0.0,
            energy=80.0,
        )
        prey = OrganismInstance(
            id="worm_1",
            species="c_elegans",
            position=(0.05, 0.0),  # very close
            heading=0.0,
            energy=60.0,
        )

        result = check_predation(predator, prey, config)
        assert result is True
        assert not prey.alive
        assert predator.energy > 80.0  # gained energy

    def test_predation_same_species_fails(self):
        """Same species cannot eat each other."""
        config = EcosystemConfig(organism_interaction_radius=0.2)

        a = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0
        )
        b = OrganismInstance(
            id="w2", species="c_elegans", position=(0.01, 0.0), heading=0.0
        )

        assert check_predation(a, b, config) is False
        assert b.alive

    def test_predation_too_far_fails(self):
        """Predation fails if organisms are too far apart."""
        config = EcosystemConfig(organism_interaction_radius=0.15)

        predator = OrganismInstance(
            id="fly_1", species="drosophila", position=(0.0, 0.0), heading=0.0
        )
        prey = OrganismInstance(
            id="worm_1", species="c_elegans", position=(1.0, 1.0), heading=0.0
        )

        assert check_predation(predator, prey, config) is False
        assert prey.alive

    def test_smaller_cannot_eat_larger(self):
        """c_elegans cannot eat drosophila."""
        config = EcosystemConfig(organism_interaction_radius=0.2)

        small = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0
        )
        big = OrganismInstance(
            id="f1", species="drosophila", position=(0.05, 0.0), heading=0.0
        )

        assert check_predation(small, big, config) is False
        assert big.alive

    def test_predation_in_simulation(self):
        """Run simulation and verify predation events occur."""
        config = EcosystemConfig(
            arena_radius=0.5,  # small arena forces encounters
            organism_interaction_radius=0.2,
            predation_enabled=True,
            n_food_sources=5,
        )
        eco = Ecosystem(config)
        eco.initialize({"c_elegans": 15, "drosophila": 5})

        all_events = []
        for _ in range(2000):
            events = eco.step()
            all_events.extend(events)

        predation_events = [e for e in all_events if e["type"] == "predation"]
        assert len(predation_events) > 0, (
            "No predation events in 2000 steps with small arena"
        )

        # Verify predator is always the larger species
        for event in predation_events:
            assert event["predator_species"] == "drosophila"
            assert event["prey_species"] == "c_elegans"


# ---------------------------------------------------------------------------
# Interaction unit tests
# ---------------------------------------------------------------------------


class TestInteractions:
    def test_food_consumption(self):
        config = EcosystemConfig(food_detection_radius=0.3)
        org = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0, energy=50.0
        )
        food = FoodSource(id="f1", position=(0.1, 0.0), energy=30.0)

        consumed = check_food_consumption(org, food, config)
        assert consumed > 0
        assert org.energy > 50.0

    def test_food_consumption_too_far(self):
        config = EcosystemConfig(food_detection_radius=0.1)
        org = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0
        )
        food = FoodSource(id="f1", position=(5.0, 5.0), energy=30.0)

        consumed = check_food_consumption(org, food, config)
        assert consumed == 0.0

    def test_reproduction(self):
        config = EcosystemConfig(reproduction_threshold=100.0)
        org = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0, energy=120.0
        )

        offspring = check_reproduction(org, config)
        assert offspring is not None
        assert offspring.species == "c_elegans"
        assert offspring.alive
        assert org.energy < 120.0  # parent lost energy
        assert offspring.energy > 0

    def test_reproduction_not_enough_energy(self):
        config = EcosystemConfig(reproduction_threshold=150.0)
        org = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0, energy=50.0
        )

        offspring = check_reproduction(org, config)
        assert offspring is None

    def test_food_gradient(self):
        org = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0
        )
        food_sources = [
            FoodSource(id="f1", position=(1.0, 0.0), energy=50.0),  # to the right
        ]

        grad = compute_food_gradient(org, food_sources, detection_radius=2.0)
        # Gradient should point toward +x
        assert grad[0] > 0, "Gradient should point toward food (positive x)"

    def test_food_gradient_no_food(self):
        org = OrganismInstance(
            id="w1", species="c_elegans", position=(0.0, 0.0), heading=0.0
        )

        grad = compute_food_gradient(org, [], detection_radius=2.0)
        assert grad == (0.0, 0.0)


# ---------------------------------------------------------------------------
# Stats and state tests
# ---------------------------------------------------------------------------


class TestStatsAndState:
    def test_get_stats_structure(self):
        eco = Ecosystem()
        eco.initialize({"c_elegans": 10, "drosophila": 3})

        stats = eco.get_stats()
        assert stats["total_alive"] == 13
        assert stats["total_dead"] == 0
        assert "c_elegans" in stats["by_species"]
        assert "drosophila" in stats["by_species"]
        assert stats["by_species"]["c_elegans"]["count"] == 10
        assert stats["by_species"]["drosophila"]["count"] == 3

    def test_get_state_structure(self):
        eco = Ecosystem()
        eco.initialize({"c_elegans": 5})

        state = eco.get_state()
        assert "time_ms" in state
        assert "organisms" in state
        assert "food_sources" in state
        assert "stats" in state
        assert "events" in state
        assert len(state["organisms"]) == 5

    def test_add_organism(self):
        eco = Ecosystem()
        eco.initialize({"c_elegans": 3})
        assert len(eco.organisms) == 3

        org = eco.add_organism("drosophila", position=(0.5, 0.5))
        assert org.species == "drosophila"
        assert org.position == (0.5, 0.5)
        assert len(eco.organisms) == 4
