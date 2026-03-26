"""Shared fixtures for Creatures test suite.

Provides session-scoped connectome fixtures and forces numpy codegen
to avoid Cython compilation overhead during testing.

Use ``pytest --runslow`` to include tests marked ``@pytest.mark.slow``.
"""

import os
from pathlib import Path

import pytest

from creatures.connectome.types import Connectome


# Force numpy codegen for all tests
os.environ.setdefault("BRIAN2_CODEGEN_TARGET", "numpy")

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "openworm"
_HAS_DATA = (_DATA_DIR / "CElegansNeuronTables.xls").exists()


def pytest_addoption(parser):
    parser.addoption("--runslow", action="store_true", default=False, help="run slow tests")


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--runslow"):
        skip_slow = pytest.mark.skip(reason="need --runslow option to run")
        for item in items:
            if "slow" in item.keywords:
                item.add_marker(skip_slow)


@pytest.fixture(scope="session")
def connectome() -> Connectome:
    """Load the C. elegans connectome once for the entire test session."""
    if not _HAS_DATA:
        pytest.skip("Connectome data files not available (CElegansNeuronTables.xls)")
    from creatures.connectome.openworm import load_from_edge_list
    return load_from_edge_list()


@pytest.fixture(scope="session")
def small_connectome(connectome: Connectome) -> Connectome:
    """A 50-neuron subset for fast tests that don't need the full connectome."""
    return connectome.subset(connectome.neuron_ids[:50])
