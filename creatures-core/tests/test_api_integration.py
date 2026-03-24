"""Comprehensive end-to-end API integration tests for the Neurevo platform.

Run with:
    PYTHONPATH="creatures-core:creatures-api" .venv/bin/python -m pytest \
        creatures-core/tests/test_api_integration.py -v --tb=short

Requires the API server running on port 8420.
"""

from __future__ import annotations

import time

import pytest
import requests

BASE = "http://localhost:8420"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ok(r: requests.Response, expected: int = 200) -> dict:
    """Assert status code and return JSON body."""
    assert r.status_code == expected, (
        f"Expected {expected}, got {r.status_code}: {r.text[:500]}"
    )
    return r.json()


@pytest.fixture(scope="session")
def server_health():
    """Verify the API server is reachable before running any tests."""
    try:
        r = requests.get(f"{BASE}/health", timeout=5)
        assert r.status_code == 200
    except requests.ConnectionError:
        pytest.skip("API server not running on port 8420")


# ---------------------------------------------------------------------------
# 1. Root / Health
# ---------------------------------------------------------------------------


class TestHealthAndRoot:
    def test_root(self, server_health):
        data = _ok(requests.get(f"{BASE}/"))
        assert data["name"] == "Creatures API"
        assert "version" in data

    def test_health(self, server_health):
        data = _ok(requests.get(f"{BASE}/health"))
        assert data["status"] == "ok"


# ---------------------------------------------------------------------------
# 2. Simulation / Experiment Flow
# ---------------------------------------------------------------------------


class TestSimulationFlow:
    """Create experiments, list, get, start/pause/stop, delete."""

    def test_create_c_elegans(self, server_health):
        r = requests.post(
            f"{BASE}/experiments",
            json={"organism": "c_elegans", "name": "integration_test_ce"},
        )
        exp = _ok(r)
        assert exp["organism"] == "c_elegans"
        assert exp["n_neurons"] == 302 or exp["n_neurons"] == 299  # depends on dataset
        assert exp["n_neurons"] > 250
        assert exp["status"] == "ready"
        assert "id" in exp
        # Clean up
        requests.delete(f"{BASE}/experiments/{exp['id']}")

    def test_create_drosophila(self, server_health):
        r = requests.post(
            f"{BASE}/experiments",
            json={
                "organism": "drosophila",
                "name": "integration_test_fly",
                "neuropils": "locomotion",
                "max_neurons": 100,
            },
        )
        exp = _ok(r)
        assert exp["organism"] == "drosophila"
        assert exp["n_neurons"] > 0
        assert exp["n_neurons"] <= 100
        assert exp["status"] == "ready"
        requests.delete(f"{BASE}/experiments/{exp['id']}")

    def test_list_experiments(self, server_health):
        # Create one so there's at least one
        r1 = requests.post(
            f"{BASE}/experiments",
            json={"organism": "c_elegans", "name": "list_test"},
        )
        exp = _ok(r1)
        data = _ok(requests.get(f"{BASE}/experiments"))
        assert isinstance(data, list)
        assert any(e["id"] == exp["id"] for e in data)
        requests.delete(f"{BASE}/experiments/{exp['id']}")

    def test_get_experiment(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "get_test"},
            )
        )
        fetched = _ok(requests.get(f"{BASE}/experiments/{exp['id']}"))
        assert fetched["id"] == exp["id"]
        assert fetched["name"] == "get_test"
        requests.delete(f"{BASE}/experiments/{exp['id']}")

    def test_get_experiment_not_found(self, server_health):
        r = requests.get(f"{BASE}/experiments/nonexistent")
        assert r.status_code == 404

    def test_start_pause_stop(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "lifecycle_test"},
            )
        )
        sid = exp["id"]

        data = _ok(requests.post(f"{BASE}/experiments/{sid}/start"))
        assert data["status"] == "running"

        data = _ok(requests.post(f"{BASE}/experiments/{sid}/pause"))
        assert data["status"] == "paused"

        data = _ok(requests.post(f"{BASE}/experiments/{sid}/stop"))
        assert data["status"] == "stopped"

        requests.delete(f"{BASE}/experiments/{sid}")

    def test_delete_experiment(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "delete_test"},
            )
        )
        data = _ok(requests.delete(f"{BASE}/experiments/{exp['id']}"))
        assert data["deleted"] == exp["id"]
        # Confirm it's gone
        r = requests.get(f"{BASE}/experiments/{exp['id']}")
        assert r.status_code == 404

    def test_stimulate_neurons(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "stim_test"},
            )
        )
        sid = exp["id"]
        data = _ok(
            requests.post(
                f"{BASE}/experiments/{sid}/stimulate",
                json={"neuron_ids": ["AVAL", "AVAR"], "current_mV": 25.0},
            )
        )
        assert "stimulated" in data
        assert "AVAL" in data["stimulated"]
        requests.delete(f"{BASE}/experiments/{sid}")

    def test_lesion_neuron(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "lesion_test"},
            )
        )
        sid = exp["id"]
        data = _ok(
            requests.post(
                f"{BASE}/experiments/{sid}/lesion",
                json={"neuron_id": "AVAL"},
            )
        )
        assert "lesioned_neuron" in data
        requests.delete(f"{BASE}/experiments/{sid}")


