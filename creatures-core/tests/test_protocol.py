"""Tests for the structured experiment protocol system."""

import pytest

from creatures.experiment.protocol import (
    ExperimentProtocol,
    ExperimentResult,
    ExperimentRunner,
    ExperimentStep,
    MeasurementResult,
    PRESET_EXPERIMENTS,
)


# ── Protocol Construction ───────────────────────────────────────────


class TestProtocolConstruction:
    """Tests for building protocols with the fluent API."""

    def test_empty_protocol(self):
        p = ExperimentProtocol(name="empty", description="No steps")
        assert p.name == "empty"
        assert len(p.steps) == 0

    def test_fluent_add_stimulus(self):
        p = ExperimentProtocol(name="test", description="fluent test")
        result = p.add_stimulus(100, ["ASEL"], current_mV=20.0)
        assert result is p, "add_stimulus should return self for chaining"
        assert len(p.steps) == 1
        assert p.steps[0].action == "stimulus"
        assert p.steps[0].parameters["neuron_ids"] == ["ASEL"]

    def test_fluent_add_drug(self):
        p = ExperimentProtocol(name="test", description="drug test")
        result = p.add_drug(200, "picrotoxin", dose=0.5)
        assert result is p
        assert p.steps[0].action == "drug"
        assert p.steps[0].parameters["drug_name"] == "picrotoxin"

    def test_fluent_add_lesion(self):
        p = ExperimentProtocol(name="test", description="lesion test")
        result = p.add_lesion(300, "AVAL")
        assert result is p
        assert p.steps[0].action == "lesion"
        assert p.steps[0].parameters["neuron_id"] == "AVAL"

    def test_fluent_add_measurement(self):
        p = ExperimentProtocol(name="test", description="measure test")
        result = p.add_measurement(400, "motor_activity")
        assert result is p
        assert p.steps[0].action == "measure"
        assert p.steps[0].parameters["metric"] == "motor_activity"

    def test_fluent_add_poke(self):
        p = ExperimentProtocol(name="test", description="poke test")
        result = p.add_poke(500, "seg_4")
        assert result is p
        assert p.steps[0].action == "poke"
        assert p.steps[0].parameters["segment"] == "seg_4"

    def test_fluent_chaining(self):
        """Build a multi-step protocol with chaining."""
        p = (
            ExperimentProtocol(name="chained", description="chained test")
            .add_poke(100, "seg_8")
            .add_measurement(200, "motor_latency")
            .add_drug(300, "picrotoxin")
            .add_measurement(500, "motor_activity")
        )
        assert len(p.steps) == 4
        assert p.steps[0].action == "poke"
        assert p.steps[1].action == "measure"
        assert p.steps[2].action == "drug"
        assert p.steps[3].action == "measure"

    def test_sorted_steps(self):
        """Steps should be sortable by time regardless of insertion order."""
        p = ExperimentProtocol(name="sort", description="sort test")
        p.add_measurement(500, "motor_activity")
        p.add_poke(100, "seg_8")
        p.add_measurement(300, "displacement")

        sorted_steps = p.sorted_steps()
        assert sorted_steps[0].time_ms == 100
        assert sorted_steps[1].time_ms == 300
        assert sorted_steps[2].time_ms == 500

    def test_default_values(self):
        p = ExperimentProtocol(name="defaults", description="test defaults")
        assert p.organism == "c_elegans"
        assert p.duration_ms == 10000.0
        assert p.n_repeats == 1
        assert p.control is True


# ── Preset Experiments ──────────────────────────────────────────────


class TestPresetExperiments:
    """Tests for the preset experiment library."""

    def test_presets_exist(self):
        assert "touch_withdrawal" in PRESET_EXPERIMENTS
        assert "drug_dose_response" in PRESET_EXPERIMENTS
        assert "gaba_knockout" in PRESET_EXPERIMENTS
        assert "chemotaxis_learning" in PRESET_EXPERIMENTS

    def test_preset_types(self):
        for name, proto in PRESET_EXPERIMENTS.items():
            assert isinstance(proto, ExperimentProtocol), f"{name} is not an ExperimentProtocol"
            assert len(proto.steps) > 0, f"{name} has no steps"
            assert proto.duration_ms > 0, f"{name} has invalid duration"

    def test_touch_withdrawal_has_poke(self):
        tw = PRESET_EXPERIMENTS["touch_withdrawal"]
        poke_steps = [s for s in tw.steps if s.action == "poke"]
        assert len(poke_steps) >= 1

    def test_touch_withdrawal_has_measurements(self):
        tw = PRESET_EXPERIMENTS["touch_withdrawal"]
        measure_steps = [s for s in tw.steps if s.action == "measure"]
        assert len(measure_steps) >= 1


# ── Running Experiments ─────────────────────────────────────────────


