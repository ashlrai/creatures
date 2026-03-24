"""Tests for the SimulationRunner brain-body coupling."""

import pytest

from creatures.body.worm_body import WormBody
from creatures.connectome.types import Connectome
from creatures.experiment.runner import CouplingConfig, SimFrame, SimulationRunner
from creatures.neural.brian2_engine import Brian2Engine


@pytest.fixture()
def runner(connectome: Connectome) -> SimulationRunner:
    """Create a coupled SimulationRunner."""
    engine = Brian2Engine()
    engine.build(connectome)
    body = WormBody()
    body.reset()
    return SimulationRunner(engine, body)


class TestSimulationRunnerCreation:
    """Tests for creating a SimulationRunner."""

    def test_runner_initial_time_is_zero(self, runner: SimulationRunner):
        assert runner.t_ms == 0.0

    def test_runner_has_no_frames_initially(self, runner: SimulationRunner):
        assert len(runner.frames) == 0


class TestPokeProducesActivity:
    """Tests for poking the worm and observing responses."""

    def test_poke_produces_neural_activity(self, runner: SimulationRunner):
        """A poke should produce neural spikes within ~40ms."""
        runner.poke("seg_8")
        all_active = set()
        for _ in range(40):
            frame = runner.step()
            all_active.update(frame.active_neurons)
        assert len(all_active) > 0, (
            "Expected neural activity within 40ms after poking seg_8"
        )

    def test_direct_stimulus_produces_muscle_activations(self, runner: SimulationRunner):
        """Directly stimulating a motor neuron should produce muscle activations."""
        # Stimulate VA1 (a motor neuron) with strong current to guarantee
        # it fires and the firing rate drives muscle output.
        runner.set_stimulus("VA1", 30.0)
        any_activation = False
        for _ in range(60):
            frame = runner.step()
            if any(abs(v) > 1e-6 for v in frame.muscle_activations.values()):
                any_activation = True
                break
        assert any_activation, (
            "Expected muscle activations after directly stimulating motor neuron VA1"
        )


class TestRunMethod:
    """Tests for the run convenience method."""

    def test_run_executes_without_error(self, runner: SimulationRunner):
        frames = runner.run(duration_ms=10.0)
        assert len(frames) > 0

    def test_run_returns_sim_frames(self, runner: SimulationRunner):
        frames = runner.run(duration_ms=5.0)
        for f in frames:
            assert isinstance(f, SimFrame)

    def test_run_with_poke(self, runner: SimulationRunner):
        frames = runner.run(duration_ms=20.0, poke_at_ms=5.0, poke_segment="seg_4")
        assert len(frames) > 0
        assert runner.t_ms == pytest.approx(20.0, abs=1.0)
