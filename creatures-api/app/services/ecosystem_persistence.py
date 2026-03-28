"""Ecosystem persistence -- checkpoint and restore brain-worlds to/from disk."""

import json
import logging
import os
import time
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

CHECKPOINT_DIR = Path(os.environ.get("NEUREVO_DATA_DIR", "neurevo_data")) / "checkpoints"
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


def save_checkpoint(bw_id: str, bw, config: dict = None) -> str:
    """Save full ecosystem state to disk. Returns checkpoint path."""
    cp_dir = CHECKPOINT_DIR / bw_id
    cp_dir.mkdir(parents=True, exist_ok=True)

    eco = bw.ecosystem
    engine = bw.engine

    # Save ecosystem arrays
    np.savez_compressed(
        cp_dir / "ecosystem.npz",
        x=eco.x, y=eco.y, heading=eco.heading,
        energy=eco.energy, alive=eco.alive,
        species=eco.species, age=eco.age, speed=eco.speed,
        generation=eco.generation, parent_id=eco.parent_id,
        lineage_id=eco.lineage_id, lifetime_food=eco.lifetime_food,
        food_x=eco.food_x, food_y=eco.food_y,
        food_energy=eco.food_energy, food_alive=eco.food_alive,
    )

    # Save neural weights
    syn_w = engine._to_numpy(engine.syn_w)
    np.save(cp_dir / "syn_w.npy", syn_w)

    # Save metadata
    meta = {
        "bw_id": bw_id,
        "timestamp": time.time(),
        "step_count": bw._step_count,
        "n_organisms": engine.n_organisms,
        "neurons_per": engine.n_per if hasattr(engine, 'n_per') else engine.n_total // max(engine.n_organisms, 1),
        "arena_size": eco.arena_size,
        "alive": int(eco.alive.sum()),
        "total_born": eco._total_born,
        "total_died": eco._total_died,
        "max_generation": int(eco.generation[eco.alive].max()) if eco.alive.any() else 0,
        "config": config or {},
    }
    with open(cp_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2, default=str)

    logger.info(f"Checkpoint saved: {bw_id} (step {bw._step_count}, {meta['alive']} alive)")
    return str(cp_dir)


def restore_checkpoint(bw_id: str):
    """Restore ecosystem from checkpoint. Returns (BrainWorld, metadata)."""
    cp_dir = CHECKPOINT_DIR / bw_id
    if not cp_dir.exists():
        return None, None

    # Load metadata
    with open(cp_dir / "meta.json") as f:
        meta = json.load(f)

    # Recreate BrainWorld
    from creatures.environment.brain_world import BrainWorld
    bw = BrainWorld(
        n_organisms=meta["n_organisms"],
        neurons_per_organism=meta["neurons_per"],
        arena_size=meta["arena_size"],
        world_type=meta.get("config", {}).get("world_type", "pond"),
    )

    # Restore ecosystem arrays
    eco_data = np.load(cp_dir / "ecosystem.npz")
    eco = bw.ecosystem
    for key in eco_data.files:
        if hasattr(eco, key):
            arr = eco_data[key]
            target = getattr(eco, key)
            # Handle size mismatch (overcapacity may differ)
            n = min(len(arr), len(target))
            target[:n] = arr[:n]
    eco._total_born = meta.get("total_born", 0)
    eco._total_died = meta.get("total_died", 0)

    # Restore neural weights
    syn_w_path = cp_dir / "syn_w.npy"
    if syn_w_path.exists():
        saved_w = np.load(syn_w_path)
        engine = bw.engine
        n = min(len(saved_w), engine.n_synapses)
        if len(saved_w) != engine.n_synapses:
            logger.warning(
                "Checkpoint weight shape mismatch: saved %d, engine %d. "
                "Partial restore — weights beyond index %d retain random init.",
                len(saved_w), engine.n_synapses, n,
            )
        if engine._backend == 'mlx':
            import mlx.core as mx
            engine.syn_w = mx.array(saved_w[:n])
        else:
            engine.syn_w[:n] = saved_w[:n]

    bw._step_count = meta.get("step_count", 0)
    bw.time_ms = float(meta.get("step_count", 0))

    logger.info(f"Checkpoint restored: {bw_id} (step {bw._step_count}, {meta['alive']} alive)")
    return bw, meta


def list_checkpoints() -> list[dict]:
    """List all saved checkpoints with metadata."""
    checkpoints = []
    if not CHECKPOINT_DIR.exists():
        return checkpoints
    for cp_dir in CHECKPOINT_DIR.iterdir():
        if cp_dir.is_dir():
            meta_path = cp_dir / "meta.json"
            if meta_path.exists():
                try:
                    with open(meta_path) as f:
                        meta = json.load(f)
                    checkpoints.append(meta)
                except Exception:
                    pass
    return sorted(checkpoints, key=lambda x: x.get("timestamp", 0), reverse=True)
