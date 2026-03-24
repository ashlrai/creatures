from creatures.neural.base import NeuralConfig, NeuralEngine, PlasticityConfig, SimulationState
from creatures.neural.brian2_engine import Brian2Engine

__all__ = [
    "Brian2Engine",
    "NeuralConfig",
    "NeuralEngine",
    "PlasticityConfig",
    "SimulationState",
    "create_engine",
]


def create_engine(backend: str = "auto") -> NeuralEngine:
    """Create the best available neural engine.

    Args:
        backend: "auto" (try cython -> numpy), "numpy", "cython",
                 or "genn" (raises if unavailable).

    Returns:
        A NeuralEngine instance ready to be built.
    """
    valid_backends = {"auto", "numpy", "cython", "genn"}
    if backend not in valid_backends:
        raise ValueError(
            f"Unknown backend {backend!r}. Choose from {sorted(valid_backends)}."
        )

    if backend == "genn":
        try:
            import brian2genn  # noqa: F401
        except ImportError:
            raise ImportError(
                "brian2genn is required for the 'genn' backend. "
                "Install it with: pip install brian2genn"
            )

    engine = Brian2Engine()
    engine._requested_backend = backend
    return engine
