"""Loader for the C. elegans connectome from OpenWorm/WormWiring data.

Data sources:
- Cook et al. 2019 adjacency matrices (SI 5, corrected July 2020)
  from https://wormwiring.org
- OpenWorm c302 neuron tables (CElegansNeuronTables.xls)
  from https://github.com/openworm/c302
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from creatures.connectome.types import (
    Connectome,
    Neuron,
    NeuronType,
    Synapse,
    SynapseType,
)

logger = logging.getLogger(__name__)

# Default data directory
_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "openworm"

# Well-known C. elegans neuron classifications
# Sensory neurons from WormAtlas / OpenWorm
SENSORY_NEURONS = {
    "ADEL", "ADER", "ADFL", "ADFR", "ADLL", "ADLR", "AFDL", "AFDR",
    "ALML", "ALMR", "ALNL", "ALNR", "AQR", "ASEL", "ASER", "ASGL", "ASGR",
    "ASHL", "ASHR", "ASIL", "ASIR", "ASJL", "ASJR", "ASKL", "ASKR",
    "AWAL", "AWAR", "AWBL", "AWBR", "AWCL", "AWCR",
    "BAGL", "BAGR", "CEPDL", "CEPDR", "CEPVL", "CEPVR",
    "FLPL", "FLPR", "IL1DL", "IL1DR", "IL1L", "IL1R", "IL1VL", "IL1VR",
    "IL2DL", "IL2DR", "IL2L", "IL2R", "IL2VL", "IL2VR",
    "OLLL", "OLLR", "OLQDL", "OLQDR", "OLQVL", "OLQVR",
    "PHAL", "PHAR", "PHBL", "PHBR", "PHCL", "PHCR",
    "PLML", "PLMR", "PLNL", "PLNR", "PQR",
    "PVDL", "PVDR", "SDQL", "SDQR", "URBL", "URBR",
    "URXL", "URXR", "URADL", "URADR", "URAVL", "URAVR",
    "URYDL", "URYDR", "URYVL", "URYVR",
}

# Neurotransmitter mapping: primary neurotransmitter for each neuron class
# Derived from Bentley et al. 2016, Pereira et al. 2015, and WormAtlas
_NT_GABA = {"DD01", "DD02", "DD03", "DD04", "DD05", "DD06",
            "VD01", "VD02", "VD03", "VD04", "VD05", "VD06", "VD07",
            "VD08", "VD09", "VD10", "VD11", "VD12", "VD13",
            "AVL", "DVB", "RIS", "RMEL", "RMER", "RMED", "RMEV"}

_NT_ACH = {"AS1", "AS2", "AS3", "AS4", "AS5", "AS6", "AS7", "AS8", "AS9",
           "AS10", "AS11",
           "DA1", "DA2", "DA3", "DA4", "DA5", "DA6", "DA7", "DA8", "DA9",
           "DB1", "DB2", "DB3", "DB4", "DB5", "DB6", "DB7",
           "VA1", "VA2", "VA3", "VA4", "VA5", "VA6", "VA7", "VA8", "VA9",
           "VA10", "VA11", "VA12",
           "VB1", "VB2", "VB3", "VB4", "VB5", "VB6", "VB7", "VB8", "VB9",
           "VB10", "VB11",
           "VC01", "VC02", "VC03", "VC04", "VC05", "VC06",
           "SAA", "SAADL", "SAADR", "SAAVL", "SAAVR",
           "SABVL", "SABVR", "SABD"}

_NT_GLUTAMATE = {"AIAL", "AIAR", "AIBL", "AIBR", "AIML", "AIMR",
                 "AINL", "AINR", "AVAL", "AVAR", "AVBL", "AVBR",
                 "AVDL", "AVDR", "AVEL", "AVER", "AVG",
                 "AVHL", "AVHR", "AVJL", "AVJR", "AVKL", "AVKR",
                 "DVA", "DVC", "PVCL", "PVCR", "PVNL", "PVNR",
                 "PVPL", "PVPR", "PVQL", "PVQR",
                 "PVWL", "PVWR", "RIBL", "RIBR", "RICL", "RICR",
                 "RIGL", "RIGR", "RIS",
                 "ASEL", "ASER", "ASHL", "ASHR"}

_NT_DOPAMINE = {"ADEL", "ADER", "CEPDL", "CEPDR", "CEPVL", "CEPVR",
                "PDEL", "PDER", "ADE", "PDE"}

_NT_SEROTONIN = {"ADFL", "ADFR", "HSNL", "HSNR", "NSML", "NSMR",
                 "AIM"}


def _classify_neurotransmitter(neuron_id: str) -> str | None:
    """Classify a neuron's primary neurotransmitter based on known data."""
    if neuron_id in _NT_GABA:
        return "GABA"
    if neuron_id in _NT_ACH:
        return "ACh"
    if neuron_id in _NT_GLUTAMATE:
        return "glutamate"
    if neuron_id in _NT_DOPAMINE:
        return "dopamine"
    if neuron_id in _NT_SEROTONIN:
        return "serotonin"
    return None


