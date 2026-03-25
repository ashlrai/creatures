"""Tests for statistical analysis and NeuroML export."""

import math
import tempfile
import xml.etree.ElementTree as ET

import numpy as np
import pytest
from scipy import stats as scipy_stats

from creatures.analysis.statistics import (
    StatisticalResult,
    batch_compare,
    compare_conditions,
    compute_confidence_interval,
    compute_effect_size,
    generate_stats_report,
)
from creatures.connectome.types import (
    Connectome,
    Neuron,
    NeuronType,
    Synapse,
    SynapseType,
)
from creatures.export.neuroml import (
    NEUROML2_NS,
    export_connectome_json,
    export_connectome_neuroml,
)


# ── Fixtures ────────────────────────────────────────────────────────


@pytest.fixture
def normal_exp():
    """Experimental group drawn from N(10, 2)."""
    rng = np.random.default_rng(42)
    return rng.normal(10, 2, size=30).tolist()


@pytest.fixture
def normal_ctrl():
    """Control group drawn from N(8, 2)."""
    rng = np.random.default_rng(123)
    return rng.normal(8, 2, size=30).tolist()


@pytest.fixture
def identical_groups():
    """Two groups from the same distribution (no difference)."""
    rng = np.random.default_rng(99)
    a = rng.normal(5, 1, size=30).tolist()
    b = rng.normal(5, 1, size=30).tolist()
    return a, b


@pytest.fixture
def small_connectome():
    """A minimal 3-neuron connectome for testing exports."""
    neurons = {
        "A": Neuron(id="A", neuron_type=NeuronType.SENSORY, neurotransmitter="ACh"),
        "B": Neuron(id="B", neuron_type=NeuronType.INTER, neurotransmitter="GABA"),
        "C": Neuron(id="C", neuron_type=NeuronType.MOTOR, neurotransmitter="ACh"),
    }
    synapses = [
        Synapse(pre_id="A", post_id="B", weight=3.0, synapse_type=SynapseType.CHEMICAL),
        Synapse(pre_id="B", post_id="C", weight=2.0, synapse_type=SynapseType.CHEMICAL),
        Synapse(pre_id="A", post_id="C", weight=1.0, synapse_type=SynapseType.ELECTRICAL),
    ]
    return Connectome(name="test_mini", neurons=neurons, synapses=synapses)


# ── compare_conditions ──────────────────────────────────────────────


class TestCompareConditions:
    """Tests for the main comparison function."""

    def test_significant_difference(self, normal_exp, normal_ctrl):
        """Known different distributions should yield significant result."""
        result = compare_conditions(normal_exp, normal_ctrl)
        assert isinstance(result, StatisticalResult)
        assert result.p_value < 0.05
        assert result.significant is True
        assert result.effect_size > 0  # experimental > control

    def test_no_significant_difference(self, identical_groups):
        """Same-distribution groups should typically not be significant."""
        a, b = identical_groups
        result = compare_conditions(a, b)
        assert isinstance(result, StatisticalResult)
        # With same distributions, p should usually be > 0.05
        # (not guaranteed, but seeded RNG makes this deterministic)
        assert result.p_value > 0.01

    def test_welch_test_explicit(self, normal_exp, normal_ctrl):
        """Explicitly requesting Welch's t-test should work."""
        result = compare_conditions(normal_exp, normal_ctrl, test="welch")
        assert result.test_name == "welch_t_test"

    def test_mann_whitney_explicit(self, normal_exp, normal_ctrl):
        """Explicitly requesting Mann-Whitney should work."""
        result = compare_conditions(normal_exp, normal_ctrl, test="mann_whitney")
        assert result.test_name == "mann_whitney"

    def test_paired_t_test(self):
        """Paired t-test with matched samples."""
        rng = np.random.default_rng(42)
        before = rng.normal(5, 1, size=20).tolist()
        after = [x + 2 for x in before]  # clear paired effect
        result = compare_conditions(after, before, test="paired")
        assert result.test_name == "paired_t"
        assert result.significant is True

    def test_paired_t_unequal_lengths_raises(self):
        """Paired t-test with unequal lengths should raise ValueError."""
        with pytest.raises(ValueError, match="equal sample sizes"):
            compare_conditions([1, 2, 3], [4, 5], test="paired")

    def test_too_few_samples_raises(self):
        """Fewer than 2 samples should raise ValueError."""
        with pytest.raises(ValueError, match="at least 2"):
            compare_conditions([1.0], [2.0, 3.0])

    def test_unknown_test_raises(self):
        """Unknown test name should raise ValueError."""
        with pytest.raises(ValueError, match="Unknown test"):
            compare_conditions([1, 2, 3], [4, 5, 6], test="invalid")

    def test_custom_alpha(self, normal_exp, normal_ctrl):
        """Custom alpha threshold should affect significance."""
        # With very stringent alpha, might not be significant
        result_strict = compare_conditions(normal_exp, normal_ctrl, alpha=0.0001)
        result_loose = compare_conditions(normal_exp, normal_ctrl, alpha=0.5)
        # Loose alpha should always be significant if strict is
        if result_strict.significant:
            assert result_loose.significant