# ---------------------------------------------------------------------------
# 3. Pharmacology Flow
# ---------------------------------------------------------------------------


class TestPharmacologyFlow:
    """Drug catalogue, dose-response, apply to simulation."""

    def test_list_drugs(self, server_health):
        data = _ok(requests.get(f"{BASE}/api/pharmacology/drugs"))
        assert isinstance(data, list)
        assert len(data) == 8
        keys = {d["key"] for d in data}
        assert "picrotoxin" in keys
        assert "levamisole" in keys

    def test_get_drug_info(self, server_health):
        data = _ok(requests.get(f"{BASE}/api/pharmacology/drugs/picrotoxin"))
        assert data["key"] == "picrotoxin"
        assert data["ec50"] == 0.5
        assert "description" in data

    def test_get_drug_not_found(self, server_health):
        r = requests.get(f"{BASE}/api/pharmacology/drugs/nonexistent_drug")
        assert r.status_code == 404

    def test_dose_response_curve(self, server_health):
        data = _ok(
            requests.get(f"{BASE}/api/pharmacology/drugs/picrotoxin/dose-response")
        )
        assert "curve" in data
        assert data["ec50"] == 0.5
        assert data["drug"] == "picrotoxin"
        assert len(data["curve"]) == 20  # default points=20
        # First point should be dose=0
        assert data["curve"][0]["dose"] == 0.0
        # Each point has dose, response, effective_scale
        for pt in data["curve"]:
            assert "dose" in pt
            assert "response" in pt
            assert "effective_scale" in pt

    def test_dose_response_custom_points(self, server_health):
        data = _ok(
            requests.get(
                f"{BASE}/api/pharmacology/drugs/levamisole/dose-response?points=10"
            )
        )
        assert len(data["curve"]) == 10

    def test_apply_drug_to_simulation(self, server_health):
        # Create a simulation first
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "pharma_apply_test"},
            )
        )
        sid = exp["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/pharmacology/{sid}/apply",
                json={"drug_name": "picrotoxin", "dose": 1.0},
            )
        )
        assert data["drug"].lower() == "picrotoxin"
        assert data["dose"] == 1.0
        assert "synapses_affected" in data
        assert "weight_scale_applied" in data

        # Check active drugs
        active = _ok(requests.get(f"{BASE}/api/pharmacology/{sid}/active"))
        assert isinstance(active, list)
        assert len(active) >= 1
        assert any(d["drug"].lower() == "picrotoxin" for d in active)

        # Reset drugs
        reset = _ok(requests.delete(f"{BASE}/api/pharmacology/{sid}/reset"))
        assert reset["reset"] is True

        # Active drugs should be empty now
        active2 = _ok(requests.get(f"{BASE}/api/pharmacology/{sid}/active"))
        assert len(active2) == 0

        requests.delete(f"{BASE}/experiments/{sid}")

    def test_batch_screen(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "screen_test"},
            )
        )
        sid = exp["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/pharmacology/{sid}/screen",
                json={"drugs": ["picrotoxin", "levamisole"], "doses": [0.5, 1.0]},
            )
        )
        assert "results" in data
        assert len(data["results"]) == 4  # 2 drugs x 2 doses
        for r in data["results"]:
            assert "drug" in r
            assert "dose" in r
            assert "predicted_effect" in r
        requests.delete(f"{BASE}/experiments/{sid}")


