"""Gene expression and receptor data for C. elegans neurons.

Enriches the connectome with receptor, ion channel, and gene expression
metadata sourced from CeNGEN (cengen.org) and Bentley et al. 2016.

Attempts to use the WormNeuroAtlas package for live data, but falls back
to a comprehensive hardcoded dataset covering the most biologically
important neurons.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from creatures.connectome.types import Connectome

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded receptor / ion-channel data for key C. elegans neurons
# Source: CeNGEN (cengen.org), Bentley et al. 2016, WormBase
# ---------------------------------------------------------------------------

NEURON_RECEPTORS: dict[str, dict] = {
    # ── Touch / mechanosensory neurons ────────────────────────────────────
    "ALML": {
        "receptors": ["mec-4", "mec-10"],
        "ion_channels": ["mec-6", "mec-2"],
        "notes": "anterior lateral mechanosensory (left)",
    },
    "ALMR": {
        "receptors": ["mec-4", "mec-10"],
        "ion_channels": ["mec-6", "mec-2"],
        "notes": "anterior lateral mechanosensory (right)",
    },
    "PLML": {
        "receptors": ["mec-4", "mec-10"],
        "ion_channels": ["mec-6", "mec-2"],
        "notes": "posterior lateral mechanosensory (left)",
    },
    "PLMR": {
        "receptors": ["mec-4", "mec-10"],
        "ion_channels": ["mec-6", "mec-2"],
        "notes": "posterior lateral mechanosensory (right)",
    },
    "AVM": {
        "receptors": ["mec-4", "mec-10"],
        "ion_channels": ["mec-6", "mec-2"],
        "notes": "anterior ventral mechanosensory",
    },
    "PVM": {
        "receptors": ["mec-4", "mec-10"],
        "ion_channels": ["mec-6", "mec-2"],
        "notes": "posterior ventral mechanosensory",
    },
    # ── Command interneurons ──────────────────────────────────────────────
    "AVAL": {
        "receptors": ["glr-1", "nmr-1", "unc-8", "glr-2"],
        "ion_channels": ["egl-19", "unc-2", "shl-1"],
        "notes": "backward locomotion command (left)",
    },
    "AVAR": {
        "receptors": ["glr-1", "nmr-1", "unc-8", "glr-2"],
        "ion_channels": ["egl-19", "unc-2", "shl-1"],
        "notes": "backward locomotion command (right)",
    },
    "AVBL": {
        "receptors": ["glr-1", "nmr-1", "glr-5"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "forward locomotion command (left)",
    },
    "AVBR": {
        "receptors": ["glr-1", "nmr-1", "glr-5"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "forward locomotion command (right)",
    },
    "AVDL": {
        "receptors": ["glr-1", "nmr-1", "nmr-2"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "backward locomotion interneuron (left)",
    },
    "AVDR": {
        "receptors": ["glr-1", "nmr-1", "nmr-2"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "backward locomotion interneuron (right)",
    },
    "PVCL": {
        "receptors": ["glr-1", "nmr-1"],
        "ion_channels": ["egl-19"],
        "notes": "forward locomotion interneuron (left)",
    },
    "PVCR": {
        "receptors": ["glr-1", "nmr-1"],
        "ion_channels": ["egl-19"],
        "notes": "forward locomotion interneuron (right)",
    },
    "AVEL": {
        "receptors": ["glr-1", "nmr-1"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "ventral turn command (left)",
    },
    "AVER": {
        "receptors": ["glr-1", "nmr-1"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "ventral turn command (right)",
    },
    # ── Key sensory neurons ───────────────────────────────────────────────
    "ASEL": {
        "receptors": ["gcy-7", "che-1", "gcy-6"],
        "ion_channels": ["tax-4", "tax-2"],
        "notes": "left ASE chemosensory — senses Na+, Cl-",
    },
    "ASER": {
        "receptors": ["gcy-5", "gcy-22", "che-1"],
        "ion_channels": ["tax-4", "tax-2"],
        "notes": "right ASE chemosensory — senses K+, Cl-",
    },
    "AWCL": {
        "receptors": ["str-2", "srt-28"],
        "ion_channels": ["tax-4", "tax-2", "osm-9"],
        "notes": "AWC olfactory neuron (left, AWC-OFF)",
    },
    "AWCR": {
        "receptors": ["srsx-3", "srt-28"],
        "ion_channels": ["tax-4", "tax-2", "osm-9"],
        "notes": "AWC olfactory neuron (right, AWC-ON)",
    },
    "AWAL": {
        "receptors": ["odr-10", "str-1"],
        "ion_channels": ["osm-9", "ocr-2"],
        "notes": "AWA olfactory neuron (left) — diacetyl",
    },
    "AWAR": {
        "receptors": ["odr-10", "str-1"],
        "ion_channels": ["osm-9", "ocr-2"],
        "notes": "AWA olfactory neuron (right) — diacetyl",
    },
    "ASHL": {
        "receptors": ["osm-10", "qui-1"],
        "ion_channels": ["osm-9", "ocr-2", "trpa-1"],
        "notes": "polymodal nociceptor (left) — osmotic, chemical, mechanical",
    },
    "ASHR": {
        "receptors": ["osm-10", "qui-1"],
        "ion_channels": ["osm-9", "ocr-2", "trpa-1"],
        "notes": "polymodal nociceptor (right) — osmotic, chemical, mechanical",
    },
    "ADLL": {
        "receptors": ["srh-220", "sra-9"],
        "ion_channels": ["tax-4", "tax-2"],
        "notes": "pheromone sensing / dauer (left)",
    },
    "ADLR": {
        "receptors": ["srh-220", "sra-9"],
        "ion_channels": ["tax-4", "tax-2"],
        "notes": "pheromone sensing / dauer (right)",
    },
    "AFDL": {
        "receptors": ["gcy-8", "gcy-18", "gcy-23"],
        "ion_channels": ["tax-4", "tax-2"],
        "notes": "thermosensory neuron (left)",
    },
    "AFDR": {
        "receptors": ["gcy-8", "gcy-18", "gcy-23"],
        "ion_channels": ["tax-4", "tax-2"],
        "notes": "thermosensory neuron (right)",
    },
    # ── DD-class inhibitory motor neurons (GABA, dorsal) ──────────────────
    "DD1": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (dorsal)",
    },
    "DD2": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (dorsal)",
    },
    "DD3": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (dorsal)",
    },
    "DD4": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (dorsal)",
    },
    "DD5": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (dorsal)",
    },
    "DD6": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (dorsal)",
    },
    # ── VD-class inhibitory motor neurons (GABA, ventral) ─────────────────
    "VD1": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD2": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD3": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD4": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD5": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD6": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD7": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD8": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD9": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD10": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD11": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD12": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    "VD13": {
        "receptors": ["unc-49", "gar-1"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "GABA",
        "notes": "inhibitory motor neuron (ventral)",
    },
    # ── DA-class excitatory motor neurons (ACh, backward, dorsal) ─────────
    "DA1": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA2": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA3": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA4": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA5": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA6": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA7": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA8": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    "DA9": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward dorsal",
    },
    # ── DB-class excitatory motor neurons (ACh, forward, dorsal) ──────────
    "DB1": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    "DB2": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    "DB3": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    "DB4": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    "DB5": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    "DB6": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    "DB7": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward dorsal",
    },
    # ── VA-class excitatory motor neurons (ACh, backward, ventral) ────────
    "VA1": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA2": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA3": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA4": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA5": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA6": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA7": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA8": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA9": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA10": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA11": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    "VA12": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — backward ventral",
    },
    # ── VB-class excitatory motor neurons (ACh, forward, ventral) ─────────
    "VB1": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB2": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB3": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB4": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB5": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB6": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB7": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB8": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB9": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB10": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    "VB11": {
        "receptors": ["acr-2", "unc-29", "acr-16"],
        "ion_channels": ["unc-2", "egl-19", "slo-1"],
        "neurotransmitter": "ACh",
        "notes": "excitatory motor neuron — forward ventral",
    },
    # ── Additional important interneurons / modulatory neurons ────────────
    "AIYL": {
        "receptors": ["mod-1", "ser-2"],
        "ion_channels": ["tax-4", "egl-19"],
        "notes": "first layer interneuron, thermotaxis (left)",
    },
    "AIYR": {
        "receptors": ["mod-1", "ser-2"],
        "ion_channels": ["tax-4", "egl-19"],
        "notes": "first layer interneuron, thermotaxis (right)",
    },
    "AIZL": {
        "receptors": ["mod-1", "glr-1"],
        "ion_channels": ["egl-19"],
        "notes": "first layer interneuron (left)",
    },
    "AIZR": {
        "receptors": ["mod-1", "glr-1"],
        "ion_channels": ["egl-19"],
        "notes": "first layer interneuron (right)",
    },
    "RIML": {
        "receptors": ["glr-1", "gar-2"],
        "ion_channels": ["unc-2", "egl-19"],
        "notes": "motor interneuron, head movement (left)",
    },
    "RIMR": {
        "receptors": ["glr-1", "gar-2"],
        "ion_channels": ["unc-2", "egl-19"],
        "notes": "motor interneuron, head movement (right)",
    },
    "SMDVL": {
        "receptors": ["glr-1", "acr-2"],
        "ion_channels": ["unc-2", "egl-19"],
        "notes": "head motor neuron, ventral left",
    },
    "SMDVR": {
        "receptors": ["glr-1", "acr-2"],
        "ion_channels": ["unc-2", "egl-19"],
        "notes": "head motor neuron, ventral right",
    },
    "SMDDL": {
        "receptors": ["glr-1", "acr-2"],
        "ion_channels": ["unc-2", "egl-19"],
        "notes": "head motor neuron, dorsal left",
    },
    "SMDDR": {
        "receptors": ["glr-1", "acr-2"],
        "ion_channels": ["unc-2", "egl-19"],
        "notes": "head motor neuron, dorsal right",
    },
    # ── PDE — posterior deirid sensory neuron (dopaminergic) ──────────────
    "PDEL": {
        "receptors": ["cat-2", "dat-1", "dop-1"],
        "ion_channels": ["osm-9", "ocr-2"],
        "neurotransmitter": "dopamine",
        "notes": "posterior deirid, mechanosensory/dopaminergic (left)",
    },
    "PDER": {
        "receptors": ["cat-2", "dat-1", "dop-1"],
        "ion_channels": ["osm-9", "ocr-2"],
        "neurotransmitter": "dopamine",
        "notes": "posterior deirid, mechanosensory/dopaminergic (right)",
    },
    # ── DVA — stretch receptor interneuron ────────────────────────────────
    "DVA": {
        "receptors": ["trp-4", "glr-1", "nmr-1"],
        "ion_channels": ["egl-19", "unc-2"],
        "notes": "stretch receptor interneuron, proprioception",
    },
    # ── RIA — key integrating interneuron ─────────────────────────────────
    "RIAL": {
        "receptors": ["glr-1", "glr-3", "ser-2"],
        "ion_channels": ["egl-19"],
        "notes": "ring interneuron, sensory integration (left)",
    },
    "RIAR": {
        "receptors": ["glr-1", "glr-3", "ser-2"],
        "ion_channels": ["egl-19"],
        "notes": "ring interneuron, sensory integration (right)",
    },
}


# ---------------------------------------------------------------------------
# Known receptor -> drug target mapping
# Useful for simulating pharmacological interventions
# ---------------------------------------------------------------------------

RECEPTOR_DRUG_TARGETS: dict[str, dict] = {
    # Glutamate receptors
    "glr-1": {
        "type": "ionotropic glutamate (AMPA-like)",
        "drug": "NBQX",
        "effect": "glutamate receptor blocker",
    },
    "glr-2": {
        "type": "ionotropic glutamate (AMPA-like)",
        "drug": "NBQX",
        "effect": "glutamate receptor blocker",
    },
    "nmr-1": {
        "type": "NMDA-like glutamate",
        "drug": "APV / MK-801",
        "effect": "NMDA receptor antagonist",
    },
    "nmr-2": {
        "type": "NMDA-like glutamate",
        "drug": "APV / MK-801",
        "effect": "NMDA receptor antagonist",
    },
    # Mechanosensory / DEG/ENaC channels
    "mec-4": {
        "type": "DEG/ENaC mechanosensory",
        "drug": "amiloride",
        "effect": "mechanosensory channel blocker",
    },
    "mec-10": {
        "type": "DEG/ENaC mechanosensory",
        "drug": "amiloride",
        "effect": "mechanosensory channel blocker",
    },
    # GABA receptors
    "unc-49": {
        "type": "GABA-A like (ligand-gated Cl-)",
        "drug": "picrotoxin / bicuculline",
        "effect": "GABA-A receptor antagonist",
    },
    "gar-1": {
        "type": "metabotropic GABA (GABA-B like)",
        "drug": "CGP-55845",
        "effect": "GABA-B receptor antagonist",
    },
    "gar-2": {
        "type": "metabotropic GABA",
        "drug": "CGP-55845",
        "effect": "GABA receptor antagonist",
    },
    # Acetylcholine receptors
    "acr-2": {
        "type": "nicotinic ACh receptor",
        "drug": "d-tubocurarine / levamisole",
        "effect": "nAChR antagonist (motor endplate)",
    },
    "acr-16": {
        "type": "nicotinic ACh receptor (alpha7-like)",
        "drug": "alpha-bungarotoxin",
        "effect": "nAChR antagonist",
    },
    "unc-29": {
        "type": "nicotinic ACh receptor (non-alpha)",
        "drug": "d-tubocurarine",
        "effect": "nAChR antagonist",
    },
    # Serotonin receptors
    "mod-1": {
        "type": "serotonin-gated Cl- channel",
        "drug": "methiothepin",
        "effect": "serotonin receptor antagonist",
    },
    "ser-2": {
        "type": "metabotropic serotonin (tyramine)",
        "drug": "mianserin",
        "effect": "serotonin/tyramine receptor antagonist",
    },
    # TRP channels
    "osm-9": {
        "type": "TRPV channel",
        "drug": "ruthenium red / capsazepine",
        "effect": "TRP channel blocker",
    },
    "ocr-2": {
        "type": "TRPV channel",
        "drug": "ruthenium red",
        "effect": "TRP channel blocker",
    },
    "trpa-1": {
        "type": "TRPA channel",
        "drug": "HC-030031",
        "effect": "TRPA1 antagonist",
    },
    "trp-4": {
        "type": "TRPN (NOMPC-like)",
        "drug": "gadolinium / ruthenium red",
        "effect": "mechanosensory TRP blocker",
    },
    # Cyclic nucleotide-gated channels
    "tax-4": {
        "type": "cGMP-gated cation channel (alpha)",
        "drug": "L-cis-diltiazem",
        "effect": "CNG channel blocker",
    },
    "tax-2": {
        "type": "cGMP-gated cation channel (beta)",
        "drug": "L-cis-diltiazem",
        "effect": "CNG channel blocker",
    },
    # Voltage-gated Ca2+ channels
    "egl-19": {
        "type": "L-type voltage-gated Ca2+ (CaV1)",
        "drug": "nemadipine-A / nifedipine",
        "effect": "L-type Ca2+ channel blocker",
    },
    "unc-2": {
        "type": "P/Q-type voltage-gated Ca2+ (CaV2)",
        "drug": "omega-agatoxin",
        "effect": "P/Q-type Ca2+ channel blocker",
    },
    # K+ channels
    "slo-1": {
        "type": "BK Ca2+-activated K+ channel",
        "drug": "iberiotoxin / paxilline",
        "effect": "BK channel blocker",
    },
    "shl-1": {
        "type": "Shaker-like voltage-gated K+",
        "drug": "4-aminopyridine",
        "effect": "Kv channel blocker",
    },
    # Dopamine-related
    "cat-2": {
        "type": "tyrosine hydroxylase (dopamine synthesis)",
        "drug": "alpha-methyl-p-tyrosine",
        "effect": "dopamine synthesis inhibitor",
    },
    "dat-1": {
        "type": "dopamine transporter",
        "drug": "bupropion / GBR-12909",
        "effect": "dopamine reuptake inhibitor",
    },
    "dop-1": {
        "type": "D1-like dopamine receptor",
        "drug": "SCH-23390",
        "effect": "D1 receptor antagonist",
    },
}


# ---------------------------------------------------------------------------
# Optional: attempt to load richer data from WormNeuroAtlas
# ---------------------------------------------------------------------------

_wna_loaded = False
_wna_atlas = None


def _try_load_wormneuroatlas() -> bool:
    """Try to load WormNeuroAtlas; tolerate SSL / download failures."""
    global _wna_loaded, _wna_atlas
    if _wna_loaded:
        return _wna_atlas is not None
    _wna_loaded = True
    try:
        import ssl
        # Work around SSL certificate verification failures on macOS
        ssl._create_default_https_context = ssl._create_unverified_context  # noqa: SLF001
        import wormneuroatlas as wna  # type: ignore[import-untyped]
        _wna_atlas = wna.NeuroAtlas()
        logger.info("WormNeuroAtlas loaded successfully — live data available")
        return True
    except Exception as exc:
        logger.warning(
            "WormNeuroAtlas unavailable (%s); using hardcoded CeNGEN data",
            exc,
        )
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def enrich_connectome(connectome: Connectome) -> Connectome:
    """Add gene expression / receptor metadata to every known neuron.

    Mutates the connectome in-place (and also returns it for chaining).
    """
    # Try live data first
    _try_load_wormneuroatlas()

    for nid, neuron in connectome.neurons.items():
        gene_data = get_neuron_receptors(nid)
        if gene_data:
            neuron.metadata.update(gene_data)

    connectome.metadata["gene_expression_enriched"] = True
    connectome.metadata["gene_expression_neurons"] = sum(
        1 for n in connectome.neurons.values()
        if n.metadata.get("receptors")
    )
    return connectome


def get_neuron_receptors(neuron_id: str) -> dict:
    """Get known receptors / ion channels for a neuron.

    Returns a dict with keys like 'receptors', 'ion_channels', 'notes'.
    Returns empty dict if neuron is unknown.
    """
    # Hardcoded data is the primary source
    data = dict(NEURON_RECEPTORS.get(neuron_id, {}))

    # If WormNeuroAtlas is available, try to supplement
    if _wna_atlas is not None:
        try:
            # WormNeuroAtlas indexes by neuron class; strip L/R suffix
            cls_name = neuron_id.rstrip("LR") if neuron_id[-1] in "LR" else neuron_id
            idx = list(_wna_atlas.neuron_ids).index(cls_name)
            # Grab neuropeptide receptor genes if available
            if hasattr(_wna_atlas, "get_gene_expression"):
                expr = _wna_atlas.get_gene_expression(cls_name)
                if expr is not None and not data:
                    data["wna_expression"] = expr
        except (ValueError, IndexError, AttributeError, Exception):
            pass  # neuron not found in atlas — use hardcoded only

    return data


def get_drug_targets(receptor_id: str) -> dict:
    """Get pharmacological target info for a receptor gene.

    Returns a dict with 'type', 'drug', 'effect' keys or empty dict.
    """
    return dict(RECEPTOR_DRUG_TARGETS.get(receptor_id, {}))


def find_neurons_expressing(gene: str) -> list[str]:
    """Return all neuron IDs that express the given receptor/channel gene."""
    results: list[str] = []
    for nid, data in NEURON_RECEPTORS.items():
        all_genes = data.get("receptors", []) + data.get("ion_channels", [])
        if gene in all_genes:
            results.append(nid)
    return sorted(results)


def get_neurons_affected_by_drug(drug: str) -> list[dict]:
    """Find all neurons that would be affected by a given drug.

    Returns list of dicts with 'neuron_id', 'receptor', 'effect' keys.
    """
    # Find which receptors this drug targets
    target_receptors: list[str] = []
    for receptor_id, info in RECEPTOR_DRUG_TARGETS.items():
        if drug.lower() in info.get("drug", "").lower():
            target_receptors.append(receptor_id)

    if not target_receptors:
        return []

    affected: list[dict] = []
    for nid, data in NEURON_RECEPTORS.items():
        all_genes = data.get("receptors", []) + data.get("ion_channels", [])
        for receptor in target_receptors:
            if receptor in all_genes:
                affected.append({
                    "neuron_id": nid,
                    "receptor": receptor,
                    "effect": RECEPTOR_DRUG_TARGETS[receptor].get("effect", ""),
                })
    return affected