def _classify_neuron_type(
    neuron_id: str,
    sensory_set: set[str],
    motor_set: set[str],
) -> NeuronType:
    """Classify a neuron as sensory, motor, or interneuron."""
    if neuron_id in sensory_set:
        return NeuronType.SENSORY
    if neuron_id in motor_set:
        return NeuronType.MOTOR
    return NeuronType.INTER


def load_from_edge_list(data_dir: str | Path | None = None) -> Connectome:
    """Load C. elegans connectome from the OpenWorm c302 edge list.

    Uses CElegansNeuronTables.xls which provides:
    - Edge list with synapse counts and neurotransmitter info
    - Neuron-to-muscle connections (for motor neuron classification)
    - Sensory neuron classification

    Args:
        data_dir: Directory containing CElegansNeuronTables.xls.
                  Defaults to <project>/data/openworm/

    Returns:
        Complete C. elegans connectome with 299 neurons.
    """
    data_dir = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR
    xls_path = data_dir / "CElegansNeuronTables.xls"

    if not xls_path.exists():
        raise FileNotFoundError(
            f"CElegansNeuronTables.xls not found at {xls_path}. "
            "Run the download script or place the file manually."
        )

    # Load edge list
    conn_df = pd.read_excel(xls_path, sheet_name="Connectome")
    n2m_df = pd.read_excel(xls_path, sheet_name="NeuronsToMuscle")
    sensory_df = pd.read_excel(xls_path, sheet_name="Sensory")

    # Build motor neuron set and full motor-to-muscle mapping
    motor_set = set(n2m_df["Neuron"].unique())
    sensory_set = set(sensory_df["Neuron"].unique()) | SENSORY_NEURONS

    # Extract the full motor-to-muscle mapping from NeuronsToMuscle sheet
    motor_to_muscle: dict[str, list[dict]] = {}
    for _, row in n2m_df.iterrows():
        neuron = str(row["Neuron"])
        muscle = str(row["Muscle"])
        n_conns = int(row["Number of Connections"])
        motor_to_muscle.setdefault(neuron, []).append(
            {"muscle": muscle, "connections": n_conns}
        )

    # Collect all neuron IDs
    all_ids = sorted(set(conn_df["Origin"]) | set(conn_df["Target"]))

    # Build neurons
    neurons: dict[str, Neuron] = {}
    for nid in all_ids:
        # Get neurotransmitter from edge list or known classification
        nt_from_edges = conn_df.loc[
            (conn_df["Origin"] == nid) & (conn_df["Type"] == "Send"),
            "Neurotransmitter",
        ]
        nt = None
        if len(nt_from_edges) > 0:
            raw_nt = nt_from_edges.iloc[0]
            if pd.notna(raw_nt) and raw_nt != "Generic_GJ":
                # Take primary neurotransmitter (before underscore for dual types)
                nt = str(raw_nt).split("_")[0]

        # Fall back to hardcoded classification
        if nt is None:
            nt = _classify_neurotransmitter(nid)

        neurons[nid] = Neuron(
            id=nid,
            neuron_type=_classify_neuron_type(nid, sensory_set, motor_set),
            neurotransmitter=nt,
        )

    # Build synapses
    synapses: list[Synapse] = []
    for _, row in conn_df.iterrows():
        syn_type = (
            SynapseType.ELECTRICAL
            if row["Type"] == "GapJunction"
            else SynapseType.CHEMICAL
        )
        weight = float(row["Number of Connections"])
        nt = None
        if pd.notna(row["Neurotransmitter"]) and row["Neurotransmitter"] != "Generic_GJ":
            nt = str(row["Neurotransmitter"]).split("_")[0]

        synapses.append(
            Synapse(
                pre_id=str(row["Origin"]),
                post_id=str(row["Target"]),
                weight=weight,
                synapse_type=syn_type,
                neurotransmitter=nt,
            )
        )

    # Load 3D neuron positions from neuron_positions.json if available
    positions_path = data_dir / "neuron_positions.json"
    if positions_path.exists():
        with open(positions_path) as f:
            pos_data = json.load(f)
        for nid, pos in pos_data.items():
            if nid in neurons:
                neurons[nid].position = tuple(pos)
        logger.info(f"Loaded 3D positions for {sum(1 for n in neurons.values() if n.position)} neurons")

    connectome = Connectome(
        name="c_elegans_openworm",
        neurons=neurons,
        synapses=synapses,
        metadata={
            "species": "Caenorhabditis elegans",
            "source": "OpenWorm c302 / CElegansNeuronTables.xls",
            "reference": "Based on White et al. 1986, updated by Varshney et al. 2011",
            "motor_to_muscle": motor_to_muscle,
        },
    )

    logger.info(connectome.summary())
    return connectome