# ---------------------------------------------------------------------------
# 4. Evolution Flow
# ---------------------------------------------------------------------------


class TestEvolutionFlow:
    """Create, start, poll, check events/narrative."""

    def test_create_evolution_run(self, server_health):
        data = _ok(
            requests.post(
                f"{BASE}/evolution/runs",
                json={
                    "organism": "c_elegans",
                    "population_size": 10,
                    "n_generations": 2,
                },
            )
        )
        assert "id" in data
        assert data["status"] in ("ready", "created")
        assert data["population_size"] == 10
        assert data["n_generations"] == 2

    def test_list_evolution_runs(self, server_health):
        data = _ok(requests.get(f"{BASE}/evolution/runs"))
        assert isinstance(data, list)

    def test_evolution_run_lifecycle(self, server_health):
        """Create -> start -> wait for completion -> check history & events."""
        run = _ok(
            requests.post(
                f"{BASE}/evolution/runs",
                json={
                    "organism": "c_elegans",
                    "population_size": 10,
                    "n_generations": 3,
                },
            )
        )
        run_id = run["id"]

        # Start
        start_data = _ok(requests.post(f"{BASE}/evolution/runs/{run_id}/start"))
        assert start_data["status"] == "running"

        # Poll until completed (with timeout)
        completed = False
        for _ in range(60):
            info = _ok(requests.get(f"{BASE}/evolution/runs/{run_id}"))
            if info["status"] == "completed":
                completed = True
                break
            if info["status"] == "failed":
                pytest.fail(f"Evolution run failed: {info}")
            time.sleep(1)
        assert completed, f"Evolution run did not complete in 60s, status: {info['status']}"

        # Check final state -- generation counter may be 0-indexed
        # With n_generations=3, final generation is typically 2 or 3
        assert info["generation"] >= 2
        assert info["best_fitness"] > 0

        # Check history
        history = _ok(requests.get(f"{BASE}/evolution/runs/{run_id}/history"))
        assert isinstance(history, list)
        assert len(history) >= 2  # at least one per generation

        # Check world_log / narrative events
        events = _ok(requests.get(f"{BASE}/evolution/runs/{run_id}/events"))
        assert isinstance(events, list)
        assert len(events) > 0

    def test_get_run_not_found(self, server_health):
        r = requests.get(f"{BASE}/evolution/runs/nonexistent")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 5. God Agent Flow
# ---------------------------------------------------------------------------


class TestGodAgentFlow:
    """God Agent status, analyze, reports."""

    def test_god_status(self, server_health):
        data = _ok(requests.get(f"{BASE}/god/status"))
        assert "active" in data
        assert "total_interventions" in data

    def test_god_analyze(self, server_health):
        # Create and start an evolution run for the god agent to analyze
        run = _ok(
            requests.post(
                f"{BASE}/evolution/runs",
                json={
                    "organism": "c_elegans",
                    "population_size": 10,
                    "n_generations": 2,
                },
            )
        )
        run_id = run["id"]

        # Analyze (works even before starting -- uses stub fallback)
        data = _ok(
            requests.post(f"{BASE}/god/analyze", json={"run_id": run_id})
        )
        assert "analysis" in data
        assert "fitness_trend" in data
        assert "interventions" in data
        assert isinstance(data["interventions"], list)
        assert "hypothesis" in data
        assert "report" in data

    def test_god_analyze_not_found(self, server_health):
        r = requests.post(
            f"{BASE}/god/analyze", json={"run_id": "nonexistent"}
        )
        assert r.status_code == 404

    def test_god_reports(self, server_health):
        # Create a run to query reports for
        run = _ok(
            requests.post(
                f"{BASE}/evolution/runs",
                json={
                    "organism": "c_elegans",
                    "population_size": 10,
                    "n_generations": 2,
                },
            )
        )
        data = _ok(requests.get(f"{BASE}/god/reports/{run['id']}"))
        assert isinstance(data, list)


