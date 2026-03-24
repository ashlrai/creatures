"""Tests for the connectome data structures and C. elegans loader."""

import numpy as np
import pytest

from creatures.connectome.types import Connectome, Neuron, NeuronType, Synapse, SynapseType


class TestLoadFromEdgeList:
    """Tests for loading the C. elegans connectome from OpenWorm edge list."""

    def test_has_299_neurons(self, connectome: Connectome):
        assert connectome.n_neurons == 299

    def test_has_3363_synapses(self, connectome: Connectome):
        assert connectome.n_synapses == 3363

    def test_neuron_ids_sorted(self, connectome: Connectome):
        ids = connectome.neuron_ids
        assert ids == sorted(ids)

    def test_all_neurons_have_ids(self, connectome: Connectome):
        for nid, neuron in connectome.neurons.items():
            assert neuron.id == nid
            assert len(nid) > 0


class TestNeuronClassification:
    """Tests for neuron type classification (sensory, inter, motor)."""

    def test_sensory_neurons_exist(self, connectome: Connectome):
        sensory = connectome.neurons_by_type(NeuronType.SENSORY)
        assert len(sensory) > 0

    def test_motor_neurons_exist(self, connectome: Connectome):
        motor = connectome.neurons_by_type(NeuronType.MOTOR)
        assert len(motor) > 0

    def test_inter_neurons_exist(self, connectome: Connectome):
        inter = connectome.neurons_by_type(NeuronType.INTER)
        assert len(inter) > 0

    def test_known_sensory_neuron_PLML(self, connectome: Connectome):
        assert connectome.neurons["PLML"].neuron_type == NeuronType.SENSORY

    def test_known_motor_neuron_VA1(self, connectome: Connectome):
        assert connectome.neurons["VA1"].neuron_type == NeuronType.MOTOR

    def test_all_types_account_for_all_neurons(self, connectome: Connectome):
        sensory = len(connectome.neurons_by_type(NeuronType.SENSORY))
        motor = len(connectome.neurons_by_type(NeuronType.MOTOR))
        inter = len(connectome.neurons_by_type(NeuronType.INTER))
        unknown = len(connectome.neurons_by_type(NeuronType.UNKNOWN))
        assert sensory + motor + inter + unknown == connectome.n_neurons


class TestAdjacencyMatrix:
    """Tests for the adjacency matrix representation."""

    def test_shape_299x299(self, connectome: Connectome):
        mat = connectome.adjacency_matrix
        assert mat.shape == (299, 299)

    def test_dtype_is_float(self, connectome: Connectome):
        mat = connectome.adjacency_matrix
        assert mat.dtype == np.float64

    def test_has_nonzero_entries(self, connectome: Connectome):
        mat = connectome.adjacency_matrix
        assert np.count_nonzero(mat) > 0

    def test_diagonal_is_zero_or_self_synapses(self, connectome: Connectome):
        """Diagonal entries should reflect self-synapses only (rare)."""
        mat = connectome.adjacency_matrix
        # Most diagonal entries should be zero
        assert np.count_nonzero(np.diag(mat)) < connectome.n_neurons // 2


class TestSubset:
    """Tests for extracting sub-connectomes."""

    def test_subset_reduces_neurons(self, connectome: Connectome):
        touch_neurons = ["ALML", "ALMR", "PLML", "PLMR", "AVM"]
        sub = connectome.subset(touch_neurons)
        assert sub.n_neurons <= len(touch_neurons)
        assert sub.n_neurons > 0

    def test_subset_name_contains_subset(self, connectome: Connectome):
        sub = connectome.subset(["ALML", "ALMR"])
        assert "subset" in sub.name

    def test_subset_synapses_only_between_subset_neurons(self, connectome: Connectome):
        ids = ["ALML", "ALMR", "PLML", "PLMR"]
        sub = connectome.subset(ids)
        id_set = set(ids)
        for s in sub.synapses:
            assert s.pre_id in id_set
            assert s.post_id in id_set

    def test_subset_preserves_metadata_parent(self, connectome: Connectome):
        sub = connectome.subset(["ALML"])
        assert sub.metadata.get("parent") == connectome.name


class TestBrian2Params:
    """Tests for Brian2 parameter export."""

    def test_returns_i_j_w_keys(self, connectome: Connectome):
        params = connectome.to_brian2_params()
        assert "i" in params
        assert "j" in params
        assert "w" in params

    def test_i_j_w_same_length(self, connectome: Connectome):
        params = connectome.to_brian2_params()
        assert len(params["i"]) == len(params["j"]) == len(params["w"])

    def test_length_matches_synapse_count(self, connectome: Connectome):
        params = connectome.to_brian2_params()
        assert len(params["i"]) == connectome.n_synapses

    def test_indices_in_range(self, connectome: Connectome):
        params = connectome.to_brian2_params()
        n = connectome.n_neurons
        assert np.all(params["i"] >= 0) and np.all(params["i"] < n)
        assert np.all(params["j"] >= 0) and np.all(params["j"] < n)

    def test_dtypes(self, connectome: Connectome):
        params = connectome.to_brian2_params()
        assert params["i"].dtype == np.int32
        assert params["j"].dtype == np.int32
        assert params["w"].dtype == np.float64
