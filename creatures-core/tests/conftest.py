"""Shared fixtures for Creatures test suite.

Provides session-scoped connectome fixtures and forces numpy codegen
to avoid Cython compilation overhead during testing.
"""

import os

import pytest

from creatures.connectome.openworm import load_from_edge_list
from creatures.connectome.types import Connectome


# Force numpy codegen for all tests — avoids Cython compilation overhead
# which dominates test runtime. Production code can still use "auto" or "cython".
os.environ.setdefault("BRIAN2_CODEGEN_TARGET", "numpy")


@pytest.fixture(scope="session")
def connectome() -> Connectome:
    """Load the C. elegans connectome once for the entire test session."""
    return load_from_edge_list()


@pytest.fixture(scope="session")
def small_connectome(connectome: Connectome) -> Connectome:
    """A 50-neuron subset for fast tests that don't need the full connectome."""
    return connectome.subset(connectome.neuron_ids[:50])
