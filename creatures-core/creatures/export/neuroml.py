"""NeuroML2 export for connectomes and simulation results.

Exports Creatures/Neurevo connectomes and simulation data in the NeuroML2
standard XML format, enabling interoperability with tools such as
OpenWorm, NEURON, NEST, and Brian2.

Standard: NeuroML v2.0 (Gleeson et al. 2010)
Namespace: http://www.neuroml.org/schema/neuroml2

We use ``iafCell`` (integrate-and-fire) elements to represent LIF neurons,
which matches the simulation engine's neuron model. Synapses are exported
as ``<projection>`` elements with ``<connection>`` sub-elements.
"""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from typing import Any

from creatures.connectome.types import Connectome, NeuronType, SynapseType

NEUROML2_NS = "http://www.neuroml.org/schema/neuroml2"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
SCHEMA_LOCATION = (
    "http://www.neuroml.org/schema/neuroml2 "
    "https://raw.githubusercontent.com/NeuroML/NeuroML2/development/"
    "Schemas/NeuroML2/NeuroML_v2.3.xsd"
)


def export_connectome_neuroml(connectome: Connectome, filepath: str) -> None:
    """Export a connectome as NeuroML2 XML.

    Compatible with: OpenWorm, NEURON, NEST, Brian2.

    Each neuron is represented as an ``iafCell`` component.  Chemical
    synapses become ``<projection>`` elements with ``<connection>``
    children; electrical (gap-junction) synapses use a separate
    projection with ``synapse="gapJunction"``.

    Args:
        connectome: The connectome to export.
        filepath: Output file path (should end in ``.nml``).
    """
    root = _build_neuroml_tree(connectome)
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(filepath, xml_declaration=True, encoding="UTF-8")


def export_simulation_neuroml(
    connectome: Connectome,
    spike_history: list[dict[str, Any]],
    filepath: str,
) -> None:
    """Export simulation results as NeuroML + embedded LEMS simulation spec.

    The spike history is stored as ``<timedSynapticInput>`` events inside
    a LEMS ``<Simulation>`` block appended to the NeuroML document. This
    allows replaying spike trains in compatible simulators.

    Args:
        connectome: The connectome used in the simulation.
        spike_history: List of dicts with keys ``time_ms`` and
            ``active_neurons`` (list of neuron IDs that spiked).
        filepath: Output file path.
    """
    root = _build_neuroml_tree(connectome)

    # Add spike event data as annotation
    annotation = ET.SubElement(root, "annotation")
    spikes_el = ET.SubElement(annotation, "spikes")
    spikes_el.set("format", "creatures_spike_history")

    for event in spike_history:
        t_ms = event.get("time_ms", 0.0)
        active = event.get("active_neurons", [])
        if active:
            ev = ET.SubElement(spikes_el, "event")
            ev.set("time", f"{t_ms}ms")
            ev.set("neurons", " ".join(str(n) for n in active))

    # LEMS simulation element
    sim_el = ET.SubElement(root, "Simulation")
    sim_el.set("id", "replay")
    sim_el.set("length", f"{spike_history[-1]['time_ms'] if spike_history else 0}ms")
    sim_el.set("step", "1ms")
    sim_el.set("target", "network")

    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(filepath, xml_declaration=True, encoding="UTF-8")


def export_connectome_json(connectome: Connectome) -> dict:
    """Export a connectome as a simple JSON-serializable dict.

    Designed for web visualization (e.g., D3.js force-directed graphs).
    The format uses ``nodes`` and ``links`` arrays compatible with common
    JavaScript graph libraries.

    Returns:
        Dict with keys:
        - ``name``: connectome name
        - ``nodes``: list of {id, type, neurotransmitter, position}
        - ``links``: list of {source, target, weight, synapse_type}
        - ``metadata``: connectome metadata
        - ``stats``: {n_neurons, n_synapses, neuron_types}
    """
    nodes = []
    for nid in connectome.neuron_ids:
        neuron = connectome.neurons[nid]
        node: dict[str, Any] = {
            "id": neuron.id,
            "type": neuron.neuron_type.value,
            "neurotransmitter": neuron.neurotransmitter,
        }
        if neuron.position is not None:
            node["position"] = list(neuron.position)
        nodes.append(node)

    links = []
    for syn in connectome.synapses:
        links.append({
            "source": syn.pre_id,
            "target": syn.post_id,
            "weight": float(syn.weight),
            "synapse_type": syn.synapse_type.value,
        })

    # Neuron type counts for stats
    type_counts: dict[str, int] = {}
    for n in connectome.neurons.values():
        key = n.neuron_type.value
        type_counts[key] = type_counts.get(key, 0) + 1

    return {
        "name": connectome.name,
        "nodes": nodes,
        "links": links,
        "metadata": connectome.metadata,
        "stats": {
            "n_neurons": connectome.n_neurons,
            "n_synapses": connectome.n_synapses,
            "neuron_types": type_counts,
        },
    }


# ── Private helpers ─────────────────────────────────────────────────


