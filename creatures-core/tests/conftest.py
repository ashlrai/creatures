"""Shared fixtures for Creatures test suite."""

import pytest

from creatures.connectome.openworm import load_from_edge_list
from creatures.connectome.types import Connectome


@pytest.fixture(scope="session")
def connectome() -> Connectome:
    """Load the C. elegans connectome once for the entire test session."""
    return load_from_edge_list()
