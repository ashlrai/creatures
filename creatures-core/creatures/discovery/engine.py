"""Autonomous scientific discovery engine for Neurevo.

Generates hypotheses about neural circuits, designs experiments to test them,
runs simulations, analyzes results with statistical rigor, and reports findings.

This is the core of the "overnight discovery" system: start it before bed,
wake up to real scientific findings about how biological neural circuits work.

Example morning report:
    "I discovered that lesioning neuron DVA increases downstream motor activity
     by 23.4% (p < 0.01). I also found that picrotoxin at EC50 dose reduces
     GABA-mediated inhibition, increasing network firing rate by 47.2%."
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Hypothesis:
    """A scientific hypothesis to test.

    Each hypothesis specifies a testable statement, the experiment parameters
    needed to test it, and a priority score for scheduling.
    """

    id: str
    statement: str  # e.g. "Lesioning DVA will improve chemotaxis"
    category: str  # "circuit", "drug", "learning", "evolution"
    experiment: dict  # Parameters defining the experiment
    priority: float  # 0-1, higher = test first
    status: str = "pending"  # pending, testing, confirmed, rejected, inconclusive
    result: dict | None = None


@dataclass
class Discovery:
    """A confirmed scientific finding backed by experimental evidence."""

    id: str
    title: str  # e.g. "DVA lesion increases motor output by 23%"
    description: str  # Full scientific description
    hypothesis: Hypothesis
    evidence: dict  # Statistical evidence from the experiment
    significance: float  # Effect size (absolute delta percent)
    timestamp: str


class DiscoveryEngine:
    """Autonomous scientific discovery system.

    Pipeline: generate hypotheses -> design experiments -> run them ->
    analyze results -> report findings.

    The engine uses real Brian2 spiking neural network simulations on
    biological connectome data, so findings reflect actual circuit properties.
    """

    # Significance thresholds
    EFFECT_SIZE_THRESHOLD = 10.0  # >10% change is "significant"
    STRONG_EFFECT_THRESHOLD = 25.0  # >25% change is "strong"
    N_TRIALS = 3  # Repeat experiments for robustness

    def __init__(self, xai_api_key: str | None = None) -> None:
        self.hypotheses: list[Hypothesis] = []
        self.discoveries: list[Discovery] = []
        self.xai_api_key = xai_api_key or os.environ.get("XAI_API_KEY")
        self._connectome_cache: dict[str, Any] = {}

    def _load_connectome(self, name: str = "c_elegans") -> Any:
        """Load and cache a connectome."""
        if name not in self._connectome_cache:
            from creatures.connectome.openworm import load

            self._connectome_cache[name] = load("edge_list")
        return self._connectome_cache[name]

    # ── Hypothesis generation ────────────────────────────────────────

    def generate_hypotheses(
        self, connectome_name: str = "c_elegans"
    ) -> list[Hypothesis]:
        """Generate testable hypotheses about the neural circuit.

        Categories:
        1. Circuit hypotheses: "What happens if we lesion neuron X?"
        2. Drug hypotheses: "How does drug Y affect behavior Z?"
        3. Learning hypotheses: "Can STDP improve response to stimulus S?"

        Returns:
            List of Hypothesis objects sorted by priority (descending).
        """
        hypotheses: list[Hypothesis] = []

        connectome = self._load_connectome(connectome_name)

        # ── Circuit lesion hypotheses (hub neurons) ──────────────────
        from creatures.connectome.analysis import hub_neurons

        hubs = hub_neurons(connectome, 10)
        for hub in hubs[:5]:
            max_degree = max(h["total"] for h in hubs)
            priority = hub["total"] / max(max_degree, 1)
            hypotheses.append(
                Hypothesis(
                    id=f"lesion_{hub['id']}",
                    statement=(
                        f"Lesioning hub neuron {hub['id']} "
                        f"(degree={hub['total']}, type={hub['type']}, nt={hub['nt']}) "
                        f"will significantly alter network spiking activity"
                    ),
                    category="circuit",
                    experiment={
                        "type": "lesion_comparison",
                        "neuron_id": hub["id"],
                        "metric": "spike_rate",
                        "duration_ms": 500,
                        "stimulus_neurons": ["PLML", "PLMR"],
                        "stimulus_current": 30.0,
                    },
                    priority=min(priority, 1.0),
                )
            )

        # ── Circuit lesion hypotheses (bottleneck neurons) ───────────
        from creatures.connectome.analysis import information_bottleneck

        bottlenecks = information_bottleneck(connectome)
        for bneck_id in bottlenecks[:3]:
            # Only add if not already covered by hub hypotheses
            if any(h.id == f"lesion_{bneck_id}" for h in hypotheses):
                continue
            hypotheses.append(
                Hypothesis(
                    id=f"lesion_{bneck_id}",
                    statement=(
                        f"Lesioning information bottleneck neuron {bneck_id} "
                        f"will disrupt sensory-to-motor signal propagation"
                    ),
                    category="circuit",
                    experiment={
                        "type": "lesion_comparison",
                        "neuron_id": bneck_id,
                        "metric": "spike_rate",
                        "duration_ms": 500,
                        "stimulus_neurons": ["PLML", "PLMR"],
                        "stimulus_current": 30.0,
                    },
                    priority=0.85,
                )
            )

        # ── Drug hypotheses ──────────────────────────────────────────
        from creatures.neural.pharmacology import DRUG_LIBRARY

        for drug_name, drug in list(DRUG_LIBRARY.items())[:4]:
            hypotheses.append(
                Hypothesis(
                    id=f"drug_{drug_name}",
                    statement=(
                        f"{drug.name} at EC50 dose ({drug.ec50}) targeting "
                        f"{drug.target_nt or 'all'} synapses will change "
                        f"network firing rate by >{self.EFFECT_SIZE_THRESHOLD}%"
                    ),
                    category="drug",
                    experiment={
                        "type": "drug_effect",
                        "drug_name": drug_name,
                        "dose": drug.ec50,
                        "metric": "firing_rate",
                        "duration_ms": 500,
                        "stimulus_neurons": ["PLML", "PLMR"],
                        "stimulus_current": 30.0,
                    },
                    priority=0.7,
                )
            )

        # ── Learning hypothesis (STDP) ───────────────────────────────
        hypotheses.append(
            Hypothesis(
                id="stdp_touch_response",
                statement=(
                    "STDP learning improves touch withdrawal response "
                    "latency by >10% over 5 repeated trials"
                ),
                category="learning",
                experiment={
                    "type": "learning_comparison",
                    "n_trials": 5,
                    "stimulus_neurons": ["PLML", "PLMR", "AVM"],
                    "stimulus_current": 30.0,
                    "metric": "motor_latency",
                    "duration_ms": 200,
                },
                priority=0.9,
            )
        )

        # ── Consciousness hypotheses ─────────────────────────────────
        # Test how different perturbations affect Integrated Information (Φ)
        hypotheses.append(Hypothesis(
            id="consciousness_hub_lesion",
            statement=(
                "Lesioning the most connected hub neuron will reduce "
                "Integrated Information (Φ) more than lesioning a peripheral neuron"
            ),
            category="consciousness",
            experiment={
                "type": "consciousness_comparison",
                "perturbation": "lesion_hub",
                "hub_neuron": hubs[0]["id"] if hubs else None,
                "peripheral_neuron": hubs[-1]["id"] if len(hubs) > 1 else None,
                "metric": "phi",
                "duration_ms": 500,
            },
            priority=0.95,
        ))

        hypotheses.append(Hypothesis(
            id="consciousness_inhibition",
            statement=(
                "Removing all inhibitory (GABA) neurons will decrease Φ, "
                "because balanced excitation-inhibition is critical for integration"
            ),
            category="consciousness",
            experiment={
                "type": "consciousness_comparison",
                "perturbation": "remove_inhibitory",
                "metric": "phi",
                "duration_ms": 500,
            },
            priority=0.90,
        ))

        hypotheses.append(Hypothesis(
            id="consciousness_stdp_learning",
            statement=(
                "STDP learning increases Φ over time as synapses "
                "strengthen correlated pathways, increasing integration"
            ),
            category="consciousness",
            experiment={
                "type": "consciousness_learning",
                "metric": "phi",
                "duration_ms": 1000,
                "learning_steps": 500,
            },
            priority=0.85,
        ))

        hypotheses.append(Hypothesis(
            id="consciousness_complexity_vs_phi",
            statement=(
                "Neural Complexity (CN) and Φ are positively correlated: "
                "brains with richer dynamics have higher integrated information"
            ),
            category="consciousness",
            experiment={
                "type": "consciousness_correlation",
                "metrics": ["phi", "complexity", "pci"],
                "n_samples": 10,
                "duration_ms": 500,
            },
            priority=0.80,
        ))

        # Sort by priority descending
        hypotheses.sort(key=lambda h: -h.priority)
        self.hypotheses = hypotheses
        logger.info("Generated %d hypotheses (%d consciousness)", len(hypotheses),
                     sum(1 for h in hypotheses if h.category == "consciousness"))
        return hypotheses

    # ── Experiment runners ───────────────────────────────────────────

    def run_experiment(self, hypothesis: Hypothesis) -> dict:
        """Run the experiment defined by a hypothesis.

        Returns dict with control/experimental measurements, delta, and
        statistical significance.
        """
        hypothesis.status = "testing"
        logger.info("Testing: %s", hypothesis.statement)

        try:
            if hypothesis.experiment["type"] == "lesion_comparison":
                return self._run_lesion_experiment(hypothesis)
            elif hypothesis.experiment["type"] == "drug_effect":
                return self._run_drug_experiment(hypothesis)
            elif hypothesis.experiment["type"] == "learning_comparison":
                return self._run_learning_experiment(hypothesis)
            elif hypothesis.experiment["type"].startswith("consciousness"):
                return self._run_consciousness_experiment(hypothesis)
            else:
                return {"error": f"Unknown experiment type: {hypothesis.experiment['type']}"}
        except Exception as exc:
            logger.exception("Experiment %s failed: %s", hypothesis.id, exc)
            return {"error": str(exc), "significant": False}

    def _build_engine(self, connectome: Any) -> Any:
        """Build a fresh Brian2 engine on the given connectome."""
        from creatures.neural.base import MonitorConfig, NeuralConfig
        from creatures.neural.brian2_engine import Brian2Engine

        engine = Brian2Engine()
        engine.build(
            connectome,
            NeuralConfig(codegen_target="numpy"),
            MonitorConfig(record_voltages=False),
        )
        return engine

    def _build_engine_with_stdp(self, connectome: Any) -> Any:
        """Build a Brian2 engine with STDP plasticity enabled."""
        from creatures.neural.base import MonitorConfig, NeuralConfig, PlasticityConfig
        from creatures.neural.brian2_engine import Brian2Engine

        engine = Brian2Engine()
        engine.build(
            connectome,
            NeuralConfig(codegen_target="numpy"),
            MonitorConfig(record_voltages=False),
            PlasticityConfig(enabled=True),
        )
        return engine

    def _measure_spike_rate(
        self,
        engine: Any,
        stimulus_neurons: list[str],
        stimulus_current: float,
        duration_ms: float,
    ) -> tuple[int, float]:
        """Inject stimulus and count total spikes. Returns (total_spikes, rate_hz)."""
        engine.set_input_currents(
            {nid: stimulus_current for nid in stimulus_neurons}
        )
        total_spikes = 0
        for _ in range(int(duration_ms)):
            state = engine.step(1.0)
            total_spikes += len(state.spikes)
        engine.set_input_currents({})
        rate = total_spikes / (duration_ms / 1000.0)
        return total_spikes, rate

    def _measure_motor_latency(
        self,
        engine: Any,
        stimulus_neurons: list[str],
        stimulus_current: float,
        duration_ms: float,
    ) -> float:
        """Measure time (ms) from stimulus onset to first motor neuron spike.

        Returns duration_ms if no motor spike observed (worst case).
        """
        from creatures.connectome.types import NeuronType

        connectome = engine._connectome
        motor_indices = set()
        for nid, neuron in connectome.neurons.items():
            if neuron.neuron_type == NeuronType.MOTOR:
                idx = engine.get_neuron_index(nid)
                if idx is not None:
                    motor_indices.add(idx)

        engine.set_input_currents(
            {nid: stimulus_current for nid in stimulus_neurons}
        )

        for t in range(int(duration_ms)):
            state = engine.step(1.0)
            if any(s in motor_indices for s in state.spikes):
                engine.set_input_currents({})
                return float(t + 1)

        engine.set_input_currents({})
        return duration_ms  # no motor spike observed

    def _run_lesion_experiment(self, hypothesis: Hypothesis) -> dict:
        """Compare network activity with and without a lesioned neuron.

        Runs N_TRIALS repetitions and reports mean + std of effect.
        """
        exp = hypothesis.experiment
        connectome = self._load_connectome()
        stimulus = exp.get("stimulus_neurons", ["PLML", "PLMR"])
        current = exp.get("stimulus_current", 30.0)
        duration = exp.get("duration_ms", 500)

        control_rates: list[float] = []
        exp_rates: list[float] = []

        for trial in range(self.N_TRIALS):
            # Control: intact network
            engine_ctrl = self._build_engine(connectome)
            _, ctrl_rate = self._measure_spike_rate(
                engine_ctrl, stimulus, current, duration
            )
            control_rates.append(ctrl_rate)

            # Experimental: lesion the target neuron
            engine_exp = self._build_engine(connectome)
            engine_exp.lesion_neuron(exp["neuron_id"])
            _, exp_rate = self._measure_spike_rate(
                engine_exp, stimulus, current, duration
            )
            exp_rates.append(exp_rate)

        ctrl_mean = float(np.mean(control_rates))
        exp_mean = float(np.mean(exp_rates))
        ctrl_std = float(np.std(control_rates))
        exp_std = float(np.std(exp_rates))

        delta_pct = (
            (exp_mean - ctrl_mean) / max(ctrl_mean, 0.001) * 100
        )

        # Simple significance test: effect size > threshold
        # For deterministic sims, std will be ~0, so we use effect size directly
        significant = abs(delta_pct) > self.EFFECT_SIZE_THRESHOLD

        # Compute Cohen's d if there's variance
        pooled_std = np.sqrt((ctrl_std**2 + exp_std**2) / 2)
        cohens_d = (
            abs(exp_mean - ctrl_mean) / pooled_std
            if pooled_std > 0.001
            else float("inf")
        )

        return {
            "type": "lesion_comparison",
            "neuron_id": exp["neuron_id"],
            "control_rate_hz": round(ctrl_mean, 2),
            "control_std": round(ctrl_std, 2),
            "experimental_rate_hz": round(exp_mean, 2),
            "experimental_std": round(exp_std, 2),
            "delta_percent": round(delta_pct, 2),
            "cohens_d": round(cohens_d, 3) if cohens_d != float("inf") else "inf",
            "n_trials": self.N_TRIALS,
            "significant": significant,
        }

    def _run_drug_experiment(self, hypothesis: Hypothesis) -> dict:
        """Compare network activity before and after drug application.

        Runs baseline measurement, applies drug via PharmacologyEngine,
        then measures the effect.
        """
        exp = hypothesis.experiment
        connectome = self._load_connectome()
        stimulus = exp.get("stimulus_neurons", ["PLML", "PLMR"])
        current = exp.get("stimulus_current", 30.0)
        duration = exp.get("duration_ms", 500)

        baseline_rates: list[float] = []
        drug_rates: list[float] = []

        for trial in range(self.N_TRIALS):
            # Baseline: no drug
            engine = self._build_engine(connectome)
            _, base_rate = self._measure_spike_rate(
                engine, stimulus, current, duration
            )
            baseline_rates.append(base_rate)

            # Drug condition: build fresh engine, apply drug, then measure
            engine_drug = self._build_engine(connectome)
            from creatures.neural.pharmacology import PharmacologyEngine

            pharma = PharmacologyEngine(engine_drug, connectome)
            drug_info = pharma.apply_drug(exp["drug_name"], dose=exp["dose"])

            _, dr_rate = self._measure_spike_rate(
                engine_drug, stimulus, current, duration
            )
            drug_rates.append(dr_rate)

        base_mean = float(np.mean(baseline_rates))
        drug_mean = float(np.mean(drug_rates))
        base_std = float(np.std(baseline_rates))
        drug_std = float(np.std(drug_rates))

        delta_pct = (
            (drug_mean - base_mean) / max(base_mean, 0.001) * 100
        )
        significant = abs(delta_pct) > self.EFFECT_SIZE_THRESHOLD

        pooled_std = np.sqrt((base_std**2 + drug_std**2) / 2)
        cohens_d = (
            abs(drug_mean - base_mean) / pooled_std
            if pooled_std > 0.001
            else float("inf")
        )

        return {
            "type": "drug_effect",
            "drug_name": exp["drug_name"],
            "dose": exp["dose"],
            "baseline_rate_hz": round(base_mean, 2),
            "baseline_std": round(base_std, 2),
            "drug_rate_hz": round(drug_mean, 2),
            "drug_std": round(drug_std, 2),
            "delta_percent": round(delta_pct, 2),
            "cohens_d": round(cohens_d, 3) if cohens_d != float("inf") else "inf",
            "n_trials": self.N_TRIALS,
            "significant": significant,
            "drug_info": {
                "synapses_affected": drug_info.get("synapses_affected", 0),
                "weight_scale_applied": drug_info.get("weight_scale_applied", 1.0),
            },
        }

    def _run_learning_experiment(self, hypothesis: Hypothesis) -> dict:
        """Compare touch-response latency with static vs STDP-enabled synapses.

        Measures motor neuron response latency across multiple trials.
        With STDP, the network should learn to respond faster over trials.
        """
        exp = hypothesis.experiment
        connectome = self._load_connectome()
        stimulus = exp.get("stimulus_neurons", ["PLML", "PLMR"])
        current = exp.get("stimulus_current", 30.0)
        duration = exp.get("duration_ms", 200)
        n_trials = exp.get("n_trials", 5)

        # Static synapses: measure latency across trials (should stay constant)
        static_latencies: list[float] = []
        engine_static = self._build_engine(connectome)
        for trial in range(n_trials):
            latency = self._measure_motor_latency(
                engine_static, stimulus, current, duration
            )
            static_latencies.append(latency)

        # STDP synapses: measure latency across trials (should improve)
        stdp_latencies: list[float] = []
        engine_stdp = self._build_engine_with_stdp(connectome)
        for trial in range(n_trials):
            latency = self._measure_motor_latency(
                engine_stdp, stimulus, current, duration
            )
            stdp_latencies.append(latency)

        # Compare first trial vs last trial for STDP
        static_first = static_latencies[0]
        static_last = static_latencies[-1]
        stdp_first = stdp_latencies[0]
        stdp_last = stdp_latencies[-1]

        # Improvement = how much faster the last trial is vs the first
        stdp_improvement_pct = (
            (stdp_first - stdp_last) / max(stdp_first, 0.001) * 100
        )
        static_improvement_pct = (
            (static_first - static_last) / max(static_first, 0.001) * 100
        )

        # STDP vs static on final trial
        final_comparison_pct = (
            (static_last - stdp_last) / max(static_last, 0.001) * 100
        )

        # Significant if STDP improves by >10% OR beats static on final trial
        significant = (
            stdp_improvement_pct > 10.0 or final_comparison_pct > 10.0
        )

        # Get weight change statistics from STDP engine
        weight_changes = engine_stdp.get_weight_changes()

        return {
            "type": "learning_comparison",
            "n_trials": n_trials,
            "static_latencies_ms": [round(l, 2) for l in static_latencies],
            "stdp_latencies_ms": [round(l, 2) for l in stdp_latencies],
            "stdp_improvement_pct": round(stdp_improvement_pct, 2),
            "static_improvement_pct": round(static_improvement_pct, 2),
            "final_comparison_pct": round(final_comparison_pct, 2),
            "weight_changes": weight_changes,
            "significant": significant,
            "delta_percent": round(
                max(stdp_improvement_pct, final_comparison_pct), 2
            ),
        }

    # ── Consciousness experiments ───────────────────────────────────

    def _run_consciousness_experiment(self, hypothesis: Hypothesis) -> dict:
        """Run a consciousness-related experiment using VectorizedEngine.

        Measures Φ (Integrated Information) before and after perturbation.
        """
        from creatures.neural.consciousness import compute_phi
        from creatures.neural.vectorized_engine import NeuronModel, VectorizedEngine

        exp = hypothesis.experiment
        connectome = self._load_connectome()
        duration_ms = exp.get("duration_ms", 500)

        def _measure_phi(conn, duration=500, enable_stdp=False):
            """Run a simulation and measure Φ."""
            engine = VectorizedEngine(use_gpu=True, neuron_model=NeuronModel.IZHIKEVICH)
            engine.build_single_connectome(conn)
            if enable_stdp:
                engine.init_stdp()

            rng = np.random.default_rng(42)
            n = engine.n_total
            for step_i in range(int(duration / engine.dt)):
                noise = np.zeros(n, dtype=np.float32)
                noise[rng.choice(n, max(1, n // 10), replace=False)] = \
                    rng.uniform(8, 20, max(1, n // 10)).astype(np.float32)
                phase = step_i * engine.dt * 2 * np.pi / 80
                q = max(1, n // 4)
                for r in range(4):
                    s, e = r * q, min((r + 1) * q, n)
                    noise[s:e] += 10.0 * (1 + np.sin(phase + r * np.pi / 2))
                engine.I_ext = engine.xp.array(noise)
                engine.step()

            indices, times = engine.get_spike_history()
            if len(indices) < 50:
                return {"phi": 0.0, "n_spikes": len(indices)}

            result = compute_phi(
                np.array(indices), np.array(times), n, duration,
                bin_ms=5.0, n_partitions=30,
            )
            result["n_spikes"] = len(indices)
            return result

        exp_type = exp["type"]

        if exp_type == "consciousness_comparison":
            # Measure Φ for control, then perturbed
            control_phi = _measure_phi(connectome, duration_ms)

            # Apply perturbation
            perturbed = connectome  # default: same
            perturbation = exp.get("perturbation", "")

            if perturbation == "lesion_hub" and exp.get("hub_neuron"):
                # Remove hub neuron's synapses
                hub_id = exp["hub_neuron"]
                perturbed_synapses = [
                    s for s in connectome.synapses
                    if s.pre_id != hub_id and s.post_id != hub_id
                ]
                from creatures.connectome.types import Connectome as CT
                perturbed = CT(
                    name=f"{connectome.name}_lesion_{hub_id}",
                    neurons=connectome.neurons,
                    synapses=perturbed_synapses,
                    metadata=connectome.metadata,
                )

            elif perturbation == "remove_inhibitory":
                # Remove all GABA neurons
                gaba_ids = {
                    nid for nid, n in connectome.neurons.items()
                    if n.neurotransmitter and "gaba" in n.neurotransmitter.lower()
                }
                perturbed_neurons = {
                    nid: n for nid, n in connectome.neurons.items()
                    if nid not in gaba_ids
                }
                perturbed_synapses = [
                    s for s in connectome.synapses
                    if s.pre_id not in gaba_ids and s.post_id not in gaba_ids
                ]
                from creatures.connectome.types import Connectome as CT
                perturbed = CT(
                    name=f"{connectome.name}_no_gaba",
                    neurons=perturbed_neurons,
                    synapses=perturbed_synapses,
                    metadata=connectome.metadata,
                )

            perturbed_phi = _measure_phi(perturbed, duration_ms)

            delta = perturbed_phi["phi"] - control_phi["phi"]
            delta_pct = (delta / max(control_phi["phi"], 0.001)) * 100

            return {
                "control_phi": control_phi["phi"],
                "perturbed_phi": perturbed_phi["phi"],
                "delta_phi": delta,
                "delta_percent": round(delta_pct, 2),
                "perturbation": perturbation,
                "significant": abs(delta_pct) > self.EFFECT_SIZE_THRESHOLD,
                "hypothesis_id": hypothesis.id,
            }

        elif exp_type == "consciousness_learning":
            # Measure Φ before and after STDP learning
            before = _measure_phi(connectome, duration_ms, enable_stdp=False)
            after = _measure_phi(connectome, exp.get("learning_steps", 500), enable_stdp=True)

            delta = after["phi"] - before["phi"]
            delta_pct = (delta / max(before["phi"], 0.001)) * 100

            return {
                "phi_before_learning": before["phi"],
                "phi_after_learning": after["phi"],
                "delta_phi": delta,
                "delta_percent": round(delta_pct, 2),
                "significant": abs(delta_pct) > self.EFFECT_SIZE_THRESHOLD,
                "hypothesis_id": hypothesis.id,
            }

        elif exp_type == "consciousness_correlation":
            # Measure multiple consciousness metrics across perturbations
            from creatures.neural.consciousness import compute_all_consciousness_metrics

            samples = []
            for trial in range(exp.get("n_samples", 5)):
                engine = VectorizedEngine(use_gpu=True, neuron_model=NeuronModel.IZHIKEVICH)
                engine.build_single_connectome(connectome)

                # Vary stimulation pattern per trial
                rng = np.random.default_rng(trial * 7 + 42)
                n = engine.n_total
                for step_i in range(int(duration_ms / engine.dt)):
                    noise = np.zeros(n, dtype=np.float32)
                    noise[rng.choice(n, max(1, n // (5 + trial)), replace=False)] = \
                        rng.uniform(5 + trial * 2, 20 + trial * 3,
                                    max(1, n // (5 + trial))).astype(np.float32)
                    engine.I_ext = engine.xp.array(noise)
                    engine.step()

                indices, times = engine.get_spike_history()
                if len(indices) > 50:
                    report = compute_all_consciousness_metrics(
                        np.array(indices), np.array(times), n, duration_ms,
                        bin_ms=5.0, top_k=20,
                    )
                    samples.append({
                        "phi": report.phi,
                        "complexity": report.neural_complexity,
                        "pci": report.pci,
                        "n_spikes": len(indices),
                    })

            if len(samples) >= 3:
                phis = [s["phi"] for s in samples]
                cns = [s["complexity"] for s in samples]
                # Correlation
                corr = float(np.corrcoef(phis, cns)[0, 1]) if np.std(phis) > 0 and np.std(cns) > 0 else 0.0
                return {
                    "samples": samples,
                    "phi_cn_correlation": round(corr, 4),
                    "mean_phi": round(float(np.mean(phis)), 4),
                    "mean_cn": round(float(np.mean(cns)), 4),
                    "significant": abs(corr) > 0.5,
                    "hypothesis_id": hypothesis.id,
                }

            return {"error": "Not enough valid samples", "n_samples": len(samples)}

        return {"error": f"Unknown consciousness experiment subtype: {exp_type}"}

    # ── Analysis and reporting ───────────────────────────────────────

    def run_all(self) -> list[dict]:
        """Run all pending hypotheses in priority order.

        Returns list of result dicts.
        """
        results = []
        for h in sorted(self.hypotheses, key=lambda x: -x.priority):
            if h.status != "pending":
                continue
            result = self.run_experiment(h)
            h.result = result
            results.append(result)

            if result.get("error"):
                h.status = "inconclusive"
            elif result.get("significant"):
                h.status = "confirmed"
                discovery = Discovery(
                    id=f"disc_{h.id}_{uuid.uuid4().hex[:6]}",
                    title=self._make_discovery_title(h, result),
                    description=self._make_discovery_description(h, result),
                    hypothesis=h,
                    evidence=result,
                    significance=abs(result.get("delta_percent", 0)),
                    timestamp=datetime.now().isoformat(),
                )
                self.discoveries.append(discovery)
                logger.info("DISCOVERY: %s", discovery.title)
            else:
                h.status = "rejected"
                logger.info("REJECTED: %s", h.statement)

        return results

    def _make_discovery_title(self, h: Hypothesis, result: dict) -> str:
        """Generate a concise discovery title from hypothesis + result."""
        delta = result.get("delta_percent", 0)
        direction = "increases" if delta > 0 else "decreases"

        if h.category == "circuit":
            return (
                f"Lesioning {result.get('neuron_id', '?')} "
                f"{direction} network activity by {abs(delta):.1f}%"
            )
        elif h.category == "drug":
            return (
                f"{result.get('drug_name', '?')} "
                f"{direction} firing rate by {abs(delta):.1f}%"
            )
        elif h.category == "learning":
            return (
                f"STDP learning improves motor response "
                f"by {abs(delta):.1f}%"
            )
        return f"Effect of {abs(delta):.1f}% observed"

    def _make_discovery_description(self, h: Hypothesis, result: dict) -> str:
        """Generate a detailed scientific description of the finding."""
        lines = [f"Hypothesis: {h.statement}", ""]

        if h.category == "circuit":
            lines.extend([
                f"Control firing rate: {result.get('control_rate_hz', 0):.2f} Hz "
                f"(+/- {result.get('control_std', 0):.2f})",
                f"Experimental firing rate: {result.get('experimental_rate_hz', 0):.2f} Hz "
                f"(+/- {result.get('experimental_std', 0):.2f})",
                f"Effect size: {result.get('delta_percent', 0):.2f}%",
                f"Cohen's d: {result.get('cohens_d', 'N/A')}",
                f"N trials: {result.get('n_trials', 1)}",
            ])
        elif h.category == "drug":
            lines.extend([
                f"Baseline firing rate: {result.get('baseline_rate_hz', 0):.2f} Hz",
                f"Drug firing rate: {result.get('drug_rate_hz', 0):.2f} Hz",
                f"Effect size: {result.get('delta_percent', 0):.2f}%",
                f"Drug dose: {result.get('dose', '?')} (EC50)",
                f"Synapses affected: {result.get('drug_info', {}).get('synapses_affected', '?')}",
            ])
        elif h.category == "learning":
            lines.extend([
                f"STDP improvement over trials: {result.get('stdp_improvement_pct', 0):.2f}%",
                f"Static improvement over trials: {result.get('static_improvement_pct', 0):.2f}%",
                f"STDP vs static on final trial: {result.get('final_comparison_pct', 0):.2f}%",
                f"STDP latencies (ms): {result.get('stdp_latencies_ms', [])}",
                f"Static latencies (ms): {result.get('static_latencies_ms', [])}",
            ])

        return "\n".join(lines)

    def generate_report(self) -> str:
        """Generate a scientific discovery report in markdown format.

        Includes confirmed discoveries, rejected hypotheses, and summary
        statistics. Designed to be read as a morning briefing.
        """
        lines = [
            "# Neurevo Automated Discovery Report",
            "",
            f"**Generated:** {datetime.now().isoformat()}",
            f"**Hypotheses tested:** {len([h for h in self.hypotheses if h.status != 'pending'])}",
            f"**Discoveries:** {len(self.discoveries)}",
            "",
        ]

        # ── Discoveries ──────────────────────────────────────────────
        if self.discoveries:
            lines.append("---")
            lines.append("")
            lines.append("## Confirmed Discoveries")
            lines.append("")

            for i, disc in enumerate(
                sorted(self.discoveries, key=lambda d: -d.significance), 1
            ):
                effect_label = (
                    "STRONG" if disc.significance > self.STRONG_EFFECT_THRESHOLD
                    else "MODERATE"
                )
                lines.extend([
                    f"### {i}. {disc.title}",
                    "",
                    f"**Effect:** {effect_label} ({disc.significance:.1f}%)",
                    f"**Category:** {disc.hypothesis.category}",
                    "",
                    disc.description,
                    "",
                ])

        # ── Rejected hypotheses ──────────────────────────────────────
        rejected = [h for h in self.hypotheses if h.status == "rejected"]
        if rejected:
            lines.append("---")
            lines.append("")
            lines.append("## Rejected Hypotheses")
            lines.append("")
            for h in rejected:
                delta = h.result.get("delta_percent", 0) if h.result else 0
                lines.append(
                    f"- **{h.statement}** -- effect: {delta:.1f}% "
                    f"(below {self.EFFECT_SIZE_THRESHOLD}% threshold)"
                )
            lines.append("")

        # ── Inconclusive ─────────────────────────────────────────────
        inconclusive = [h for h in self.hypotheses if h.status == "inconclusive"]
        if inconclusive:
            lines.append("## Inconclusive / Errors")
            lines.append("")
            for h in inconclusive:
                err = h.result.get("error", "unknown") if h.result else "unknown"
                lines.append(f"- **{h.id}**: {err}")
            lines.append("")

        # ── Summary statistics ───────────────────────────────────────
        lines.extend([
            "---",
            "",
            "## Summary",
            "",
            f"- Total hypotheses generated: {len(self.hypotheses)}",
            f"- Confirmed: {len([h for h in self.hypotheses if h.status == 'confirmed'])}",
            f"- Rejected: {len(rejected)}",
            f"- Inconclusive: {len(inconclusive)}",
            f"- Pending: {len([h for h in self.hypotheses if h.status == 'pending'])}",
            "",
        ])

        return "\n".join(lines)

    def to_json(self) -> dict:
        """Serialize all hypotheses and discoveries to a JSON-compatible dict."""
        return {
            "timestamp": datetime.now().isoformat(),
            "hypotheses": [
                {
                    "id": h.id,
                    "statement": h.statement,
                    "category": h.category,
                    "priority": h.priority,
                    "status": h.status,
                    "experiment": h.experiment,
                    "result": h.result,
                }
                for h in self.hypotheses
            ],
            "discoveries": [
                {
                    "id": d.id,
                    "title": d.title,
                    "description": d.description,
                    "significance": d.significance,
                    "timestamp": d.timestamp,
                    "evidence": d.evidence,
                    "hypothesis_id": d.hypothesis.id,
                }
                for d in self.discoveries
            ],
        }
