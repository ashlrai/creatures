[![CI](https://github.com/ashlrai/creatures/actions/workflows/ci.yml/badge.svg)](https://github.com/ashlrai/creatures/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.13+](https://img.shields.io/badge/Python-3.13+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-183%20passing-brightgreen.svg)](https://github.com/ashlrai/creatures/actions)

# Neurevo

**Evolving real brains. Understanding life.**

**[neurevo.dev](https://neurevo.dev)**

Neurevo is a neuroevolution platform built on real biological connectome data. It takes the complete C. elegans wiring diagram -- 299 neurons, 3,363 synapses -- runs it as a spiking neural network inside a physics-simulated body, and evolves populations across generations using natural selection and ML-accelerated optimization. The first platform to perform evolutionary optimization starting from real biological neural architectures.

---

## Key Features

- **Real C. elegans connectome** -- 299 neurons, 3,363 synapses from OpenWorm/Cook et al. 2019
- **Spiking neural network simulation** -- Brian2 leaky integrate-and-fire engine, calibrated to Shiu et al. 2024
- **3D MuJoCo physics body** -- 12-segment worm with real motor neuron-to-muscle mappings
- **Neuroevolution from biological templates** -- mutate, crossover, and select on real connectome architectures
- **AI God Agent** -- xAI/Grok-powered intelligent evolution oversight with narrative generation
- **8 pharmacological drugs** -- receptor-level targeting (levamisole, ivermectin, aldicarb, and more)
- **101 neurons with gene expression data** -- CeNGEN single-cell RNA-seq receptor/ion channel profiles
- **75% behavioral accuracy** -- validated against real C. elegans biology (chemotaxis, withdrawal reflex, omega turns)
- **Interactive 3D web visualization** -- React + Three.js real-time brain-body rendering
- **Publication-quality scientific reports** -- automated PDF/HTML generation with statistical analysis

---

## Quick Start

```bash
git clone https://github.com/ashlrai/creatures.git && cd creatures
make setup
make dev        # API on :8420, frontend on :5173
```

Open [http://localhost:5173](http://localhost:5173) to see the live simulation.

---

## Architecture

```
                    +------------------+
                    |   creatures-web  |    React + Three.js
                    |   (Frontend)     |    Real-time 3D visualization
                    +--------+---------+
                             |
                        WebSocket / REST
                             |
                    +--------+---------+
                    |  creatures-api   |    FastAPI
                    |   (Backend)      |    Simulation lifecycle, export, evolution
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------+--------+          +--------+--------+
     |  Neural Engine   |          |   Physics Body   |
     |  (Brian2 SNN)    |          |   (MuJoCo)       |
     +--------+---------+          +--------+---------+
              |                             |
     +--------+---------+          +--------+---------+
     |   Connectome      |          |   Environment    |
     |   (OpenWorm data) |          |   (Arena/Sensors)|
     +---------+---------+          +------------------+
              |
     +--------+---------+
     |   Evolution       |    Mutation, crossover, fitness,
     |   + God Agent     |    population management, AI oversight
     +-------------------+
```

```
creatures/
├── creatures-core/             # Python library (pip installable)
│   └── creatures/
│       ├── connectome/         # Connectome loaders + gene expression
│       ├── neural/             # Brian2 spiking engine + pharmacology
│       ├── body/               # MuJoCo physics bodies
│       ├── evolution/          # Genome, mutation, crossover, fitness, population
│       ├── god/                # AI God Agent (xAI/Grok) + narrator
│       ├── environment/        # Arena, sensors, chemical gradients
│       ├── experiment/         # Brain-body simulation runner
│       ├── reporting/          # Scientific report generation
│       └── ml/                 # ML-accelerated optimization
├── creatures-api/              # FastAPI server
│   └── app/
│       ├── routers/            # REST + WebSocket endpoints
│       └── services/           # Simulation lifecycle management
├── creatures-web/              # React + Three.js frontend
│   └── src/
│       ├── components/         # 3D scene, worm body, dashboard
│       ├── hooks/              # WebSocket + demo mode hooks
│       └── stores/             # Zustand state management
├── notebooks/                  # Jupyter demos
└── scripts/                    # CLI tools (evolution, validation, reports)
```

---

## Run Evolution

```bash
# Run 50 generations of neuroevolution from the C. elegans connectome
python scripts/run_evolution.py --generations 50 --population 20

# Run with the AI God Agent overseeing evolution
python scripts/run_evolution.py --generations 100 --god-agent

# Validate simulation against known C. elegans behaviors
python scripts/validate_simulation.py

# Generate a scientific report from evolution results
python scripts/generate_report.py --input evolution_results/
```

### Python API

```python
from creatures.connectome.openworm import load
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.base import NeuralConfig
from creatures.body.worm_body import WormBody
from creatures.experiment.runner import SimulationRunner

# Load the real connectome
connectome = load("edge_list")  # 299 neurons, 3,363 synapses

# Build a spiking neural network
engine = Brian2Engine()
engine.build(connectome, NeuralConfig(weight_scale=3.0))

# Connect brain to body
body = WormBody()
runner = SimulationRunner(engine, body)
runner.poke("seg_8")  # Touch the posterior
runner.run(200)        # Watch the withdrawal reflex emerge
```

---

## Scientific Validation

Simulation outputs validated against published C. elegans behavioral data:

| Behavior | Biological Reference | Simulated | Accuracy |
|----------|---------------------|-----------|----------|
| Touch withdrawal (posterior) | Chalfie et al. 1985 | Backward locomotion within 200ms | 85% |
| Chemotaxis (NaCl gradient) | Bargmann & Horvitz 1991 | Biased random walk toward source | 72% |
| Omega turn | Gray et al. 2005 | Head-to-tail body bend | 70% |
| Pharyngeal pumping rate | Avery & Horvitz 1989 | 3.5 Hz baseline | 78% |
| Forward/reverse ratio | Zheng et al. 1999 | ~3:1 forward bias | 71% |
| **Overall** | | | **75%** |

---

## Data Sources

| Source | Data | Size | Reference |
|--------|------|------|-----------|
| [OpenWorm](https://openworm.org/) | C. elegans connectome | 299 neurons, 3,363 synapses | Cook et al. 2019 |
| [FlyWire](https://flywire.ai/) | Drosophila connectome | 139K neurons, 50M synapses | Dorkenwald et al. 2024 |
| [CeNGEN](https://cengen.org/) | Gene expression (scRNA-seq) | 101 neuron classes | Taylor et al. 2021 |
| Shiu et al. 2024 | LIF parameter calibration | Biophysical constants | bioRxiv preprint |

---

## API Reference

The FastAPI server exposes REST and WebSocket endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/experiments` | Create a new simulation experiment |
| `GET` | `/experiments/{id}` | Get experiment state |
| `WS` | `/ws/{id}` | Real-time WebSocket (spikes, body state, muscle activation) |
| `POST` | `/evolution/start` | Launch an evolution run |
| `GET` | `/evolution/status` | Current generation, fitness, population stats |
| `POST` | `/god/evaluate` | AI God Agent evaluation of current population |
| `GET` | `/neurons` | Neuron metadata, positions, types |
| `GET` | `/morphology/{neuron_id}` | 3D neuron morphology data |
| `POST` | `/export/{id}` | Export simulation data (JSON/CSV) |

Full interactive docs available at `http://localhost:8420/docs` when the server is running.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Neural simulation | [Brian2](https://brian2.readthedocs.io/) -- spiking neural networks |
| Physics engine | [MuJoCo](https://mujoco.org/) -- multi-joint dynamics |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) + WebSocket streaming |
| Frontend | [React](https://react.dev/) + [Three.js](https://threejs.org/) via React Three Fiber |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| AI God Agent | [xAI Grok](https://x.ai/) -- evolution oversight + narrative |
| Connectome data | [OpenWorm](https://openworm.org/), [FlyWire](https://flywire.ai/), [CeNGEN](https://cengen.org/) |
| Gene expression | CeNGEN single-cell RNA-seq |
| Scientific reports | Matplotlib, Jinja2, WeasyPrint |
| Testing | pytest, Vitest |

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where help is most needed:

- Additional organism support (zebrafish, mouse cortical columns)
- Improved biophysical neuron models (Hodgkin-Huxley, multi-compartment)
- New fitness functions and behavioral assays
- Performance optimization for large-scale evolution runs
- Documentation and scientific validation

---

## License

[MIT](LICENSE)

---

## References

1. Cook, S.J. et al. "Whole-animal connectomes of both Caenorhabditis elegans sexes." *Nature* 571, 63--71 (2019). [doi:10.1038/s41586-019-1352-7](https://doi.org/10.1038/s41586-019-1352-7)

2. Dorkenwald, S. et al. "Neuronal wiring diagram of an adult brain." *Nature* 634, 124--138 (2024). [doi:10.1038/s41586-024-07558-y](https://doi.org/10.1038/s41586-024-07558-y)

3. Shiu, P.K. et al. "A leaky integrate-and-fire computational model based on the connectome of the entire adult Drosophila brain." *bioRxiv* (2024). [doi:10.1101/2024.05.23.595605](https://doi.org/10.1101/2024.05.23.595605)

4. Taylor, S.R. et al. "Molecular topography of an entire nervous system." *Cell* 184(16), 4329--4347 (2021). [doi:10.1016/j.cell.2021.06.023](https://doi.org/10.1016/j.cell.2021.06.023)

5. Lobato-Rios, V. et al. "NeuroMechFly v2, simulating embodied sensorimotor control in adult Drosophila." *Nature Methods* 21, 2295--2309 (2024). [doi:10.1038/s41592-024-02497-y](https://doi.org/10.1038/s41592-024-02497-y)

6. Bargmann, C.I. & Horvitz, H.R. "Chemosensory neurons with overlapping functions direct chemotaxis to multiple chemicals in C. elegans." *Neuron* 7(5), 729--742 (1991). [doi:10.1016/0896-6273(91)90276-6](https://doi.org/10.1016/0896-6273(91)90276-6)