def load_from_adjacency(data_dir: str | Path | None = None) -> Connectome:
    """Load C. elegans connectome from Cook et al. 2019 adjacency matrices.

    Uses the corrected (July 2020) adjacency matrices from WormWiring.org
    (SI 5), which provides the most complete hermaphrodite connectome
    with 300 neurons.

    Args:
        data_dir: Directory containing connectome_adjacency.xlsx.

    Returns:
        Complete C. elegans connectome with ~300 neurons.
    """
    data_dir = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR
    xlsx_path = data_dir / "connectome_adjacency.xlsx"

    if not xlsx_path.exists():
        raise FileNotFoundError(
            f"connectome_adjacency.xlsx not found at {xlsx_path}. "
            "Download from https://wormwiring.org/pages/adjacency.html"
        )

    neurons: dict[str, Neuron] = {}
    synapses: list[Synapse] = []

    for sheet_name, syn_type in [
        ("hermaphrodite chemical", SynapseType.CHEMICAL),
        ("hermaphrodite gap jn symmetric", SynapseType.ELECTRICAL),
    ]:
        df = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=None)

        # Row 2 (0-indexed) has column neuron names starting from column 3
        col_names = [str(v) for v in df.iloc[2, 3:] if pd.notna(v)]
        # Column 2 has row neuron names starting from row 3
        row_names = [str(v) for v in df.iloc[3:, 2] if pd.notna(v)]

        # Extract the adjacency matrix
        n_rows = len(row_names)
        n_cols = len(col_names)
        matrix = df.iloc[3 : 3 + n_rows, 3 : 3 + n_cols].values

        # Register all neurons
        for nid in set(row_names) | set(col_names):
            if nid not in neurons:
                nt = _classify_neurotransmitter(nid)
                motor_set = _NT_ACH | _NT_GABA  # motor neurons are mostly ACh or GABA
                neurons[nid] = Neuron(
                    id=nid,
                    neuron_type=_classify_neuron_type(nid, SENSORY_NEURONS, motor_set),
                    neurotransmitter=nt,
                )

        # Extract synapses from non-zero entries
        for i, pre_id in enumerate(row_names):
            for j, post_id in enumerate(col_names):
                val = matrix[i, j]
                if pd.notna(val) and val != 0:
                    synapses.append(
                        Synapse(
                            pre_id=pre_id,
                            post_id=post_id,
                            weight=float(val),
                            synapse_type=syn_type,
                        )
                    )

    connectome = Connectome(
        name="c_elegans_cook2019",
        neurons=neurons,
        synapses=synapses,
        metadata={
            "species": "Caenorhabditis elegans",
            "source": "Cook et al. 2019, corrected July 2020",
            "reference": "Cook et al., Nature 571, 63-71 (2019)",
            "url": "https://wormwiring.org/pages/adjacency.html",
        },
    )

    logger.info(connectome.summary())
    return connectome


def load(
    source: str = "edge_list",
    data_dir: str | Path | None = None,
) -> Connectome:
    """Load the C. elegans connectome.

    Args:
        source: "edge_list" for OpenWorm c302 data (299 neurons),
                "adjacency" for Cook 2019 matrices (300 neurons).
        data_dir: Directory containing data files.

    Returns:
        The C. elegans connectome.
    """
    if source == "edge_list":
        return load_from_edge_list(data_dir)
    elif source == "adjacency":
        return load_from_adjacency(data_dir)
    else:
        raise ValueError(f"Unknown source: {source!r}. Use 'edge_list' or 'adjacency'.")