# ---------------------------------------------------------------------------
# 6. Ecosystem Flow
# ---------------------------------------------------------------------------


class TestEcosystemFlow:
    """Create ecosystem, step, stats, events, triggers."""

    def test_create_ecosystem(self, server_health):
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 10, "drosophila": 3}},
            )
        )
        assert "id" in data
        assert data["id"].startswith("eco_")

    def test_ecosystem_step(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(f"{BASE}/api/ecosystem/{eco_id}/step?steps=10")
        )
        assert data["steps_run"] == 10
        assert "time_ms" in data
        assert "events_count" in data

    def test_ecosystem_stats(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 8, "drosophila": 2}},
            )
        )
        eco_id = eco["id"]
        # Step a bit first
        _ok(requests.post(f"{BASE}/api/ecosystem/{eco_id}/step?steps=5"))
        stats = _ok(requests.get(f"{BASE}/api/ecosystem/{eco_id}/stats"))
        assert "total_alive" in stats or "by_species" in stats

    def test_ecosystem_get(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        data = _ok(requests.get(f"{BASE}/api/ecosystem/{eco_id}"))
        assert data["id"] == eco_id

    def test_ecosystem_not_found(self, server_health):
        r = requests.get(f"{BASE}/api/ecosystem/eco_nonexistent")
        assert r.status_code == 404

    def test_ecosystem_events(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        _ok(requests.post(f"{BASE}/api/ecosystem/{eco_id}/step?steps=50"))
        data = _ok(requests.get(f"{BASE}/api/ecosystem/{eco_id}/events"))
        assert "events" in data
        assert "total_events" in data

    def test_ecosystem_trigger_food_scarcity(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}, "n_food_sources": 10},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem/{eco_id}/event",
                json={"type": "food_scarcity"},
            )
        )
        assert data["type"] == "env_food_scarcity"
        assert "food_removed" in data

    def test_ecosystem_trigger_predator_surge(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5, "drosophila": 2}},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem/{eco_id}/event",
                json={"type": "predator_surge"},
            )
        )
        assert data["type"] == "env_predator_surge"
        assert "organisms_added" in data

    def test_ecosystem_trigger_mutation_burst(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem/{eco_id}/event",
                json={"type": "mutation_burst"},
            )
        )
        assert data["type"] == "env_mutation_burst"
        assert "organisms_boosted" in data

    def test_ecosystem_trigger_climate_shift(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem/{eco_id}/event",
                json={"type": "climate_shift"},
            )
        )
        assert data["type"] == "env_climate_shift"

    def test_ecosystem_add_organism(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 3}},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem/{eco_id}/add-organism",
                json={"species": "c_elegans", "energy": 80.0},
            )
        )
        assert data["species"] == "c_elegans"
        assert "organism_id" in data
        assert data["energy"] == 80.0

    def test_ecosystem_drug(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        data = _ok(
            requests.post(
                f"{BASE}/api/ecosystem/{eco_id}/drug",
                json={"species": "c_elegans", "drug": "picrotoxin", "dose": 1.0},
            )
        )
        assert data["type"] == "drug_applied"
        assert data["organisms_affected"] >= 1

    def test_ecosystem_timeline(self, server_health):
        eco = _ok(
            requests.post(
                f"{BASE}/api/ecosystem",
                json={"populations": {"c_elegans": 5}},
            )
        )
        eco_id = eco["id"]
        # Step enough to get at least one timeline snapshot
        _ok(requests.post(f"{BASE}/api/ecosystem/{eco_id}/step?steps=200"))
        data = _ok(requests.get(f"{BASE}/api/ecosystem/{eco_id}/timeline"))
        assert "snapshots" in data
        assert data["current_step"] == 200


# ---------------------------------------------------------------------------
# 7. Circuit Analysis Flow
# ---------------------------------------------------------------------------


class TestCircuitAnalysis:
    """Shortest path, hubs, motifs, communities, layers, bottlenecks, neuron profile."""

    @pytest.fixture(scope="class")
    def sim_id(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "analysis_test"},
            )
        )
        yield exp["id"]
        requests.delete(f"{BASE}/experiments/{exp['id']}")

    def test_shortest_path(self, sim_id):
        data = _ok(
            requests.get(
                f"{BASE}/api/analysis/{sim_id}/shortest-path",
                params={"source": "AVAL", "target": "VA1"},
            )
        )
        assert data["source"] == "AVAL"
        assert data["target"] == "VA1"
        assert "path" in data
        assert isinstance(data["path"], list)
        assert len(data["path"]) >= 2
        assert data["path"][0] == "AVAL"
        assert data["path"][-1] == "VA1"
        assert data["length"] == len(data["path"]) - 1

    def test_shortest_path_no_path(self, sim_id):
        # Use a non-existent neuron to provoke a 404 or empty result
        r = requests.get(
            f"{BASE}/api/analysis/{sim_id}/shortest-path",
            params={"source": "AVAL", "target": "NONEXISTENT"},
        )
        assert r.status_code == 404

    def test_hub_neurons(self, sim_id):
        data = _ok(
            requests.get(
                f"{BASE}/api/analysis/{sim_id}/hubs", params={"top_n": 5}
            )
        )
        assert "hubs" in data
        assert isinstance(data["hubs"], list)
        assert len(data["hubs"]) == 5

    def test_motifs(self, sim_id):
        data = _ok(requests.get(f"{BASE}/api/analysis/{sim_id}/motifs"))
        assert "motifs" in data
        assert isinstance(data["motifs"], dict)

    def test_communities(self, sim_id):
        data = _ok(
            requests.get(
                f"{BASE}/api/analysis/{sim_id}/communities", params={"n": 3}
            )
        )
        assert data["n_communities"] == 3
        assert "assignments" in data
        assert "groups" in data

    def test_neuron_profile_analysis(self, sim_id):
        data = _ok(
            requests.get(f"{BASE}/api/analysis/{sim_id}/neuron/AVAL")
        )
        # neuron_profile should return connectivity info
        assert isinstance(data, dict)

    def test_layers(self, sim_id):
        data = _ok(requests.get(f"{BASE}/api/analysis/{sim_id}/layers"))
        assert isinstance(data, dict)

    def test_bottlenecks(self, sim_id):
        data = _ok(requests.get(f"{BASE}/api/analysis/{sim_id}/bottlenecks"))
        assert "bottlenecks" in data
        assert "count" in data


