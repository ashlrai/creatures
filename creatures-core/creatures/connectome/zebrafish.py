"""Loader for the zebrafish (Danio rerio) connectome.

The larval zebrafish brain has ~180,000 neurons. Full connectome data
is emerging (Kunst et al. 2019, Svara et al. 2022). Until complete
EM data is available, we provide:

1. A synthetic zebrafish-like connectome based on known brain regions
2. The Mauthner cell escape circuit (well-characterized, ~50 neurons)
3. Infrastructure ready for full connectome data when available

References:
- Kunst et al. 2019: A cellular-resolution atlas of the larval zebrafish brain
- Svara et al. 2022: Automated synapse-level reconstruction of neural circuits
  in the larval zebrafish brain
- Korn & Faber 2005: The Mauthner cell half a century later
- Eaton et al. 2001: The Mauthner-initiated startle response in teleost fish
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict

import numpy as np

from creatures.connectome.types import (
    Connectome,
    Neuron,
    NeuronType,
    Synapse,
    SynapseType,
)

logger = logging.getLogger(__name__)

# Known zebrafish brain regions and approximate neuron counts (larval, 5-7 dpf)
ZEBRAFISH_REGIONS = {
    "telencephalon": {"n_neurons": 20000, "function": "learning, decision-making"},
    "optic_tectum": {"n_neurons": 50000, "function": "visual processing, prey capture"},
    "cerebellum": {"n_neurons": 40000, "function": "motor coordination"},
    "hindbrain": {"n_neurons": 30000, "function": "motor output, escape reflex"},
    "spinal_cord": {"n_neurons": 20000, "function": "locomotion CPG"},
    "retina": {"n_neurons": 20000, "function": "visual input"},
}

# Inter-region connectivity matrix (fraction of source neurons projecting to target)
# Based on Kunst et al. 2019 whole-brain projection patterns
_INTER_REGION_CONNECTIVITY = {
    # (source, target): connection_probability
    ("retina", "optic_tectum"): 0.15,
    ("optic_tectum", "telencephalon"): 0.03,
    ("optic_tectum", "hindbrain"): 0.05,
    ("optic_tectum", "cerebellum"): 0.04,
    ("telencephalon", "optic_tectum"): 0.02,
    ("telencephalon", "hindbrain"): 0.01,
    ("cerebellum", "hindbrain"): 0.06,
    ("cerebellum", "optic_tectum"): 0.02,
    ("hindbrain", "spinal_cord"): 0.08,
    ("hindbrain", "cerebellum"): 0.03,
    ("spinal_cord", "hindbrain"): 0.02,
    # Intra-region recurrence
    ("optic_tectum", "optic_tectum"): 0.05,
    ("cerebellum", "cerebellum"): 0.04,
    ("hindbrain", "hindbrain"): 0.06,
    ("telencephalon", "telencephalon"): 0.03,
    ("spinal_cord", "spinal_cord"): 0.10,
}

# Neurotransmitter distribution per region (fraction excitatory)
_REGION_EXCITATORY_FRACTION = {
    "retina": 0.8,
    "optic_tectum": 0.7,
    "telencephalon": 0.65,
    "cerebellum": 0.6,  # Purkinje cells are GABAergic
    "hindbrain": 0.7,
    "spinal_cord": 0.6,
}

# Region-level neuron type classification
_REGION_NEURON_TYPE = {
    "retina": NeuronType.SENSORY,
    "optic_tectum": NeuronType.INTER,
    "telencephalon": NeuronType.INTER,
    "cerebellum": NeuronType.INTER,
    "hindbrain": NeuronType.INTER,
    "spinal_cord": NeuronType.MOTOR,
}


def load_mauthner_circuit() -> Connectome:
    """Load the Mauthner cell escape reflex circuit.

    The best-characterized zebrafish neural circuit:
    - Mauthner cells (M-cell): giant reticulospinal neurons
    - Sensory input: auditory/lateral line -> M-cell
    - Motor output: M-cell -> spinal motor neurons -> C-start escape

    Based on Korn & Faber 2005 and Eaton et al. 2001:
    - Auditory afferents make mixed (electrical + chemical) synapses
      onto the M-cell lateral dendrite
    - Each M-cell inhibits the contralateral M-cell via commissural
      interneurons (reciprocal inhibition ensures unilateral escape)
    - M-cell axon crosses midline, activating contralateral motor
      neurons for the C-start bend
    - Cranial relay neurons (CRN) provide feedforward excitation
    - Spiral fiber neurons provide feedback inhibition (PHP cells)

    ~50 neurons, well-validated behavioral output.
    """
    neurons: dict[str, Neuron] = {}
    synapses: list[Synapse] = []

    # --- Sensory neurons (auditory/lateral line afferents) ---
    # VIII nerve afferents: large myelinated club endings on M-cell
    for i in range(10):
        nid = f"AUD_{i}"
        neurons[nid] = Neuron(
            id=nid,
            neuron_type=NeuronType.SENSORY,
            neurotransmitter="glutamate",
            metadata={"region": "hindbrain", "cell_class": "VIIIn_afferent"},
        )

    # --- Mauthner cells (left + right) ---
    # Giant reticulospinal neurons; glutamatergic output
    for side in ["L", "R"]:
        nid = f"M_{side}"
        neurons[nid] = Neuron(
            id=nid,
            neuron_type=NeuronType.INTER,
            neurotransmitter="glutamate",
            metadata={"region": "hindbrain", "cell_class": "Mauthner"},
        )

    # --- Cranial relay neurons (CRN) ---
    # Excitatory interneurons providing feedforward excitation to M-cell
    # (Korn & Faber 2005: parallel excitatory pathway)
    for side in ["L", "R"]:
        for i in range(3):
            nid = f"CRN_{side}_{i}"
            neurons[nid] = Neuron(
                id=nid,
                neuron_type=NeuronType.INTER,
                neurotransmitter="glutamate",
                metadata={"region": "hindbrain", "cell_class": "cranial_relay"},
            )

    # --- Commissural inhibitory interneurons ---
    # T-reticular / commissural neurons for reciprocal inhibition
    # (Korn & Faber 2005: ensure unilateral M-cell firing)
    for side in ["L", "R"]:
        for i in range(3):
            nid = f"COM_{side}_{i}"
            neurons[nid] = Neuron(
                id=nid,
                neuron_type=NeuronType.INTER,
                neurotransmitter="glycine",
                metadata={"region": "hindbrain", "cell_class": "commissural_inhibitory"},
            )

    # --- PHP cells (passive hyperpolarizing potential) ---
    # Feedback inhibitory interneurons that recurrently inhibit M-cell
    # (Korn & Faber 2005: collateral inhibition, sharpens response)
    for side in ["L", "R"]:
        for i in range(2):
            nid = f"PHP_{side}_{i}"
            neurons[nid] = Neuron(
                id=nid,
                neuron_type=NeuronType.INTER,
                neurotransmitter="glycine",
                metadata={"region": "hindbrain", "cell_class": "PHP_inhibitory"},
            )

    # --- Reticulospinal neurons (MiD2cm, MiD3cm) ---
    # Segmental homologs; also activated during escape
    for side in ["L", "R"]:
        for i in range(3):
            nid = f"RS_{side}_{i}"
            neurons[nid] = Neuron(
                id=nid,
                neuron_type=NeuronType.INTER,
                neurotransmitter="glutamate",
                metadata={"region": "hindbrain", "cell_class": "reticulospinal"},
            )

    # --- Spinal motor neurons ---
    # Primary motor neurons for fast (escape) swimming
    for side in ["L", "R"]:
        for i in range(8):
            nid = f"MN_{side}_{i}"
            neurons[nid] = Neuron(
                id=nid,
                neuron_type=NeuronType.MOTOR,
                neurotransmitter="ACh",
                metadata={"region": "spinal_cord", "cell_class": "primary_motoneuron"},
            )

    # =====================================================================
    # SYNAPSES — based on Korn & Faber 2005, Eaton et al. 2001
    # =====================================================================

    rng = np.random.default_rng(42)

    # 1. Auditory afferents -> ipsilateral M-cell (mixed synapses)
    #    Club endings: electrical + chemical glutamatergic
    #    VIIIn afferents 0-4 -> M_L, 5-9 -> M_R
    for i in range(10):
        target = "M_L" if i < 5 else "M_R"
        # Electrical (gap junction) synapse — large, fast
        synapses.append(Synapse(
            pre_id=f"AUD_{i}", post_id=target,
            weight=8.0 + rng.normal(0, 1),
            synapse_type=SynapseType.ELECTRICAL,
            neurotransmitter="glutamate",
        ))
        # Chemical synapse — slower, modulatable
        synapses.append(Synapse(
            pre_id=f"AUD_{i}", post_id=target,
            weight=5.0 + rng.normal(0, 0.8),
            synapse_type=SynapseType.CHEMICAL,
            neurotransmitter="glutamate",
        ))

    # 2. Auditory afferents -> CRN (feedforward excitation path)
    for i in range(10):
        side = "L" if i < 5 else "R"
        for j in range(3):
            if rng.random() < 0.6:  # sparse connectivity
                synapses.append(Synapse(
                    pre_id=f"AUD_{i}", post_id=f"CRN_{side}_{j}",
                    weight=3.0 + rng.normal(0, 0.5),
                    synapse_type=SynapseType.CHEMICAL,
                    neurotransmitter="glutamate",
                ))

    # 3. CRN -> ipsilateral M-cell (feedforward excitation)
    for side in ["L", "R"]:
        for i in range(3):
            synapses.append(Synapse(
                pre_id=f"CRN_{side}_{i}", post_id=f"M_{side}",
                weight=4.0 + rng.normal(0, 0.5),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glutamate",
            ))

    # 4. M-cell -> commissural inhibitory interneurons (ipsilateral)
    #    M-cell axon cap collaterals excite ipsilateral COM neurons
    for side in ["L", "R"]:
        for i in range(3):
            synapses.append(Synapse(
                pre_id=f"M_{side}", post_id=f"COM_{side}_{i}",
                weight=6.0 + rng.normal(0, 0.5),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glutamate",
            ))

    # 5. Commissural interneurons -> contralateral M-cell (reciprocal inhibition)
    contra = {"L": "R", "R": "L"}
    for side in ["L", "R"]:
        for i in range(3):
            synapses.append(Synapse(
                pre_id=f"COM_{side}_{i}", post_id=f"M_{contra[side]}",
                weight=7.0 + rng.normal(0, 0.5),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glycine",
            ))

    # 6. M-cell -> PHP cells (feedback inhibition pathway)
    for side in ["L", "R"]:
        for i in range(2):
            synapses.append(Synapse(
                pre_id=f"M_{side}", post_id=f"PHP_{side}_{i}",
                weight=5.0 + rng.normal(0, 0.5),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glutamate",
            ))

    # 7. PHP cells -> ipsilateral M-cell (recurrent inhibition)
    for side in ["L", "R"]:
        for i in range(2):
            synapses.append(Synapse(
                pre_id=f"PHP_{side}_{i}", post_id=f"M_{side}",
                weight=6.0 + rng.normal(0, 0.5),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glycine",
            ))

    # 8. M-cell -> contralateral reticulospinal neurons
    #    M-cell axon crosses midline; activates contralateral RS neurons
    for side in ["L", "R"]:
        for i in range(3):
            synapses.append(Synapse(
                pre_id=f"M_{side}", post_id=f"RS_{contra[side]}_{i}",
                weight=7.0 + rng.normal(0, 0.8),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glutamate",
            ))

    # 9. M-cell -> contralateral spinal motor neurons (direct)
    #    M-cell axon makes direct synapses onto contralateral primary MNs
    for side in ["L", "R"]:
        for i in range(8):
            synapses.append(Synapse(
                pre_id=f"M_{side}", post_id=f"MN_{contra[side]}_{i}",
                weight=6.0 + rng.normal(0, 1.0),
                synapse_type=SynapseType.CHEMICAL,
                neurotransmitter="glutamate",
            ))

    # 10. Reticulospinal -> ipsilateral spinal motor neurons
    for side in ["L", "R"]:
        for i in range(3):
            for j in range(8):
                if rng.random() < 0.5:  # sparse
                    synapses.append(Synapse(
                        pre_id=f"RS_{side}_{i}", post_id=f"MN_{side}_{j}",
                        weight=3.0 + rng.normal(0, 0.5),
                        synapse_type=SynapseType.CHEMICAL,
                        neurotransmitter="glutamate",
                    ))

    connectome = Connectome(
        name="zebrafish_mauthner",
        neurons=neurons,
        synapses=synapses,
        metadata={
            "species": "Danio rerio",
            "circuit": "Mauthner escape",
            "reference": "Korn & Faber 2005, Eaton et al. 2001",
            "description": (
                "Mauthner cell escape reflex circuit: auditory input -> "
                "M-cell -> contralateral motor neurons -> C-start escape. "
                "Includes commissural reciprocal inhibition and PHP "
                "feedback inhibition."
            ),
        },
    )

    logger.info(connectome.summary())
    return connectome


def load_synthetic(
    n_neurons: int = 1000,
    regions: list[str] | None = None,
    seed: int = 42,
) -> Connectome:
    """Generate a synthetic zebrafish-like connectome.

    Uses known region sizes and inter-region connectivity patterns
    from Kunst et al. 2019 to create a biologically plausible
    connectome at any scale.

    Args:
        n_neurons: Total number of neurons to generate.
        regions: Subset of brain regions to include. If None, uses all.
        seed: Random seed for reproducibility.

    Returns:
        A synthetic zebrafish connectome.
    """
    rng = np.random.default_rng(seed)

    if regions is None:
        regions = list(ZEBRAFISH_REGIONS.keys())

    # Validate regions
    for r in regions:
        if r not in ZEBRAFISH_REGIONS:
            raise ValueError(
                f"Unknown region: {r!r}. "
                f"Available: {sorted(ZEBRAFISH_REGIONS.keys())}"
            )

    # Compute neuron counts per region proportional to biological sizes
    total_bio_neurons = sum(ZEBRAFISH_REGIONS[r]["n_neurons"] for r in regions)
    region_counts: dict[str, int] = {}
    assigned = 0
    for i, r in enumerate(regions):
        if i == len(regions) - 1:
            # Last region gets remainder to ensure exact total
            region_counts[r] = n_neurons - assigned
        else:
            count = max(1, round(n_neurons * ZEBRAFISH_REGIONS[r]["n_neurons"] / total_bio_neurons))
            region_counts[r] = count
            assigned += count

    # Build neurons
    neurons: dict[str, Neuron] = {}
    region_neuron_ids: dict[str, list[str]] = defaultdict(list)

    for region in regions:
        n = region_counts[region]
        exc_frac = _REGION_EXCITATORY_FRACTION.get(region, 0.7)
        neuron_type = _REGION_NEURON_TYPE.get(region, NeuronType.INTER)

        for i in range(n):
            nid = f"{region}_{i}"
            is_exc = rng.random() < exc_frac
            nt = "glutamate" if is_exc else "GABA"

            neurons[nid] = Neuron(
                id=nid,
                neuron_type=neuron_type,
                neurotransmitter=nt,
                metadata={"region": region},
            )
            region_neuron_ids[region].append(nid)

    # Build synapses using inter-region connectivity patterns
    synapses: list[Synapse] = []

    for (src_region, tgt_region), prob in _INTER_REGION_CONNECTIVITY.items():
        if src_region not in region_neuron_ids or tgt_region not in region_neuron_ids:
            continue

        src_ids = region_neuron_ids[src_region]
        tgt_ids = region_neuron_ids[tgt_region]
        n_src = len(src_ids)
        n_tgt = len(tgt_ids)

        # Scale connection probability to keep total synapse count manageable
        # For large n, use sparse random sampling
        # Expected number of connections: n_src * n_tgt * prob
        # But cap per-neuron fan-out to keep it biologically realistic
        max_fan_out = min(50, n_tgt)
        expected_conns_per_src = min(prob * n_tgt, max_fan_out)

        if expected_conns_per_src < 1:
            # Very sparse: each source neuron has <1 expected connection
            # Sample which source neurons actually connect
            n_connecting = max(1, int(n_src * expected_conns_per_src))
            connecting_srcs = rng.choice(n_src, size=min(n_connecting, n_src), replace=False)
            for si in connecting_srcs:
                ti = rng.integers(0, n_tgt)
                weight = 1.0 + rng.exponential(1.5)
                synapses.append(Synapse(
                    pre_id=src_ids[si],
                    post_id=tgt_ids[ti],
                    weight=weight,
                    synapse_type=SynapseType.CHEMICAL,
                    neurotransmitter=neurons[src_ids[si]].neurotransmitter,
                ))
        else:
            # Each source neuron connects to a few target neurons
            n_conns = max(1, int(expected_conns_per_src))
            for si in range(n_src):
                targets = rng.choice(n_tgt, size=min(n_conns, n_tgt), replace=False)
                for ti in targets:
                    weight = 1.0 + rng.exponential(1.5)
                    synapses.append(Synapse(
                        pre_id=src_ids[si],
                        post_id=tgt_ids[int(ti)],
                        weight=weight,
                        synapse_type=SynapseType.CHEMICAL,
                        neurotransmitter=neurons[src_ids[si]].neurotransmitter,
                    ))

    # Add sparse electrical synapses within regions (gap junctions, ~5% of chemical)
    for region in regions:
        ids = region_neuron_ids[region]
        n = len(ids)
        n_gap = max(1, int(0.05 * n))
        for _ in range(n_gap):
            i, j = rng.integers(0, n, size=2)
            if i != j:
                synapses.append(Synapse(
                    pre_id=ids[i],
                    post_id=ids[j],
                    weight=2.0 + rng.exponential(1.0),
                    synapse_type=SynapseType.ELECTRICAL,
                ))

    connectome = Connectome(
        name=f"zebrafish_synthetic_{n_neurons}n",
        neurons=neurons,
        synapses=synapses,
        metadata={
            "species": "Danio rerio",
            "type": "synthetic",
            "n_neurons": n_neurons,
            "regions": regions,
            "region_counts": region_counts,
            "reference": "Region structure from Kunst et al. 2019",
        },
    )

    logger.info(connectome.summary())
    return connectome


def load(circuit: str = "mauthner", **kwargs) -> Connectome:
    """Load a zebrafish connectome.

    Args:
        circuit: Which circuit to load:
            - "mauthner": Mauthner cell escape reflex (~50 neurons)
            - "synthetic": Configurable synthetic connectome (pass n_neurons, regions)
            - "hindbrain": Synthetic hindbrain + spinal cord (~1000 neurons)
            - "full": Full 180K synthetic (when real data unavailable)
        **kwargs: Passed to the underlying loader.

    Returns:
        A zebrafish Connectome.
    """
    if circuit == "mauthner":
        return load_mauthner_circuit()
    elif circuit == "synthetic":
        return load_synthetic(**kwargs)
    elif circuit == "hindbrain":
        return load_synthetic(
            n_neurons=kwargs.pop("n_neurons", 1000),
            regions=["hindbrain", "spinal_cord"],
            **kwargs,
        )
    elif circuit == "full":
        return load_synthetic(
            n_neurons=kwargs.pop("n_neurons", 180000),
            **kwargs,
        )
    else:
        raise ValueError(
            f"Unknown circuit: {circuit!r}. "
            "Use 'mauthner', 'synthetic', 'hindbrain', or 'full'."
        )
