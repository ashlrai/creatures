"""Structured experiment protocols for reproducible neuroscience.

Provides a declarative way to define experimental protocols (stimulus sequences,
drug applications, lesions, measurements) and run them against the simulation
engine. Produces structured results with automatic control conditions and
statistical comparisons.

Design goals:
  - Reproducibility: same protocol → same results (modulo stochastic noise)
  - Scientific rigor: automatic no-stimulus controls, repeated trials
  - Fluent API: protocol.add_stimulus(...).add_measurement(...).add_poke(...)
  - Preset library: classic C. elegans experiments from the literature

References:
  - Chalfie et al. 1985 — touch withdrawal reflex circuit
  - Mahoney et al. 2006 — aldicarb dose-response
  - Bargmann 2006 — chemosensory circuits and learning
"""

from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from creatures.body.base import BodyConfig
from creatures.body.worm_body import WormBody
from creatures.connectome.openworm import load as load_celegans
from creatures.connectome.types import Connectome
from creatures.experiment.runner import CouplingConfig, SimFrame, SimulationRunner
from creatures.neural.base import MonitorConfig, NeuralConfig
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.pharmacology import PharmacologyEngine

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────


@dataclass
class ExperimentStep:
    """A single step in an experimental protocol.

    Each step executes at a specific simulation time and performs one action:
    stimulus injection, drug application, neuron lesion, poke, or measurement.
    """

    time_ms: float  # when to execute
    action: str  # "stimulus", "drug", "lesion", "measure", "wait", "poke"
    parameters: dict = field(default_factory=dict)  # action-specific parameters
    label: str = ""  # human-readable description


@dataclass
class ExperimentProtocol:
    """A complete experimental protocol.

    Defines a sequence of timed steps (stimuli, drugs, measurements) to execute
    against a simulation. Supports fluent construction via add_* methods.
    """

    name: str
    description: str
    organism: str = "c_elegans"
    steps: list[ExperimentStep] = field(default_factory=list)
    duration_ms: float = 10000.0
    n_repeats: int = 1  # for statistical power
    control: bool = True  # run a no-stimulus control in parallel

    def add_stimulus(
        self,
        time_ms: float,
        neuron_ids: list[str],
        current_mV: float = 25.0,
        duration_ms: float = 50.0,
        label: str = "",
    ) -> ExperimentProtocol:
        """Add a neural stimulus step (inject current into specific neurons)."""
        self.steps.append(
            ExperimentStep(
                time_ms=time_ms,
                action="stimulus",
                parameters={
                    "neuron_ids": neuron_ids,
                    "current_mV": current_mV,
                    "duration_ms": duration_ms,
                },
                label=label or f"Stimulate {neuron_ids} at {current_mV}mV",
            )
        )
        return self

    def add_drug(
        self,
        time_ms: float,
        drug_name: str,
        dose: float = 1.0,
        label: str = "",
    ) -> ExperimentProtocol:
        """Add a drug application step."""
        self.steps.append(
            ExperimentStep(
                time_ms=time_ms,
                action="drug",
                parameters={"drug_name": drug_name, "dose": dose},
                label=label or f"Apply {drug_name} (dose={dose})",
            )
        )
        return self

    def add_lesion(
        self,
        time_ms: float,
        neuron_id: str,
        label: str = "",
    ) -> ExperimentProtocol:
        """Add a neuron lesion step (ablate all synapses to/from a neuron)."""
        self.steps.append(
            ExperimentStep(
                time_ms=time_ms,
                action="lesion",
                parameters={"neuron_id": neuron_id},
                label=label or f"Lesion {neuron_id}",
            )
        )
        return self

    def add_measurement(
        self,
        time_ms: float,
        metric: str,
        label: str = "",
    ) -> ExperimentProtocol:
        """Add a measurement step (record a metric at a specific time)."""
        self.steps.append(
            ExperimentStep(
                time_ms=time_ms,
                action="measure",
                parameters={"metric": metric},
                label=label or f"Measure {metric}",
            )
        )
        return self

    def add_poke(
        self,
        time_ms: float,
        segment: str = "seg_8",
        label: str = "",
    ) -> ExperimentProtocol:
        """Add a mechanical poke step."""
        self.steps.append(
            ExperimentStep(
                time_ms=time_ms,
                action="poke",
                parameters={"segment": segment},
                label=label or f"Poke {segment}",
            )
        )
        return self

    def sorted_steps(self) -> list[ExperimentStep]:
        """Return steps sorted by execution time."""
        return sorted(self.steps, key=lambda s: s.time_ms)


