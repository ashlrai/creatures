"""Tests for the autonomous scientific discovery engine.

Covers hypothesis generation, all three experiment types (lesion, drug,
learning), and report generation.  Uses the session-scoped connectome
fixture from conftest.py and the small_connectome subset for speed.
"""

from __future__ import annotations

import os

import pytest

# Force numpy codegen (redundant with conftest but explicit for clarity)
os.environ.setdefault("BRIAN2_CODEGEN_TARGET", "numpy")

from creatures.discovery.engine import Discovery, DiscoveryEngine, Hypothesis


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture()
def engine() -> DiscoveryEngine:
    """Create a DiscoveryEngine with no API key."""
    return DiscoveryEngine(xai_api_key=None)


# ── Hypothesis generation ────────────────────────────────────────────


class TestHypothesisGeneration:
    """Verify that generate_hypotheses produces well-formed hypotheses."""

    def test_generates_nonzero_hypotheses(self, engine: DiscoveryEngine):
        hypotheses = engine.generate_hypotheses("c_elegans")
        assert len(hypotheses) > 0

    def test_hypothesis_has_required_fields(self, engine: DiscoveryEngine):
        hypotheses = engine.generate_hypotheses("c_elegans")
        for h in hypotheses:
            assert isinstance(h, Hypothesis)
            assert h.id
            assert h.statement
            assert h.category in ("circuit", "drug", "learning")
            assert 0.0 <= h.priority <= 1.0
            assert h.status == "pending"
            assert isinstance(h.experiment, dict)
            assert "type" in h.experiment

    def test_includes_circuit_hypotheses(self, engine: DiscoveryEngine):
        hypotheses = engine.generate_hypotheses("c_elegans")
        circuit = [h for h in hypotheses if h.category == "circuit"]
        assert len(circuit) >= 3, "Should generate at least 3 circuit hypotheses"

    def test_includes_drug_hypotheses(self, engine: DiscoveryEngine):
        hypotheses = engine.generate_hypotheses("c_elegans")
        drug = [h for h in hypotheses if h.category == "drug"]
        assert len(drug) >= 2, "Should generate at least 2 drug hypotheses"

    def test_includes_learning_hypothesis(self, engine: DiscoveryEngine):
        hypotheses = engine.generate_hypotheses("c_elegans")
        learning = [h for h in hypotheses if h.category == "learning"]
        assert len(learning) >= 1, "Should generate at least 1 learning hypothesis"

    def test_sorted_by_priority_descending(self, engine: DiscoveryEngine):
        hypotheses = engine.generate_hypotheses("c_elegans")
        priorities = [h.priority for h in hypotheses]
        assert priorities == sorted(priorities, reverse=True)


# ── Lesion experiment ────────────────────────────────────────────────


