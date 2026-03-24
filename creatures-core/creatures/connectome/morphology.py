"""Neuron morphology loading and mesh generation using NAVis.

NAVis (https://navis-org.github.io/navis/) is a Python library for
neuron analysis and visualization. We use it to:
- Load neuron morphologies from SWC files or FlyWire
- Generate 3D meshes from skeleton data
- Export vertices/faces for Three.js rendering

This enables rendering actual neuron morphologies (not just point positions)
in the web frontend.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


def skeleton_to_mesh(
    nodes: list[dict],
    tube_radius: float = 0.5,
) -> dict:
    """Convert a neuron skeleton (node list) to a 3D mesh.

    Args:
        nodes: List of dicts with keys: node_id, x, y, z, radius, parent_id
        tube_radius: Base tube radius for the mesh.

    Returns:
        dict with 'vertices' (Nx3 array) and 'faces' (Mx3 array)
    """
    try:
        import navis
        import pandas as pd
    except ImportError:
        raise ImportError("pip install navis to generate neuron meshes")

    df = pd.DataFrame(nodes)
    required = {"node_id", "x", "y", "z", "radius", "parent_id"}
    if not required.issubset(df.columns):
        raise ValueError(f"Nodes must have columns: {required}")

    tn = navis.TreeNeuron(df, units="um")
    mesh = navis.conversion.tree2meshneuron(tn)

    return {
        "vertices": np.array(mesh.vertices).tolist(),
        "faces": np.array(mesh.faces).tolist(),
        "n_vertices": len(mesh.vertices),
        "n_faces": len(mesh.faces),
    }


def load_swc(path: str | Path) -> dict:
    """Load a neuron morphology from an SWC file.

    SWC is the standard format for neuron reconstructions.
    Returns vertices and faces for 3D rendering.
    """
    try:
        import navis
    except ImportError:
        raise ImportError("pip install navis to load SWC files")

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"SWC file not found: {path}")

    tn = navis.read_swc(str(path))
    mesh = navis.conversion.tree2meshneuron(tn)

    return {
        "vertices": np.array(mesh.vertices).tolist(),
        "faces": np.array(mesh.faces).tolist(),
        "n_vertices": len(mesh.vertices),
        "n_faces": len(mesh.faces),
        "name": tn.name if hasattr(tn, "name") else path.stem,
    }


def generate_connectome_meshes(
    neuron_positions: dict[str, list[float]],
    neuron_types: dict[str, str],
    scale: float = 0.001,
) -> dict:
    """Generate simplified mesh data for all neurons in a connectome.

    Instead of full morphology (which requires SWC data), this creates
    simple sphere-like representations at the soma position.

    Returns a dict that can be serialized to JSON for the frontend.
    """
    neurons = []
    for nid, pos in neuron_positions.items():
        ntype = neuron_types.get(nid, "unknown")
        neurons.append({
            "id": nid,
            "type": ntype,
            "position": [p * scale for p in pos],
            "radius": 0.002 if ntype == "inter" else 0.003,
        })

    return {
        "neurons": neurons,
        "count": len(neurons),
        "scale": scale,
    }