class TestExperimentRunner:
    """Tests for running experiment protocols against real simulation.

    These tests use short durations to keep runtime reasonable while
    still verifying that the protocol machinery works end-to-end.
    """

    def test_touch_withdrawal_produces_measurements(self):
        """The touch withdrawal preset should produce measurement results."""
        # Use a shorter version for testing speed
        proto = ExperimentProtocol(
            name="Touch Withdrawal (test)",
            description="Short test version",
            steps=[
                ExperimentStep(50, "poke", {"segment": "seg_8"}, "Touch"),
                ExperimentStep(50, "measure", {"metric": "motor_latency"}, "Latency"),
                ExperimentStep(150, "measure", {"metric": "displacement"}, "Displacement"),
            ],
            duration_ms=160.0,
            control=False,  # skip control for speed
        )
        runner = ExperimentRunner(proto)
        result = runner.run()

        assert isinstance(result, ExperimentResult)
        assert len(result.measurements) >= 2, "Expected at least 2 measurements"
        assert result.protocol.name == "Touch Withdrawal (test)"

    def test_control_condition_runs_without_stimuli(self):
        """When control=True, a second trial runs without any stimuli."""
        proto = ExperimentProtocol(
            name="Control test",
            description="Test control condition",
            steps=[
                ExperimentStep(20, "poke", {"segment": "seg_8"}, "Touch"),
                ExperimentStep(40, "measure", {"metric": "baseline_activity"}, "Activity"),
            ],
            duration_ms=50.0,
            control=True,
        )
        runner = ExperimentRunner(proto)
        result = runner.run()

        assert result.control_measurements is not None
        assert len(result.control_measurements) >= 1

    def test_measurements_recorded_at_correct_times(self):
        """Measurements should be taken at approximately the times specified."""
        proto = ExperimentProtocol(
            name="Timing test",
            description="Verify measurement timing",
            steps=[
                ExperimentStep(10, "measure", {"metric": "baseline_activity"}, "Early"),
                ExperimentStep(80, "measure", {"metric": "baseline_activity"}, "Late"),
            ],
            duration_ms=100.0,
            control=False,
        )
        runner = ExperimentRunner(proto)
        result = runner.run()

        assert len(result.measurements) == 2
        # First measurement should be around t=10ms (within sync interval tolerance)
        assert result.measurements[0].time_ms <= 12.0, (
            f"First measurement at {result.measurements[0].time_ms}ms, expected ~10ms"
        )
        # Second measurement should be around t=80ms
        assert result.measurements[1].time_ms <= 82.0, (
            f"Second measurement at {result.measurements[1].time_ms}ms, expected ~80ms"
        )

    def test_result_to_report_generates_markdown(self):
        """to_report() should generate valid markdown with expected sections."""
        proto = ExperimentProtocol(
            name="Report test",
            description="Test markdown report generation",
            steps=[
                ExperimentStep(10, "measure", {"metric": "baseline_activity"}, "Activity"),
            ],
            duration_ms=30.0,
            control=True,
        )
        runner = ExperimentRunner(proto)
        result = runner.run()
        report = result.to_report()

        assert isinstance(report, str)
        assert "# Experiment Report: Report test" in report
        assert "## Protocol" in report
        assert "## Results" in report
        assert "## Summary Statistics" in report
        assert "baseline_activity" in report

    def test_stimulus_protocol_runs(self):
        """A protocol with neural stimulation should execute without errors."""
        proto = ExperimentProtocol(
            name="Stimulus test",
            description="Test direct neural stimulation",
            steps=[
                ExperimentStep(10, "stimulus", {"neuron_ids": ["AVAL"], "current_mV": 20.0}, "Stimulate"),
                ExperimentStep(80, "measure", {"metric": "motor_activity"}, "Response"),
            ],
            duration_ms=100.0,
            control=False,
        )
        runner = ExperimentRunner(proto)
        result = runner.run()
        assert len(result.measurements) >= 1

    def test_summary_statistics_computed(self):
        """Summary should contain aggregated statistics."""
        proto = ExperimentProtocol(
            name="Stats test",
            description="Test summary statistics",
            steps=[
                ExperimentStep(10, "measure", {"metric": "baseline_activity"}, "Activity"),
            ],
            duration_ms=50.0,
            control=False,
        )
        runner = ExperimentRunner(proto)
        result = runner.run()

        assert "n_trials" in result.summary
        assert result.summary["n_trials"] == 1
        assert "baseline_activity_mean" in result.summary

    def test_frames_collected(self):
        """Simulation frames should be collected during the run."""
        proto = ExperimentProtocol(
            name="Frames test",
            description="Check frames are recorded",
            steps=[
                ExperimentStep(10, "measure", {"metric": "spike_count"}, "Count"),
            ],
            duration_ms=50.0,
            control=False,
        )
        runner = ExperimentRunner(proto)
        result = runner.run()

        assert len(result.frames) > 0
        # Should have approximately duration_ms / sync_interval frames
        assert len(result.frames) == pytest.approx(50, abs=5)