class TestLesionExperiment:
    """Verify that lesion experiments produce measurable results."""

    @pytest.mark.slow
    def test_lesion_experiment_produces_results(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        circuit_h = [h for h in engine.hypotheses if h.category == "circuit"]
        assert circuit_h, "Need at least one circuit hypothesis"

        h = circuit_h[0]
        result = engine.run_experiment(h)

        assert "error" not in result, f"Experiment failed: {result.get('error')}"
        assert "control_rate_hz" in result
        assert "experimental_rate_hz" in result
        assert "delta_percent" in result
        assert "significant" in result
        assert isinstance(result["significant"], bool)
        assert result["n_trials"] == engine.N_TRIALS

    @pytest.mark.slow
    def test_lesion_sets_hypothesis_status(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        h = [h for h in engine.hypotheses if h.category == "circuit"][0]
        engine.run_experiment(h)
        # After run_experiment, the engine sets status to "testing"
        # but the caller (run_all) sets final status. Direct run_experiment
        # leaves it as "testing".
        assert h.status == "testing"


# ── Drug experiment ──────────────────────────────────────────────────


class TestDrugExperiment:
    """Verify that drug experiments produce measurable results."""

    @pytest.mark.slow
    def test_drug_experiment_produces_results(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        drug_h = [h for h in engine.hypotheses if h.category == "drug"]
        assert drug_h, "Need at least one drug hypothesis"

        h = drug_h[0]
        result = engine.run_experiment(h)

        assert "error" not in result, f"Experiment failed: {result.get('error')}"
        assert "baseline_rate_hz" in result
        assert "drug_rate_hz" in result
        assert "delta_percent" in result
        assert "significant" in result
        assert "drug_info" in result
        assert result["n_trials"] == engine.N_TRIALS

    @pytest.mark.slow
    def test_drug_experiment_reports_synapses_affected(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        drug_h = [h for h in engine.hypotheses if h.category == "drug"]
        h = drug_h[0]
        result = engine.run_experiment(h)
        assert result.get("drug_info", {}).get("synapses_affected", 0) >= 0


# ── Learning experiment ──────────────────────────────────────────────


class TestLearningExperiment:
    """Verify that STDP learning experiments work."""

    @pytest.mark.slow
    def test_learning_experiment_produces_results(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        learn_h = [h for h in engine.hypotheses if h.category == "learning"]
        assert learn_h, "Need at least one learning hypothesis"

        h = learn_h[0]
        result = engine.run_experiment(h)

        assert "error" not in result, f"Experiment failed: {result.get('error')}"
        assert "stdp_latencies_ms" in result
        assert "static_latencies_ms" in result
        assert "stdp_improvement_pct" in result
        assert "significant" in result

    @pytest.mark.slow
    def test_learning_latency_lists_match_trial_count(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        h = [h for h in engine.hypotheses if h.category == "learning"][0]
        result = engine.run_experiment(h)
        n_trials = h.experiment.get("n_trials", 5)
        assert len(result["stdp_latencies_ms"]) == n_trials
        assert len(result["static_latencies_ms"]) == n_trials


# ── Report generation ────────────────────────────────────────────────


class TestReportGeneration:
    """Verify the report is well-formed and includes findings."""

    def test_empty_report(self, engine: DiscoveryEngine):
        """Report on zero hypotheses should still be valid markdown."""
        report = engine.generate_report()
        assert "Neurevo Automated Discovery Report" in report
        assert "Total hypotheses generated: 0" in report

    @pytest.mark.slow
    def test_report_includes_discoveries(self, engine: DiscoveryEngine):
        """After running experiments, confirmed findings appear in the report."""
        engine.generate_hypotheses("c_elegans")
        # Run just the first 2 hypotheses for speed
        engine.hypotheses = engine.hypotheses[:2]
        engine.run_all()
        report = engine.generate_report()

        assert "Neurevo Automated Discovery Report" in report
        # Should mention at least one section
        assert "Confirmed" in report or "Rejected" in report

    @pytest.mark.slow
    def test_run_all_populates_discoveries(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        engine.hypotheses = engine.hypotheses[:2]
        engine.run_all()

        # At least some hypotheses should have been resolved
        resolved = [h for h in engine.hypotheses if h.status in ("confirmed", "rejected", "inconclusive")]
        assert len(resolved) > 0


# ── Serialization ────────────────────────────────────────────────────


class TestSerialization:
    """Verify JSON export of results."""

    def test_to_json_empty(self, engine: DiscoveryEngine):
        data = engine.to_json()
        assert "hypotheses" in data
        assert "discoveries" in data
        assert "timestamp" in data
        assert data["hypotheses"] == []
        assert data["discoveries"] == []

    def test_to_json_after_generation(self, engine: DiscoveryEngine):
        engine.generate_hypotheses("c_elegans")
        data = engine.to_json()
        assert len(data["hypotheses"]) > 0
        for hd in data["hypotheses"]:
            assert "id" in hd
            assert "statement" in hd
            assert "category" in hd
            assert "status" in hd
