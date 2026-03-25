"""Neural organism: couples a real spiking neural network to an ecosystem organism.

Each NeuralOrganism wraps a Brian2 LIF simulation of the C. elegans connectome
(299 neurons, ~3400 synapses). Environmental sensory inputs are injected into
biologically identified sensory neurons, and motor neuron firing rates are
decoded into movement commands.

This enables organisms in the ecosystem to make decisions using a *real*
connectome-based neural simulation rather than simple gradient-following rules.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

from creatures.connectome.types import Connectome, NeuronType
from creatures.neural.base import MonitorConfig, NeuralConfig
from creatures.neural.brian2_engine import Brian2Engine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# C. elegans sensory neuron classifications
# ---------------------------------------------------------------------------
# Salt/food chemosensory (bilateral)
_SALT_NEURONS_L = ["ASEL"]
_SALT_NEURONS_R = ["ASER"]

# Volatile odor chemosensory (bilateral)
_ODOR_NEURONS_L = ["AWCL"]
_ODOR_NEURONS_R = ["AWCR"]

# Thermosensory
_THERMO_NEURONS = ["AFDL", "AFDR"]

# Nociceptive / danger (bilateral)
_DANGER_NEURONS_L = ["ASHL"]
_DANGER_NEURONS_R = ["ASHR"]

# Mechanosensory (touch)
_TOUCH_ANTERIOR = ["ALML", "ALMR", "AVM"]  # anterior gentle touch
_TOUCH_POSTERIOR = ["PLML", "PLMR"]  # posterior gentle touch

# Default sensor map: sensory modality -> list of neuron IDs
_DEFAULT_SENSOR_MAP: dict[str, list[str]] = {
    "chemical_left": _SALT_NEURONS_L + _ODOR_NEURONS_L,
    "chemical_right": _SALT_NEURONS_R + _ODOR_NEURONS_R,
    "temperature": _THERMO_NEURONS,
    "danger_left": _DANGER_NEURONS_L,
    "danger_right": _DANGER_NEURONS_R,
    "touch_anterior": _TOUCH_ANTERIOR,
    "touch_posterior": _TOUCH_POSTERIOR,
}

# ---------------------------------------------------------------------------
# C. elegans motor neuron classifications
# ---------------------------------------------------------------------------
# Forward locomotion: ventral A-class and B-class motor neurons
_FORWARD_NEURONS = [
    "VA1", "VA2", "VA3", "VA4", "VA5", "VA6", "VA7", "VA8", "VA9",
    "VA10", "VA11", "VA12",
    "VB1", "VB2", "VB3", "VB4", "VB5", "VB6", "VB7", "VB8", "VB9",
    "VB10", "VB11",
]

# Backward locomotion: dorsal A-class and B-class motor neurons
_BACKWARD_NEURONS = [
    "DA1", "DA2", "DA3", "DA4", "DA5", "DA6", "DA7", "DA8", "DA9",
    "DB1", "DB2", "DB3", "DB4", "DB5", "DB6", "DB7",
]

# Turning: inhibitory motor neurons (GABA) -- differential activation
# causes dorsal/ventral imbalance -> turning
# DD = dorsal inhibitory, VD = ventral inhibitory
_TURN_LEFT_NEURONS = [  # dorsal inhibitory (DD) -> suppress dorsal -> turn left
    "DD1", "DD2", "DD3", "DD4", "DD5", "DD6",
]
_TURN_RIGHT_NEURONS = [  # ventral inhibitory (VD) -> suppress ventral -> turn right
    "VD1", "VD2", "VD3", "VD4", "VD5", "VD6", "VD7",
    "VD8", "VD9", "VD10", "VD11", "VD12", "VD13",
]

_DEFAULT_MOTOR_MAP: dict[str, list[str]] = {
    "forward": _FORWARD_NEURONS,
    "backward": _BACKWARD_NEURONS,
    "turn_left": _TURN_LEFT_NEURONS,
    "turn_right": _TURN_RIGHT_NEURONS,
}

# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------
# Sensory gain: scale environment signal (0-1) to neural current (mV)
_SENSORY_GAIN = 20.0

# Motor output scaling
_SPEED_SCALE = 0.001  # firing rate (Hz) -> arena units per step
_TURN_SCALE = 0.01  # firing rate (Hz) -> radians per step

# Baseline current to keep the network gently active (sub-threshold tonic input)
_BASELINE_CURRENT = 2.0  # mV -- enough to bring neurons near threshold


class NeuralOrganism:
    """An ecosystem organism with a real spiking neural network brain.

    The brain receives sensory inputs from the environment and produces
    motor outputs that control movement. Each NeuralOrganism owns its own
    Brian2Engine instance running the full C. elegans connectome.

    Attributes:
        organism_id: ID of the linked OrganismInstance in the Ecosystem.
        species: Species name (e.g. "c_elegans").
        engine: The Brian2 spiking neural network.
        n_neurons: Number of neurons in the brain.
        n_synapses: Number of synapses in the brain.
    """

    def __init__(
        self,
        organism_id: str,
        species: str,
        connectome: Connectome,
        neural_config: NeuralConfig | None = None,
    ) -> None:
        self.organism_id = organism_id
        self.species = species
        self._connectome = connectome

        # Build the neural network
        self.engine = Brian2Engine()
        self.engine.build(
            connectome,
            config=neural_config or NeuralConfig(),
            monitor=MonitorConfig(record_voltages=False, record_spikes=True),
        )

        self.n_neurons = connectome.n_neurons
        self.n_synapses = connectome.n_synapses

        # Build sensor/motor maps filtered to neurons that exist in connectome
        self._sensor_map = self._build_sensor_map(connectome)
        self._motor_map = self._build_motor_map(connectome)

        logger.info(
            "NeuralOrganism %s: %d neurons, %d synapses, "
            "%d sensory mappings, %d motor mappings",
            organism_id,
            self.n_neurons,
            self.n_synapses,
            sum(len(v) for v in self._sensor_map.values()),
            sum(len(v) for v in self._motor_map.values()),
        )

    def _build_sensor_map(self, connectome: Connectome) -> dict[str, list[str]]:
        """Map environmental inputs to sensory neurons.

        Only includes neurons that actually exist in the connectome, so this
        is safe to use with subsetted connectomes.

        For C. elegans:
          - chemical_left/right -> ASEL/ASER (salt), AWCL/AWCR (odor)
          - temperature -> AFDL, AFDR (thermosensory)
          - danger_left/right -> ASHL/ASHR (nociceptive)
          - touch_anterior -> ALML, ALMR, AVM
          - touch_posterior -> PLML, PLMR
        """
        available = set(connectome.neuron_ids)
        sensor_map: dict[str, list[str]] = {}
        for key, neuron_ids in _DEFAULT_SENSOR_MAP.items():
            filtered = [nid for nid in neuron_ids if nid in available]
            if filtered:
                sensor_map[key] = filtered
        return sensor_map

    def _build_motor_map(self, connectome: Connectome) -> dict[str, list[str]]:
        """Map motor neuron activity to movement commands.

        For C. elegans:
          - Forward: VA, VB neurons active -> move forward
          - Backward: DA, DB neurons active -> move backward
          - Turn left: DD (dorsal inhibitory) -> suppress dorsal -> turn left
          - Turn right: VD (ventral inhibitory) -> suppress ventral -> turn right
        """
        available = set(connectome.neuron_ids)
        motor_map: dict[str, list[str]] = {}
        for key, neuron_ids in _DEFAULT_MOTOR_MAP.items():
            filtered = [nid for nid in neuron_ids if nid in available]
            if filtered:
                motor_map[key] = filtered
        return motor_map

    def sense_and_act(self, sensory_input: dict, dt_ms: float = 1.0) -> dict:
        """Main loop: sense environment -> process in brain -> output movement.

        Args:
            sensory_input: From SensoryWorld.sense_at() -- contains:
                - chemicals: {name: concentration}
                - temperature: float or None
                - toxin_exposure: float
                - social: {signal_type: strength}
                - gradient_direction: {name: (dx, dy)}
            dt_ms: Simulation timestep in milliseconds.

        Returns:
            Movement command: {"speed": float, "turn": float}
        """
        currents: dict[str, float] = {}

        # 1. Inject baseline tonic current to keep network active
        for nid in self.engine.neuron_ids:
            currents[nid] = _BASELINE_CURRENT

        # 2. Convert chemical concentrations to bilateral sensory input
        chemicals = sensory_input.get("chemicals", {})
        total_chemical = sum(chemicals.values()) if chemicals else 0.0

        if total_chemical > 0:
            # Inject into left/right chemosensory neurons equally (scalar)
            for nid in self._sensor_map.get("chemical_left", []):
                currents[nid] = currents.get(nid, 0.0) + total_chemical * _SENSORY_GAIN
            for nid in self._sensor_map.get("chemical_right", []):
                currents[nid] = currents.get(nid, 0.0) + total_chemical * _SENSORY_GAIN

        # 3. Inject gradient direction as differential left/right input
        #    This is how real chemotaxis works: bilateral comparison of
        #    chemical concentration drives turning behavior.
        gradient_direction = sensory_input.get("gradient_direction", {})
        if gradient_direction:
            for chem_name, direction in gradient_direction.items():
                if not isinstance(direction, (list, tuple)) or len(direction) < 2:
                    continue
                dx, dy = direction[0], direction[1]
                # Compute angle of gradient relative to organism heading
                # We don't have heading here, so use raw left/right decomposition:
                # positive dx = gradient to the right, negative = to the left
                # This is a simplification; in reality the organism's heading
                # would rotate the gradient into body-frame coordinates.
                # The ecosystem step() handles heading, so we use world-frame
                # gradient magnitude as a proxy.
                grad_mag = math.sqrt(dx * dx + dy * dy)
                if grad_mag < 1e-8:
                    continue

                # Left sensors get more input when gradient points left (-x)
                # Right sensors get more input when gradient points right (+x)
                # This differential drives turning via the connectome
                left_signal = max(0.0, -dx / grad_mag) * grad_mag
                right_signal = max(0.0, dx / grad_mag) * grad_mag

                for nid in self._sensor_map.get("chemical_left", []):
                    currents[nid] = currents.get(nid, 0.0) + left_signal * _SENSORY_GAIN
                for nid in self._sensor_map.get("chemical_right", []):
                    currents[nid] = currents.get(nid, 0.0) + right_signal * _SENSORY_GAIN

        # 4. Temperature input
        temperature = sensory_input.get("temperature")
        if temperature is not None:
            # Thermosensory neurons respond to temperature deviation
            # from preferred (20C). Stronger signal = farther from preferred.
            temp_signal = abs(temperature - 20.0) / 10.0  # normalize
            temp_signal = min(temp_signal, 1.0)
            for nid in self._sensor_map.get("temperature", []):
                currents[nid] = currents.get(nid, 0.0) + temp_signal * _SENSORY_GAIN

        # 5. Danger / toxin input
        toxin = sensory_input.get("toxin_exposure", 0.0)
        if toxin > 0:
            danger_signal = min(toxin / 5.0, 1.0)  # normalize
            for nid in self._sensor_map.get("danger_left", []):
                currents[nid] = currents.get(nid, 0.0) + danger_signal * _SENSORY_GAIN
            for nid in self._sensor_map.get("danger_right", []):
                currents[nid] = currents.get(nid, 0.0) + danger_signal * _SENSORY_GAIN

        # 6. Step the neural network
        self.engine.set_input_currents(currents)
        state = self.engine.step(dt_ms)

        # 7. Read motor output and compute movement
        rates = self.engine.get_firing_rates()
        movement = self._compute_movement(rates)

        return movement

    def _compute_movement(self, firing_rates: dict[str, float]) -> dict:
        """Convert motor neuron firing rates to movement commands.

        Forward/backward rates produce speed; differential turn_left/turn_right
        rates produce angular velocity. This mirrors how C. elegans locomotion
        is actually controlled: VA/VB drive forward crawling, DA/DB drive
        reversals, and DD/VD imbalance causes omega-turns.
        """
        forward_rate = sum(
            firing_rates.get(n, 0.0) for n in self._motor_map.get("forward", [])
        )
        backward_rate = sum(
            firing_rates.get(n, 0.0) for n in self._motor_map.get("backward", [])
        )
        left_rate = sum(
            firing_rates.get(n, 0.0) for n in self._motor_map.get("turn_left", [])
        )
        right_rate = sum(
            firing_rates.get(n, 0.0) for n in self._motor_map.get("turn_right", [])
        )

        speed = (forward_rate - backward_rate) * _SPEED_SCALE
        turn = (right_rate - left_rate) * _TURN_SCALE

        return {"speed": speed, "turn": turn}

    def get_neural_stats(self) -> dict:
        """Return summary statistics about the neural brain."""
        rates = self.engine.get_firing_rates()
        active = sum(1 for r in rates.values() if r > 0.1)
        return {
            "organism_id": self.organism_id,
            "species": self.species,
            "n_neurons": self.n_neurons,
            "n_synapses": self.n_synapses,
            "active_neurons": active,
            "sensor_groups": list(self._sensor_map.keys()),
            "motor_groups": list(self._motor_map.keys()),
        }
