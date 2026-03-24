"""Tests for connectome circuit analysis functions using C. elegans data."""

import pytest

from creatures.connectome.analysis import (
    circuit_motifs,
    community_detection,
    hub_neurons,
    information_bottleneck,
    layer_analysis,
    neuron_profile,
    shortest_path,
)


class TestShortestPath:
    """BFS shortest path tests."""

    def test_aval_to_va1(self, connectome):
        """AVAL -> VA1 should be reachable in 1-4 hops (known circuit)."""
        path = shortest_path(connectome, "AVAL", "VA1")
        assert path is not None, "Expected a path from AVAL to VA1"
        assert path[0] == "AVAL"
        assert path[-1] == "VA1"
        assert 2 <= len(path) <= 5, f"Path length {len(path)} outside expected 2-5 range"

    def test_same_neuron(self, connectome):
        """Path from a neuron to itself should be [neuron]."""
        path = shortest_path(connectome, "AVAL", "AVAL")
        assert path == ["AVAL"]

    def test_invalid_neuron(self, connectome):
        """Invalid neuron IDs should return None."""
        assert shortest_path(connectome, "FAKE", "AVAL") is None
        assert shortest_path(connectome, "AVAL", "FAKE") is None

    def test_path_contains_valid_neurons(self, connectome):
        """Every neuron in the path should exist in the connectome."""
        path = shortest_path(connectome, "AVAL", "VA1")
        assert path is not None
        for nid in path:
            assert nid in connectome.neurons


class TestHubNeurons:
    """Hub neuron detection tests."""

    def test_returns_correct_count(self, connectome):
        hubs = hub_neurons(connectome, top_n=10)
        assert len(hubs) == 10

    def test_known_command_interneurons(self, connectome):
        """AVAL and AVAR are known C. elegans command interneurons with high connectivity."""
        hubs = hub_neurons(connectome, top_n=20)
        hub_ids = {h["id"] for h in hubs}
        # At least one of the AVA pair should be in top-20 hubs
        assert hub_ids & {"AVAL", "AVAR"}, f"Expected AVAL or AVAR in top-20 hubs, got {hub_ids}"

    def test_hub_fields(self, connectome):
        """Each hub entry should have all required fields."""
        hubs = hub_neurons(connectome, top_n=1)
        h = hubs[0]
        assert "id" in h
        assert "in_degree" in h
        assert "out_degree" in h
        assert "total" in h
        assert "type" in h
        assert "nt" in h
        assert h["total"] == h["in_degree"] + h["out_degree"]

    def test_sorted_descending(self, connectome):
        """Hubs should be sorted by total degree descending."""
        hubs = hub_neurons(connectome, top_n=10)
        totals = [h["total"] for h in hubs]
        assert totals == sorted(totals, reverse=True)


class TestCommunityDetection:
    """Spectral community detection tests."""

    def test_returns_n_communities(self, connectome):
        communities = community_detection(connectome, n_communities=5)
        unique = set(communities.values())
        assert len(unique) <= 5, f"Expected <=5 communities, got {len(unique)}"
        assert len(unique) >= 2, "Expected at least 2 distinct communities"

    def test_all_neurons_assigned(self, connectome):
        communities = community_detection(connectome, n_communities=5)
        assert set(communities.keys()) == set(connectome.neuron_ids)

    def test_different_n(self, connectome):
        """Different n_communities should produce different groupings."""
        c3 = community_detection(connectome, n_communities=3)
        c8 = community_detection(connectome, n_communities=8)
        assert len(set(c3.values())) <= 3
        assert len(set(c8.values())) <= 8


class TestCircuitMotifs:
    """3-node motif counting tests."""

    def test_feed_forward_exists(self, connectome):
        motifs = circuit_motifs(connectome)
        assert motifs["feed_forward"] > 0, "C. elegans should have feed-forward motifs"

    def test_feedback_exists(self, connectome):
        motifs = circuit_motifs(connectome)
        assert motifs["feedback"] > 0, "C. elegans should have feedback (reciprocal) connections"

    def test_all_motif_types_present(self, connectome):
        motifs = circuit_motifs(connectome)
        assert set(motifs.keys()) == {"feed_forward", "feedback", "mutual", "chain"}

    def test_counts_non_negative(self, connectome):
        motifs = circuit_motifs(connectome)
        for name, count in motifs.items():
            assert count >= 0, f"Motif {name} has negative count: {count}"


class TestNeuronProfile:
    """Single neuron profile tests."""

    def test_aval_profile(self, connectome):
        profile = neuron_profile(connectome, "AVAL")
        assert profile["id"] == "AVAL"
        assert profile["type"] in ("sensory", "inter", "motor", "unknown")
        assert "nt" in profile
        assert profile["in_degree"] > 0
        assert profile["out_degree"] > 0
        assert len(profile["presynaptic_partners"]) == profile["in_degree"]
        assert len(profile["postsynaptic_partners"]) == profile["out_degree"]
        assert 0.0 <= profile["hub_score"] <= 1.0

    def test_all_fields_present(self, connectome):
        profile = neuron_profile(connectome, "AVAL")
        expected = {"id", "type", "nt", "in_degree", "out_degree",
                    "presynaptic_partners", "postsynaptic_partners", "hub_score"}
        assert set(profile.keys()) == expected

    def test_invalid_neuron_raises(self, connectome):
        with pytest.raises(ValueError, match="not found"):
            neuron_profile(connectome, "NONEXISTENT")


class TestLayerAnalysis:
    """Sensory->inter->motor layer analysis tests."""

    def test_sensory_at_depth_zero(self, connectome):
        result = layer_analysis(connectome)
        depths = result["layer_depths"]
        # All sensory neurons should be at depth 0
        from creatures.connectome.types import NeuronType
        for nid, neuron in connectome.neurons.items():
            if neuron.neuron_type == NeuronType.SENSORY:
                assert depths[nid] == 0, f"Sensory neuron {nid} at depth {depths[nid]}, expected 0"

    def test_has_multiple_layers(self, connectome):
        result = layer_analysis(connectome)
        counts = result["layer_counts"]
        # Should have at least depth 0, 1, and 2
        assert len(counts) >= 3, f"Expected at least 3 layers, got {len(counts)}"

    def test_all_neurons_assigned(self, connectome):
        result = layer_analysis(connectome)
        depths = result["layer_depths"]
        assert set(depths.keys()) == set(connectome.neurons.keys())

    def test_layer_counts_sum(self, connectome):
        result = layer_analysis(connectome)
        total = sum(result["layer_counts"].values())
        assert total == connectome.n_neurons


class TestInformationBottleneck:
    """Information bottleneck detection tests."""

    def test_returns_list(self, connectome):
        bottlenecks = information_bottleneck(connectome)
        assert isinstance(bottlenecks, list)

    def test_bottlenecks_are_valid_neurons(self, connectome):
        bottlenecks = information_bottleneck(connectome)
        for nid in bottlenecks:
            assert nid in connectome.neurons

    def test_bottlenecks_are_not_sensory_or_motor(self, connectome):
        """Bottlenecks should be interneurons or unknown type."""
        from creatures.connectome.types import NeuronType
        bottlenecks = information_bottleneck(connectome)
        for nid in bottlenecks:
            nt = connectome.neurons[nid].neuron_type
            assert nt in (NeuronType.INTER, NeuronType.UNKNOWN), \
                f"Bottleneck {nid} is {nt}, expected INTER or UNKNOWN"
