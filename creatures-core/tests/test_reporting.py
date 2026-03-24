"""Tests for the scientific report generator and export utilities."""

from __future__ import annotations

import json
import math

import pytest

from creatures.reporting.report_generator import (
    connectome_to_export_json,
    fitness_history_to_csv,
    generate_report,
    generate_sample_report,
    generate_report_from_run,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_fitness_history() -> list[dict]:
    """Generate a realistic fitness history for testing."""
    history = []
    for g in range(50):
        progress = g / 50
        best = 0.15 + progress * 0.7 + 0.01 * math.sin(g * 0.5)
        mean = best * (0.5 + progress * 0.3)
        history.append({
            "generation": g,
            "best_fitness": round(best, 4),
            "mean_fitness": round(mean, 4),
            "std_fitness": round(0.1 - progress * 0.05, 4),
            "n_species": max(3, 10 - int(progress * 5)),
        })
    return history


@pytest.fixture
def sample_run_data(sample_fitness_history) -> dict:
    """Build a complete run_data dict for report generation."""
    return {
        "run_id": "test_001",
        "organism": "c_elegans",
        "config": {
            "n_generations": 50,
            "population_size": 100,
            "fitness_mode": "fast",
            "tournament_size": 5,
            "elitism": 3,
            "crossover_rate": 0.3,
            "seed": 42,
            "mutation": {
                "weight_perturb_rate": 0.8,
                "weight_perturb_sigma": 0.3,
                "add_synapse_rate": 0.1,
                "remove_synapse_rate": 0.02,
            },
        },
        "fitness_history": sample_fitness_history,
        "total_elapsed_seconds": 120.5,
        "summary": {
            "template_neurons": 302,
            "evolved_neurons": 304,
            "template_synapses": 2194,
            "evolved_synapses": 2230,
        },
        "drift": {
            "preserved_fraction": 0.95,
            "modified_weight_fraction": 0.3,
            "novel_synapses": 36,
            "deleted_synapses": 8,
            "novel_neurons": 2,
            "total_weight_change": 15.3,
        },
        "connection_analysis": {
            "most_modified": [
                {"pre": "AVAL", "post": "DA01", "original": 2.5, "evolved": 6.0, "delta": 3.5},
                {"pre": "AVBL", "post": "VB01", "original": 3.0, "evolved": 5.5, "delta": 2.5},
            ],
            "most_preserved": [
                {"pre": "ADAL", "post": "AIAL", "original": 1.0, "evolved": 1.01, "delta": 0.01},
            ],
            "novel_connections": [
                {"pre": "ADAL", "post": "VA01", "weight": 1.2, "pre_type": "sensory", "post_type": "motor"},
            ],
        },
        "behavior": {
            "linearity": 0.6,
            "speed": 0.7,
            "persistence": 0.5,
            "exploration": 0.4,
            "activity": 0.65,
        },
        "god_report": {
            "mode": "fallback",
            "n_observations": 5,
            "n_interventions": 2,
            "history": [
                {
                    "generation": 20,
                    "analysis": "Diversity declining",
                    "actions_applied": ["increase_mutation_rate"],
                },
            ],
        },
    }


# ---------------------------------------------------------------------------
# Report generation tests
# ---------------------------------------------------------------------------


class TestGenerateReport:
    """Tests for the main generate_report function."""

    def test_generates_non_empty_report(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert len(report) > 500
        assert isinstance(report, str)

    def test_contains_title(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "# Neurevo Scientific Report" in report

    def test_contains_run_id(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "test_001" in report

    def test_contains_organism(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "C. elegans" in report

    def test_contains_fitness_stats(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Fitness Trajectory" in report
        assert "Initial best fitness" in report
        assert "Final best fitness" in report
        assert "Improvement" in report

    def test_contains_drift_analysis(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Connectome Drift" in report
        assert "preserved" in report.lower()
        assert "novel" in report.lower()

    def test_contains_modified_connections(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Most Modified Connections" in report
        assert "AVAL" in report
        assert "DA01" in report

    def test_contains_preserved_connections(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Preserved" in report
        assert "ADAL" in report

    def test_contains_novel_connections(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Novel Connections" in report

    def test_contains_behavior_analysis(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Behavioral Analysis" in report
        assert "Linearity" in report
        assert "Speed" in report

    def test_contains_god_agent_section(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "God Agent" in report
        assert "fallback" in report.lower()

    def test_contains_methods_section(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Methods" in report
        assert "Tournament selection" in report
        assert "leaky integrate-and-fire" in report

    def test_contains_references(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "References" in report
        assert "Varshney" in report
        assert "OpenWorm" in report

    def test_contains_fitness_table(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "| Generation |" in report

    def test_contains_bio_vs_evolved_table(self, sample_run_data):
        report = generate_report(sample_run_data)
        assert "Biological vs Evolved" in report
        assert "302" in report  # template neurons

    def test_minimal_data(self):
        """Report should handle minimal/empty data gracefully."""
        report = generate_report({"run_id": "empty", "config": {}, "fitness_history": []})
        assert "# Neurevo Scientific Report" in report
        assert len(report) > 200

    def test_no_god_report(self, sample_run_data):
        """Should handle missing god_report gracefully."""
        sample_run_data["god_report"] = None
        report = generate_report(sample_run_data)
        assert "No God Agent interventions" in report

    def test_no_behavior(self, sample_run_data):
        """Should handle missing behavior gracefully."""
        del sample_run_data["behavior"]
        report = generate_report(sample_run_data)
        assert "not available" in report.lower()

    def test_no_drift(self, sample_run_data):
        """Should handle empty drift gracefully."""
        sample_run_data["drift"] = {}
        report = generate_report(sample_run_data)
        assert "not available" in report.lower()


class TestSampleReport:
    """Tests for the demo/sample report generator."""

    def test_generates_report(self):
        report = generate_sample_report()
        assert "# Neurevo Scientific Report" in report
        assert "demo_001" in report

    def test_contains_all_sections(self):
        report = generate_sample_report()
        expected_sections = [
            "Overview",
            "Fitness Trajectory",
            "Connectome Drift",
            "Behavioral Analysis",
            "Biological vs Evolved",
            "God Agent",
            "Methods",
            "References",
        ]
        for section in expected_sections:
            assert section in report, f"Missing section: {section}"

    def test_has_realistic_data(self):
        report = generate_sample_report()
        # Should have 100 generations worth of data
        assert "100 Generations" in report
        assert "150" in report  # population size


class TestGenerateReportFromRun:
    """Tests for the API-oriented report generator."""

    def test_basic_report(self, sample_fitness_history):
        report = generate_report_from_run(
            run_id="api_test",
            config={"n_generations": 50, "population_size": 100},
            history=[
                {"generation": i, "best_fitness": h["best_fitness"],
                 "mean_fitness": h["mean_fitness"], "std_fitness": h["std_fitness"],
                 "n_species": h["n_species"]}
                for i, h in enumerate(sample_fitness_history)
            ],
            elapsed=60.0,
        )
        assert "api_test" in report
        assert "# Neurevo Scientific Report" in report

    def test_with_god_reports(self):
        report = generate_report_from_run(
            run_id="god_test",
            config={"n_generations": 10},
            history=[
                {"generation": i, "best_fitness": i * 0.1, "mean_fitness": i * 0.05,
                 "std_fitness": 0.1, "n_species": 5}
                for i in range(10)
            ],
            god_reports=[
                {"type": "god_intervention", "generation": 5,
                 "analysis": "Test intervention", "applied": ["boost_mutation"],
                 "interventions": [{"action": "boost_mutation", "reasoning": "test"}]},
            ],
        )
        assert "God Agent" in report


# ---------------------------------------------------------------------------
# Export utility tests
# ---------------------------------------------------------------------------


class TestFitnessHistoryToCSV:
    """Tests for CSV export of fitness history."""

    def test_basic_csv(self, sample_fitness_history):
        csv = fitness_history_to_csv(sample_fitness_history)
        lines = csv.strip().split("\n")
        assert lines[0] == "generation,best_fitness,mean_fitness,std_fitness,n_species"
        assert len(lines) == len(sample_fitness_history) + 1  # header + data

    def test_csv_values_parseable(self, sample_fitness_history):
        csv = fitness_history_to_csv(sample_fitness_history)
        lines = csv.strip().split("\n")[1:]  # skip header
        for line in lines:
            parts = line.split(",")
            assert len(parts) == 5
            int(parts[0])  # generation is int
            float(parts[1])  # best_fitness
            float(parts[2])  # mean_fitness
            float(parts[3])  # std_fitness
            int(parts[4])  # n_species

    def test_empty_history(self):
        csv = fitness_history_to_csv([])
        assert csv == "generation,best_fitness,mean_fitness,std_fitness,n_species"


class TestConnectomeExportJSON:
    """Tests for connectome JSON export."""

    def test_basic_export(self):
        genome_dict = {
            "id": "test_genome",
            "generation": 5,
            "fitness": 0.85,
            "template_name": "c_elegans",
            "neuron_ids": ["N1", "N2", "N3"],
            "neuron_types": {"N1": "sensory", "N2": "inter", "N3": "motor"},
            "neuron_nts": {"N1": "ACh", "N2": "ACh", "N3": None},
            "pre_indices": [0, 1],
            "post_indices": [1, 2],
            "weights": [1.5, -0.8],
            "synapse_types": [0, 0],
        }

        export = connectome_to_export_json(genome_dict)

        assert export["format"] == "neurevo_connectome_v1"
        assert export["genome_id"] == "test_genome"
        assert export["generation"] == 5
        assert export["fitness"] == 0.85
        assert len(export["neurons"]["ids"]) == 3
        assert len(export["synapses"]["weights"]) == 2
        assert export["statistics"]["n_neurons"] == 3
        assert export["statistics"]["n_synapses"] == 2

    def test_export_is_json_serializable(self):
        genome_dict = {
            "id": "json_test",
            "generation": 0,
            "fitness": 0.0,
            "neuron_ids": ["A"],
            "neuron_types": {},
            "neuron_nts": {},
            "pre_indices": [],
            "post_indices": [],
            "weights": [],
            "synapse_types": [],
        }

        export = connectome_to_export_json(genome_dict)
        # Should not raise
        serialized = json.dumps(export)
        assert len(serialized) > 0
