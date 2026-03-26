# Contributing to Neurevo

Thank you for your interest in contributing to Neurevo. This document covers everything you need to get started, whether you are fixing a bug, adding a new organism, or building new analysis tools.

## Getting Started

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/<your-username>/creatures.git
cd creatures
```

2. Set up the development environment:

```bash
make setup    # Creates Python venv, installs dependencies, compiles Cython, runs npm install
```

3. Run the full test suite to verify everything works:

```bash
make test     # 291 tests across creatures-core and creatures-web
```

## Development Workflow

1. Create a feature branch from `main`:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes, following the coding standards below.

3. Run tests and ensure they pass:

```bash
# Full Python test suite (291 tests)
PYTHONPATH="creatures-core:creatures-api" .venv/bin/python -m pytest creatures-core/tests/ -v

# Frontend type check and tests
cd creatures-web && npx tsc --noEmit && npm test
```

4. Commit your changes with a clear message:

```bash
git commit -m "Add description of what changed and why"
```

5. Push to your fork and open a pull request against `main`.

## Project Structure

| Directory | Language | Purpose |
|-----------|----------|---------|
| `creatures-core/` | Python | Core library: connectome loaders (OpenWorm, FlyWire), Brian2 neural engine, MuJoCo bodies (WormBody, NeuroMechFly), NEAT evolution, pharmacology, ecosystem, circuit analysis, God Agent |
| `creatures-api/` | Python | FastAPI server with 122+ REST + WebSocket endpoints across 12 router modules |
| `creatures-web/` | TypeScript | React 18 + Three.js frontend: 3D bodies, spike particles, neuron detail panel, dose-response charts, narrative feed, ecosystem view |
| `scripts/` | Python | CLI tools for evolution, validation, and reporting |
| `notebooks/` | Jupyter | Interactive demos and exploration |

### Supported Organisms

| Organism | Neurons | Source | Body Model |
|----------|---------|--------|------------|
| C. elegans | 299 | OpenWorm / Cook et al. 2019 | WormBody (12-segment MuJoCo) |
| Drosophila | 500 | FlyWire v783 / Dorkenwald et al. 2024 | NeuroMechFly (tripod gait MuJoCo) |

## Coding Standards

### Python (creatures-core, creatures-api)

- Python 3.13+
- Follow PEP 8 style guidelines; `ruff` is used for linting (all checks must pass)
- Use type hints for all function signatures
- Write docstrings for public functions and classes
- Keep functions focused -- one function, one responsibility
- Add unit tests in `creatures-core/tests/` for new functionality
- Use `PYTHONPATH="creatures-core:creatures-api"` when running tests

### TypeScript (creatures-web)

- TypeScript strict mode
- Use functional components with hooks
- Keep components small and composable
- Use Zustand for shared state, not prop drilling
- Run `npx tsc --noEmit` before committing

### General

- No committed secrets, API keys, or credentials
- Keep dependencies minimal -- justify new additions
- Write clear commit messages that explain *why*, not just *what*

---

## Adding a New Organism

To add a new organism (e.g., zebrafish), you need four things:

### 1. Connectome Loader

Create `creatures-core/creatures/connectome/your_organism.py`:

```python
def load(format: str = "edge_list") -> dict:
    """Load the connectome for your organism.

    Returns:
        Dictionary with keys: neurons, synapses, neuron_types, metadata
    """
    ...
```

Follow the patterns in `openworm.py` (C. elegans) and `flywire.py` (Drosophila). Your loader must return a dictionary with `neurons` (list of neuron IDs), `synapses` (list of (pre, post, weight) tuples), and `neuron_types` (mapping of neuron ID to type string).

### 2. Body Model

Create `creatures-core/creatures/body/your_body.py`:

```python
from creatures.body.base import BodyBase

class YourBody(BodyBase):
    def __init__(self):
        super().__init__(organism="your_organism")
        # Load or generate MuJoCo XML

    def apply_motor_output(self, motor_signals: dict) -> dict:
        """Map neural motor output to body actuators."""
        ...
