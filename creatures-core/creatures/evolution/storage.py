"""Storage backend for evolutionary runs.

Uses SQLite for metadata and HDF5 for genome data.
Supports checkpointing, loading, and querying evolution history.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from creatures.evolution.genome import Genome

logger = logging.getLogger(__name__)


@dataclass
class GenerationRecord:
    """Record of a single generation's statistics."""

    run_id: str
    generation: int
    best_fitness: float
    mean_fitness: float
    std_fitness: float
    n_species: int
    n_neurons_mean: float
    n_synapses_mean: float
    best_genome_id: str
    elapsed_seconds: float


class EvolutionStore:
    """Persistent storage for evolutionary runs."""

    def __init__(self, db_path: str | Path = "evolution.db") -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._db_path))
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                organism TEXT NOT NULL,
                config_json TEXT,
                started_at REAL,
                status TEXT DEFAULT 'created'
            );

            CREATE TABLE IF NOT EXISTS generations (
                run_id TEXT REFERENCES runs(id),
                generation INTEGER,
                best_fitness REAL,
                mean_fitness REAL,
                std_fitness REAL,
                n_species INTEGER,
                n_neurons_mean REAL,
                n_synapses_mean REAL,
                best_genome_id TEXT,
                elapsed_seconds REAL,
                PRIMARY KEY (run_id, generation)
            );

            CREATE TABLE IF NOT EXISTS genomes (
                id TEXT PRIMARY KEY,
                run_id TEXT REFERENCES runs(id),
                generation INTEGER,
                fitness REAL,
                n_neurons INTEGER,
                n_synapses INTEGER,
                hdf5_path TEXT
            );
        """)
        self._conn.commit()

    def create_run(self, run_id: str, organism: str, config: dict) -> None:
        self._conn.execute(
            "INSERT INTO runs (id, organism, config_json, started_at, status) VALUES (?, ?, ?, ?, ?)",
            (run_id, organism, json.dumps(config), time.time(), "running"),
        )
        self._conn.commit()

    def save_generation(self, record: GenerationRecord) -> None:
        self._conn.execute(
            """INSERT OR REPLACE INTO generations
               (run_id, generation, best_fitness, mean_fitness, std_fitness,
                n_species, n_neurons_mean, n_synapses_mean, best_genome_id, elapsed_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record.run_id, record.generation, record.best_fitness,
                record.mean_fitness, record.std_fitness, record.n_species,
                record.n_neurons_mean, record.n_synapses_mean,
                record.best_genome_id, record.elapsed_seconds,
            ),
        )
        self._conn.commit()

    def save_genome(self, genome: Genome, run_id: str, checkpoint_dir: str | Path) -> str:
        """Save a genome to HDF5 and register in database."""
        checkpoint_dir = Path(checkpoint_dir)
        hdf5_path = checkpoint_dir / f"gen_{genome.generation}" / f"{genome.id}.h5"
        genome.save(hdf5_path)

        self._conn.execute(
            """INSERT OR REPLACE INTO genomes (id, run_id, generation, fitness, n_neurons, n_synapses, hdf5_path)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (genome.id, run_id, genome.generation, genome.fitness,
             genome.n_neurons, genome.n_synapses, str(hdf5_path)),
        )
        self._conn.commit()
        return str(hdf5_path)

    def get_fitness_history(self, run_id: str) -> list[dict]:
        cursor = self._conn.execute(
            "SELECT generation, best_fitness, mean_fitness, std_fitness FROM generations WHERE run_id = ? ORDER BY generation",
            (run_id,),
        )
        return [
            {"generation": r[0], "best_fitness": r[1], "mean_fitness": r[2], "std_fitness": r[3]}
            for r in cursor.fetchall()
        ]

    def get_run_status(self, run_id: str) -> dict | None:
        cursor = self._conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return {"id": row[0], "organism": row[1], "config": json.loads(row[2] or "{}"),
                "started_at": row[3], "status": row[4]}

    def update_run_status(self, run_id: str, status: str) -> None:
        self._conn.execute("UPDATE runs SET status = ? WHERE id = ?", (status, run_id))
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()
