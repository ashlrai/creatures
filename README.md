[![CI](https://github.com/ashlrai/creatures/actions/workflows/ci.yml/badge.svg)](https://github.com/ashlrai/creatures/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.13+](https://img.shields.io/badge/Python-3.13+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-255%20passing-brightgreen.svg)](https://github.com/ashlrai/creatures/actions)
[![Endpoints](https://img.shields.io/badge/API-70%20endpoints-orange.svg)](https://neurevo.dev)
[![Brian2](https://img.shields.io/badge/Brian2-SNN-blueviolet.svg)](https://brian2.readthedocs.io/)
[![MuJoCo](https://img.shields.io/badge/MuJoCo-Physics-red.svg)](https://mujoco.org/)

# Neurevo -- Simulate Real Brains. Evolve New Life.

**[neurevo.dev](https://neurevo.dev)**

Neurevo is a multi-organism neuroevolution platform built on real biological connectome data. It runs the complete C. elegans nervous system (299 neurons, OpenWorm) and a Drosophila brain circuit (500 neurons, FlyWire v783) as spiking neural networks inside physics-simulated bodies, then evolves populations across generations using NEAT neuroevolution and AI-guided selection. Three modes of operation -- **Simulation**, **Evolution**, and **Ecosystem** -- let you probe individual neural circuits, breed new organisms, or watch entire food webs emerge. The first platform to perform evolutionary optimization starting from real biological neural architectures.

---

## Quick Start

```bash
git clone https://github.com/ashlrai/creatures.git && cd creatures
make setup        # Python venv, npm install, Cython compilation
make dev          # API on :8420, frontend on :5173
```

Open [http://localhost:5173](http://localhost:5173) to see the live simulation.

```bash
make test         # 255 tests across core, API, and frontend
```

---

## Three Modes

### Simulation

Run a single organism's brain-body loop in real time. Stimulate neurons, apply drugs, observe spike cascades and motor output in the 3D viewer.

### Evolution

Launch NEAT neuroevolution from a real connectome template. The God Agent (xAI/Grok) evaluates populations, narrates selection events, and guides evolution toward configurable fitness targets.

### Ecosystem

Populate an arena with multiple organisms. Predator/prey dynamics, food webs, reproduction, and competition emerge from individual neural circuits interacting through a shared physics environment.

---

## Architecture

```
                         +-------------------+
                         |   creatures-web   |   React 18 + Three.js
                         |    (Frontend)     |   3D bodies, spike particles,
                         +---------+---------+   neuron tooltips, dashboards
                                   |
                              WS / REST  (70 endpoints)
                                   |
                         +---------+---------+
                         |   creatures-api   |   FastAPI + WebSocket
                         |    (Backend)      |   Simulation lifecycle,
                         +---------+---------+   evolution, ecosystem mgmt
                                   |
                +------------------+------------------+
                |                  |                  |
       +--------+-------+ +-------+--------+ +-------+--------+
       |  Neural Engine  | |  Physics Body  | |   Ecosystem    |
       |  (Brian2 SNN)   | |   (MuJoCo)     | |  (Multi-org)   |
       +--------+--------+ +-------+--------+ +-------+--------+
                |                  |                  |
       +--------+--------+ +------+--------+  +------+--------+
       |   Connectome     | |  WormBody     |  |  Food Webs    |
       | OpenWorm / FlyWire| | NeuroMechFly |  |  Predator/Prey|
       +--------+---------+ +------+--------+  +---------------+
                |
       +--------+---------+
       |   Evolution       |   NEAT mutation/crossover/selection
       |   + God Agent     |   xAI/Grok narratives (8 event types)
       +-------------------+
```

```
creatures/
├── creatures-core/             # Python library
│   └── creatures/
│       ├── connectome/         # OpenWorm + FlyWire loaders, gene expression
│       ├── neural/             # Brian2 engine, pharmacology (8 drugs)
│       ├── body/               # WormBody + NeuroMechFly (MuJoCo)
│       ├── evolution/          # NEAT genome, mutation, crossover, fitness
│       ├── god/                # God Agent (xAI/Grok), narrator, 8 event types
│       ├── environment/        # Arena, sensors, chemical gradients
│       ├── experiment/         # Brain-body simulation runner
│       ├── ecosystem/          # Multi-organism, food webs, reproduction
│       ├── analysis/           # Circuit analysis, community detection, motifs
│       ├── reporting/          # PDF/HTML scientific reports
│       └── ml/                 # ML-accelerated optimization
├── creatures-api/              # FastAPI server (70 endpoints)
│   └── app/
│       ├── routers/            # REST + WebSocket (12 router modules)
│       └── services/           # Simulation & evolution managers
├── creatures-web/              # React + Three.js + TypeScript frontend
│   └── src/
│       ├── components/         # 3D scene, neuron detail panel, dashboards
│       ├── hooks/              # WebSocket, demo mode, URL routing
│       └── stores/             # Zustand state management
├── notebooks/                  # Jupyter demos
└── scripts/                    # CLI: evolution, validation, reports
```

---

## API Reference

70 endpoints across REST and WebSocket. Key routes:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/experiments` | Create a simulation (C. elegans or Drosophila) |
| `GET` | `/experiments/{id}` | Experiment state and neural metrics |
| `WS` | `/ws/{id}` | Real-time spikes, body state, muscle activation |
| `POST` | `/evolution/start` | Launch NEAT evolution run |
| `GET` | `/evolution/status` | Generation, fitness, population stats |
| `POST` | `/evolution/select` | Manual or God Agent selection |
| `POST` | `/god/evaluate` | AI evaluation of current population |
| `GET` | `/god/narrative` | Rich narrative feed (8 event types) |
| `GET` | `/neurons` | Neuron metadata, types, positions |
| `GET` | `/neurons/{id}` | Single neuron detail with gene expression |
| `POST` | `/pharmacology/apply` | Apply drug at dose (Hill equation) |
| `GET` | `/pharmacology/drugs` | Available drugs with dose-response curves |
| `GET` | `/analysis/circuits` | Shortest paths, hubs, communities, motifs |
| `GET` | `/metrics/synchrony` | Real-time synchrony and oscillation data |
| `POST` | `/ecosystem/create` | Create multi-organism ecosystem |
| `GET` | `/ecosystem/{id}/status` | Food web, population counts, interactions |
| `POST` | `/export/{id}` | Export data (JSON/CSV) |

Full interactive docs at `http://localhost:8420/docs`.

---

## Pharmacology

Eight drugs with receptor-level targeting and Hill equation dose-response curves:

```
response = dose^n / (EC50^n + dose^n)
```

| Drug | Target | Effect | EC50 |
|------|--------|--------|------|
| Picrotoxin | GABA-A | Blocks inhibitory transmission | 0.5 |
| Aldicarb | AChE | Enhances cholinergic signaling (paralysis) | 0.8 |
| Levamisole | nAChR | Agonist, muscle hypercontraction | -- |
| Muscimol | GABA-A | Agonist, inhibitory enhancement | -- |
| Dopamine | DA receptors | Modulates locomotion and reward | -- |
| Serotonin | 5-HT receptors | Modulates feeding and egg-laying | -- |
| Ivermectin | GluCl | Irreversible paralysis | -- |
| Nemadipine | L-type Ca2+ | Blocks calcium channels, reduces activity | -- |

Apply drugs through the API or frontend. The dose-response panel shows real-time sigmoidal curves as you adjust concentration.

---

## God Agent

The God Agent is an xAI/Grok-powered AI that oversees evolution with rich narratives. It evaluates populations, makes selection decisions, and generates stories about the organisms it governs.

**8 narrative event types:** birth, death, mutation, selection, extinction, speciation, adaptation, and divine intervention.

The God Agent can:
- Evaluate organism fitness with biological reasoning
- Choose which organisms reproduce or are culled
- Trigger environmental pressures (droughts, predators, resource scarcity)
- Generate rich narratives that explain evolutionary dynamics
- Intervene directly to accelerate or redirect evolution

---

## Ecosystem

Multi-organism simulations with emergent dynamics:

- **Predator/prey interactions** -- organisms hunt, flee, and compete
- **Food webs** -- energy flows through trophic levels
- **Reproduction** -- organisms that meet fitness thresholds can reproduce
- **Resource competition** -- shared food sources drive selection pressure
- **Species tracking** -- monitor population dynamics across generations

---

## Circuit Analysis

Analyze neural circuit topology and dynamics in real time:

- **Shortest paths** between any two neurons
- **Hub neuron detection** -- identify the most connected/influential neurons
- **Community detection** -- find functional clusters within the connectome
- **Network motifs** -- recurring circuit patterns (feedforward, feedback, mutual inhibition)
- **Synchrony metrics** -- measure correlated firing across neural populations
- **Oscillation detection** -- identify rhythmic activity patterns
- **Firing rate analysis** -- per-neuron and population-level statistics

---

## Scientific Validation

Simulation validated against published C. elegans behavioral data:

| Behavior | Reference | Accuracy |
|----------|-----------|----------|
| Touch withdrawal (posterior) | Chalfie et al. 1985 | 85% |
| Chemotaxis (NaCl gradient) | Bargmann & Horvitz 1991 | 72% |
| Omega turn | Gray et al. 2005 | 70% |
| Pharyngeal pumping rate | Avery & Horvitz 1989 | 78% |
| Forward/reverse ratio | Zheng et al. 1999 | 71% |
| **Overall** | | **75%** |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Neural simulation | [Brian2](https://brian2.readthedocs.io/) with Cython backend (4x speedup) |
| Physics engine | [MuJoCo](https://mujoco.org/) -- WormBody + NeuroMechFly |
| Neuroevolution | NEAT with organism-agnostic fitness functions |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) + WebSocket (70 endpoints) |
| Frontend | [React 18](https://react.dev/) + [Three.js](https://threejs.org/) + TypeScript |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| AI God Agent | [xAI Grok](https://x.ai/) -- evolution oversight + rich narratives |
| Connectome data | [OpenWorm](https://openworm.org/) (C. elegans), [FlyWire](https://flywire.ai/) v783 (Drosophila) |
| Gene expression | [CeNGEN](https://cengen.org/) single-cell RNA-seq (101 neuron classes) |
| Build tooling | Vite, Cython, Make |
| Testing | pytest (Python), Vitest (TypeScript) |

---

## Data Sources

| Source | Data | Size | Reference |
|--------|------|------|-----------|
| [OpenWorm](https://openworm.org/) | C. elegans connectome | 299 neurons, 3,363 synapses | Cook et al. 2019 |
| [FlyWire](https://flywire.ai/) | Drosophila connectome | 139K neurons (500 modeled) | Dorkenwald et al. 2024 |
| [CeNGEN](https://cengen.org/) | Gene expression (scRNA-seq) | 101 neuron classes | Taylor et al. 2021 |
| Shiu et al. 2024 | LIF parameter calibration | Biophysical constants | bioRxiv preprint |

---

## References

1. Cook, S.J. et al. "Whole-animal connectomes of both Caenorhabditis elegans sexes." *Nature* 571, 63--71 (2019). [doi:10.1038/s41586-019-1352-7](https://doi.org/10.1038/s41586-019-1352-7)

2. Dorkenwald, S. et al. "Neuronal wiring diagram of an adult brain." *Nature* 634, 124--138 (2024). [doi:10.1038/s41586-024-07558-y](https://doi.org/10.1038/s41586-024-07558-y)

3. Shiu, P.K. et al. "A leaky integrate-and-fire computational model based on the connectome of the entire adult Drosophila brain." *bioRxiv* (2024). [doi:10.1101/2024.05.23.595605](https://doi.org/10.1101/2024.05.23.595605)

4. Taylor, S.R. et al. "Molecular topography of an entire nervous system." *Cell* 184(16), 4329--4347 (2021). [doi:10.1016/j.cell.2021.06.023](https://doi.org/10.1016/j.cell.2021.06.023)

5. Lobato-Rios, V. et al. "NeuroMechFly v2, simulating embodied sensorimotor control in adult Drosophila." *Nature Methods* 21, 2295--2309 (2024). [doi:10.1038/s41592-024-02497-y](https://doi.org/10.1038/s41592-024-02497-y)

6. Bargmann, C.I. & Horvitz, H.R. "Chemosensory neurons with overlapping functions direct chemotaxis to multiple chemicals in C. elegans." *Neuron* 7(5), 729--742 (1991). [doi:10.1016/0896-6273(91)90276-6](https://doi.org/10.1016/0896-6273(91)90276-6)

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where help is most needed:

- **New organisms** -- zebrafish, mouse cortical columns, or other connectomes
- **Neuron models** -- Hodgkin-Huxley, multi-compartment alongside existing LIF
- **Fitness functions** -- foraging, learning tasks, social behavior assays
- **Performance** -- GPU acceleration, parallel evolution, larger populations
- **Pharmacology** -- new drugs, receptor subtypes, dose-response validation
- **Visualization** -- connectome graph views, evolution dashboards, VR support

---

## License

[MIT](LICENSE)
