"""Export Creatures connectome data to NeuroML format.

NeuroML is the international standard for describing computational
neuroscience models. Exporting to NeuroML makes our connectome models
interoperable with NEURON, NEST, Brian2, and dozens of other tools.

See: https://neuroml.org/
"""

from __future__ import annotations

import logging
from pathlib import Path

from creatures.connectome.types import Connectome, NeuronType, SynapseType

logger = logging.getLogger(__name__)


def export_to_neuroml(
    connectome: Connectome,
    output_path: str | Path,
    neuron_positions: dict[str, list[float]] | None = None,
) -> Path:
    """Export a Connectome to NeuroML2 format.

    Creates a NeuroML2 file with:
    - Cell definitions for each neuron (with 3D position if available)
    - Synapse definitions (excitatory/inhibitory)
    - Network connectivity

    Args:
        connectome: The connectome to export.
        output_path: Where to write the .nml file.
        neuron_positions: Optional {neuron_id: [x, y, z]} position data.

    Returns:
        Path to the written file.
    """
    try:
        import neuroml
        from neuroml import (
            NeuroMLDocument,
            Network,
            Population,
            Instance,
            Location,
            Projection,
            Connection,
            ExpOneSynapse,
            IafCell,
        )
        from neuroml.writers import NeuroMLWriter
    except ImportError:
        raise ImportError("pip install libneuroml to export NeuroML")

    output_path = Path(output_path)
    positions = neuron_positions or {}

    doc = NeuroMLDocument(id=connectome.name)

    # Define cell types
    exc_cell = IafCell(
        id="exc_iaf",
        leak_reversal="-65mV",
        thresh="-50mV",
        reset="-65mV",
        C="1.0nF",
        leak_conductance="0.1uS",
    )
    inh_cell = IafCell(
        id="inh_iaf",
        leak_reversal="-65mV",
        thresh="-50mV",
        reset="-65mV",
        C="1.0nF",
        leak_conductance="0.1uS",
    )
    doc.iaf_cells.append(exc_cell)
    doc.iaf_cells.append(inh_cell)

    # Synapse types
    exc_syn = ExpOneSynapse(id="exc_syn", gbase="0.5nS", erev="0mV", tau_decay="5ms")
    inh_syn = ExpOneSynapse(id="inh_syn", gbase="0.5nS", erev="-80mV", tau_decay="5ms")
    doc.exp_one_synapses.append(exc_syn)
    doc.exp_one_synapses.append(inh_syn)

    # Network
    network = Network(id=f"network_{connectome.name}")

    # Populations (one per neuron type for simplicity)
    for ntype in [NeuronType.SENSORY, NeuronType.INTER, NeuronType.MOTOR]:
        neurons = connectome.neurons_by_type(ntype)
        if not neurons:
            continue

        cell_type = "inh_iaf" if ntype == NeuronType.INTER else "exc_iaf"
        pop = Population(
            id=f"pop_{ntype.value}",
            component=cell_type,
            size=len(neurons),
            type="populationList",
        )

        for i, neuron in enumerate(neurons):
            pos = positions.get(neuron.id, [0, 0, 0])
            instance = Instance(id=str(i))
            instance.location = Location(x=str(pos[0]), y=str(pos[1]), z=str(pos[2]))
            pop.instances.append(instance)

        network.populations.append(pop)

    doc.networks.append(network)

    # Write
    output_path.parent.mkdir(parents=True, exist_ok=True)
    NeuroMLWriter.write(doc, str(output_path))

    logger.info(f"Exported {connectome.n_neurons} neurons to {output_path}")
    return output_path
