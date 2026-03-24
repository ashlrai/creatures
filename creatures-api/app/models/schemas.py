"""Pydantic models for API request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ExperimentCreate(BaseModel):
    """Request to create a new experiment."""

    name: str = "default"
    connectome_source: str = "edge_list"  # "edge_list" or "adjacency"
    organism: str = "c_elegans"  # "c_elegans", "drosophila", "zebrafish"

    # Neural config
    weight_scale: float = 3.0
    tau_syn: float = 8.0
    tau_m: float = 15.0

    # Coupling config
    poke_current: float = 50.0
    poke_duration_ms: float = 50.0
    firing_rate_to_torque_gain: float = 0.004
    inhibitory_gain: float = -0.002

    # Drosophila-specific
    neuropils: str | None = None  # brain region preset for fly
    max_neurons: int | None = None  # limit neuron count for testing


class ExperimentInfo(BaseModel):
    """Response with experiment metadata."""

    id: str
    name: str
    organism: str
    n_neurons: int
    n_synapses: int
    status: str  # "ready", "running", "paused", "stopped"
    t_ms: float


class StimulateRequest(BaseModel):
    """Request to stimulate neurons."""

    neuron_ids: list[str]
    current_mV: float = 25.0
    duration_ms: float = 50.0


class PokeRequest(BaseModel):
    """Request to poke a body segment."""

    segment: str = "seg_8"
    force: list[float] = Field(default=[0, 0.15, 0])


class LesionRequest(BaseModel):
    """Request to lesion a synapse or neuron."""

    pre_id: str | None = None
    post_id: str | None = None
    neuron_id: str | None = None  # lesion all synapses of this neuron


class NeuronInfo(BaseModel):
    """Info about a single neuron."""

    id: str
    neuron_type: str
    neurotransmitter: str | None
    firing_rate: float
    degree_in: int
    degree_out: int


class SimulationFrame(BaseModel):
    """A frame of simulation state streamed via WebSocket."""

    t_ms: float
    n_active: int
    spikes: list[int]  # neuron indices that spiked
    firing_rates: list[float]  # all neurons
    body_positions: list[list[float]]  # [[x,y,z], ...] per segment
    joint_angles: list[float]
    center_of_mass: list[float]
    muscle_activations: dict[str, float]