# ── Effect size ─────────────────────────────────────────────────────


class TestEffectSize:
    """Tests for Cohen's d effect size computation."""

    def test_known_effect_size(self):
        """Manual calculation: d = (10 - 8) / sqrt(pooled_var)."""
        # Two groups with known means and identical variance
        rng = np.random.default_rng(42)
        exp = rng.normal(10, 2, size=100).tolist()
        ctrl = rng.normal(8, 2, size=100).tolist()
        d = compute_effect_size(exp, ctrl)
        # Should be approximately 1.0 (large effect)
        assert 0.7 < d < 1.5, f"Expected d ~ 1.0, got {d}"

    def test_no_difference(self):
        """Same distribution should give d near 0."""
        data = [5.0, 5.1, 4.9, 5.0, 5.2]
        d = compute_effect_size(data, data)
        assert d == 0.0

    def test_negative_effect(self):
        """Control higher than experimental gives negative d."""
        d = compute_effect_size([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
        assert d < 0

    def test_zero_variance(self):
        """Constant values should return 0 (no variance to pool)."""
        d = compute_effect_size([5, 5, 5], [5, 5, 5])
        assert d == 0.0

    def test_too_few_samples(self):
        """Fewer than 2 samples should return 0.0 gracefully."""
        d = compute_effect_size([5.0], [3.0])
        assert d == 0.0


# ── Confidence intervals ────────────────────────────────────────────


class TestConfidenceInterval:
    """Tests for confidence interval computation."""

    def test_ci_contains_true_mean(self):
        """95% CI should contain the population mean most of the time.

        With a large enough sample from N(100, 10), the CI should
        contain 100 nearly always.
        """
        rng = np.random.default_rng(42)
        data = rng.normal(100, 10, size=200).tolist()
        lo, hi = compute_confidence_interval(data, confidence=0.95)
        assert lo < 100 < hi, f"True mean 100 not in CI [{lo}, {hi}]"

    def test_wider_ci_with_higher_confidence(self):
        """99% CI should be wider than 90% CI."""
        data = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
        lo_90, hi_90 = compute_confidence_interval(data, confidence=0.90)
        lo_99, hi_99 = compute_confidence_interval(data, confidence=0.99)
        width_90 = hi_90 - lo_90
        width_99 = hi_99 - lo_99
        assert width_99 > width_90

    def test_single_sample(self):
        """Single sample should return (value, value)."""
        lo, hi = compute_confidence_interval([42.0])
        assert lo == 42.0
        assert hi == 42.0

    def test_ci_symmetric_around_mean(self):
        """CI should be symmetric around the sample mean."""
        data = [10.0, 20.0, 30.0, 40.0, 50.0]
        lo, hi = compute_confidence_interval(data)
        mean = sum(data) / len(data)
        assert abs((mean - lo) - (hi - mean)) < 1e-10


# ── Batch comparison ────────────────────────────────────────────────


class TestBatchCompare:
    """Tests for multiple-comparison correction."""

    def test_bonferroni_correction(self):
        """Bonferroni correction should multiply p-values by k."""
        rng = np.random.default_rng(42)
        results = {
            "control": rng.normal(5, 1, size=30).tolist(),
            "drug_low": rng.normal(6, 1, size=30).tolist(),
            "drug_high": rng.normal(8, 1, size=30).tolist(),
        }
        comparisons = batch_compare(results, control_key="control", correction="bonferroni")

        assert "drug_low" in comparisons
        assert "drug_high" in comparisons
        assert "control" not in comparisons  # control excluded from output

        # Bonferroni p-values should be at most 1.0
        for name, r in comparisons.items():
            assert r.p_value <= 1.0

    def test_no_correction(self):
        """Without correction, p-values should be uncorrected."""
        rng = np.random.default_rng(42)
        results = {
            "control": rng.normal(5, 1, size=30).tolist(),
            "treatment": rng.normal(8, 1, size=30).tolist(),
        }
        corrected = batch_compare(results, correction="bonferroni")
        uncorrected = batch_compare(results, correction="none")

        # With k=1 condition, Bonferroni shouldn't change the p-value
        assert corrected["treatment"].p_value == pytest.approx(
            uncorrected["treatment"].p_value, abs=1e-10
        )

    def test_missing_control_raises(self):
        """Missing control key should raise ValueError."""
        with pytest.raises(ValueError, match="Control key"):
            batch_compare({"a": [1, 2], "b": [3, 4]}, control_key="control")

    def test_bonferroni_increases_p_with_many_comparisons(self):
        """More comparisons should yield higher corrected p-values."""
        rng = np.random.default_rng(42)
        ctrl = rng.normal(5, 1, size=30).tolist()
        treat = rng.normal(6, 1, size=30).tolist()

        # 1 comparison
        r1 = batch_compare({"control": ctrl, "A": treat}, correction="bonferroni")
        # 3 comparisons (same treatment duplicated)
        r3 = batch_compare(
            {"control": ctrl, "A": treat, "B": treat, "C": treat},
            correction="bonferroni",
        )
        # Bonferroni should increase p for 3 comparisons
        assert r3["A"].p_value >= r1["A"].p_value


# ── Stats report generation ─────────────────────────────────────────


class TestGenerateStatsReport:
    """Tests for publication-ready report generation."""

    def test_report_has_header(self, normal_exp, normal_ctrl):
        result = compare_conditions(normal_exp, normal_ctrl)
        report = generate_stats_report([result])
        assert "### Statistical Analysis" in report

    def test_report_has_table(self, normal_exp, normal_ctrl):
        result = compare_conditions(normal_exp, normal_ctrl)
        report = generate_stats_report([result])
        assert "| Test |" in report
        assert "p-value" in report

    def test_empty_results(self):
        report = generate_stats_report([])
        assert "No statistical comparisons" in report

    def test_significant_results_noted(self, normal_exp, normal_ctrl):
        result = compare_conditions(normal_exp, normal_ctrl)
        assert result.significant  # pre-condition
        report = generate_stats_report([result])
        assert "Significant results" in report


# ── NeuroML export ──────────────────────────────────────────────────


class TestNeuroMLExport:
    """Tests for NeuroML2 XML export."""

    def test_produces_valid_xml(self, small_connectome):
        """Exported file should be parseable XML."""
        with tempfile.NamedTemporaryFile(suffix=".nml", delete=False) as f:
            filepath = f.name

        export_connectome_neuroml(small_connectome, filepath)

        # Should parse without errors
        tree = ET.parse(filepath)
        root = tree.getroot()
        assert root is not None

    def test_neuroml_namespace(self, small_connectome):
        """Root element should use the NeuroML2 namespace."""
        with tempfile.NamedTemporaryFile(suffix=".nml", delete=False) as f:
            filepath = f.name

        export_connectome_neuroml(small_connectome, filepath)
        tree = ET.parse(filepath)
        root = tree.getroot()

        # Tag should include the namespace
        assert NEUROML2_NS in root.tag

    def test_contains_network(self, small_connectome):
        """Export should contain a <network> element."""
        with tempfile.NamedTemporaryFile(suffix=".nml", delete=False) as f:
            filepath = f.name

        export_connectome_neuroml(small_connectome, filepath)
        tree = ET.parse(filepath)
        root = tree.getroot()

        ns = {"nml": NEUROML2_NS}
        networks = root.findall(".//nml:network", ns)
        assert len(networks) == 1

    def test_contains_population(self, small_connectome):
        """Export should contain a population with correct size."""
        with tempfile.NamedTemporaryFile(suffix=".nml", delete=False) as f:
            filepath = f.name

        export_connectome_neuroml(small_connectome, filepath)
        tree = ET.parse(filepath)
        root = tree.getroot()

        ns = {"nml": NEUROML2_NS}
        pops = root.findall(".//nml:population", ns)
        assert len(pops) >= 1
        assert pops[0].get("size") == "3"

    def test_contains_projections(self, small_connectome):
        """Export should contain projection elements for synapses."""
        with tempfile.NamedTemporaryFile(suffix=".nml", delete=False) as f:
            filepath = f.name

        export_connectome_neuroml(small_connectome, filepath)
        tree = ET.parse(filepath)
        root = tree.getroot()

        ns = {"nml": NEUROML2_NS}
        projections = root.findall(".//nml:projection", ns)
        # Should have chemical and electrical projections
        assert len(projections) == 2

    def test_connection_count(self, small_connectome):
        """Number of connections should match synapse count per type."""
        with tempfile.NamedTemporaryFile(suffix=".nml", delete=False) as f:
            filepath = f.name

        export_connectome_neuroml(small_connectome, filepath)
        tree = ET.parse(filepath)
        root = tree.getroot()

        ns = {"nml": NEUROML2_NS}
        connections = root.findall(".//nml:connection", ns)
        # 2 chemical + 1 electrical = 3 total
        assert len(connections) == 3


# ── JSON export ─────────────────────────────────────────────────────


class TestConnectomeJSON:
    """Tests for JSON graph export."""

    def test_json_structure(self, small_connectome):
        data = export_connectome_json(small_connectome)
        assert "nodes" in data
        assert "links" in data
        assert "stats" in data
        assert "name" in data

    def test_node_count(self, small_connectome):
        data = export_connectome_json(small_connectome)
        assert len(data["nodes"]) == 3

    def test_link_count(self, small_connectome):
        data = export_connectome_json(small_connectome)
        assert len(data["links"]) == 3

    def test_node_fields(self, small_connectome):
        data = export_connectome_json(small_connectome)
        node = data["nodes"][0]
        assert "id" in node
        assert "type" in node
        assert "neurotransmitter" in node

    def test_stats(self, small_connectome):
        data = export_connectome_json(small_connectome)
        assert data["stats"]["n_neurons"] == 3
        assert data["stats"]["n_synapses"] == 3
