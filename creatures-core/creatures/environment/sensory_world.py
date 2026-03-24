"""Rich sensory environment for multi-modal organism navigation.

Models chemical gradients, temperature fields, toxic zones, and social
signals. Inspired by C. elegans chemotaxis studies (Bargmann & Horvitz 1991)
and Drosophila thermotaxis.

Chemical concentrations follow Gaussian diffusion:
    concentration = peak * exp(-distance^2 / (2 * sigma^2))
where sigma = diffusion_radius / 3 (so ~99.7% of signal is within radius).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class ChemicalGradient:
    """A chemical gradient in the arena (e.g., NaCl, isoamyl alcohol)."""

    name: str
    source_position: tuple[float, float]
    peak_concentration: float = 1.0
    diffusion_radius: float = 1.5  # arena units
    chemical_type: str = "attractant"  # or "repellent"

    @property
    def sigma(self) -> float:
        """Standard deviation for Gaussian diffusion model."""
        return self.diffusion_radius / 3.0


@dataclass
class TemperatureField:
    """A linear temperature gradient across the arena."""

    cold_position: tuple[float, float] = (-1.5, 0.0)
    hot_position: tuple[float, float] = (1.5, 0.0)
    cold_temp: float = 15.0  # degrees C
    hot_temp: float = 25.0  # degrees C
    preferred_temp: float = 20.0  # C. elegans cultivated at 20 C


@dataclass
class ToxicZone:
    """An area that damages organisms."""

    position: tuple[float, float]
    radius: float = 0.3
    damage_rate: float = 5.0  # energy per ms
    name: str = "toxin"


@dataclass
class SocialSignal:
    """Pheromone-like signals emitted by organisms."""

    emitter_species: str
    signal_type: str  # "aggregation", "alarm", "mating"
    range: float = 0.5
    intensity: float = 1.0
    position: tuple[float, float] = (0.0, 0.0)


class SensoryWorld:
    """Rich sensory environment for multi-modal navigation.

    Provides a unified interface for querying all sensory modalities at
    any position in the arena: chemical concentrations, temperature,
    toxin exposure, social signals, and gradient directions.
    """

    def __init__(self, arena_radius: float = 2.0) -> None:
        self.arena_radius = arena_radius
        self.chemical_gradients: list[ChemicalGradient] = []
        self.temperature_field: TemperatureField | None = None
        self.toxic_zones: list[ToxicZone] = []
        self.social_signals: list[SocialSignal] = []
        self.time_ms: float = 0.0

    def add_gradient(self, gradient: ChemicalGradient) -> None:
        """Add a chemical gradient to the world."""
        self.chemical_gradients.append(gradient)

    def set_temperature(self, field: TemperatureField) -> None:
        """Set the temperature field for the world."""
        self.temperature_field = field

    def add_toxic_zone(self, zone: ToxicZone) -> None:
        """Add a toxic zone to the world."""
        self.toxic_zones.append(zone)

    def add_social_signal(self, signal: SocialSignal) -> None:
        """Add a social signal to the world."""
        self.social_signals.append(signal)

    # --- Concentration / field computations ---

    def _concentration_at(
        self, position: tuple[float, float], gradient: ChemicalGradient
    ) -> float:
        """Gaussian diffusion: peak * exp(-d^2 / (2 * sigma^2))."""
        dx = position[0] - gradient.source_position[0]
        dy = position[1] - gradient.source_position[1]
        dist_sq = dx * dx + dy * dy
        sigma = gradient.sigma
        return gradient.peak_concentration * math.exp(
            -dist_sq / (2.0 * sigma * sigma)
        )

    def _temperature_at(self, position: tuple[float, float]) -> float | None:
        """Linearly interpolate temperature based on projection onto
        the cold->hot axis."""
        tf = self.temperature_field
        if tf is None:
            return None

        # Vector from cold to hot
        axis_x = tf.hot_position[0] - tf.cold_position[0]
        axis_y = tf.hot_position[1] - tf.cold_position[1]
        axis_len_sq = axis_x * axis_x + axis_y * axis_y
        if axis_len_sq < 1e-12:
            return (tf.cold_temp + tf.hot_temp) / 2.0

        # Project position onto cold->hot axis
        px = position[0] - tf.cold_position[0]
        py = position[1] - tf.cold_position[1]
        t = (px * axis_x + py * axis_y) / axis_len_sq
        t = max(0.0, min(1.0, t))  # clamp to [0, 1]

        return tf.cold_temp + t * (tf.hot_temp - tf.cold_temp)

    def _toxin_exposure_at(self, position: tuple[float, float]) -> float:
        """Total toxin damage rate at a position (sum over all zones).

        Damage falls off linearly from center to edge of the zone.
        """
        total = 0.0
        for zone in self.toxic_zones:
            dx = position[0] - zone.position[0]
            dy = position[1] - zone.position[1]
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < zone.radius:
                # Linear falloff: full damage at center, zero at edge
                fraction = 1.0 - (dist / zone.radius)
                total += zone.damage_rate * fraction
        return total

    def _social_at(self, position: tuple[float, float]) -> dict[str, float]:
        """Aggregate social signals at a position, keyed by signal_type."""
        signals: dict[str, float] = {}
        for sig in self.social_signals:
            dx = position[0] - sig.position[0]
            dy = position[1] - sig.position[1]
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < sig.range:
                # Linear falloff within range
                strength = sig.intensity * (1.0 - dist / sig.range)
                signals[sig.signal_type] = (
                    signals.get(sig.signal_type, 0.0) + strength
                )
        return signals

    # --- Public API ---

    def sense_at(self, position: tuple[float, float]) -> dict:
        """Return all sensory inputs at a given position.

        Returns:
            {
                'chemicals': {'NaCl': 0.7, 'isoamyl_alcohol': 0.2},
                'temperature': 18.5,       # or None if no field set
                'toxin_exposure': 0.0,      # total damage rate
                'social': {'aggregation': 0.3},
                'gradient_direction': {'NaCl': (0.5, -0.2)},
            }
        """
        chemicals: dict[str, float] = {}
        gradient_direction: dict[str, tuple[float, float]] = {}

        for grad in self.chemical_gradients:
            chemicals[grad.name] = self._concentration_at(position, grad)
            gradient_direction[grad.name] = self.get_gradient_at(
                position, grad.name
            )

        return {
            "chemicals": chemicals,
            "temperature": self._temperature_at(position),
            "toxin_exposure": self._toxin_exposure_at(position),
            "social": self._social_at(position),
            "gradient_direction": gradient_direction,
        }

    def get_gradient_at(
        self, position: tuple[float, float], gradient_name: str
    ) -> tuple[float, float]:
        """Return the direction of steepest ascent for a chemical at position.

        Uses the analytical gradient of the Gaussian:
            dC/dx = C(x,y) * -(x - x0) / sigma^2
            dC/dy = C(x,y) * -(y - y0) / sigma^2

        The gradient points toward the source (direction of increasing
        concentration). Returns (0, 0) if gradient not found.
        """
        for grad in self.chemical_gradients:
            if grad.name != gradient_name:
                continue

            conc = self._concentration_at(position, grad)
            if conc < 1e-10:
                return (0.0, 0.0)

            sigma_sq = grad.sigma * grad.sigma
            # Partial derivatives of Gaussian: gradient points toward source
            dx = -(position[0] - grad.source_position[0]) / sigma_sq * conc
            dy = -(position[1] - grad.source_position[1]) / sigma_sq * conc

            mag = math.sqrt(dx * dx + dy * dy)
            if mag < 1e-10:
                return (0.0, 0.0)

            # Return unit vector in direction of steepest ascent
            return (dx / mag, dy / mag)

        return (0.0, 0.0)

    def step(self, dt_ms: float) -> None:
        """Advance time -- gradients can shift, toxins can spread."""
        self.time_ms += dt_ms
        # Future: time-varying gradients, spreading toxins, etc.

    def get_state(self) -> dict:
        """Full state for visualization."""
        return {
            "time_ms": self.time_ms,
            "arena_radius": self.arena_radius,
            "chemical_gradients": [
                {
                    "name": g.name,
                    "source_position": list(g.source_position),
                    "peak_concentration": g.peak_concentration,
                    "diffusion_radius": g.diffusion_radius,
                    "chemical_type": g.chemical_type,
                }
                for g in self.chemical_gradients
            ],
            "temperature_field": (
                {
                    "cold_position": list(self.temperature_field.cold_position),
                    "hot_position": list(self.temperature_field.hot_position),
                    "cold_temp": self.temperature_field.cold_temp,
                    "hot_temp": self.temperature_field.hot_temp,
                    "preferred_temp": self.temperature_field.preferred_temp,
                }
                if self.temperature_field
                else None
            ),
            "toxic_zones": [
                {
                    "position": list(z.position),
                    "radius": z.radius,
                    "damage_rate": z.damage_rate,
                    "name": z.name,
                }
                for z in self.toxic_zones
            ],
            "social_signals": [
                {
                    "emitter_species": s.emitter_species,
                    "signal_type": s.signal_type,
                    "range": s.range,
                    "intensity": s.intensity,
                    "position": list(s.position),
                }
                for s in self.social_signals
            ],
        }

    # --- Factory methods for standard arenas ---

    @staticmethod
    def create_chemotaxis_arena() -> SensoryWorld:
        """Create a standard NaCl chemotaxis arena matching Bargmann & Horvitz 1991.

        Single NaCl point source at (1.0, 0.5) with Gaussian diffusion.
        """
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(
                name="NaCl",
                source_position=(1.0, 0.5),
                peak_concentration=1.0,
                diffusion_radius=1.5,
            )
        )
        return world

    @staticmethod
    def create_survival_arena() -> SensoryWorld:
        """Arena with food, toxins, and temperature gradient.

        Organisms must navigate toward food odor, avoid a toxic zone,
        and stay in comfortable temperatures.
        """
        world = SensoryWorld()
        world.add_gradient(
            ChemicalGradient(
                name="food_odor",
                source_position=(0.8, 0.8),
                peak_concentration=1.0,
                diffusion_radius=1.5,
            )
        )
        world.add_toxic_zone(
            ToxicZone(position=(-0.5, -0.5), radius=0.4)
        )
        world.set_temperature(TemperatureField())
        return world