@dataclass
class MeasurementResult:
    """A single measurement from an experiment."""

    time_ms: float
    metric: str
    value: float | dict
    label: str = ""


@dataclass
class ExperimentResult:
    """Complete results from running a protocol.

    Contains all measurements (experimental + control), simulation frames,
    weight changes from STDP, and a computed summary with statistics.
    """

    protocol: ExperimentProtocol
    measurements: list[MeasurementResult]
    control_measurements: list[MeasurementResult] | None  # if control=True
    frames: list[SimFrame]
    weight_changes: dict | None  # if STDP was on
    summary: dict  # computed statistics

    def to_report(self) -> str:
        """Generate a markdown scientific report from the results."""
        lines: list[str] = []
        lines.append(f"# Experiment Report: {self.protocol.name}")
        lines.append("")
        lines.append(f"**Description:** {self.protocol.description}")
        lines.append(f"**Organism:** {self.protocol.organism}")
        lines.append(f"**Duration:** {self.protocol.duration_ms} ms")
        lines.append(f"**Repeats:** {self.protocol.n_repeats}")
        lines.append(f"**Control condition:** {'Yes' if self.protocol.control else 'No'}")
        lines.append("")

        # Protocol steps
        lines.append("## Protocol")
        lines.append("")
        lines.append("| Time (ms) | Action | Parameters | Label |")
        lines.append("|-----------|--------|------------|-------|")
        for step in self.protocol.sorted_steps():
            params_str = ", ".join(f"{k}={v}" for k, v in step.parameters.items())
            lines.append(f"| {step.time_ms} | {step.action} | {params_str} | {step.label} |")
        lines.append("")

        # Measurements
        lines.append("## Results")
        lines.append("")
        if self.measurements:
            lines.append("### Experimental Condition")
            lines.append("")
            lines.append("| Time (ms) | Metric | Value | Label |")
            lines.append("|-----------|--------|-------|-------|")
            for m in self.measurements:
                val_str = f"{m.value:.4f}" if isinstance(m.value, (int, float)) else str(m.value)
                lines.append(f"| {m.time_ms} | {m.metric} | {val_str} | {m.label} |")
            lines.append("")

        if self.control_measurements:
            lines.append("### Control Condition (no stimuli)")
            lines.append("")
            lines.append("| Time (ms) | Metric | Value | Label |")
            lines.append("|-----------|--------|-------|-------|")
            for m in self.control_measurements:
                val_str = f"{m.value:.4f}" if isinstance(m.value, (int, float)) else str(m.value)
                lines.append(f"| {m.time_ms} | {m.metric} | {val_str} | {m.label} |")
            lines.append("")

        # Summary statistics
        lines.append("## Summary Statistics")
        lines.append("")
        for key, value in self.summary.items():
            if isinstance(value, float):
                lines.append(f"- **{key}:** {value:.4f}")
            else:
                lines.append(f"- **{key}:** {value}")
        lines.append("")

        # Weight changes from STDP
        if self.weight_changes:
            lines.append("## Synaptic Weight Changes (STDP)")
            lines.append("")
            lines.append(f"- **Mean change:** {self.weight_changes.get('mean_change', 0):.6f}")
            lines.append(f"- **Max potentiation:** {self.weight_changes.get('max_potentiation', 0):.6f}")
            lines.append(f"- **Max depression:** {self.weight_changes.get('max_depression', 0):.6f}")
            lines.append("")

        lines.append("---")
        lines.append("*Generated by Creatures/Neurevo experiment protocol runner.*")
        return "\n".join(lines)


# ── Experiment Runner ───────────────────────────────────────────────


