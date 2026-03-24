# Contributing to Neurevo

Thank you for your interest in contributing to Neurevo. This document outlines the process for contributing to the project.

## Getting Started

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/<your-username>/creatures.git
cd creatures
```

2. Set up the development environment:

```bash
make setup
```

3. Run the test suite to verify everything works:

```bash
make test
```

## Development Workflow

1. Create a feature branch from `main`:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes, following the coding standards below.

3. Run tests and ensure they pass:

```bash
# Python tests
make test

# Frontend tests (if you modified creatures-web)
cd creatures-web && npm test
```

4. Commit your changes with a clear message:

```bash
git commit -m "Add description of what changed and why"
```

5. Push to your fork and open a pull request against `main`.

## Coding Standards

### Python (creatures-core, creatures-api)

- Python 3.13+
- Follow PEP 8 style guidelines
- Use type hints for function signatures
- Write docstrings for public functions and classes
- Keep functions focused -- one function, one responsibility
- Add unit tests for new functionality in `creatures-core/tests/`

### TypeScript (creatures-web)

- TypeScript strict mode
- Use functional components with hooks
- Keep components small and composable
- Use Zustand for shared state, not prop drilling

### General

- No committed secrets, API keys, or credentials
- Keep dependencies minimal -- justify new additions
- Write clear commit messages that explain *why*, not just *what*

## Project Structure

| Directory | Language | Purpose |
|-----------|----------|---------|
| `creatures-core/` | Python | Core library: connectome, neural simulation, evolution, pharmacology |
| `creatures-api/` | Python | FastAPI server with REST and WebSocket endpoints |
| `creatures-web/` | TypeScript | React + Three.js frontend |
| `scripts/` | Python | CLI tools for evolution, validation, and reporting |
| `notebooks/` | Jupyter | Interactive demos and exploration |

## Where to Contribute

### High-Impact Areas

- **New organisms**: Add connectome loaders and body models for zebrafish, mouse, or other species
- **Neuron models**: Implement Hodgkin-Huxley or multi-compartment models alongside the existing LIF engine
- **Fitness functions**: Design new behavioral assays for evolution (foraging efficiency, learning tasks, social behavior)
- **Performance**: Optimize Brian2 simulation speed, parallelize evolution runs, GPU acceleration
- **Pharmacology**: Add new drug models with receptor-level specificity
- **Visualization**: Improve 3D rendering, add connectome graph views, evolution dashboards

### Good First Issues

Look for issues labeled `good first issue` on GitHub. These are scoped tasks suitable for new contributors.

## Testing

All contributions should include tests where applicable.

```bash
# Run Python tests with verbose output
python -m pytest creatures-core/tests/ -v

# Run a specific test file
python -m pytest creatures-core/tests/test_connectome.py -v

# Run with coverage
python -m pytest creatures-core/tests/ --cov=creatures --cov-report=term-missing
```

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what changed and why
- Reference any related issues
- Ensure CI passes before requesting review
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
