"""Tests for the God Agent: AI-guided evolutionary interventions."""

import asyncio

import pytest

from creatures.evolution.mutation import MutationConfig
from creatures.god.agent import GodAgent, GodConfig


@pytest.fixture()
def agent(monkeypatch: pytest.MonkeyPatch) -> GodAgent:
    """Create a GodAgent in fallback mode (no API key)."""
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    return GodAgent(GodConfig(api_key=None))


def _make_stats(generation: int, best: float, mean: float) -> dict:
    return {"generation": generation, "best_fitness": best, "mean_fitness": mean}


def _make_pop_summary() -> dict:
    return {"size": 50, "n_species": 3}


def _make_env_state() -> dict:
    return {"n_food": 5, "n_obstacles": 2}


# ── Construction ─────────────────────────────────────────────────────


class TestGodAgentCreation:
    """Tests for GodAgent construction without API key."""

    def test_creates_without_api_key(self, agent: GodAgent):
        assert agent.config.api_key is None

    def test_has_empty_history(self, agent: GodAgent):
        assert len(agent.history) == 0

    def test_has_empty_observations(self, agent: GodAgent):
        assert len(agent.observations) == 0


# ── Observation ──────────────────────────────────────────────────────


class TestObserve:
    """Tests for recording observations."""

    def test_observe_records_observation(self, agent: GodAgent):
        agent.observe(_make_stats(0, 50.0, 30.0), _make_pop_summary(), _make_env_state())
        assert len(agent.observations) == 1

    def test_observe_records_generation(self, agent: GodAgent):
        agent.observe(_make_stats(5, 60.0, 40.0), _make_pop_summary(), _make_env_state())
        assert agent.observations[0]["generation"] == 5

    def test_observe_accumulates(self, agent: GodAgent):
        for i in range(3):
            agent.observe(
                _make_stats(i, 50.0 + i, 30.0 + i), _make_pop_summary(), _make_env_state()
            )
        assert len(agent.observations) == 3


# ── Analyze and Intervene (fallback mode) ────────────────────────────


class TestAnalyzeAndIntervene:
    """Tests for fallback-mode analysis and intervention."""

    def test_returns_valid_dict_no_observations(self, agent: GodAgent):
        result = asyncio.get_event_loop().run_until_complete(agent.analyze_and_intervene())
        assert isinstance(result, dict)
        assert "analysis" in result
        assert "interventions" in result
        assert "hypothesis" in result

    def test_returns_valid_dict_with_observations(self, agent: GodAgent):
        agent.observe(_make_stats(0, 50.0, 30.0), _make_pop_summary(), _make_env_state())
        result = asyncio.get_event_loop().run_until_complete(agent.analyze_and_intervene())
        assert isinstance(result, dict)
        assert "analysis" in result

    def test_intervention_added_to_history(self, agent: GodAgent):
        asyncio.get_event_loop().run_until_complete(agent.analyze_and_intervene())
        assert len(agent.history) == 1

    def test_report_after_intervention(self, agent: GodAgent):
        asyncio.get_event_loop().run_until_complete(agent.analyze_and_intervene())
        report = agent.get_report()
        assert "Intervention 1" in report


# ── Stagnation detection ─────────────────────────────────────────────


class TestStagnationDetection:
    """Tests for detecting fitness stagnation."""

    def test_stagnation_after_flat_generations(self, agent: GodAgent):
        """After 10 flat generations, fallback should suggest interventions."""
        for i in range(10):
            agent.observe(
                _make_stats(i, 50.0, 30.0),  # constant fitness
                _make_pop_summary(),
                _make_env_state(),
            )
        result = asyncio.get_event_loop().run_until_complete(agent.analyze_and_intervene())
        # Should detect stagnation and propose interventions
        assert len(result["interventions"]) > 0
        actions = [a["action"] for a in result["interventions"]]
        assert "increase_mutation_rate" in actions

    def test_no_stagnation_with_improving_fitness(self, agent: GodAgent):
        """With improving fitness over 5 gens, should not detect stagnation."""
        for i in range(5):
            agent.observe(
                _make_stats(i, 50.0 + i * 5.0, 30.0 + i * 3.0),
                _make_pop_summary(),
                _make_env_state(),
            )
        result = asyncio.get_event_loop().run_until_complete(agent.analyze_and_intervene())
        stagnation_actions = [
            a for a in result["interventions"]
            if a.get("action") == "increase_mutation_rate"
        ]
        assert len(stagnation_actions) == 0


# ── Apply interventions ──────────────────────────────────────────────


class TestApplyInterventions:
    """Tests for applying interventions to simulation parameters."""

    def test_modifies_mutation_config(self, agent: GodAgent):
        mutation_config = MutationConfig()
        original_sigma = mutation_config.weight_perturb_sigma
        intervention = {
            "interventions": [
                {
                    "type": "evolution",
                    "action": "increase_mutation_rate",
                    "parameters": {"weight_perturb_sigma": 0.5},
                    "reasoning": "test",
                }
            ]
        }
        applied = agent.apply_interventions(intervention, mutation_config=mutation_config)
        assert len(applied) > 0
        assert mutation_config.weight_perturb_sigma == 0.5
        assert mutation_config.weight_perturb_sigma != original_sigma

    def test_modifies_add_synapse_rate(self, agent: GodAgent):
        mutation_config = MutationConfig()
        intervention = {
            "interventions": [
                {
                    "type": "evolution",
                    "action": "increase_topology_mutation",
                    "parameters": {"add_synapse_rate": 0.3},
                    "reasoning": "test",
                }
            ]
        }
        agent.apply_interventions(intervention, mutation_config=mutation_config)
        assert mutation_config.add_synapse_rate == 0.3

    def test_empty_interventions_returns_empty_list(self, agent: GodAgent):
        result = agent.apply_interventions({"interventions": []})
        assert result == []

    def test_ignores_unknown_intervention_type(self, agent: GodAgent):
        intervention = {
            "interventions": [
                {
                    "type": "unknown_type",
                    "action": "something",
                    "parameters": {},
                    "reasoning": "test",
                }
            ]
        }
        result = agent.apply_interventions(intervention)
        assert result == []
