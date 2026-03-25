"""Tests for emergent behavior detection.

Validates that the EmergentBehaviorDetector correctly identifies:
- Aggregation (Clark-Evans ratio)
- Trail following
- Avoidance learning
- Niche specialization
- Cooperation
"""

from __future__ import annotations

import math
import random

import numpy as np
import pytest

from creatures.environment.emergent_detector import EmergentBehaviorDetector


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_organisms(positions, species="worm", alive=True):
    """Create organism dicts from (x, y) positions."""
    return [
        {"id": f"{species}_{i}", "x": x, "y": y, "species": species, "alive": alive}
        for i, (x, y) in enumerate(positions)
    ]


def make_state(organisms, time_ms=0.0):
    return {"organisms": organisms, "time_ms": time_ms}


# ===========================================================================
# Aggregation detection
# ===========================================================================


class TestAggregation:
    def test_clustered_organisms_detected(self):
        """Tightly clustered organisms should trigger aggregation."""
        # 20 organisms in a tight cluster around (5, 5)
        rng = random.Random(42)
        positions = [(5 + rng.gauss(0, 0.3), 5 + rng.gauss(0, 0.3)) for _ in range(20)]
        organisms = make_organisms(positions)
        state = make_state(organisms)

        detector = EmergentBehaviorDetector()
        events = detector.observe(state)

        agg_events = [e for e in events if e["behavior_type"] == "aggregation"]
        assert len(agg_events) > 0, "Should detect aggregation in tight cluster"
        assert agg_events[0]["details"]["clark_evans_R"] < 0.6

    def test_uniform_organisms_not_detected(self):
        """Uniformly spaced organisms should not trigger aggregation."""
        # Grid of organisms
        positions = [(x, y) for x in range(5) for y in range(5)]
        organisms = make_organisms(positions)
        state = make_state(organisms)

        detector = EmergentBehaviorDetector()
        events = detector.observe(state)

        agg_events = [e for e in events if e["behavior_type"] == "aggregation"]
        # Grid is regular, R should be > 0.6
        assert len(agg_events) == 0, "Regular grid should not be aggregation"

    def test_too_few_organisms_skipped(self):
        """Fewer than 10 organisms should not trigger aggregation check."""
        positions = [(0, 0), (0, 0.1), (0, 0.2)]
        organisms = make_organisms(positions)
        state = make_state(organisms)

        detector = EmergentBehaviorDetector()
        events = detector.observe(state)
        agg_events = [e for e in events if e["behavior_type"] == "aggregation"]
        assert len(agg_events) == 0


# ===========================================================================
# Niche specialization
# ===========================================================================


class TestNicheSpecialization:
    def test_separated_species_detected(self):
        """Two species in different regions should trigger specialization."""
        rng = random.Random(42)
        worms = make_organisms(
            [(1 + rng.gauss(0, 0.3), 1 + rng.gauss(0, 0.3)) for _ in range(10)],
            species="worm",
        )
        flies = make_organisms(
            [(8 + rng.gauss(0, 0.3), 8 + rng.gauss(0, 0.3)) for _ in range(10)],
            species="fly",
        )
        state = make_state(worms + flies)

        detector = EmergentBehaviorDetector()
        events = detector.observe(state)

        niche_events = [e for e in events if e["behavior_type"] == "niche_specialization"]
        assert len(niche_events) > 0, "Separated species should trigger niche specialization"

    def test_mixed_species_not_detected(self):
        """Two species in the same region should not trigger specialization."""
        rng = random.Random(42)
        worms = make_organisms(
            [(5 + rng.gauss(0, 1), 5 + rng.gauss(0, 1)) for _ in range(10)],
            species="worm",
        )
        flies = make_organisms(
            [(5 + rng.gauss(0, 1), 5 + rng.gauss(0, 1)) for _ in range(10)],
            species="fly",
        )
        state = make_state(worms + flies)

        detector = EmergentBehaviorDetector()
        events = detector.observe(state)

        niche_events = [e for e in events if e["behavior_type"] == "niche_specialization"]
        assert len(niche_events) == 0, "Co-located species should not trigger specialization"


# ===========================================================================
# Avoidance learning
# ===========================================================================