```

Follow the patterns in `worm_body.py` and `neuromechfly.py`.

### 3. Register the Organism

Add your organism to the experiment runner and API so it can be selected when creating simulations. Update the organism registry in `creatures-core/creatures/experiment/runner.py`.

### 4. Tests

Add test files:
- `creatures-core/tests/test_your_connectome.py` -- loader tests
- `creatures-core/tests/test_your_body.py` -- body model tests
- `creatures-core/tests/test_your_pipeline.py` -- end-to-end brain-body tests

---

## Adding a New Drug

Drugs are defined in `creatures-core/creatures/neural/pharmacology.py` in the `DRUG_LIBRARY` dictionary.

### 1. Add the DrugEffect Entry

```python
DRUG_LIBRARY["your_drug"] = DrugEffect(
    name="Your Drug",
    target_nt="ACh",           # Target neurotransmitter: ACh, GABA, DA, 5-HT, Glu
    target_type=None,          # Optional receptor subtype filter
    weight_scale=0.5,          # Multiplier on synaptic weights (0.0 = block, 2.0 = double)
    ec50=1.0,                  # Half-maximal effective concentration
    hill_coefficient=1.5,      # Hill equation steepness
    description="Description of mechanism and biological effect.",
)
```

The Hill equation `response = dose^n / (EC50^n + dose^n)` governs dose-response. Choose `ec50` and `hill_coefficient` based on published pharmacological data.

### 2. Add Tests

Add test cases in `creatures-core/tests/test_pharmacology.py`:
- Verify the drug appears in the library
- Test dose-response curve shape at key doses (0, EC50, 2x EC50)
- Test that it affects the correct synapses

### 3. Update the Frontend

The frontend drug selector in `creatures-web/` picks up drugs dynamically from the API, so no frontend changes should be needed.

---

## Adding Analysis Functions

Circuit analysis lives in `creatures-core/creatures/analysis/`. The API exposes analysis through `creatures-api/app/routers/analysis.py`.

### 1. Add the Analysis Function

```python
# creatures-core/creatures/analysis/your_analysis.py

def your_analysis(connectome: dict, **kwargs) -> dict:
    """Describe what this analysis computes.

    Args:
        connectome: Connectome dictionary with neurons and synapses.

    Returns:
        Dictionary with analysis results.
    """
    ...
```

Existing analyses include: shortest paths, hub neurons, community detection, and network motifs.

### 2. Add an API Endpoint

Add a route in `creatures-api/app/routers/analysis.py`:

```python
@router.get("/analysis/your-analysis")
async def get_your_analysis(experiment_id: str):
    ...
```

### 3. Add Tests

Add test cases in `creatures-core/tests/test_analysis.py`.

---

## Testing

All contributions should include tests. The test suite currently has 291 tests across 14 test files.

```bash
# Full Python test suite
PYTHONPATH="creatures-core:creatures-api" .venv/bin/python -m pytest creatures-core/tests/ -v

# Run a specific test file
.venv/bin/python -m pytest creatures-core/tests/test_pharmacology.py -v

# Run with coverage
.venv/bin/python -m pytest creatures-core/tests/ --cov=creatures --cov-report=term-missing

# Frontend type check
cd creatures-web && npx tsc --noEmit

# Frontend tests
cd creatures-web && npm test

# Frontend production build verification
cd creatures-web && npm run build

# Python linting
ruff check creatures-core/ creatures-api/

# Deployment preflight (checks endpoints, test count, build, etc.)
python scripts/preflight.py
```

For the full list of API endpoints, see [API.md](API.md).

## Areas Where Help Is Needed

- **Consciousness metrics**: the integrated information (Phi) partition search is currently greedy; a proper MIP (minimum information partition) solver would improve accuracy
- **Distributed fitness evaluation**: evolving larger populations would benefit from parallel/distributed fitness evaluation
- **Additional connectomes**: a zebrafish brain loader is partially implemented and needs completion
- **Frontend code-splitting**: the main App chunk is ~675KB and should be split for faster initial load

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what changed and why
- Reference any related issues
- Ensure CI passes before requesting review (Python tests + TypeScript type check)
- Add tests for new functionality
- Update documentation if the public API changes

## Reporting Bugs

Open a GitHub issue with:

1. A clear title describing the bug
2. Steps to reproduce
3. Expected behavior vs. actual behavior
4. Your environment (OS, Python version, relevant package versions)

## Requesting Features

Open a GitHub issue with the `enhancement` label. Include:

1. The problem you are trying to solve
2. Your proposed solution
3. Any alternatives you considered

## Code of Conduct

Be respectful and constructive. We are building tools to advance neuroscience and reduce animal testing. Treat fellow contributors with the same care we bring to the science.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
