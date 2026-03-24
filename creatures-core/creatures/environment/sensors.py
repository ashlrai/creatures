"""Sensory mapper: converts arena state to neuron input currents.

Maps environmental signals (food gradient, touch) to specific C. elegans
sensory neuron currents for chemotaxis and mechanosensation.

C. elegans chemosensory neurons:
  - ASE (ASEL/ASER): primary salt/food chemosensors
  - AWA (AWAL/AWAR): attractive volatile chemosensors
  - AWC (AWCL/AWCR): volatile chemosensors (ON/OFF asymmetry)

These neurons receive left/right gradient signals and drive turning
behavior through downstream interneurons (AIY, AIZ, AIB, etc).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from creatures.environment.arena import ArenaState

logger = logging.getLogger(__name__)

# C. elegans chemosensory neurons and their laterality
CHEMOSENSORY_NEURONS: dict[str, str] = {
    "ASEL": "left",
    "ASER": "right",
    "AWAL": "left",
    "AWAR": "right",
    "AWCL": "left",
    "AWCR": "right",
}

# Default scaling: gradient signal * gain = input current (mV)
# 15 mV is strong enough to influence spiking behavior in LIF neurons
DEFAULT_CHEMOSENSORY_GAIN: float = 15.0

# Touch neuron pass-through gain (already scaled by body sensor_gain)
DEFAULT_TOUCH_GAIN: float = 1.0


@dataclass
class SensoryConfig:
    """Configuration for sensory mapping."""

    chemosensory_gain: float = DEFAULT_CHEMOSENSORY_GAIN
    touch_gain: float = DEFAULT_TOUCH_GAIN
    # Per-neuron gain multipliers (for asymmetric sensing)
    neuron_weights: dict[str, float] | None = None


class SensoryMapper:
    """Maps arena and body sensor data to neural input currents.

    Converts food gradients into chemosensory neuron currents and
    passes through touch sensor data from the body model.
    """

    def __init__(
        self,
        organism: str = "c_elegans",
        config: SensoryConfig | None = None,
    ) -> None:
        self._organism = organism
        self._config = config or SensoryConfig()

        if organism != "c_elegans":
            raise ValueError(
                f"Unsupported organism: {organism}. Only 'c_elegans' is supported."
            )

        # Build lookup for neuron weights
        self._neuron_weights: dict[str, float] = {}
        for neuron_id in CHEMOSENSORY_NEURONS:
            weight = 1.0
            if self._config.neuron_weights and neuron_id in self._config.neuron_weights:
                weight = self._config.neuron_weights[neuron_id]
            self._neuron_weights[neuron_id] = weight

    def compute_currents(
        self,
        arena_state: ArenaState,
        touch_data: dict[str, float] | None = None,
    ) -> dict[str, float]:
        """Compute input currents for all sensory neurons.

        Combines chemosensory gradient signals with touch sensor data
        to produce a dict of {neuron_id: current_mV}.

        Args:
            arena_state: Current state from Arena.step().
            touch_data: Touch sensor readings from BodyModel.get_sensory_input().
                Maps {neuron_id: force_value} for mechanosensory neurons.

        Returns:
            {neuron_id: current_mV} for all active sensory neurons.
        """
        currents: dict[str, float] = {}
        cfg = self._config

        # --- Chemosensory currents from food gradient ---
        left_signal, right_signal = arena_state.food_gradient

        for neuron_id, side in CHEMOSENSORY_NEURONS.items():
            if side == "left":
                signal = left_signal
            else:
                signal = right_signal

            current = signal * cfg.chemosensory_gain * self._neuron_weights[neuron_id]

            if current > 0.0:
                currents[neuron_id] = current

        # --- Touch currents (pass through from body sensors) ---
        if touch_data:
            for neuron_id, force_value in touch_data.items():
                scaled = force_value * cfg.touch_gain
                if scaled > 0.0:
                    # Accumulate with any existing current
                    currents[neuron_id] = currents.get(neuron_id, 0.0) + scaled

        return currents

    @property
    def chemosensory_neurons(self) -> dict[str, str]:
        """Return the chemosensory neuron map {id: side}."""
        return dict(CHEMOSENSORY_NEURONS)

    @property
    def organism(self) -> str:
        return self._organism