# ---------------------------------------------------------------------------
# 8. Neural Metrics Flow
# ---------------------------------------------------------------------------


class TestNeuralMetrics:
    """Summary, top-active, oscillations, firing-patterns for a simulation."""

    @pytest.fixture(scope="class")
    def sim_id(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "metrics_test"},
            )
        )
        sid = exp["id"]
        # Run a few steps to generate some neural activity
        requests.post(f"{BASE}/experiments/{sid}/start?speed=1.0")
        time.sleep(2)
        requests.post(f"{BASE}/experiments/{sid}/pause")
        time.sleep(0.5)
        yield sid
        requests.delete(f"{BASE}/experiments/{sid}")

    def test_summary(self, sim_id):
        data = _ok(requests.get(f"{BASE}/api/metrics/{sim_id}/summary"))
        assert "n_neurons" in data
        assert "synchrony_index" in data

    def test_top_active(self, sim_id):
        data = _ok(
            requests.get(f"{BASE}/api/metrics/{sim_id}/top-active?n=5")
        )
        assert "neurons" in data
        assert isinstance(data["neurons"], list)
        assert len(data["neurons"]) <= 5
        assert "n_total" in data
        assert "n_active" in data

    def test_oscillations(self, sim_id):
        data = _ok(requests.get(f"{BASE}/api/metrics/{sim_id}/oscillations"))
        assert "peak_frequency_hz" in data
        assert "has_data" in data

    def test_firing_patterns(self, sim_id):
        data = _ok(
            requests.get(f"{BASE}/api/metrics/{sim_id}/firing-patterns")
        )
        assert "patterns" in data
        assert "counts" in data
        assert "n_neurons" in data