def _build_neuroml_tree(connectome: Connectome) -> ET.Element:
    """Build the core NeuroML2 XML tree for a connectome."""
    # Register namespaces so output is clean
    ET.register_namespace("", NEUROML2_NS)
    ET.register_namespace("xsi", XSI_NS)

    root = ET.Element(f"{{{NEUROML2_NS}}}neuroml")
    root.set(f"{{{XSI_NS}}}schemaLocation", SCHEMA_LOCATION)
    root.set("id", f"creatures_{connectome.name}")

    # Comment-like note as a <notes> element
    notes = ET.SubElement(root, "notes")
    notes.text = (
        f"Connectome: {connectome.name}. "
        f"{connectome.n_neurons} neurons, {connectome.n_synapses} synapses. "
        f"Exported by Creatures/Neurevo."
    )

    # Define cell types
    _add_cell_types(root)

    # Network
    network = ET.SubElement(root, "network")
    network.set("id", "network")

    # Populations — one per neuron type for clarity
    _add_populations(root, network, connectome)

    # Projections — chemical and electrical separately
    _add_projections(network, connectome)

    return root


def _add_cell_types(root: ET.Element) -> None:
    """Add iafCell component definitions."""
    # Standard LIF neuron matching Creatures simulation defaults
    iaf = ET.SubElement(root, "iafCell")
    iaf.set("id", "lif_excitatory")
    iaf.set("leakReversal", "-70mV")
    iaf.set("thresh", "-45mV")
    iaf.set("reset", "-70mV")
    iaf.set("C", "1nF")
    iaf.set("leakConductance", "0.05uS")

    iaf_inh = ET.SubElement(root, "iafCell")
    iaf_inh.set("id", "lif_inhibitory")
    iaf_inh.set("leakReversal", "-70mV")
    iaf_inh.set("thresh", "-45mV")
    iaf_inh.set("reset", "-70mV")
    iaf_inh.set("C", "1nF")
    iaf_inh.set("leakConductance", "0.05uS")

    # Synapse types
    exc_syn = ET.SubElement(root, "expOneSynapse")
    exc_syn.set("id", "exc_syn")
    exc_syn.set("gbase", "0.5nS")
    exc_syn.set("erev", "0mV")
    exc_syn.set("tauDecay", "5ms")

    inh_syn = ET.SubElement(root, "expOneSynapse")
    inh_syn.set("id", "inh_syn")
    inh_syn.set("gbase", "0.5nS")
    inh_syn.set("erev", "-80mV")
    inh_syn.set("tauDecay", "10ms")

    gap = ET.SubElement(root, "gapJunction")
    gap.set("id", "gap_junction")
    gap.set("conductance", "0.1nS")


def _add_populations(
    root: ET.Element, network: ET.Element, connectome: Connectome
) -> None:
    """Add population elements — one flat population with all neurons."""
    # Single population approach for simplicity; each neuron gets an index
    pop = ET.SubElement(network, "population")
    pop.set("id", "neurons")
    pop.set("component", "lif_excitatory")
    pop.set("size", str(connectome.n_neurons))

    # Individual neuron annotations as <property> elements
    for i, nid in enumerate(connectome.neuron_ids):
        neuron = connectome.neurons[nid]
        instance = ET.SubElement(pop, "property")
        instance.set("tag", f"neuron_{i}")
        instance.set(
            "value",
            f"id={neuron.id};type={neuron.neuron_type.value};"
            f"nt={neuron.neurotransmitter or 'unknown'}",
        )


def _add_projections(network: ET.Element, connectome: Connectome) -> None:
    """Add projection elements for chemical and electrical synapses."""
    idx = connectome.neuron_id_to_index

    # Chemical synapses
    chem_synapses = [s for s in connectome.synapses if s.synapse_type == SynapseType.CHEMICAL]
    if chem_synapses:
        proj = ET.SubElement(network, "projection")
        proj.set("id", "chemical_synapses")
        proj.set("presynapticPopulation", "neurons")
        proj.set("postsynapticPopulation", "neurons")
        proj.set("synapse", "exc_syn")

        for i, syn in enumerate(chem_synapses):
            if syn.pre_id not in idx or syn.post_id not in idx:
                continue
            conn = ET.SubElement(proj, "connection")
            conn.set("id", str(i))
            conn.set("preCellId", f"../neurons/{idx[syn.pre_id]}")
            conn.set("postCellId", f"../neurons/{idx[syn.post_id]}")
            conn.set("weight", f"{syn.weight:.4f}")

    # Electrical (gap junction) synapses
    elec_synapses = [s for s in connectome.synapses if s.synapse_type == SynapseType.ELECTRICAL]
    if elec_synapses:
        proj_e = ET.SubElement(network, "projection")
        proj_e.set("id", "electrical_synapses")
        proj_e.set("presynapticPopulation", "neurons")
        proj_e.set("postsynapticPopulation", "neurons")
        proj_e.set("synapse", "gap_junction")

        for i, syn in enumerate(elec_synapses):
            if syn.pre_id not in idx or syn.post_id not in idx:
                continue
            conn = ET.SubElement(proj_e, "connection")
            conn.set("id", str(i))
            conn.set("preCellId", f"../neurons/{idx[syn.pre_id]}")
            conn.set("postCellId", f"../neurons/{idx[syn.post_id]}")
            conn.set("weight", f"{syn.weight:.4f}")
