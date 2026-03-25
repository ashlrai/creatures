"""Diverse environment types for Neurevo organism simulation.

Four distinct world types, each modeling a different ecological niche:
- SoilWorld: Cubic centimeter of soil (natural C. elegans habitat)
- PondWorld: Aquatic environment (preparation for zebrafish)
- LabPlateWorld: Standard NGM agar plate (comparable to real experiments)
- AbstractWorld: Mazes, memory tasks, social dilemmas (tests learning)

All worlds implement a common interface:
- sense_at(x, y) -> dict compatible with NeuralOrganism sensory input
- step(dt) -> advance dynamic environment
- get_state() -> full state for visualization
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Shared sensory dict builder
# ---------------------------------------------------------------------------

def _empty_sensory() -> dict:
    """Return a sensory dict with all required keys at zero/empty defaults.

    This ensures every world's sense_at() output is compatible with
    NeuralOrganism.sense_and_act(), which expects:
        chemicals, temperature, toxin_exposure, social, gradient_direction
    """
    return {
        "chemicals": {},
        "temperature": None,
        "toxin_exposure": 0.0,
        "social": {},
        "gradient_direction": {},
    }


def _gaussian(distance_sq: float, sigma: float) -> float:
    """Gaussian falloff: exp(-d^2 / (2 * sigma^2))."""
    return math.exp(-distance_sq / (2.0 * sigma * sigma))


def _distance_sq(x1: float, y1: float, x2: float, y2: float) -> float:
    dx = x1 - x2
    dy = y1 - y2
    return dx * dx + dy * dy


def _unit_direction(x: float, y: float, tx: float, ty: float) -> tuple[float, float]:
    """Unit vector from (x, y) toward (tx, ty). Returns (0, 0) if coincident."""
    dx = tx - x
    dy = ty - y
    mag = math.sqrt(dx * dx + dy * dy)
    if mag < 1e-10:
        return (0.0, 0.0)
    return (dx / mag, dy / mag)


# ===========================================================================
# SoilWorld
# ===========================================================================


@dataclass
class BacteriaColony:
    """Clustered bacterial food source in soil."""
    x: float
    y: float
    population: float = 1.0  # 0-1 normalized
    growth_rate: float = 0.001  # per ms
    max_population: float = 1.0
    sigma: float = 0.8  # diffusion radius for odor


@dataclass
class FungalSegment:
    """Linear obstacle in the soil (fungal hypha)."""
    x1: float
    y1: float
    x2: float
    y2: float
    thickness: float = 0.1


@dataclass
class OrganicMatter:
    """Decaying organic material that slowly becomes food."""
    x: float
    y: float
    remaining: float = 1.0  # decays over time, becomes bacterial food
    decay_rate: float = 0.0005


class SoilWorld:
    """Cubic centimeter of soil with bacterial food, fungal networks, moisture.

    Based on real C. elegans ecology -- they naturally live in rotting
    vegetation in temperate soil. Bacteria (their primary food) cluster
    around decaying organic matter. Fungal hyphae form linear obstacles.
    Moisture and temperature vary with depth (y-axis = depth).
    """

    def __init__(self, size: float = 10.0, seed: int = 42) -> None:
        self.size = size
        self.time_ms: float = 0.0
        self._rng = random.Random(seed)

        # Bacteria colonies cluster around organic matter, not random
        self.bacteria_colonies: list[BacteriaColony] = []
        self.fungal_networks: list[FungalSegment] = []
        # Moisture gradient: wet_side (left) to dry_side (right)
        self.moisture_gradient: tuple[float, float] = (0.9, 0.2)
        # Temperature layers: cooler at surface (y=0), warmer at depth (y=size)
        self.temperature_layers: tuple[float, float] = (18.0, 22.0)
        self.organic_matter: list[OrganicMatter] = []

        self._populate(seed)

    def _populate(self, seed: int) -> None:
        """Generate a realistic soil patch."""
        rng = self._rng
        s = self.size

        # Place 3-5 clusters of organic matter
        n_organic = rng.randint(3, 5)
        for _ in range(n_organic):
            ox = rng.uniform(s * 0.1, s * 0.9)
            oy = rng.uniform(s * 0.1, s * 0.9)
            self.organic_matter.append(OrganicMatter(x=ox, y=oy))

            # Bacteria cluster around organic matter (2-4 colonies per patch)
            n_bac = rng.randint(2, 4)
            for _ in range(n_bac):
                bx = ox + rng.gauss(0, 0.5)
                by = oy + rng.gauss(0, 0.5)
                bx = max(0, min(s, bx))
                by = max(0, min(s, by))
                self.bacteria_colonies.append(
                    BacteriaColony(x=bx, y=by, population=rng.uniform(0.3, 1.0))
                )

        # Fungal networks: 3-6 linear segments
        n_fungi = rng.randint(3, 6)
        for _ in range(n_fungi):
            fx1 = rng.uniform(0, s)
            fy1 = rng.uniform(0, s)
            angle = rng.uniform(0, 2 * math.pi)
            length = rng.uniform(s * 0.1, s * 0.4)
            fx2 = fx1 + length * math.cos(angle)
            fy2 = fy1 + length * math.sin(angle)
            self.fungal_networks.append(
                FungalSegment(x1=fx1, y1=fy1, x2=fx2, y2=fy2)
            )

    def sense_at(self, x: float, y: float) -> dict:
        """Return sensory inputs at position (x, y).

        Chemicals:
            bacteria_odor: sum of Gaussian-diffused bacterial colony signals
            organic_odor: decaying matter scent
        Temperature: linear interpolation by depth (y)
        Toxin: damage if inside a fungal segment (physical obstacle)
        """
        sensory = _empty_sensory()

        # --- Bacteria odor (food) ---
        total_bac = 0.0
        grad_x, grad_y = 0.0, 0.0
        for col in self.bacteria_colonies:
            dsq = _distance_sq(x, y, col.x, col.y)
            conc = col.population * _gaussian(dsq, col.sigma)
            total_bac += conc
            if conc > 1e-8:
                # Gradient toward this colony, weighted by concentration
                dx = col.x - x
                dy = col.y - y
                dist = math.sqrt(dsq)
                if dist > 1e-10:
                    grad_x += conc * dx / dist
                    grad_y += conc * dy / dist

        sensory["chemicals"]["bacteria_odor"] = min(total_bac, 1.0)

        # Normalize gradient to unit vector
        gmag = math.sqrt(grad_x * grad_x + grad_y * grad_y)
        if gmag > 1e-10:
            sensory["gradient_direction"]["bacteria_odor"] = (
                grad_x / gmag, grad_y / gmag
            )
        else:
            sensory["gradient_direction"]["bacteria_odor"] = (0.0, 0.0)

        # --- Organic matter odor ---
        total_org = 0.0
        org_gx, org_gy = 0.0, 0.0
        for om in self.organic_matter:
            dsq = _distance_sq(x, y, om.x, om.y)
            conc = om.remaining * _gaussian(dsq, 1.2)
            total_org += conc
            if conc > 1e-8:
                dx = om.x - x
                dy = om.y - y
                dist = math.sqrt(dsq)
                if dist > 1e-10:
                    org_gx += conc * dx / dist
                    org_gy += conc * dy / dist

        sensory["chemicals"]["organic_odor"] = min(total_org, 1.0)
        omag = math.sqrt(org_gx * org_gx + org_gy * org_gy)
        if omag > 1e-10:
            sensory["gradient_direction"]["organic_odor"] = (
                org_gx / omag, org_gy / omag
            )
        else:
            sensory["gradient_direction"]["organic_odor"] = (0.0, 0.0)

        # --- Moisture (linear gradient: wet at x=0, dry at x=size) ---
        t = max(0.0, min(1.0, x / self.size)) if self.size > 0 else 0.5
        moisture = self.moisture_gradient[0] + t * (
            self.moisture_gradient[1] - self.moisture_gradient[0]
        )
        sensory["chemicals"]["moisture"] = moisture
        # Gradient points toward wetter side (negative x)
        if self.moisture_gradient[0] > self.moisture_gradient[1]:
            sensory["gradient_direction"]["moisture"] = (-1.0, 0.0)
        else:
            sensory["gradient_direction"]["moisture"] = (1.0, 0.0)

        # --- Temperature (linear by depth: y=0 surface cool, y=size deep warm) ---
        t_depth = max(0.0, min(1.0, y / self.size)) if self.size > 0 else 0.5
        temp = self.temperature_layers[0] + t_depth * (
            self.temperature_layers[1] - self.temperature_layers[0]
        )
        sensory["temperature"] = temp

        # --- Fungal obstacle collision (treated as mild toxin/damage) ---
        toxin = 0.0
        for seg in self.fungal_networks:
            dist = _point_to_segment_distance(x, y, seg.x1, seg.y1, seg.x2, seg.y2)
            if dist < seg.thickness:
                # Mild damage from bumping into fungal hyphae
                toxin += 1.0 * (1.0 - dist / seg.thickness)
        sensory["toxin_exposure"] = toxin

        return sensory

    def step(self, dt: float) -> None:
        """Advance the soil environment.

        Bacteria grow logistically, organic matter decays and feeds nearby
        bacteria colonies.
        """
        self.time_ms += dt

        # Organic matter decays
        for om in self.organic_matter:
            if om.remaining > 0:
                decay = om.decay_rate * dt
                om.remaining = max(0.0, om.remaining - decay)

                # Feed nearby bacteria
                for col in self.bacteria_colonies:
                    dsq = _distance_sq(om.x, om.y, col.x, col.y)
                    if dsq < 4.0:  # within 2 units
                        col.population = min(
                            col.max_population,
                            col.population + decay * 0.5 * _gaussian(dsq, 1.0),
                        )

        # Bacteria grow logistically
        for col in self.bacteria_colonies:
            growth = col.growth_rate * dt * col.population * (
                1.0 - col.population / col.max_population
            )
            col.population = min(col.max_population, col.population + growth)

        # Slow moisture shift (oscillate slightly)
        shift = 0.01 * math.sin(self.time_ms * 0.0001)
        wet, dry = self.moisture_gradient
        self.moisture_gradient = (
            max(0.0, min(1.0, wet + shift)),
            max(0.0, min(1.0, dry - shift)),
        )

    def get_state(self) -> dict:
        """Full state for visualization."""
        return {
            "type": "soil",
            "time_ms": self.time_ms,
            "size": self.size,
            "bacteria_colonies": [
                {"x": c.x, "y": c.y, "population": c.population}
                for c in self.bacteria_colonies
            ],
            "fungal_networks": [
                {"x1": s.x1, "y1": s.y1, "x2": s.x2, "y2": s.y2,
                 "thickness": s.thickness}
                for s in self.fungal_networks
            ],
            "moisture_gradient": list(self.moisture_gradient),
            "temperature_layers": list(self.temperature_layers),
            "organic_matter": [
                {"x": o.x, "y": o.y, "remaining": o.remaining}
                for o in self.organic_matter
            ],
        }


def _point_to_segment_distance(
    px: float, py: float,
    x1: float, y1: float, x2: float, y2: float,
) -> float:
    """Minimum distance from point (px, py) to line segment (x1,y1)-(x2,y2)."""
    dx = x2 - x1
    dy = y2 - y1
    len_sq = dx * dx + dy * dy
    if len_sq < 1e-12:
        return math.sqrt(_distance_sq(px, py, x1, y1))
    # Project point onto segment, clamped to [0, 1]
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.sqrt(_distance_sq(px, py, proj_x, proj_y))


# ===========================================================================
# PondWorld
# ===========================================================================


@dataclass
class AlgaeBloom:
    """Food source that grows and shrinks over time."""
    x: float
    y: float  # depth (0 = surface)
    biomass: float = 0.8
    growth_rate: float = 0.002
    max_biomass: float = 1.0
    sigma: float = 1.5  # scent radius


@dataclass
class PredatorShadow:
    """A moving dark patch overhead -- triggers avoidance behavior."""
    x: float
    y: float
    radius: float = 2.0
    speed: float = 0.01  # units per ms
    heading: float = 0.0


class PondWorld:
    """Aquatic environment with light, algae, predators, and currents.

    Preparation for zebrafish simulations. Vertical axis (y) represents
    depth: y=0 is the surface (bright, oxygen-rich), y=depth is the bottom
    (dark, low oxygen). Organisms must balance food access, predator
    avoidance, and oxygen needs.
    """

    def __init__(
        self, depth: float = 5.0, width: float = 20.0, seed: int = 42
    ) -> None:
        self.depth = depth
        self.width = width
        self.time_ms: float = 0.0
        self._rng = random.Random(seed)

        self.algae_blooms: list[AlgaeBloom] = []
        # Current: (dx, dy) direction + strength
        self.current: tuple[float, float] = (0.003, -0.001)
        self.predator_shadows: list[PredatorShadow] = []
        # Light intensity at surface (1.0) decays exponentially with depth
        self.surface_light: float = 1.0
        # Oxygen: high at surface, low at depth
        self.surface_oxygen: float = 1.0

        self._populate(seed)

    def _populate(self, seed: int) -> None:
        rng = self._rng
        w, d = self.width, self.depth

        # Algae blooms: mostly near surface where light is
        n_algae = rng.randint(4, 8)
        for _ in range(n_algae):
            ax = rng.uniform(-w / 2, w / 2)
            ay = rng.uniform(0, d * 0.6)  # upper 60% of water column
            self.algae_blooms.append(
                AlgaeBloom(x=ax, y=ay, biomass=rng.uniform(0.3, 1.0))
            )

        # 1-3 predator shadows
        n_pred = rng.randint(1, 3)
        for _ in range(n_pred):
            px = rng.uniform(-w / 2, w / 2)
            self.predator_shadows.append(
                PredatorShadow(
                    x=px, y=0.0,
                    heading=rng.uniform(0, 2 * math.pi),
                    speed=rng.uniform(0.005, 0.02),
                )
            )

    def sense_at(self, x: float, y: float) -> dict:
        """Sensory input at position (x, y) where y is depth (0 = surface)."""
        sensory = _empty_sensory()

        # Clamp y to valid depth range
        y_clamped = max(0.0, min(self.depth, y))

        # --- Light (exponential decay with depth, Beer-Lambert law) ---
        # Attenuation coefficient ~0.5 per unit depth
        light = self.surface_light * math.exp(-0.5 * y_clamped)
        sensory["chemicals"]["light"] = light

        # --- Algae food ---
        total_algae = 0.0
        grad_x, grad_y = 0.0, 0.0
        for bloom in self.algae_blooms:
            dsq = _distance_sq(x, y_clamped, bloom.x, bloom.y)
            conc = bloom.biomass * _gaussian(dsq, bloom.sigma)
            total_algae += conc
            if conc > 1e-8:
                dx = bloom.x - x
                dy = bloom.y - y_clamped
                dist = math.sqrt(dsq)
                if dist > 1e-10:
                    grad_x += conc * dx / dist
                    grad_y += conc * dy / dist

        sensory["chemicals"]["algae"] = min(total_algae, 1.0)
        gmag = math.sqrt(grad_x * grad_x + grad_y * grad_y)
        if gmag > 1e-10:
            sensory["gradient_direction"]["algae"] = (grad_x / gmag, grad_y / gmag)
        else:
            sensory["gradient_direction"]["algae"] = (0.0, 0.0)

        # --- Oxygen gradient (high at surface, low at depth) ---
        oxygen = self.surface_oxygen * max(0.0, 1.0 - 0.15 * y_clamped)
        sensory["chemicals"]["oxygen"] = oxygen
        # Gradient always points upward (toward surface, lower y)
        sensory["gradient_direction"]["oxygen"] = (0.0, -1.0)

        # --- Predator shadows (danger signal) ---
        shadow_danger = 0.0
        for pred in self.predator_shadows:
            dsq = _distance_sq(x, y_clamped, pred.x, pred.y)
            if dsq < pred.radius * pred.radius:
                # Shadow blocks light proportionally
                shadow_danger += 1.0 - math.sqrt(dsq) / pred.radius
        sensory["chemicals"]["predator_shadow"] = min(shadow_danger, 1.0)

        # --- Temperature (warmer at surface in summer-like conditions) ---
        temp = 22.0 - 1.5 * y_clamped  # ~22C at surface, cooler at depth
        sensory["temperature"] = max(10.0, temp)

        # --- Current as social-like signal (felt everywhere) ---
        sensory["social"]["current_x"] = self.current[0]
        sensory["social"]["current_y"] = self.current[1]

        # --- Toxin: deep anoxic zone ---
        if oxygen < 0.1:
            sensory["toxin_exposure"] = (0.1 - oxygen) * 20.0

        return sensory

    def step(self, dt: float) -> None:
        """Advance the pond environment."""
        self.time_ms += dt

        # Algae grow with light (logistic growth, faster near surface)
        for bloom in self.algae_blooms:
            light_factor = math.exp(-0.5 * bloom.y)
            growth = (
                bloom.growth_rate * dt * bloom.biomass
                * (1.0 - bloom.biomass / bloom.max_biomass)
                * light_factor
            )
            bloom.biomass = min(bloom.max_biomass, bloom.biomass + growth)

        # Predator shadows drift
        for pred in self.predator_shadows:
            pred.x += pred.speed * dt * math.cos(pred.heading)
            # Bounce off horizontal boundaries
            half_w = self.width / 2
            if abs(pred.x) > half_w:
                pred.heading = math.pi - pred.heading
                pred.x = max(-half_w, min(half_w, pred.x))

        # Gentle current oscillation (tidal-like)
        phase = self.time_ms * 0.00005
        self.current = (
            0.003 * math.sin(phase),
            -0.001 * math.cos(phase * 0.7),
        )

    def get_state(self) -> dict:
        return {
            "type": "pond",
            "time_ms": self.time_ms,
            "width": self.width,
            "depth": self.depth,
            "algae_blooms": [
                {"x": b.x, "y": b.y, "biomass": b.biomass}
                for b in self.algae_blooms
            ],
            "predator_shadows": [
                {"x": p.x, "y": p.y, "radius": p.radius, "heading": p.heading}
                for p in self.predator_shadows
            ],
            "current": list(self.current),
            "surface_light": self.surface_light,
        }


# ===========================================================================
# LabPlateWorld
# ===========================================================================


class LabPlateWorld:
    """Standard NGM agar plate -- the exact setup used in C. elegans labs.

    60mm diameter petri dish with E. coli OP50 bacterial lawn.
    Directly comparable to real experimental data from Bargmann lab
    chemotaxis assays and standard avoidance assays.

    Coordinate system: center of plate at (0, 0), units in mm.
    """

    def __init__(self) -> None:
        self.plate_radius: float = 30.0  # mm (60mm plate)
        self.ecoli_lawn_center: tuple[float, float] = (0.0, 0.0)
        self.ecoli_lawn_radius: float = 10.0  # mm
        self.ecoli_density: float = 1.0  # normalized
        # Assay chemicals: list of (name, position, concentration, sigma)
        self.assay_chemicals: list[dict] = []
        # Optional copper ring (repellent barrier)
        self.copper_ring: float | None = None  # radius in mm, or None
        self.time_ms: float = 0.0

    def sense_at(self, x: float, y: float) -> dict:
        """Sensory input at position (x, y) on the plate (mm coordinates).

        Returns standard sensory dict with:
        - chemicals: E. coli food lawn + any assay chemicals
        - temperature: constant 20C (standard lab conditions)
        - toxin_exposure: damage from copper ring or plate edge
        - gradient_direction: toward food and assay chemicals
        """
        sensory = _empty_sensory()

        dist_from_center = math.sqrt(x * x + y * y)

        # --- E. coli OP50 lawn (Gaussian around lawn center) ---
        dsq = _distance_sq(x, y, *self.ecoli_lawn_center)
        # Sharp-edged lawn: high inside, drops quickly outside
        lawn_sigma = self.ecoli_lawn_radius / 2.5
        ecoli_conc = self.ecoli_density * _gaussian(dsq, lawn_sigma)
        sensory["chemicals"]["ecoli"] = ecoli_conc

        # Gradient toward lawn center
        gdir = _unit_direction(x, y, *self.ecoli_lawn_center)
        sensory["gradient_direction"]["ecoli"] = gdir

        # --- Assay chemicals (NaCl, diacetyl, ethanol, etc.) ---
        for chem in self.assay_chemicals:
            cname = chem["name"]
            cx, cy = chem["position"]
            cpeak = chem.get("concentration", 1.0)
            csigma = chem.get("sigma", 8.0)  # mm
            cdsq = _distance_sq(x, y, cx, cy)
            conc = cpeak * _gaussian(cdsq, csigma)
            sensory["chemicals"][cname] = conc
            sensory["gradient_direction"][cname] = _unit_direction(x, y, cx, cy)

        # --- Temperature: constant 20C (standard cultivation temp) ---
        sensory["temperature"] = 20.0

        # --- Copper ring (strong repellent/damage) ---
        toxin = 0.0
        if self.copper_ring is not None:
            ring_dist = abs(dist_from_center - self.copper_ring)
            ring_width = 1.0  # mm
            if ring_dist < ring_width:
                toxin += 10.0 * (1.0 - ring_dist / ring_width)

        # --- Plate edge (organisms can't leave, mild aversive signal) ---
        edge_dist = self.plate_radius - dist_from_center
        if edge_dist < 2.0:  # within 2mm of edge
            toxin += 2.0 * (1.0 - edge_dist / 2.0)

        sensory["toxin_exposure"] = toxin

        return sensory

    def step(self, dt: float) -> None:
        """Advance time. Lab plates are mostly static environments.

        E. coli lawn depletes slowly as organisms consume it (not modeled
        individually here -- the lawn is treated as inexhaustible for
        standard assay durations of ~60 minutes).
        """
        self.time_ms += dt

    def get_state(self) -> dict:
        return {
            "type": "lab_plate",
            "time_ms": self.time_ms,
            "plate_radius": self.plate_radius,
            "ecoli_lawn_center": list(self.ecoli_lawn_center),
            "ecoli_lawn_radius": self.ecoli_lawn_radius,
            "assay_chemicals": [
                {
                    "name": c["name"],
                    "position": list(c["position"]),
                    "concentration": c.get("concentration", 1.0),
                    "sigma": c.get("sigma", 8.0),
                }
                for c in self.assay_chemicals
            ],
            "copper_ring": self.copper_ring,
        }

    @staticmethod
    def chemotaxis_assay(chemical: str = "NaCl") -> LabPlateWorld:
        """Standard Bargmann chemotaxis assay.

        Chemical point source at one side of the plate, control (ethanol)
        at the opposite side. Organisms start at center.
        Ref: Bargmann & Horvitz, 1991.
        """
        world = LabPlateWorld()
        # Chemical source at +x side
        world.assay_chemicals.append({
            "name": chemical,
            "position": (20.0, 0.0),
            "concentration": 1.0,
            "sigma": 10.0,
        })
        # Control solvent at -x side
        world.assay_chemicals.append({
            "name": "control",
            "position": (-20.0, 0.0),
            "concentration": 0.1,
            "sigma": 10.0,
        })
        return world

    @staticmethod
    def avoidance_assay(repellent: str = "copper") -> LabPlateWorld:
        """Standard avoidance assay with copper ring barrier.

        A copper ring at 15mm radius acts as a repellent barrier.
        E. coli lawn is inside the ring. Tests whether organisms learn
        to avoid the barrier.
        """
        world = LabPlateWorld()
        world.copper_ring = 15.0  # mm radius
        # Food inside the ring
        world.ecoli_lawn_radius = 12.0
        return world


# ===========================================================================
# AbstractWorld
# ===========================================================================


@dataclass
class Wall:
    """A wall segment in a maze."""
    x1: float
    y1: float
    x2: float
    y2: float
    thickness: float = 0.2


@dataclass
class FoodPatch:
    """A depletable food source for foraging tasks."""
    x: float
    y: float
    amount: float = 1.0
    max_amount: float = 1.0
    regrowth_rate: float = 0.0  # 0 = no regrowth
    sigma: float = 0.5


class AbstractWorld:
    """Abstract challenges: mazes, patterns, multi-armed bandits.

    Tests what neural architectures can LEARN, independent of
    ecological realism. Useful for benchmarking and comparing
    different connectomes.
    """

    def __init__(self, challenge: str = "maze", size: float = 10.0, seed: int = 42) -> None:
        self.challenge_type = challenge
        self.size = size
        self.time_ms: float = 0.0
        self._rng = random.Random(seed)

        self.walls: list[Wall] = []
        self.food_patches: list[FoodPatch] = []
        self.goal: tuple[float, float] | None = None
        # Memory task: food appears at a fixed location after a delay
        self.memory_location: tuple[float, float] | None = None
        self.memory_cycle_ms: float = 5000.0  # food appears every 5s
        self.memory_visible: bool = False
        # Social dilemma: cooperative zones
        self.cooperation_zones: list[dict] = []

        if challenge == "maze":
            self._build_maze()
        elif challenge == "foraging":
            self._build_foraging()
        elif challenge == "memory":
            self._build_memory()
        elif challenge == "social":
            self._build_social()

    def _build_maze(self) -> None:
        """Simple T-maze with goal at one end."""
        s = self.size
        # Horizontal corridor
        self.walls.append(Wall(x1=0, y1=s * 0.4, x2=s, y2=s * 0.4))
        self.walls.append(Wall(x1=0, y1=s * 0.6, x2=s, y2=s * 0.6))
        # Vertical wall creating T-junction
        self.walls.append(Wall(x1=s * 0.5, y1=0, x2=s * 0.5, y2=s * 0.4))
        self.walls.append(Wall(x1=s * 0.5, y1=s * 0.6, x2=s * 0.5, y2=s))
        # Open the T at top and bottom of the vertical section
        # Goal at right end
        self.goal = (s * 0.9, s * 0.5)
        self.food_patches.append(
            FoodPatch(x=s * 0.9, y=s * 0.5, amount=1.0, sigma=0.5)
        )

    def _build_foraging(self) -> None:
        """Multiple food patches that deplete when consumed."""
        rng = self._rng
        s = self.size
        n_patches = rng.randint(5, 10)
        for _ in range(n_patches):
            self.food_patches.append(
                FoodPatch(
                    x=rng.uniform(s * 0.1, s * 0.9),
                    y=rng.uniform(s * 0.1, s * 0.9),
                    amount=rng.uniform(0.5, 1.0),
                    regrowth_rate=0.0005,
                    sigma=rng.uniform(0.3, 0.8),
                )
            )

    def _build_memory(self) -> None:
        """Food appears at the same location on a cycle."""
        s = self.size
        self.memory_location = (s * 0.7, s * 0.7)
        self.memory_visible = True
        self.food_patches.append(
            FoodPatch(x=s * 0.7, y=s * 0.7, amount=1.0, sigma=0.5)
        )

    def _build_social(self) -> None:
        """Zones that only yield food when multiple organisms are present."""
        s = self.size
        self.cooperation_zones = [
            {"x": s * 0.3, "y": s * 0.3, "radius": 1.5, "min_organisms": 2,
             "reward": 1.0},
            {"x": s * 0.7, "y": s * 0.7, "radius": 1.5, "min_organisms": 3,
             "reward": 2.0},
        ]

    def sense_at(self, x: float, y: float) -> dict:
        """Sensory input at position (x, y)."""
        sensory = _empty_sensory()

        # --- Food signals ---
        total_food = 0.0
        grad_x, grad_y = 0.0, 0.0
        for patch in self.food_patches:
            if patch.amount < 0.01:
                continue
            dsq = _distance_sq(x, y, patch.x, patch.y)
            conc = patch.amount * _gaussian(dsq, patch.sigma)
            total_food += conc
            if conc > 1e-8:
                dx = patch.x - x
                dy = patch.y - y
                dist = math.sqrt(dsq)
                if dist > 1e-10:
                    grad_x += conc * dx / dist
                    grad_y += conc * dy / dist

        sensory["chemicals"]["food"] = min(total_food, 1.0)
        gmag = math.sqrt(grad_x * grad_x + grad_y * grad_y)
        if gmag > 1e-10:
            sensory["gradient_direction"]["food"] = (grad_x / gmag, grad_y / gmag)
        else:
            sensory["gradient_direction"]["food"] = (0.0, 0.0)

        # --- Goal signal (for maze) ---
        if self.goal is not None:
            dsq = _distance_sq(x, y, *self.goal)
            goal_signal = _gaussian(dsq, 2.0)
            sensory["chemicals"]["goal"] = goal_signal
            sensory["gradient_direction"]["goal"] = _unit_direction(
                x, y, *self.goal
            )

        # --- Wall collision (toxin-like damage) ---
        toxin = 0.0
        for wall in self.walls:
            dist = _point_to_segment_distance(x, y, wall.x1, wall.y1,
                                              wall.x2, wall.y2)
            if dist < wall.thickness:
                toxin += 5.0 * (1.0 - dist / wall.thickness)
        sensory["toxin_exposure"] = toxin

        # --- Cooperation zones (social signal) ---
        for zone in self.cooperation_zones:
            dsq = _distance_sq(x, y, zone["x"], zone["y"])
            if dsq < zone["radius"] * zone["radius"]:
                sensory["social"]["cooperation_zone"] = (
                    sensory["social"].get("cooperation_zone", 0.0)
                    + zone["reward"]
                )

        # --- Temperature: constant (abstract world, no ecological temp) ---
        sensory["temperature"] = 20.0

        return sensory

    def step(self, dt: float) -> None:
        """Advance the abstract world."""
        self.time_ms += dt

        # Memory task: toggle food visibility on a cycle
        if self.challenge_type == "memory" and self.memory_location is not None:
            cycle_phase = (self.time_ms % self.memory_cycle_ms) / self.memory_cycle_ms
            should_be_visible = cycle_phase < 0.5  # visible first half of cycle
            if should_be_visible != self.memory_visible:
                self.memory_visible = should_be_visible
                for patch in self.food_patches:
                    if (patch.x, patch.y) == self.memory_location:
                        patch.amount = 1.0 if should_be_visible else 0.0

        # Foraging: slow regrowth
        if self.challenge_type == "foraging":
            for patch in self.food_patches:
                if patch.amount < patch.max_amount and patch.regrowth_rate > 0:
                    patch.amount = min(
                        patch.max_amount,
                        patch.amount + patch.regrowth_rate * dt,
                    )

    def get_state(self) -> dict:
        return {
            "type": "abstract",
            "challenge": self.challenge_type,
            "time_ms": self.time_ms,
            "size": self.size,
            "walls": [
                {"x1": w.x1, "y1": w.y1, "x2": w.x2, "y2": w.y2,
                 "thickness": w.thickness}
                for w in self.walls
            ],
            "food_patches": [
                {"x": p.x, "y": p.y, "amount": p.amount, "sigma": p.sigma}
                for p in self.food_patches
            ],
            "goal": list(self.goal) if self.goal else None,
            "cooperation_zones": self.cooperation_zones,
            "memory_visible": self.memory_visible,
        }

    @staticmethod
    def simple_maze(size: float = 10.0) -> AbstractWorld:
        """Create a simple T-maze challenge."""
        return AbstractWorld(challenge="maze", size=size)

    @staticmethod
    def memory_task(size: float = 10.0) -> AbstractWorld:
        """Create a memory challenge (food on a cycle)."""
        return AbstractWorld(challenge="memory", size=size)

    @staticmethod
    def social_dilemma(size: float = 10.0) -> AbstractWorld:
        """Create a social cooperation challenge."""
        return AbstractWorld(challenge="social", size=size)