# ---------------------------------------------------------------------------
# 9. Neuron Data Endpoints
# ---------------------------------------------------------------------------


class TestNeuronEndpoints:
    """Positions, gene expression, profiles."""

    def test_neuron_positions(self, server_health):
        data = _ok(requests.get(f"{BASE}/neurons/positions"))
        assert isinstance(data, dict)
        assert len(data) > 100  # Expecting ~300 neuron positions

    def test_gene_summary(self, server_health):
        data = _ok(requests.get(f"{BASE}/neurons/genes/summary"))
        assert data["neurons_with_data"] > 0
        assert data["drug_targets"] > 0
        assert isinstance(data["neuron_ids"], list)

    def test_gene_drug_target(self, server_health):
        data = _ok(
            requests.get(f"{BASE}/neurons/genes/drug/levamisole")
        )
        assert data["drug"] == "levamisole"
        assert "affected_neurons" in data
        assert len(data["affected_neurons"]) > 0

    def test_gene_receptor(self, server_health):
        # First get available receptor IDs from gene summary
        summary = _ok(requests.get(f"{BASE}/neurons/genes/summary"))
        # Try to find a receptor -- query one of the known neuron's data
        neuron_ids = summary["neuron_ids"]
        if neuron_ids:
            # Try getting gene data for a known neuron to find a receptor
            gene_data = _ok(
                requests.get(f"{BASE}/neurons/{neuron_ids[0]}/genes")
            )
            receptors = gene_data.get("receptors", [])
            if receptors:
                r_data = _ok(
                    requests.get(
                        f"{BASE}/neurons/genes/receptor/{receptors[0]}"
                    )
                )
                assert "receptor" in r_data
                assert "expressing_neurons" in r_data

    def test_neuron_profile_static(self, server_health):
        """Test the static neuron profile endpoint (no sim needed)."""
        data = _ok(requests.get(f"{BASE}/neurons/AVAL/profile"))
        assert data["id"] == "AVAL"
        assert "type" in data
        assert "in_degree" in data
        assert "out_degree" in data
        assert "hub_score" in data
        assert "presynaptic" in data
        assert "postsynaptic" in data

    def test_neuron_profile_not_found(self, server_health):
        r = requests.get(f"{BASE}/neurons/NONEXISTENT/profile")
        assert r.status_code == 404

    def test_neuron_info_for_sim(self, server_health):
        exp = _ok(
            requests.post(
                f"{BASE}/experiments",
                json={"organism": "c_elegans", "name": "neuron_info_test"},
            )
        )
        sid = exp["id"]
        data = _ok(requests.get(f"{BASE}/neurons/{sid}/info"))
        assert isinstance(data, list)
        assert len(data) > 200
        for n in data[:3]:
            assert "id" in n
            assert "type" in n
            assert "firing_rate" in n
        requests.delete(f"{BASE}/experiments/{sid}")

    def test_neuron_genes(self, server_health):
        data = _ok(requests.get(f"{BASE}/neurons/AVAL/genes"))
        assert data["neuron_id"] == "AVAL"
        assert "receptors" in data or "ion_channels" in data


# ---------------------------------------------------------------------------
# Run standalone
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