class ExperimentRunner:
    """Runs an ExperimentProtocol on a simulation.

    Creates its own Brian2Engine, Body, and SimulationRunner internally.
    Executes all protocol steps in time order, records measurements,
    and optionally runs a no-stimulus control for comparison.
    """

    def __init__(self, protocol: ExperimentProtocol) -> None:
        self.protocol = protocol

    def _build_simulation(self) -> tuple[Brian2Engine, WormBody, SimulationRunner, Connectome]:
        """Build a fresh simulation stack for one trial."""
        connectome = load_celegans("edge_list")
        engine = Brian2Engine()
        monitor = MonitorConfig(record_voltages=False)
        engine.build(connectome, NeuralConfig(), monitor)

        body = WormBody(BodyConfig(dt=1.0))
        body.reset()

        coupling = CouplingConfig(poke_current=60.0, poke_duration_ms=50.0)
        runner = SimulationRunner(engine, body, coupling, connectome=connectome)
        return engine, body, runner, connectome

    def _measure(
        self,
        metric: str,
        runner: SimulationRunner,
        engine: Brian2Engine,
        label: str = "",
    ) -> MeasurementResult:
        """Take a measurement from the current simulation state."""
        t_ms = runner.t_ms
        value: float | dict

        if metric == "motor_latency":
            # Time from last poke to first motor neuron spike
            # Scan recent frames for motor/command neuron activity
            motor_prefixes = ("VA", "VB", "DA", "DB", "DD", "VD", "AS",
                              "AVA", "AVB", "AVD", "PVC", "DVA")
            first_motor_t = None
            for frame in runner.frames:
                for n in frame.active_neurons:
                    if any(n.startswith(p) for p in motor_prefixes):
                        first_motor_t = frame.t_ms
                        break
                if first_motor_t is not None:
                    break
            value = first_motor_t if first_motor_t is not None else -1.0

        elif metric == "displacement":
            # Net displacement of center of mass from start
            if len(runner.frames) >= 2:
                start = runner.frames[0].body_state.center_of_mass
                end = runner.frames[-1].body_state.center_of_mass
                dx = end[0] - start[0]
                dy = end[1] - start[1]
                value = float(np.sqrt(dx * dx + dy * dy))
            else:
                value = 0.0

        elif metric == "baseline_activity":
            # Average spike count over recent frames
            recent = runner.frames[-10:] if len(runner.frames) >= 10 else runner.frames
            if recent:
                value = float(np.mean([len(f.active_neurons) for f in recent]))
            else:
                value = 0.0

        elif metric == "motor_activity":
            # Current motor neuron firing rates (sum)
            rates = engine.get_firing_rates()
            motor_prefixes = ("VA", "VB", "DA", "DB", "DD", "VD", "AS")
            motor_rates = [r for nid, r in rates.items() if any(nid.startswith(p) for p in motor_prefixes)]
            value = float(sum(motor_rates))

        elif metric == "motor_symmetry":
            # Ratio of dorsal vs ventral motor activity
            rates = engine.get_firing_rates()
            dorsal = sum(r for nid, r in rates.items() if nid.startswith(("DA", "DB", "DD")))
            ventral = sum(r for nid, r in rates.items() if nid.startswith(("VA", "VB", "VD")))
            total = dorsal + ventral
            value = float(dorsal / total) if total > 0 else 0.5

        elif metric == "withdrawal_response":
            # Whether backward movement occurred (negative y displacement in recent frames)
            if len(runner.frames) >= 20:
                recent_start = runner.frames[-20].body_state.center_of_mass
                recent_end = runner.frames[-1].body_state.center_of_mass
                value = float(recent_end[1] - recent_start[1])
            else:
                value = 0.0

        elif metric == "motor_response":
            # General motor response: any motor neuron activity
            rates = engine.get_firing_rates()
            motor_prefixes = ("VA", "VB", "DA", "DB", "DD", "VD", "AS")
            motor_rates = [r for nid, r in rates.items() if any(nid.startswith(p) for p in motor_prefixes)]
            value = float(sum(motor_rates))

        elif metric == "spike_count":
            # Total spikes across all neurons in recent window
            recent = runner.frames[-10:] if len(runner.frames) >= 10 else runner.frames
            value = float(sum(len(f.active_neurons) for f in recent))

        else:
            # Unknown metric: return total active neuron count as fallback
            logger.warning(f"Unknown metric '{metric}', returning total active count")
            recent = runner.frames[-10:] if len(runner.frames) >= 10 else runner.frames
            value = float(sum(len(f.active_neurons) for f in recent))

        return MeasurementResult(time_ms=t_ms, metric=metric, value=value, label=label)

    def _run_trial(self, is_control: bool = False) -> tuple[list[MeasurementResult], list[SimFrame], dict | None]:
        """Run a single trial of the protocol.

        Args:
            is_control: If True, skip all stimulus/drug/lesion/poke actions
                        (only run measurements at the same times).

        Returns:
            (measurements, frames, weight_changes_or_None)
        """
        engine, body, runner, connectome = self._build_simulation()
        pharma: PharmacologyEngine | None = None
        measurements: list[MeasurementResult] = []

        # Sort steps by time
        sorted_steps = self.protocol.sorted_steps()

        # Pre-compute initial weights for STDP change tracking
        initial_weights = engine.get_synapse_weights().copy()

        # Execute the simulation step-by-step, applying actions at their scheduled times
        step_idx = 0
        sync_interval = 1.0  # ms per simulation step
        n_steps = int(self.protocol.duration_ms / sync_interval)
        _stim_clear_at: float | None = None  # time to clear persistent stimuli

        for i in range(n_steps):
            current_t = runner.t_ms

            # Clear stimuli that have expired
            if _stim_clear_at is not None and current_t >= _stim_clear_at:
                runner.clear_stimuli()
                _stim_clear_at = None

            # Apply all steps whose time has arrived
            while step_idx < len(sorted_steps):
                step = sorted_steps[step_idx]
                if step.time_ms > current_t + sync_interval:
                    break

                if step.action == "measure":
                    # Always take measurements, even in control
                    m = self._measure(
                        step.parameters["metric"], runner, engine, step.label,
                    )
                    measurements.append(m)

                elif not is_control:
                    # Stimulus actions are skipped for control condition
                    if step.action == "stimulus":
                        stim_duration = step.parameters.get("duration_ms", 50.0)
                        for nid in step.parameters.get("neuron_ids", []):
                            runner.set_stimulus(nid, step.parameters.get("current_mV", 25.0))
                        # Schedule stimulus clearance after duration
                        _stim_clear_at = current_t + stim_duration

                    elif step.action == "drug":
                        if pharma is None:
                            pharma = PharmacologyEngine(engine, connectome)
                        pharma.apply_drug(
                            step.parameters["drug_name"],
                            step.parameters.get("dose", 1.0),
                        )

                    elif step.action == "lesion":
                        engine.lesion_neuron(step.parameters["neuron_id"])

                    elif step.action == "poke":
                        runner.poke(step.parameters.get("segment", "seg_8"))
                        # Also stimulate the broader touch circuit to ensure
                        # the poke drives activity through command interneurons.
                        # A real poke activates multiple mechanosensory neurons.
                        touch_circuit = [
                            "PLML", "PLMR", "AVM", "ALML", "ALMR",
                            "ASHL", "ASHR",
                        ]
                        for nid in touch_circuit:
                            runner.set_stimulus(nid, 50.0)
                        _stim_clear_at = current_t + 50.0  # clear poke stimuli after 50ms

                    elif step.action == "wait":
                        pass  # just advance time

                step_idx += 1

            runner.step()

        # Compute weight changes
        final_weights = engine.get_synapse_weights()
        weight_diff = final_weights - initial_weights
        weight_changes = None
        if np.any(np.abs(weight_diff) > 1e-9):
            weight_changes = {
                "mean_change": float(np.mean(weight_diff)),
                "max_potentiation": float(np.max(weight_diff)),
                "max_depression": float(np.min(weight_diff)),
            }

        return measurements, list(runner.frames), weight_changes

    def run(self) -> ExperimentResult:
        """Execute the full protocol including controls and repeats.

        Returns:
            ExperimentResult with all measurements, frames, and statistics.
        """
        logger.info(f"Running protocol: {self.protocol.name} ({self.protocol.n_repeats} repeats)")

        # Run experimental trials
        all_exp_measurements: list[list[MeasurementResult]] = []
        all_frames: list[SimFrame] = []
        last_weight_changes: dict | None = None

        for trial in range(self.protocol.n_repeats):
            logger.info(f"  Trial {trial + 1}/{self.protocol.n_repeats} (experimental)")
            measurements, frames, weight_changes = self._run_trial(is_control=False)
            all_exp_measurements.append(measurements)
            # Keep frames from last trial only (avoid memory bloat)
            all_frames = frames
            last_weight_changes = weight_changes

        # Run control trial if requested
        control_measurements: list[MeasurementResult] | None = None
        if self.protocol.control:
            logger.info("  Running control condition (no stimuli)")
            control_measurements, _, _ = self._run_trial(is_control=True)

        # Aggregate measurements across repeats
        # Use the last trial's measurements as the primary set
        final_measurements = all_exp_measurements[-1] if all_exp_measurements else []

        # Compute summary statistics
        summary = self._compute_summary(all_exp_measurements, control_measurements)

        return ExperimentResult(
            protocol=self.protocol,
            measurements=final_measurements,
            control_measurements=control_measurements,
            frames=all_frames,
            weight_changes=last_weight_changes,
            summary=summary,
        )

    def _compute_summary(
        self,
        all_exp: list[list[MeasurementResult]],
        control: list[MeasurementResult] | None,
    ) -> dict:
        """Compute summary statistics across trials and vs control."""
        summary: dict[str, Any] = {}
        summary["n_trials"] = len(all_exp)

        if not all_exp:
            return summary

        # Gather all unique metrics
        metrics_seen: set[str] = set()
        for trial_measurements in all_exp:
            for m in trial_measurements:
                metrics_seen.add(m.metric)

        # For each metric, compute mean/std across trials
        for metric in sorted(metrics_seen):
            values: list[float] = []
            for trial_measurements in all_exp:
                for m in trial_measurements:
                    if m.metric == metric and isinstance(m.value, (int, float)):
                        values.append(float(m.value))

            if values:
                summary[f"{metric}_mean"] = statistics.mean(values)
                if len(values) > 1:
                    summary[f"{metric}_std"] = statistics.stdev(values)

                # Compare to control if available
                if control:
                    ctrl_values = [
                        float(m.value) for m in control
                        if m.metric == metric and isinstance(m.value, (int, float))
                    ]
                    if ctrl_values:
                        ctrl_mean = statistics.mean(ctrl_values)
                        exp_mean = statistics.mean(values)
                        summary[f"{metric}_control_mean"] = ctrl_mean
                        if ctrl_mean != 0:
                            summary[f"{metric}_vs_control_ratio"] = exp_mean / ctrl_mean
                        else:
                            summary[f"{metric}_vs_control_diff"] = exp_mean - ctrl_mean

        # Total simulation frames
        summary["total_frames"] = sum(
            len(trial) for trial in all_exp
        )

        return summary