class TestAvoidanceLearning:
    def test_organisms_far_from_deaths(self):
        """Organisms far from death sites should trigger avoidance detection."""
        detector = EmergentBehaviorDetector()

        # Simulate deaths at (0, 0) area
        dead = make_organisms(
            [(0.1 * i, 0.1 * i) for i in range(5)],
            species="worm", alive=False,
        )
        alive = make_organisms(
            [(10 + 0.1 * i, 10 + 0.1 * i) for i in range(15)],
            species="worm",
        )
        state = make_state(dead + alive, time_ms=1000.0)
        events = detector.observe(state)

        avoid_events = [e for e in events if e["behavior_type"] == "avoidance_learning"]
        assert len(avoid_events) > 0, "Organisms far from deaths should suggest avoidance"


# ===========================================================================
# Trail following
# ===========================================================================


class TestTrailFollowing:
    def test_aligned_movement_detected(self):
        """Organisms all moving in the same direction should trigger trail following."""
        detector = EmergentBehaviorDetector()

        # Simulate 30 steps of organisms all moving right
        for step in range(30):
            organisms = []
            for i in range(10):
                x = step * 0.1 + i * 0.3  # all moving right
                y = 5 + i * 0.2
                organisms.append({
                    "id": f"worm_{i}", "x": x, "y": y,
                    "species": "worm", "alive": True,
                })
            state = make_state(organisms, time_ms=step * 10.0)
            events = detector.observe(state)

        # By the end, trail following should be detected
        trail_events = [e for e in events if e["behavior_type"] == "trail_following"]
        assert len(trail_events) > 0, "Aligned movement should trigger trail following"


# ===========================================================================
# Cooperation
# ===========================================================================


class TestCooperation:
    def test_coordinated_groups_detected(self):
        """Groups moving together should trigger cooperation."""
        detector = EmergentBehaviorDetector()

        for step in range(30):
            organisms = []
            # Group 1: moving right together
            for i in range(5):
                organisms.append({
                    "id": f"a_{i}",
                    "x": step * 0.1 + i * 0.2,
                    "y": 3 + i * 0.1,
                    "species": "worm", "alive": True,
                })
            # Group 2: moving right together nearby
            for i in range(5):
                organisms.append({
                    "id": f"b_{i}",
                    "x": step * 0.1 + i * 0.2 + 0.1,
                    "y": 3.5 + i * 0.1,
                    "species": "worm", "alive": True,
                })
            state = make_state(organisms, time_ms=step * 10.0)
            events = detector.observe(state)

        coop_events = [e for e in events if e["behavior_type"] == "cooperation"]
        assert len(coop_events) > 0, "Coordinated movement should trigger cooperation"


# ===========================================================================
# General
# ===========================================================================


class TestDetectorGeneral:
    def test_empty_state_no_crash(self):
        detector = EmergentBehaviorDetector()
        events = detector.observe({"organisms": [], "time_ms": 0})
        assert events == []

    def test_known_behaviors_tracked(self):
        detector = EmergentBehaviorDetector()
        rng = random.Random(42)
        positions = [(5 + rng.gauss(0, 0.2), 5 + rng.gauss(0, 0.2)) for _ in range(20)]
        organisms = make_organisms(positions)
        detector.observe(make_state(organisms))
        # Should have logged at least aggregation
        assert "aggregation" in detector.known_behaviors

    def test_get_summary(self):
        detector = EmergentBehaviorDetector()
        summary = detector.get_summary()
        assert "total_events" in summary
        assert "known_behaviors" in summary
        assert "recent_events" in summary

    def test_reset_clears_state(self):
        detector = EmergentBehaviorDetector()
        rng = random.Random(42)
        positions = [(5 + rng.gauss(0, 0.2), 5 + rng.gauss(0, 0.2)) for _ in range(20)]
        detector.observe(make_state(make_organisms(positions)))
        assert len(detector.behavior_log) > 0
        detector.reset()
        assert len(detector.behavior_log) == 0
        assert len(detector.known_behaviors) == 0

    def test_position_extraction_tuple_format(self):
        """Organisms with position as tuple should work."""
        detector = EmergentBehaviorDetector()
        organisms = [
            {"id": f"org_{i}", "position": (float(i), float(i)),
             "species": "worm", "alive": True}
            for i in range(15)
        ]
        events = detector.observe(make_state(organisms))
        # Should not crash
        assert isinstance(events, list)
