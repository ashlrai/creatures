"""Simulation runner: couples neural engine to body model.

This is the core loop where behavior emerges from connectome architecture.
Each step:
  1. Read body sensors → convert to neural input currents
  2. Step the spiking neural network
  3. Read motor neuron firing rates → convert to muscle activations
  4. Step the physics body
  5. Record state for visualization
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from creatures.body.base import BodyConfig, BodyModel, BodyState
from creatures.connectome.types import Connectome
from creatures.neural.base import NeuralConfig, NeuralEngine, SimulationState

logger = logging.getLogger(__name__)


@dataclass
class CouplingConfig:
    """Configuration for brain-body coupling."""

    # How strongly sensor readings drive neural input (sensor_value * gain = mV input)
    sensor_to_current_gain: float = 50.0

    # How strongly motor neuron firing rates drive muscles
    # firing_rate (Hz) * gain = torque
    firing_rate_to_torque_gain: float = 0.005

    # Inhibitory neuron gain (typically negative to reduce activation)
    inhibitory_gain: float = -0.003

    # Sync interval: how often we transfer between brain and body (ms)
    sync_interval_ms: float = 1.0

    # Neural substeps per sync interval
    neural_substeps: int = 10

    # External stimulus current (mV) for poke events
    poke_current: float = 30.0

    # How long a poke stimulus lasts (ms)
    poke_duration_ms: float = 30.0


@dataclass
class SimFrame:
    """A single frame of the coupled simulation for recording/visualization."""

    t_ms: float
    body_state: BodyState
    neural_state: SimulationState
    sensory_input: dict[str, float]
    muscle_activations: dict[str, float]
    active_neurons: list[str]  # neurons that spiked this frame


class SimulationRunner:
    """Runs the coupled brain-body simulation.

    Connects a NeuralEngine (spiking neural network from real connectome)
    to a BodyModel (physics simulation) through a sensorimotor loop.
    """

    def __init__(
        self,
        neural_engine: NeuralEngine,
        body: BodyModel,
        coupling_config: CouplingConfig | None = None,
        connectome: Connectome | None = None,
    ) -> None:
        self._neural = neural_engine
        self._body = body
        self._config = coupling_config or CouplingConfig()
        self._connectome = connectome
        self._t_ms: float = 0.0
        self._frames: list[SimFrame] = []
        self._external_stimuli: dict[str, float] = {}
        self._poke_segments: list[tuple[str, tuple[float, float, float]]] = []
        # Active pokes: list of (neuron_id, current, remaining_ms)
        self._active_pokes: list[list] = []

    @property
    def t_ms(self) -> float:
        return self._t_ms

    @property
    def frames(self) -> list[SimFrame]:
        return self._frames

    def poke(self, segment: str, force: tuple[float, float, float] = (0, 0.05, 0)) -> None:
        """Apply a poke to a body segment. Also stimulates the mapped sensory neuron."""
        self._poke_segments.append((segment, force))

    def set_stimulus(self, neuron_id: str, current_mV: float) -> None:
        """Set a persistent external stimulus current on a neuron."""
        self._external_stimuli[neuron_id] = current_mV

    def clear_stimuli(self) -> None:
        """Remove all external stimuli."""
        self._external_stimuli.clear()

    def step(self) -> SimFrame:
        """Run one sync interval of the coupled simulation.

        Returns a SimFrame with the state after this step.
        """
        cfg = self._config

        # 1. Read body sensors → neural input currents
        sensory = self._body.get_sensory_input()
        neuron_currents: dict[str, float] = {}

        for neuron_id, sensor_value in sensory.items():
            neuron_currents[neuron_id] = sensor_value * cfg.sensor_to_current_gain

        # Add persistent external stimuli
        for neuron_id, current in self._external_stimuli.items():
            neuron_currents[neuron_id] = neuron_currents.get(neuron_id, 0) + current

        # Register new pokes as persistent stimuli
        sensor_map = self._body.sensor_neuron_map
        for seg_name, force in self._poke_segments:
            self._body.apply_external_force(seg_name, force)

            if sensor_map:
                # Organism-agnostic: use sensor map to find target neurons
                # Direct mapping: if this segment has a mapped sensor neuron
                mapped_neuron = sensor_map.get(seg_name)
                if mapped_neuron:
                    self._active_pokes.append(
                        [mapped_neuron, cfg.poke_current, cfg.poke_duration_ms]
                    )
                else:
                    # Fallback: stimulate all mapped sensory neurons with falloff
                    for i, (sensor_name, neuron_id) in enumerate(sensor_map.items()):
                        falloff = max(0.3, np.exp(-0.5 * (i / max(len(sensor_map) / 3, 1)) ** 2))
                        self._active_pokes.append(
                            [neuron_id, cfg.poke_current * falloff,
                             cfg.poke_duration_ms]
                        )
            else:
                # Legacy C. elegans fallback with hardcoded touch neurons
                _ALL_TOUCH_NEURONS = {
                    "ALML": 2, "ALMR": 3, "AVM": 5, "PLML": 8, "PLMR": 9,
                }
                try:
                    seg_idx = int(seg_name.split("_")[1])
                except (IndexError, ValueError):
                    seg_idx = 5  # default to middle
                for neuron_id, neuron_pos in _ALL_TOUCH_NEURONS.items():
                    distance = abs(seg_idx - neuron_pos)
                    falloff = max(0.3, np.exp(-0.5 * (distance / 4.0) ** 2))
                    self._active_pokes.append(
                        [neuron_id, cfg.poke_current * falloff,
                         cfg.poke_duration_ms]
                    )
        self._poke_segments.clear()

        # Apply active poke stimuli (persist for poke_duration_ms)
        still_active = []
        for poke in self._active_pokes:
            neuron_id, current, remaining = poke
            neuron_currents[neuron_id] = (
                neuron_currents.get(neuron_id, 0) + current
            )
            remaining -= cfg.sync_interval_ms
            if remaining > 0:
                still_active.append([neuron_id, current, remaining])
        self._active_pokes = still_active

        # Set neural input
        self._neural.set_input_currents(neuron_currents)

        # 2. Step neural simulation (single step for reliable spike detection)
        neural_state = self._neural.step(cfg.sync_interval_ms)

        # 3. Read motor neuron firing rates → muscle activations
        firing_rates = self._neural.get_firing_rates()
        motor_map = self._body.motor_neuron_map

        muscle_activations: dict[str, float] = {}

        for neuron_id, actuator_names in motor_map.items():
            rate = firing_rates.get(neuron_id, 0)
            if rate <= 0:
                continue

            # Determine gain based on neuron type (organism-agnostic)
            is_inhibitory = False
            if self._connectome and neuron_id in self._connectome.neurons:
                is_inhibitory = not self._connectome.neurons[neuron_id].is_excitatory
            elif neuron_id.startswith(("DD", "VD")):
                # Legacy C. elegans fallback
                is_inhibitory = True
            gain = cfg.inhibitory_gain if is_inhibitory else cfg.firing_rate_to_torque_gain

            for act_name in actuator_names:
                muscle_activations[act_name] = (
                    muscle_activations.get(act_name, 0) + rate * gain
                )

        # Apply gait patterning for fly locomotion
        if hasattr(self._body, 'leg_joints'):  # FlyBody has this property
            from creatures.body.fly_neuron_map import apply_tripod_gait
            muscle_activations = apply_tripod_gait(muscle_activations, self._t_ms)

        # Clip activations
        for name in muscle_activations:
            muscle_activations[name] = np.clip(muscle_activations[name], -0.5, 0.5)

        # 4. Step body physics
        body_state = self._body.step(muscle_activations)

        self._t_ms += cfg.sync_interval_ms

        # 5. Record frame
        active = []
        if neural_state and neural_state.spikes:
            active = [self._neural.neuron_ids[i] for i in neural_state.spikes]

        frame = SimFrame(
            t_ms=self._t_ms,
            body_state=body_state,
            neural_state=neural_state,
            sensory_input=sensory,
            muscle_activations=muscle_activations,
            active_neurons=active,
        )
        self._frames.append(frame)
        return frame

    def run(self, duration_ms: float, poke_at_ms: float | None = None,
            poke_segment: str | None = None,
            poke_force: tuple[float, float, float] = (0, 0.1, 0)) -> list[SimFrame]:
        """Run the simulation for a duration.

        Args:
            duration_ms: Total simulation time.
            poke_at_ms: Time to apply a poke (None = no poke).
            poke_segment: Which segment to poke.
            poke_force: Force vector for the poke.

        Returns:
            List of SimFrames from the run.
        """
        n_steps = int(duration_ms / self._config.sync_interval_ms)
        start_frames = len(self._frames)

        for i in range(n_steps):
            current_t = self._t_ms

            # Apply poke at specified time
            if poke_at_ms is not None and poke_segment is not None and current_t <= poke_at_ms < current_t + self._config.sync_interval_ms:
                self.poke(poke_segment, poke_force)
                logger.info(f"Poke applied at t={current_t:.0f}ms on {poke_segment}")

            self.step()

            # Log progress
            if (i + 1) % 100 == 0:
                frame = self._frames[-1]
                n_active = len(frame.active_neurons)
                com = frame.body_state.center_of_mass
                logger.info(
                    f"t={frame.t_ms:.0f}ms: {n_active} active neurons, "
                    f"COM=({com[0]:.4f}, {com[1]:.4f})"
                )

        return self._frames[start_frames:]

    def get_movement_trace(self) -> tuple[list[float], list[float], list[float]]:
        """Return (times, x_positions, y_positions) of center of mass."""
        times = [f.t_ms for f in self._frames]
        xs = [f.body_state.center_of_mass[0] for f in self._frames]
        ys = [f.body_state.center_of_mass[1] for f in self._frames]
        return times, xs, ys

    def get_neural_activity_trace(self) -> tuple[list[float], list[int]]:
        """Return (times, spike_counts) over the simulation."""
        times = [f.t_ms for f in self._frames]
        counts = [len(f.active_neurons) for f in self._frames]
        return times, counts