# ── Preset Experiments ──────────────────────────────────────────────

PRESET_EXPERIMENTS: dict[str, ExperimentProtocol] = {
    "touch_withdrawal": ExperimentProtocol(
        name="Touch Withdrawal Reflex",
        description="Posterior gentle touch -> backward locomotion (Chalfie et al. 1985)",
        organism="c_elegans",
        steps=[
            ExperimentStep(100, "poke", {"segment": "seg_8"}, "Posterior touch"),
            ExperimentStep(200, "measure", {"metric": "motor_latency"}, "Time to first motor spike"),
            ExperimentStep(500, "measure", {"metric": "displacement"}, "Backward movement"),
        ],
        duration_ms=1000.0,
    ),
    "drug_dose_response": ExperimentProtocol(
        name="Aldicarb Dose-Response",
        description="Progressive paralysis with AChE inhibitor (Mahoney et al. 2006)",
        organism="c_elegans",
        steps=[
            ExperimentStep(0, "measure", {"metric": "baseline_activity"}, "Baseline"),
            ExperimentStep(100, "drug", {"drug_name": "aldicarb", "dose": 0.5}, "Apply aldicarb"),
            ExperimentStep(2000, "measure", {"metric": "motor_activity"}, "Early response"),
            ExperimentStep(5000, "measure", {"metric": "motor_activity"}, "Late response"),
        ],
        duration_ms=10000.0,
    ),
    "gaba_knockout": ExperimentProtocol(
        name="GABA Circuit Knockout",
        description="Block all GABAergic inhibition -> dorsal-ventral imbalance",
        organism="c_elegans",
        steps=[
            ExperimentStep(0, "measure", {"metric": "baseline_activity"}, "Baseline"),
            ExperimentStep(100, "drug", {"drug_name": "picrotoxin", "dose": 1.0}, "Block GABA"),
            ExperimentStep(500, "measure", {"metric": "motor_symmetry"}, "Symmetry after GABA block"),
            ExperimentStep(1000, "poke", {"segment": "seg_8"}, "Posterior poke"),
            ExperimentStep(1500, "measure", {"metric": "withdrawal_response"}, "Withdrawal post-block"),
        ],
        duration_ms=3000.0,
    ),
    "chemotaxis_learning": ExperimentProtocol(
        name="Associative Chemotaxis Learning",
        description="Pair NaCl stimulus with food -> learned attraction",
        organism="c_elegans",
        steps=[
            ExperimentStep(0, "stimulus", {"neuron_ids": ["ASEL", "ASER"], "current_mV": 15}, "NaCl stimulus"),
            ExperimentStep(0, "stimulus", {"neuron_ids": ["AWCL", "AWCR"], "current_mV": 10}, "Food odor"),
            ExperimentStep(500, "measure", {"metric": "motor_response"}, "Motor response to pairing"),
        ],
        duration_ms=1000.0,
        n_repeats=5,
    ),
}
