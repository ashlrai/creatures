"""Per-organism trajectory logging with HDF5 storage.

Records detailed trajectory data at two sampling rates:
  - Every sample_interval steps: top-K organisms by energy (detailed tracking)
  - Every snapshot_interval steps: full population snapshot

Data accumulates in memory and can be flushed to HDF5 on demand.
"""

from __future__ import annotations

import logging
from collections import deque
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from creatures.environment.brain_world import BrainWorld

logger = logging.getLogger(__name__)

# Graceful h5py import — HDF5 writes are skipped if unavailable
try:
    import h5py

    _HAS_H5PY = True
except ImportError:
    _HAS_H5PY = False
    logger.warning(
        "h5py not installed — TrajectoryRecorder will keep in-memory data "
        "but flush_to_hdf5() will be a no-op."
    )


class TrajectoryRecorder:
    """Records per-organism trajectory data for scientific analysis.

    Samples at two rates:
    - Every sample_interval steps: top-K organisms by energy (detailed tracking)
    - Every snapshot_interval steps: full population snapshot

    Data is stored in memory and flushed to HDF5 on demand.
    """

    def __init__(
        self,
        sample_interval: int = 10,
        snapshot_interval: int = 100,
        top_k: int = 50,
        max_samples: int = 1000,
    ) -> None:
        self.sample_interval = sample_interval
        self.snapshot_interval = snapshot_interval
        self.top_k = top_k
        self.max_samples = max_samples

        # Use deque for efficient O(1) left-popleft when exceeding cap
        self._samples: deque[dict[str, Any]] = deque(maxlen=max_samples)

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record_step(self, bw: BrainWorld, chemotaxis_index: float = 0.0) -> None:
        """Sample trajectory data from a BrainWorld at the current step.

        Called every step; internally decides whether to record based on
        sample_interval / snapshot_interval.
        """
        step = bw._step_count
        if step <= 0:
            return

        is_sample = (step % self.sample_interval == 0)
        is_snapshot = (step % self.snapshot_interval == 0)

        if not is_sample and not is_snapshot:
            return

        eco = bw.ecosystem
        engine = bw.engine
        n_engine = engine.n_organisms
        n_per = bw.n_per

        alive_mask = eco.alive[:n_engine]
        alive_idx = np.where(alive_mask)[0]

        if len(alive_idx) == 0:
            return

        # Population stats (always computed)
        alive_energies = eco.energy[alive_idx]
        pop_stats = {
            "alive": int(len(alive_idx)),
            "mean_energy": float(np.mean(alive_energies)),
            "max_generation": int(eco.generation[alive_idx].max()),
        }

        # Choose which organisms to record
        if is_snapshot:
            # Full population snapshot
            record_idx = alive_idx
        else:
            # Top-K by energy
            k = min(self.top_k, len(alive_idx))
            top_k_local = np.argpartition(alive_energies, -k)[-k:]
            record_idx = alive_idx[top_k_local]

        # Extract firing rate data (convert from backend to numpy once)
        fr_np = engine._to_numpy(engine.firing_rate)
        fired_np = engine._to_numpy(engine.fired)

        organisms: list[dict[str, Any]] = []
        for idx in record_idx:
            idx_int = int(idx)
            neuron_start = idx_int * n_per
            neuron_end = (idx_int + 1) * n_per
            org_fr = fr_np[neuron_start:neuron_end]

            organisms.append({
                "idx": idx_int,
                "x": float(eco.x[idx_int]),
                "y": float(eco.y[idx_int]),
                "heading": float(eco.heading[idx_int]),
                "energy": float(eco.energy[idx_int]),
                "generation": int(eco.generation[idx_int]),
                "lineage_id": int(eco.lineage_id[idx_int]),
                "species": int(eco.species[idx_int]),
                "mean_firing_rate": float(np.mean(org_fr)),
                "n_active": int(np.sum(fired_np[neuron_start:neuron_end])),
            })

        sample = {
            "step": step,
            "organisms": organisms,
            "population_stats": pop_stats,
            "chemotaxis_index": chemotaxis_index,
        }

        self._samples.append(sample)

    # ------------------------------------------------------------------
    # Access
    # ------------------------------------------------------------------

    @property
    def n_samples(self) -> int:
        """Number of samples currently in memory."""
        return len(self._samples)

    def get_samples(self) -> list[dict[str, Any]]:
        """Return a copy of all in-memory samples (oldest first)."""
        return list(self._samples)

    def clear(self) -> None:
        """Drop all in-memory samples."""
        self._samples.clear()

    # ------------------------------------------------------------------
    # HDF5 persistence
    # ------------------------------------------------------------------

    def flush_to_hdf5(self, filepath: str) -> int:
        """Write accumulated samples to an HDF5 file and clear memory.

        Creates group ``/trajectories/step_{N}/`` for each sample with:
          - datasets: positions (M,2), energies (M,), generations (M,),
            lineage_ids (M,), firing_rates (M,)
          - attributes: step, population_alive, chemotaxis_index

        Parameters
        ----------
        filepath:
            Path to the .h5 file.  Created if it does not exist;
            appended to if it does.

        Returns
        -------
        int
            Number of samples written.
        """
        if not _HAS_H5PY:
            logger.warning(
                "h5py not available — cannot flush %d samples to %s",
                len(self._samples), filepath,
            )
            return 0

        n_written = 0
        samples = list(self._samples)

        with h5py.File(filepath, "a") as f:
            traj_grp = f.require_group("trajectories")

            for sample in samples:
                step = sample["step"]
                grp_name = f"step_{step}"

                # Skip if this step already exists (idempotent)
                if grp_name in traj_grp:
                    continue

                orgs = sample["organisms"]
                if not orgs:
                    continue

                grp = traj_grp.create_group(grp_name)

                # Build arrays from organism dicts
                n = len(orgs)
                positions = np.empty((n, 2), dtype=np.float32)
                energies = np.empty(n, dtype=np.float32)
                generations = np.empty(n, dtype=np.int32)
                lineage_ids = np.empty(n, dtype=np.int32)
                firing_rates = np.empty(n, dtype=np.float32)

                for i, o in enumerate(orgs):
                    positions[i, 0] = o["x"]
                    positions[i, 1] = o["y"]
                    energies[i] = o["energy"]
                    generations[i] = o["generation"]
                    lineage_ids[i] = o["lineage_id"]
                    firing_rates[i] = o["mean_firing_rate"]

                grp.create_dataset("positions", data=positions)
                grp.create_dataset("energies", data=energies)
                grp.create_dataset("generations", data=generations)
                grp.create_dataset("lineage_ids", data=lineage_ids)
                grp.create_dataset("firing_rates", data=firing_rates)

                # Attributes
                grp.attrs["step"] = step
                grp.attrs["population_alive"] = sample["population_stats"]["alive"]
                grp.attrs["chemotaxis_index"] = sample["chemotaxis_index"]

                n_written += 1

        self._samples.clear()
        logger.info("Flushed %d trajectory samples to %s", n_written, filepath)
        return n_written
