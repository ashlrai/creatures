"""Loader for the Drosophila melanogaster connectome from FlyWire.

Data sources:
- FlyWire v783 connectivity: Zenodo https://zenodo.org/records/10676866
- Neuron annotations: https://github.com/flyconnectome/flywire_annotations
- 139,255 proofread neurons, 50M+ synapses

This loader supports:
- Full connectome loading (requires ~1GB download)
- Brain region (neuropil) subsetting for manageable circuit sizes
- Neuron type and neurotransmitter annotations
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from creatures.connectome.types import (
    Connectome,
    Neuron,
    NeuronType,
    Synapse,
    SynapseType,
)

logger = logging.getLogger(__name__)

_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "flywire"

# Zenodo download URLs for FlyWire v783
_CONNECTIONS_URL = "https://zenodo.org/records/10676866/files/proofread_connections_783.feather?download=1"
_ROOT_IDS_URL = "https://zenodo.org/records/10676866/files/proofread_root_ids_783.npy?download=1"
_NEUROPIL_PRE_URL = "https://zenodo.org/records/10676866/files/per_neuron_neuropil_count_pre_783.feather?download=1"
_NEUROPIL_POST_URL = "https://zenodo.org/records/10676866/files/per_neuron_neuropil_count_post_783.feather?download=1"

# Annotations from flyconnectome GitHub
_ANNOTATIONS_URL = "https://raw.githubusercontent.com/flyconnectome/flywire_annotations/main/supplemental_files/Supplemental_file1_neuron_annotations.tsv"

# Neurotransmitter → excitatory/inhibitory mapping
_INHIBITORY_NTS = {"GABA", "gaba"}
_EXCITATORY_NTS = {"acetylcholine", "ACh", "glutamate", "octopamine", "serotonin", "dopamine"}

# Key neuropil subsets for specific circuits
NEUROPIL_PRESETS = {
    "antennal_lobe": ["AL_R", "AL_L"],
    "mushroom_body": ["MB_CA_R", "MB_CA_L", "MB_PED_R", "MB_PED_L",
                       "MB_VL_R", "MB_VL_L", "MB_ML_R", "MB_ML_L"],
    "central_complex": ["FB", "EB", "PB", "NO"],
    "optic_lobe_right": ["ME_R", "LO_R", "LOP_R"],
    "locomotion": ["T1_R", "T1_L", "T2_R", "T2_L", "T3_R", "T3_L",
                    "ANm", "GNG"],
    "all_sensory": ["AL_R", "AL_L", "ME_R", "ME_L", "LO_R", "LO_L"],
}


def _download_file(url: str, dest: Path, desc: str = "") -> Path:
    """Download a file with progress logging."""
    if dest.exists():
        logger.info(f"Using cached: {dest.name}")
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading {desc or dest.name} ({url})...")

    response = requests.get(url, stream=True)
    response.raise_for_status()
    total = int(response.headers.get("content-length", 0))

    with open(dest, "wb") as f:
        downloaded = 0
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)
            if total > 0 and downloaded % (10 * 1024 * 1024) < 8192:
                pct = downloaded / total * 100
                logger.info(f"  {downloaded / 1e6:.0f}MB / {total / 1e6:.0f}MB ({pct:.0f}%)")

    logger.info(f"  Saved: {dest} ({dest.stat().st_size / 1e6:.1f}MB)")
    return dest


def download_data(data_dir: str | Path | None = None) -> dict[str, Path]:
    """Download all FlyWire data files.

    Returns dict mapping file type to local path.
    """
    data_dir = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)

    files = {}
    files["connections"] = _download_file(
        _CONNECTIONS_URL, data_dir / "proofread_connections_783.feather",
        "connectivity edge list (852MB)"
    )
    files["root_ids"] = _download_file(
        _ROOT_IDS_URL, data_dir / "proofread_root_ids_783.npy",
        "neuron root IDs (1MB)"
    )
    files["annotations"] = _download_file(
        _ANNOTATIONS_URL, data_dir / "neuron_annotations.tsv",
        "neuron annotations TSV"
    )
    return files


def load_annotations(data_dir: str | Path | None = None) -> pd.DataFrame:
    """Load neuron annotation table.

    Columns include: root_id, flow, super_class, cell_class, cell_type,
    nerve, side, nt_type (neurotransmitter), etc.
    """
    data_dir = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR
    ann_path = data_dir / "neuron_annotations.tsv"

    if not ann_path.exists():
        _download_file(_ANNOTATIONS_URL, ann_path, "neuron annotations")

    df = pd.read_csv(ann_path, sep="\t")
    logger.info(f"Loaded {len(df)} neuron annotations")
    return df


def _classify_neuron_type(row: pd.Series) -> NeuronType:
    """Classify a FlyWire neuron based on its annotations."""
    flow = str(row.get("flow", "")).lower()
    super_class = str(row.get("super_class", "")).lower()

    if flow == "sensory" or super_class == "sensory":
        return NeuronType.SENSORY
    if flow == "motor" or super_class == "motor":
        return NeuronType.MOTOR
    return NeuronType.INTER


def load(
    neuropils: list[str] | str | None = None,
    max_neurons: int | None = None,
    data_dir: str | Path | None = None,
    min_synapse_count: int = 3,
) -> Connectome:
    """Load the Drosophila connectome from FlyWire v783 data.

    Args:
        neuropils: Filter to specific brain regions. Can be:
            - A preset name: "antennal_lobe", "central_complex", etc.
            - A list of neuropil codes: ["AL_R", "AL_L"]
            - None for the full connectome (WARNING: 139K neurons, very large)
        max_neurons: Limit the number of neurons (for testing).
        data_dir: Directory for data files.
        min_synapse_count: Minimum synapse count to include a connection.

    Returns:
        Drosophila connectome.
    """
    data_dir = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR

    # Resolve neuropil preset
    if isinstance(neuropils, str):
        if neuropils in NEUROPIL_PRESETS:
            neuropils = NEUROPIL_PRESETS[neuropils]
        else:
            neuropils = [neuropils]

    # Load annotations
    ann_df = load_annotations(data_dir)

    # Load connections
    conn_path = data_dir / "proofread_connections_783.feather"
    if not conn_path.exists():
        download_data(data_dir)

    logger.info(f"Loading connections from {conn_path.name}...")
    conn_df = pd.read_feather(conn_path)
    logger.info(f"  {len(conn_df)} connections loaded")

    # Filter by synapse count
    if min_synapse_count > 1:
        conn_df = conn_df[conn_df["syn_count"] >= min_synapse_count]
        logger.info(f"  {len(conn_df)} after filtering (min {min_synapse_count} synapses)")

    # If neuropil filtering requested, identify neurons in those regions
    if neuropils:
        # Load neuropil counts to identify neurons in target regions
        pre_path = data_dir / "per_neuron_neuropil_count_pre_783.feather"
        if not pre_path.exists():
            _download_file(_NEUROPIL_PRE_URL, pre_path, "neuropil pre-synaptic counts")

        neuropil_df = pd.read_feather(pre_path)

        # Filter to neurons that have synapses in target neuropils
        target_cols = [c for c in neuropil_df.columns if c in neuropils]
        if not target_cols:
            available = [c for c in neuropil_df.columns if c != "root_id"]
            raise ValueError(
                f"No matching neuropils found. Available: {sorted(available)[:20]}"
            )

        # Neurons with any presynaptic output in target neuropils
        mask = neuropil_df[target_cols].sum(axis=1) > 0
        target_ids = set(neuropil_df.loc[mask, "root_id"].values)
        logger.info(f"  {len(target_ids)} neurons in neuropils {neuropils}")

        # Filter connections to only those between target neurons
        conn_df = conn_df[
            conn_df["pre_root_id"].isin(target_ids) &
            conn_df["post_root_id"].isin(target_ids)
        ]
        logger.info(f"  {len(conn_df)} connections in target region")

    # Apply max_neurons limit
    if max_neurons:
        all_ids = sorted(set(conn_df["pre_root_id"]) | set(conn_df["post_root_id"]))
        if len(all_ids) > max_neurons:
            # Take the most connected neurons
            degree = conn_df["pre_root_id"].value_counts().add(
                conn_df["post_root_id"].value_counts(), fill_value=0
            )
            top_ids = set(degree.nlargest(max_neurons).index)
            conn_df = conn_df[
                conn_df["pre_root_id"].isin(top_ids) &
                conn_df["post_root_id"].isin(top_ids)
            ]
            logger.info(f"  Limited to {max_neurons} most-connected neurons")

    # Build neuron objects
    all_neuron_ids = sorted(set(conn_df["pre_root_id"]) | set(conn_df["post_root_id"]))
    ann_lookup = ann_df.set_index("root_id") if "root_id" in ann_df.columns else pd.DataFrame()

    neurons: dict[str, Neuron] = {}
    for nid in all_neuron_ids:
        nid_str = str(nid)
        row = ann_lookup.loc[nid] if nid in ann_lookup.index else pd.Series()

        nt = None
        for nt_col in ("top_nt", "known_nt", "nt_type"):
            if nt_col in row.index and pd.notna(row.get(nt_col)):
                nt = str(row[nt_col])
                break

        neurons[nid_str] = Neuron(
            id=nid_str,
            neuron_type=_classify_neuron_type(row) if len(row) > 0 else NeuronType.UNKNOWN,
            neurotransmitter=nt,
            metadata={
                k: str(v) for k, v in row.items()
                if pd.notna(v) and k in ("cell_class", "cell_type", "flow", "super_class", "side")
            } if len(row) > 0 else {},
        )

    # Build synapses
    synapses: list[Synapse] = []
    for _, row in conn_df.iterrows():
        pre_str = str(row["pre_root_id"])
        post_str = str(row["post_root_id"])
        if pre_str in neurons and post_str in neurons:
            nt = neurons[pre_str].neurotransmitter
            synapses.append(Synapse(
                pre_id=pre_str,
                post_id=post_str,
                weight=float(row["syn_count"]),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter=nt,
            ))

    connectome = Connectome(
        name=f"drosophila_flywire_v783{'_' + '_'.join(neuropils) if neuropils else ''}",
        neurons=neurons,
        synapses=synapses,
        metadata={
            "species": "Drosophila melanogaster",
            "source": "FlyWire v783",
            "reference": "Dorkenwald et al., Nature 2024",
            "neuropils": neuropils or "all",
        },
    )

    logger.info(connectome.summary())
    return connectome
