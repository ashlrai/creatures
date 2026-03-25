"""File-based persistence for Neurevo experiments and results.

Uses SQLite for structured storage with JSON serialization for complex data.
No ORM — just raw SQL + json.dumps/loads.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _default_data_dir() -> str:
    """Return the data directory, configurable via NEUREVO_DATA_DIR env var."""
    return os.environ.get("NEUREVO_DATA_DIR", "neurevo_data")


class NeurevoStore:
    """File-based persistence for Neurevo experiments and results.

    Stores: experiments, evolution runs, evolved genomes, drug screening
    results, ecosystem snapshots, and experiment protocols.
    """

    def __init__(self, data_dir: str | None = None):
        self.data_dir = Path(data_dir or _default_data_dir())
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "neurevo.db"
        self._init_db()

    def _init_db(self) -> None:
        """Create SQLite tables if they don't exist."""
        conn = sqlite3.connect(str(self.db_path))
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS experiments (
                id TEXT PRIMARY KEY,
                name TEXT,
                organism TEXT,
                created_at TEXT,
                status TEXT,
                config TEXT,
                results TEXT
            );
            CREATE TABLE IF NOT EXISTS evolution_runs (
                id TEXT PRIMARY KEY,
                organism TEXT,
                created_at TEXT,
                status TEXT,
                generations INTEGER,
                best_fitness REAL,
                config TEXT,
                world_log TEXT,
                final_report TEXT
            );
            CREATE TABLE IF NOT EXISTS genomes (
                id TEXT PRIMARY KEY,
                run_id TEXT,
                generation INTEGER,
                fitness REAL,
                n_neurons INTEGER,
                n_synapses INTEGER,
                data TEXT,
                FOREIGN KEY (run_id) REFERENCES evolution_runs(id)
            );
            CREATE TABLE IF NOT EXISTS drug_screenings (
                id TEXT PRIMARY KEY,
                experiment_id TEXT,
                created_at TEXT,
                drugs TEXT,
                results TEXT
            );
            CREATE TABLE IF NOT EXISTS ecosystem_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ecosystem_id TEXT,
                step_number INTEGER,
                created_at TEXT,
                state TEXT
            );
        """)
        conn.close()

    def _connect(self) -> sqlite3.Connection:
        """Return a new connection with row_factory set to sqlite3.Row."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _gen_id() -> str:
        return str(uuid.uuid4())[:8]

    @staticmethod
    def _to_json(obj: Any) -> str | None:
        if obj is None:
            return None
        return json.dumps(obj)

    @staticmethod
    def _from_json(text: str | None) -> Any:
        if text is None:
            return None
        return json.loads(text)

    # ── Experiments ──────────────────────────────────────────────────

    def save_experiment(
        self,
        exp_id: str,
        name: str,
        organism: str,
        config: dict,
        results: dict | None = None,
        status: str = "completed",
    ) -> None:
        """Insert or replace an experiment record."""
        conn = self._connect()
        conn.execute(
            """INSERT OR REPLACE INTO experiments
               (id, name, organism, created_at, status, config, results)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                exp_id,
                name,
                organism,
                self._now(),
                status,
                self._to_json(config),
                self._to_json(results),
            ),
        )
        conn.commit()
        conn.close()

    def get_experiment(self, exp_id: str) -> dict | None:
        """Retrieve a single experiment by ID."""
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM experiments WHERE id = ?", (exp_id,)
        ).fetchone()
        conn.close()
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "organism": row["organism"],
            "created_at": row["created_at"],
            "status": row["status"],
            "config": self._from_json(row["config"]),
            "results": self._from_json(row["results"]),
        }

    def list_experiments(self, limit: int = 50) -> list[dict]:
        """List experiments, most recent first."""
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM experiments ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "organism": r["organism"],
                "created_at": r["created_at"],
                "status": r["status"],
                "config": self._from_json(r["config"]),
                "results": self._from_json(r["results"]),
            }
            for r in rows
        ]

    # ── Evolution Runs ───────────────────────────────────────────────

    def save_evolution_run(
        self,
        run_id: str,
        organism: str,
        config: dict,
        status: str,
        generations: int,
        best_fitness: float,
        world_log: list[dict] | None = None,
        report: str | None = None,
    ) -> None:
        """Insert or replace an evolution run record."""
        conn = self._connect()
        conn.execute(
            """INSERT OR REPLACE INTO evolution_runs
               (id, organism, created_at, status, generations, best_fitness,
                config, world_log, final_report)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id,
                organism,
                self._now(),
                status,
                generations,
                best_fitness,
                self._to_json(config),
                self._to_json(world_log),
                report,
            ),
        )
        conn.commit()
        conn.close()

    def get_evolution_run(self, run_id: str) -> dict | None:
        """Retrieve a single evolution run by ID."""
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM evolution_runs WHERE id = ?", (run_id,)
        ).fetchone()
        conn.close()
        if row is None:
            return None
        return {
            "id": row["id"],
            "organism": row["organism"],
            "created_at": row["created_at"],
            "status": row["status"],
            "generations": row["generations"],
            "best_fitness": row["best_fitness"],
            "config": self._from_json(row["config"]),
            "world_log": self._from_json(row["world_log"]),
            "final_report": row["final_report"],
        }

    def list_evolution_runs(self, limit: int = 50) -> list[dict]:
        """List evolution runs, most recent first."""
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM evolution_runs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "organism": r["organism"],
                "created_at": r["created_at"],
                "status": r["status"],
                "generations": r["generations"],
                "best_fitness": r["best_fitness"],
                "config": self._from_json(r["config"]),
                "world_log": self._from_json(r["world_log"]),
                "final_report": r["final_report"],
            }
            for r in rows
        ]

    # ── Genomes ──────────────────────────────────────────────────────

    def save_genome(
        self,
        genome_id: str,
        run_id: str,
        generation: int,
        fitness: float,
        n_neurons: int,
        n_synapses: int,
        data: dict,
    ) -> None:
        """Insert or replace a genome record."""
        conn = self._connect()
        conn.execute(
            """INSERT OR REPLACE INTO genomes
               (id, run_id, generation, fitness, n_neurons, n_synapses, data)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                genome_id,
                run_id,
                generation,
                fitness,
                n_neurons,
                n_synapses,
                self._to_json(data),
            ),
        )
        conn.commit()
        conn.close()

    def get_genome(self, genome_id: str) -> dict | None:
        """Retrieve a genome by ID."""
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM genomes WHERE id = ?", (genome_id,)
        ).fetchone()
        conn.close()
        if row is None:
            return None
        return {
            "id": row["id"],
            "run_id": row["run_id"],
            "generation": row["generation"],
            "fitness": row["fitness"],
            "n_neurons": row["n_neurons"],
            "n_synapses": row["n_synapses"],
            "data": self._from_json(row["data"]),
        }

    def list_genomes_for_run(self, run_id: str) -> list[dict]:
        """List all genomes for a given evolution run."""
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM genomes WHERE run_id = ? ORDER BY generation DESC",
            (run_id,),
        ).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "run_id": r["run_id"],
                "generation": r["generation"],
                "fitness": r["fitness"],
                "n_neurons": r["n_neurons"],
                "n_synapses": r["n_synapses"],
                "data": self._from_json(r["data"]),
            }
            for r in rows
        ]

    # ── Drug Screenings ──────────────────────────────────────────────

    def save_drug_screening(
        self,
        screening_id: str,
        experiment_id: str,
        drugs: list[dict],
        results: dict,
    ) -> None:
        """Insert or replace a drug screening record."""
        conn = self._connect()
        conn.execute(
            """INSERT OR REPLACE INTO drug_screenings
               (id, experiment_id, created_at, drugs, results)
               VALUES (?, ?, ?, ?, ?)""",
            (
                screening_id,
                experiment_id,
                self._now(),
                self._to_json(drugs),
                self._to_json(results),
            ),
        )
        conn.commit()
        conn.close()

    def get_drug_screening(self, screening_id: str) -> dict | None:
        """Retrieve a drug screening by ID."""
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM drug_screenings WHERE id = ?", (screening_id,)
        ).fetchone()
        conn.close()
        if row is None:
            return None
        return {
            "id": row["id"],
            "experiment_id": row["experiment_id"],
            "created_at": row["created_at"],
            "drugs": self._from_json(row["drugs"]),
            "results": self._from_json(row["results"]),
        }

    # ── Ecosystem Snapshots ──────────────────────────────────────────

    def save_ecosystem_snapshot(
        self,
        ecosystem_id: str,
        step_number: int,
        state: dict,
    ) -> None:
        """Append a snapshot of ecosystem state (subsampled)."""
        conn = self._connect()
        conn.execute(
            """INSERT INTO ecosystem_snapshots
               (ecosystem_id, step_number, created_at, state)
               VALUES (?, ?, ?, ?)""",
            (
                ecosystem_id,
                step_number,
                self._now(),
                self._to_json(state),
            ),
        )
        conn.commit()
        conn.close()

    def get_ecosystem_history(
        self, ecosystem_id: str, limit: int = 100
    ) -> list[dict]:
        """Get recent snapshots for an ecosystem, ordered by step."""
        conn = self._connect()
        rows = conn.execute(
            """SELECT * FROM ecosystem_snapshots
               WHERE ecosystem_id = ?
               ORDER BY step_number DESC LIMIT ?""",
            (ecosystem_id, limit),
        ).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "ecosystem_id": r["ecosystem_id"],
                "step_number": r["step_number"],
                "created_at": r["created_at"],
                "state": self._from_json(r["state"]),
            }
            for r in rows
        ]
