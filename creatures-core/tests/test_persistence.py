"""Tests for NeurevoStore file-based persistence."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from creatures.storage.persistence import NeurevoStore


@pytest.fixture
def tmp_store(tmp_path: Path) -> NeurevoStore:
    """Create a NeurevoStore backed by a temporary directory."""
    return NeurevoStore(data_dir=str(tmp_path / "test_data"))


class TestExperiments:
    def test_save_and_get_experiment(self, tmp_store: NeurevoStore):
        tmp_store.save_experiment(
            exp_id="exp-001",
            name="Touch Withdrawal",
            organism="c_elegans",
            config={"duration_ms": 5000, "n_repeats": 3},
            results={"summary": {"mean_response": 0.85}},
        )
        result = tmp_store.get_experiment("exp-001")
        assert result is not None
        assert result["id"] == "exp-001"
        assert result["name"] == "Touch Withdrawal"
        assert result["organism"] == "c_elegans"
        assert result["status"] == "completed"
        assert result["config"]["duration_ms"] == 5000
        assert result["results"]["summary"]["mean_response"] == 0.85
        assert result["created_at"] is not None

    def test_get_nonexistent_experiment(self, tmp_store: NeurevoStore):
        assert tmp_store.get_experiment("nonexistent") is None

    def test_list_experiments(self, tmp_store: NeurevoStore):
        for i in range(5):
            tmp_store.save_experiment(
                exp_id=f"exp-{i:03d}",
                name=f"Experiment {i}",
                organism="c_elegans",
                config={"index": i},
            )
        results = tmp_store.list_experiments(limit=3)
        assert len(results) == 3
        # All results should have IDs
        assert all(r["id"] for r in results)

    def test_list_experiments_empty(self, tmp_store: NeurevoStore):
        assert tmp_store.list_experiments() == []

    def test_save_experiment_without_results(self, tmp_store: NeurevoStore):
        tmp_store.save_experiment(
            exp_id="exp-no-results",
            name="Pending",
            organism="drosophila",
            config={"steps": 10},
        )
        result = tmp_store.get_experiment("exp-no-results")
        assert result is not None
        assert result["results"] is None

    def test_update_experiment(self, tmp_store: NeurevoStore):
        """INSERT OR REPLACE should update existing records."""
        tmp_store.save_experiment(
            exp_id="exp-upd",
            name="Original",
            organism="c_elegans",
            config={},
            status="running",
        )
        tmp_store.save_experiment(
            exp_id="exp-upd",
            name="Updated",
            organism="c_elegans",
            config={"updated": True},
            results={"done": True},
            status="completed",
        )
        result = tmp_store.get_experiment("exp-upd")
        assert result["name"] == "Updated"
        assert result["status"] == "completed"
        assert result["results"]["done"] is True


class TestEvolutionRuns:
    def test_save_and_get_evolution_run(self, tmp_store: NeurevoStore):
        world_log = [
            {"type": "epoch_start", "generation": 0, "text": "Life begins..."},
            {"type": "milestone", "generation": 50, "text": "Breakthrough!"},
        ]
        tmp_store.save_evolution_run(
            run_id="run-001",
            organism="c_elegans",
            config={"population_size": 100, "n_generations": 200},
            status="completed",
            generations=200,
            best_fitness=0.95,
            world_log=world_log,
            report="Evolution completed successfully.",
        )
        result = tmp_store.get_evolution_run("run-001")
        assert result is not None
        assert result["id"] == "run-001"
        assert result["organism"] == "c_elegans"
        assert result["status"] == "completed"
        assert result["generations"] == 200
        assert result["best_fitness"] == 0.95
        assert len(result["world_log"]) == 2
        assert result["world_log"][1]["text"] == "Breakthrough!"
        assert result["final_report"] == "Evolution completed successfully."

    def test_get_nonexistent_run(self, tmp_store: NeurevoStore):
        assert tmp_store.get_evolution_run("nonexistent") is None

    def test_list_evolution_runs(self, tmp_store: NeurevoStore):
        for i in range(4):
            tmp_store.save_evolution_run(
                run_id=f"run-{i:03d}",
                organism="drosophila",
                config={"index": i},
                status="completed",
                generations=100,
                best_fitness=0.5 + i * 0.1,
            )
        results = tmp_store.list_evolution_runs(limit=2)
        assert len(results) == 2

    def test_save_run_without_world_log(self, tmp_store: NeurevoStore):
        tmp_store.save_evolution_run(
            run_id="run-no-log",
            organism="c_elegans",
            config={},
            status="failed",
            generations=10,
            best_fitness=0.1,
        )
        result = tmp_store.get_evolution_run("run-no-log")
        assert result is not None
        assert result["world_log"] is None
        assert result["final_report"] is None


class TestGenomes:
    def test_save_and_get_genome(self, tmp_store: NeurevoStore):
        genome_data = {
            "neurons": [
                {"id": "n0", "bias": 0.1, "tau": 10.0, "type": "excitatory"},
                {"id": "n1", "bias": -0.2, "tau": 15.0, "type": "inhibitory"},
            ],
            "synapses": [
                {"pre": "n0", "post": "n1", "weight": 0.5, "delay": 1.0},
            ],
        }
        tmp_store.save_genome(
            genome_id="g-001",
            run_id="run-001",
            generation=100,
            fitness=0.92,
            n_neurons=2,
            n_synapses=1,
            data=genome_data,
        )
        result = tmp_store.get_genome("g-001")
        assert result is not None
        assert result["id"] == "g-001"
        assert result["run_id"] == "run-001"
        assert result["generation"] == 100
        assert result["fitness"] == 0.92
        assert result["n_neurons"] == 2
        assert result["n_synapses"] == 1
        assert len(result["data"]["neurons"]) == 2
        assert result["data"]["synapses"][0]["weight"] == 0.5

    def test_get_nonexistent_genome(self, tmp_store: NeurevoStore):
        assert tmp_store.get_genome("nonexistent") is None

    def test_list_genomes_for_run(self, tmp_store: NeurevoStore):
        for i in range(3):
            tmp_store.save_genome(
                genome_id=f"g-{i}",
                run_id="run-x",
                generation=i * 10,
                fitness=0.5 + i * 0.1,
                n_neurons=10,
                n_synapses=20,
                data={"gen": i},
            )
        genomes = tmp_store.list_genomes_for_run("run-x")
        assert len(genomes) == 3
        # Should be ordered by generation DESC
        assert genomes[0]["generation"] == 20
        assert genomes[2]["generation"] == 0


class TestDrugScreenings:
    def test_save_and_get_drug_screening(self, tmp_store: NeurevoStore):
        tmp_store.save_drug_screening(
            screening_id="ds-001",
            experiment_id="exp-001",
            drugs=[{"name": "dopamine", "concentration": 0.5}],
            results={"effect": "increased_activity", "magnitude": 0.3},
        )
        result = tmp_store.get_drug_screening("ds-001")
        assert result is not None
        assert result["drugs"][0]["name"] == "dopamine"
        assert result["results"]["magnitude"] == 0.3


class TestEcosystemSnapshots:
    def test_save_and_get_history(self, tmp_store: NeurevoStore):
        for step in range(5):
            tmp_store.save_ecosystem_snapshot(
                ecosystem_id="eco-001",
                step_number=step,
                state={"population": 10 + step, "food": 100 - step * 5},
            )
        history = tmp_store.get_ecosystem_history("eco-001", limit=3)
        assert len(history) == 3
        # Ordered by step_number DESC
        assert history[0]["step_number"] == 4
        assert history[2]["step_number"] == 2


class TestPersistenceAcrossReinit:
    def test_data_survives_store_reinitialization(self, tmp_path: Path):
        """Data persists when creating a new NeurevoStore with the same data_dir."""
        data_dir = str(tmp_path / "persist_test")

        # First store: save data
        store1 = NeurevoStore(data_dir=data_dir)
        store1.save_experiment(
            exp_id="persist-exp",
            name="Persistence Test",
            organism="c_elegans",
            config={"key": "value"},
            results={"score": 42},
        )
        store1.save_evolution_run(
            run_id="persist-run",
            organism="drosophila",
            config={"pop": 50},
            status="completed",
            generations=100,
            best_fitness=0.88,
            world_log=[{"event": "milestone"}],
        )
        store1.save_genome(
            genome_id="persist-genome",
            run_id="persist-run",
            generation=100,
            fitness=0.88,
            n_neurons=5,
            n_synapses=8,
            data={"neurons": [], "synapses": []},
        )

        # Second store: same directory, fresh instance
        store2 = NeurevoStore(data_dir=data_dir)

        exp = store2.get_experiment("persist-exp")
        assert exp is not None
        assert exp["name"] == "Persistence Test"
        assert exp["results"]["score"] == 42

        run = store2.get_evolution_run("persist-run")
        assert run is not None
        assert run["best_fitness"] == 0.88
        assert run["world_log"][0]["event"] == "milestone"

        genome = store2.get_genome("persist-genome")
        assert genome is not None
        assert genome["fitness"] == 0.88

    def test_db_file_created(self, tmp_path: Path):
        """The SQLite database file should be created on init."""
        data_dir = tmp_path / "db_check"
        store = NeurevoStore(data_dir=str(data_dir))
        assert (data_dir / "neurevo.db").exists()


class TestEnvVarConfig:
    def test_default_data_dir(self, monkeypatch, tmp_path: Path):
        """NEUREVO_DATA_DIR env var should configure the data directory."""
        target = str(tmp_path / "env_test_data")
        monkeypatch.setenv("NEUREVO_DATA_DIR", target)
        store = NeurevoStore()  # No explicit data_dir
        assert str(store.data_dir) == target
        assert store.db_path == Path(target) / "neurevo.db"
