"""Emergent behavior detection for multi-organism ecosystems.

Watches organism behavior over time and detects novel, unexpected patterns
that arise from simple neural rules -- the hallmark of emergence.

Detected behaviors:
- Aggregation: organisms cluster more than random (Clark-Evans ratio)
- Trail following: organisms follow paths of others
- Avoidance learning: organisms avoid areas where others died
- Niche specialization: different species occupy different regions
- Cooperation: coordinated movement for mutual benefit

Uses numpy for efficient spatial analysis.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import numpy as np


@dataclass
class BehaviorEvent:
    """A detected emergent behavior event."""
    behavior_type: str
    confidence: float  # 0-1, how confident we are this is real
    description: str
    timestamp_ms: float
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "behavior_type": self.behavior_type,
            "confidence": self.confidence,
            "description": self.description,
            "timestamp_ms": self.timestamp_ms,
            "details": self.details,
        }


class EmergentBehaviorDetector:
    """Watches organism behavior for novel, unexpected patterns.

    Call observe() each simulation step with the current ecosystem state.
    The detector accumulates history and identifies patterns that emerge
    over time. New behaviors are flagged as events.
    """

    def __init__(
        self, history_window: int = 500, arena_area: float | None = None
    ) -> None:
        """
        Args:
            history_window: Number of past states to keep for temporal analysis.
            arena_area: Known arena area for Clark-Evans ratio. If None,
                uses a minimum of bounding-box area or 100 sq units so that
                tight clusters relative to a large arena are detected.
        """
        self.behavior_log: list[dict] = []
        self.known_behaviors: set[str] = set()
        self._history: list[dict] = []  # recent ecosystem snapshots
        self._history_window = history_window
        self._death_locations: list[tuple[float, float]] = []
        self._position_trails: dict[str, list[tuple[float, float]]] = {}
        self._arena_area = arena_area  # None = auto-estimate

    def observe(self, ecosystem_state: dict) -> list[dict]:
        """Analyze current state for emergent behaviors.

        Args:
            ecosystem_state: Dict with at minimum:
                organisms: list of dicts with keys: id, x, y, species, alive
                (optional) time_ms: float

        Returns:
            List of detected behavior event dicts.
        """
        # Store snapshot
        self._history.append(ecosystem_state)
        if len(self._history) > self._history_window:
            self._history = self._history[-self._history_window:]

        # Track positions for trail analysis
        for org in ecosystem_state.get("organisms", []):
            if not org.get("alive", True):
                continue
            oid = org.get("id", "")
            pos = (org.get("x", org.get("position", [0, 0])[0] if isinstance(org.get("position"), (list, tuple)) else 0),
                   org.get("y", org.get("position", [0, 0])[1] if isinstance(org.get("position"), (list, tuple)) else 0))
            if oid:
                trail = self._position_trails.setdefault(oid, [])
                trail.append(pos)
                if len(trail) > 200:
                    self._position_trails[oid] = trail[-200:]

        # Track death locations
        for org in ecosystem_state.get("organisms", []):
            if not org.get("alive", True):
                pos = _extract_position(org)
                if pos not in self._death_locations:
                    self._death_locations.append(pos)
                    if len(self._death_locations) > 500:
                        self._death_locations = self._death_locations[-500:]

        timestamp = ecosystem_state.get("time_ms", 0.0)

        events: list[dict] = []
        events.extend(self._check_aggregation(ecosystem_state, timestamp))
        events.extend(self._check_trail_following(ecosystem_state, timestamp))
        events.extend(self._check_avoidance_learning(ecosystem_state, timestamp))
        events.extend(self._check_niche_specialization(ecosystem_state, timestamp))
        events.extend(self._check_cooperation(ecosystem_state, timestamp))

        # Log and deduplicate
        for evt in events:
            self.behavior_log.append(evt)
            self.known_behaviors.add(evt["behavior_type"])

        return events

    def _check_aggregation(
        self, state: dict, timestamp: float
    ) -> list[dict]:
        """Detect non-random clustering using Clark-Evans nearest-neighbor ratio.

        Clark-Evans R = mean_observed_NN / expected_NN
        Expected NN for uniform random = 1 / (2 * sqrt(density))
        R < 1 indicates clustering, R > 1 indicates regularity.
        R < 0.5 with enough organisms is strong evidence of aggregation.
        """
        organisms = [o for o in state.get("organisms", []) if o.get("alive", True)]
        if len(organisms) < 10:
            return []

        positions = np.array([_extract_position(o) for o in organisms])
        n = len(positions)

        # Compute pairwise distances efficiently
        # For each organism, find nearest neighbor distance
        nn_distances = np.full(n, np.inf)
        for i in range(n):
            diffs = positions - positions[i]
            dists = np.sqrt(np.sum(diffs * diffs, axis=1))
            dists[i] = np.inf  # exclude self
            nn_distances[i] = np.min(dists)

        mean_nn = np.mean(nn_distances)

        # Use known arena area, or estimate with a sensible minimum.
        # The minimum prevents tight clusters from looking "normal" relative
        # to their own tiny bounding box -- aggregation means they occupy
        # a small fraction of the available space.
        if self._arena_area is not None:
            area = self._arena_area
        else:
            x_range = positions[:, 0].max() - positions[:, 0].min()
            y_range = positions[:, 1].max() - positions[:, 1].min()
            bbox_area = x_range * y_range
            # Use at least 100 sq units or 10x the bounding box, whichever
            # is larger -- this captures the intuition that if organisms
            # are packed in a tiny region, they ARE aggregated.
            area = max(bbox_area * 10.0, 100.0)
        density = n / area

        # Expected mean NN distance for uniform random distribution
        expected_nn = 1.0 / (2.0 * math.sqrt(density))

        # Clark-Evans ratio
        R = mean_nn / expected_nn if expected_nn > 1e-10 else 1.0

        events = []
        if R < 0.6:
            confidence = min(1.0, (0.6 - R) / 0.4)  # higher as R approaches 0
            events.append(
                BehaviorEvent(
                    behavior_type="aggregation",
                    confidence=confidence,
                    description=(
                        f"Organisms are clustering (Clark-Evans R={R:.2f}, "
                        f"n={n}). Mean NN distance {mean_nn:.3f} vs "
                        f"expected {expected_nn:.3f} for random."
                    ),
                    timestamp_ms=timestamp,
                    details={
                        "clark_evans_R": round(R, 3),
                        "mean_nn_distance": round(float(mean_nn), 4),
                        "expected_nn_distance": round(expected_nn, 4),
                        "n_organisms": n,
                    },
                ).to_dict()
            )

        return events

    def _check_trail_following(
        self, state: dict, timestamp: float
    ) -> list[dict]:
        """Detect if organisms follow paths of others.

        Compare each organism's recent movement direction with the
        historical path of nearby organisms. If alignment is significantly
        above random (>0.7 cosine similarity), trail following is detected.
        """
        if len(self._history) < 20:
            return []

        organisms = [o for o in state.get("organisms", []) if o.get("alive", True)]
        if len(organisms) < 5:
            return []

        # Get recent velocity vectors for each organism
        velocities: dict[str, tuple[float, float]] = {}
        for org in organisms:
            oid = org.get("id", "")
            trail = self._position_trails.get(oid, [])
            if len(trail) >= 5:
                # Average velocity over last 5 steps
                dx = trail[-1][0] - trail[-5][0]
                dy = trail[-1][1] - trail[-5][1]
                mag = math.sqrt(dx * dx + dy * dy)
                if mag > 1e-6:
                    velocities[oid] = (dx / mag, dy / mag)

        if len(velocities) < 4:
            return []

        # For each pair of nearby organisms, check velocity alignment
        ids = list(velocities.keys())
        alignment_scores = []
        for i, id_a in enumerate(ids):
            trail_a = self._position_trails.get(id_a, [])
            if not trail_a:
                continue
            pos_a = trail_a[-1]
            vel_a = velocities[id_a]

            for id_b in ids[i + 1:]:
                trail_b = self._position_trails.get(id_b, [])
                if not trail_b:
                    continue
                pos_b = trail_b[-1]
                vel_b = velocities[id_b]

                # Only check nearby organisms
                dist = math.sqrt(_dsq(pos_a, pos_b))
                if dist > 2.0:
                    continue

                # Cosine similarity of velocities
                dot = vel_a[0] * vel_b[0] + vel_a[1] * vel_b[1]
                alignment_scores.append(dot)

        if len(alignment_scores) < 3:
            return []

        mean_alignment = sum(alignment_scores) / len(alignment_scores)

        events = []
        if mean_alignment > 0.6:
            confidence = min(1.0, (mean_alignment - 0.6) / 0.3)
            events.append(
                BehaviorEvent(
                    behavior_type="trail_following",
                    confidence=confidence,
                    description=(
                        f"Nearby organisms show aligned movement "
                        f"(mean cosine similarity={mean_alignment:.2f}, "
                        f"{len(alignment_scores)} pairs analyzed)."
                    ),
                    timestamp_ms=timestamp,
                    details={
                        "mean_alignment": round(mean_alignment, 3),
                        "n_pairs": len(alignment_scores),
                    },
                ).to_dict()
            )

        return events

    def _check_avoidance_learning(
        self, state: dict, timestamp: float
    ) -> list[dict]:
        """Detect if living organisms avoid areas where others died.

        Computes mean distance from alive organisms to death locations.
        If significantly larger than expected by chance, avoidance is detected.
        """
        if len(self._death_locations) < 3:
            return []

        organisms = [o for o in state.get("organisms", []) if o.get("alive", True)]
        if len(organisms) < 5:
            return []

        alive_positions = np.array([_extract_position(o) for o in organisms])
        death_positions = np.array(self._death_locations[-50:])  # recent deaths

        # Mean distance from alive organisms to nearest death site
        min_dists = []
        for pos in alive_positions:
            diffs = death_positions - pos
            dists = np.sqrt(np.sum(diffs * diffs, axis=1))
            min_dists.append(float(np.min(dists)))

        mean_min_dist = np.mean(min_dists)

        # Compare to what we'd expect: estimate arena extent
        x_range = alive_positions[:, 0].max() - alive_positions[:, 0].min()
        y_range = alive_positions[:, 1].max() - alive_positions[:, 1].min()
        arena_scale = math.sqrt(max(x_range * y_range, 1e-6))

        # Normalized avoidance score (higher = more avoidance)
        avoidance_ratio = mean_min_dist / (arena_scale * 0.3 + 1e-6)

        events = []
        if avoidance_ratio > 1.5:
            confidence = min(1.0, (avoidance_ratio - 1.5) / 2.0)
            events.append(
                BehaviorEvent(
                    behavior_type="avoidance_learning",
                    confidence=confidence,
                    description=(
                        f"Alive organisms maintain distance from death sites "
                        f"(avoidance ratio={avoidance_ratio:.2f}, "
                        f"mean dist to nearest death={mean_min_dist:.2f})."
                    ),
                    timestamp_ms=timestamp,
                    details={
                        "avoidance_ratio": round(avoidance_ratio, 3),
                        "mean_distance_to_death": round(float(mean_min_dist), 4),
                        "n_death_sites": len(death_positions),
                        "n_alive": len(organisms),
                    },
                ).to_dict()
            )

        return events

    def _check_niche_specialization(
        self, state: dict, timestamp: float
    ) -> list[dict]:
        """Detect if species occupy distinct regions of the arena.

        For each species, compute its centroid and mean spread (std dev).
        If centroids are significantly separated relative to spread,
        niche specialization is occurring.
        """
        organisms = [o for o in state.get("organisms", []) if o.get("alive", True)]
        if len(organisms) < 10:
            return []

        # Group by species
        species_positions: dict[str, list[tuple[float, float]]] = {}
        for org in organisms:
            sp = org.get("species", "unknown")
            pos = _extract_position(org)
            species_positions.setdefault(sp, []).append(pos)

        if len(species_positions) < 2:
            return []

        # Compute centroids
        centroids: dict[str, np.ndarray] = {}
        spreads: dict[str, float] = {}
        for sp, positions in species_positions.items():
            if len(positions) < 3:
                continue
            arr = np.array(positions)
            centroids[sp] = np.mean(arr, axis=0)
            spreads[sp] = float(np.mean(np.std(arr, axis=0)))

        species_list = list(centroids.keys())
        if len(species_list) < 2:
            return []

        # Compute inter-species centroid distances
        separations = []
        for i, sp_a in enumerate(species_list):
            for sp_b in species_list[i + 1:]:
                dist = float(np.linalg.norm(centroids[sp_a] - centroids[sp_b]))
                mean_spread = (spreads[sp_a] + spreads[sp_b]) / 2.0
                if mean_spread > 1e-6:
                    separations.append(dist / mean_spread)

        if not separations:
            return []

        mean_separation = sum(separations) / len(separations)

        events = []
        # Separation ratio > 2 means centroids are 2x the spread apart
        if mean_separation > 2.0:
            confidence = min(1.0, (mean_separation - 2.0) / 3.0)
            species_summary = {
                sp: {
                    "centroid": [round(c, 2) for c in centroids[sp].tolist()],
                    "spread": round(spreads[sp], 3),
                    "count": len(species_positions[sp]),
                }
                for sp in species_list
            }
            events.append(
                BehaviorEvent(
                    behavior_type="niche_specialization",
                    confidence=confidence,
                    description=(
                        f"Species occupy distinct regions "
                        f"(separation ratio={mean_separation:.2f}). "
                        f"Species: {', '.join(species_list)}."
                    ),
                    timestamp_ms=timestamp,
                    details={
                        "separation_ratio": round(mean_separation, 3),
                        "species": species_summary,
                    },
                ).to_dict()
            )

        return events

    def _check_cooperation(
        self, state: dict, timestamp: float
    ) -> list[dict]:
        """Detect coordinated movement patterns between organisms.

        Looks for groups of 3+ organisms moving in the same direction
        at similar speeds, which is unlikely by random walk alone.
        Uses velocity correlation within spatial neighborhoods.
        """
        if len(self._history) < 10:
            return []

        organisms = [o for o in state.get("organisms", []) if o.get("alive", True)]
        if len(organisms) < 6:
            return []

        # Compute velocities from trail history
        vels: list[tuple[float, float, float, float]] = []  # (x, y, vx, vy)
        for org in organisms:
            oid = org.get("id", "")
            trail = self._position_trails.get(oid, [])
            if len(trail) >= 3:
                dx = trail[-1][0] - trail[-3][0]
                dy = trail[-1][1] - trail[-3][1]
                mag = math.sqrt(dx * dx + dy * dy)
                if mag > 1e-6:
                    vels.append((trail[-1][0], trail[-1][1], dx / mag, dy / mag))

        if len(vels) < 6:
            return []

        positions = np.array([(v[0], v[1]) for v in vels])
        velocities = np.array([(v[2], v[3]) for v in vels])
        n = len(vels)

        # For each organism, find its local neighborhood and measure
        # velocity coherence
        neighborhood_radius = 2.0
        coherence_scores = []

        for i in range(n):
            diffs = positions - positions[i]
            dists = np.sqrt(np.sum(diffs * diffs, axis=1))
            neighbors = np.where((dists < neighborhood_radius) & (dists > 0))[0]

            if len(neighbors) < 2:
                continue

            # Mean velocity alignment with neighbors
            neighbor_vels = velocities[neighbors]
            dots = np.sum(neighbor_vels * velocities[i], axis=1)
            coherence_scores.append(float(np.mean(dots)))

        if len(coherence_scores) < 3:
            return []

        mean_coherence = sum(coherence_scores) / len(coherence_scores)

        events = []
        if mean_coherence > 0.65:
            confidence = min(1.0, (mean_coherence - 0.65) / 0.25)
            events.append(
                BehaviorEvent(
                    behavior_type="cooperation",
                    confidence=confidence,
                    description=(
                        f"Coordinated movement detected "
                        f"(mean local coherence={mean_coherence:.2f}, "
                        f"n={len(coherence_scores)} neighborhoods)."
                    ),
                    timestamp_ms=timestamp,
                    details={
                        "mean_coherence": round(mean_coherence, 3),
                        "n_neighborhoods": len(coherence_scores),
                        "n_organisms_with_velocity": n,
                    },
                ).to_dict()
            )

        return events

    def get_summary(self) -> dict:
        """Return a summary of all detected behaviors."""
        return {
            "total_events": len(self.behavior_log),
            "known_behaviors": sorted(self.known_behaviors),
            "recent_events": self.behavior_log[-20:],
        }

    def reset(self) -> None:
        """Clear all history and detected behaviors."""
        self.behavior_log.clear()
        self.known_behaviors.clear()
        self._history.clear()
        self._death_locations.clear()
        self._position_trails.clear()


def _extract_position(org: dict) -> tuple[float, float]:
    """Extract (x, y) from an organism dict, handling both formats."""
    if "x" in org and "y" in org:
        return (org["x"], org["y"])
    pos = org.get("position", (0.0, 0.0))
    if isinstance(pos, (list, tuple)) and len(pos) >= 2:
        return (pos[0], pos[1])
    return (0.0, 0.0)


def _dsq(a: tuple[float, float], b: tuple[float, float]) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy
