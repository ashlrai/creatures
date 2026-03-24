# Neurevo

**Evolving real brains. Understanding life.**

Neurevo is a neuroevolution platform that starts from real biological connectome data and evolves it — discovering how neural circuits adapt, which connections are essential, and what makes brains work. The first platform to do evolutionary optimization starting from REAL biological neural architectures.

**[neurevo.dev](https://neurevo.dev)**

Start with the actual C. elegans wiring diagram (299 neurons, 3,363 synapses). Evolve populations of organisms in 3D environments with food, obstacles, and chemical gradients. Watch natural selection reshape biological neural circuits over hundreds of generations. Use machine learning (CMA-ES, RL) to accelerate the process. Generate genuine scientific insight about neural circuit design principles.

---

## What This Does

```
Real Connectome → Spiking Neural Network → Physics Body → Emergent Behavior
                           ↓
              Evolution (Mutation + Selection + ML Acceleration)
                           ↓
              Scientific Insight (Which circuits matter? What's robust?)
```

| Organism | Neurons | Synapses | Body | Status |
|----------|---------|----------|------|--------|
| **C. elegans** (worm) | 299 | 3,363 | 12-segment MuJoCo chain | Working |
| **Drosophila** (fruit fly) | 3,216+ | 70,755+ | NeuroMechFly v2 (6 legs) | Working |
| **Zebrafish** (larva) | 180,000 | 30M+ | In development | Planned |

## Quick Start

```bash
# Clone
git clone https://github.com/ashlrai/creatures.git
cd creatures

# Setup Python environment
python3 -m venv .venv && source .venv/bin/activate
pip install -e "creatures-core[dev]"

# Download C. elegans data (small, ~35MB)
python3 -c "from creatures.connectome.openworm import load; c = load(); print(c.summary())"

# Run the notebooks
jupyter notebook notebooks/
```

### Run the Full Stack (API + Web UI)

```bash
# Terminal 1: Backend
cd creatures-api
pip install fastapi uvicorn websockets msgpack
PYTHONPATH="../creatures-core:." uvicorn app.main:app --port 8420

# Terminal 2: Frontend
cd creatures-web
npm install && npm run dev

# Open http://localhost:5173
# Click "Start Experiment" → Click "Poke Posterior" → Watch the brain light up
```

### Run with Make

```bash
make setup    # Install all dependencies
make dev      # Start API + frontend
make notebook # Open Jupyter notebooks
```

## Architecture

```
creatures/
├── creatures-core/              Python library
│   └── creatures/
│       ├── connectome/          Data loaders (C. elegans, FlyWire)
│       │   ├── openworm.py      299 neurons, 3,363 synapses
│       │   └── flywire.py       139K neurons, 50M synapses (with neuropil subsetting)
│       ├── neural/              Spiking neural network engines
│       │   └── brian2_engine.py Leaky integrate-and-fire via Brian2
│       ├── body/                Physics body models
│       │   ├── worm_body.py     MuJoCo 12-segment worm
│       │   └── fly_body.py      NeuroMechFly v2 (88 bodies, 87 joints)
│       └── experiment/
│           └── runner.py        Brain-body coupling loop
├── creatures-api/               FastAPI server
│   └── app/
│       ├── routers/             REST + WebSocket endpoints
│       └── services/            Simulation lifecycle management
├── creatures-web/               React + Three.js frontend
│   └── src/
│       ├── components/          3D scene, dashboard, controls
│       ├── hooks/               WebSocket real-time connection
│       └── stores/              Zustand state management
└── notebooks/                   Jupyter demos
    ├── 01_load_celegans.ipynb   Connectome exploration
    ├── 02_brian2_spike_cascade  Neural simulation
    ├── 03_alive_worm.ipynb      Brain-body coupling
    └── 04_fly_brain_body.ipynb  Fruit fly at scale
```

## How It Works

### 1. Load Real Connectome Data

```python
from creatures.connectome.openworm import load
connectome = load("edge_list")  # 299 neurons, 3,363 synapses
```

Or load 3,200+ fruit fly neurons:

```python
from creatures.connectome.flywire import load
connectome = load(neuropils="central_complex")  # FB, EB, PB, NO
```

### 2. Build a Spiking Neural Network

```python
from creatures.neural.brian2_engine import Brian2Engine
from creatures.neural.base import NeuralConfig

engine = Brian2Engine()
engine.build(connectome, NeuralConfig(weight_scale=3.0))
```

### 3. Connect to a Physics Body

```python
from creatures.body.worm_body import WormBody
from creatures.experiment.runner import SimulationRunner

body = WormBody()
runner = SimulationRunner(engine, body)
runner.poke("seg_8")  # Touch the posterior
runner.run(200)        # Watch the withdrawal reflex
```

### 4. Interact via API

```bash
# Create experiment
curl -X POST http://localhost:8420/experiments -H "Content-Type: application/json" \
  -d '{"name": "demo"}'

# Poke via WebSocket
wscat -c ws://localhost:8420/ws/{id}
> {"type": "poke", "segment": "seg_8"}
```

## Key Results

**C. elegans touch withdrawal reflex:**
- Poke posterior body → 5 touch neurons fire → cascade through 54+ neurons → 22 muscles activate → worm moves backward
- All from the real biological wiring — no behavior was programmed

**Fruit fly central complex:**
- 3,216 neurons from FlyWire v783 real data
- 1,871 neurons activate (58% of circuit)
- 82,501 spikes in 200ms (peak: 561/ms)
- Neural output drives NeuroMechFly body movement

## Supported Organisms

| Organism | Data Source | Neurons | Body Sim | Drug Testing |
|----------|-----------|---------|----------|-------------|
| C. elegans | OpenWorm / Cook 2019 | 299 | MuJoCo | Basic screens |
| Fruit fly | FlyWire v783 | 139,255 | NeuroMechFly v2 | Neurotoxicology |
| Zebrafish | Fish1 (2025) | 180,000+ | Planned | FDA-approved model |

## FlyWire Data

The fruit fly connectome (139K neurons, 50M synapses) is loaded from [FlyWire v783](https://codex.flywire.ai/). Data is downloaded automatically from Zenodo (~1GB).

Available brain region presets:
- `antennal_lobe` — Olfaction (3,824 neurons)
- `central_complex` — Navigation/locomotion (3,216 neurons)
- `mushroom_body` — Learning/memory
- `optic_lobe_right` — Vision
- `locomotion` — Motor control (thoracic ganglia)

## Tech Stack

- **Neural simulation**: [Brian2](https://brian2.readthedocs.io/) (leaky integrate-and-fire spiking networks)
- **Physics**: [MuJoCo](https://mujoco.org/) + [NeuroMechFly v2](https://neuromechfly.org/)
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) with WebSocket streaming
- **Frontend**: [React](https://react.dev/) + [Three.js](https://threejs.org/) via React Three Fiber
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Data**: [FlyWire](https://flywire.ai/) connectome, [OpenWorm](https://openworm.org/) C. elegans

## Vision

The FDA Modernization Act 2.0 (2022) removed the mandatory requirement for animal testing in drug development. Virtual organism simulation using real connectome data offers a path to:

- **Reduce animal testing** — pre-screen drug candidates computationally before expensive animal studies
- **Neurotoxicology screening** — predict neural circuit damage from drug candidates
- **CNS drug discovery** — simulate how drugs affect brain circuits before clinical trials
- **Precision medicine** — test treatments on patient-specific neural models

115-150 million animals are used in research annually. 90% of drugs that pass animal testing fail in humans. This platform aims to make virtual organism testing a viable first-pass filter.

## License

MIT

## References

- Dorkenwald et al. "Neuronal wiring diagram of an adult brain." Nature (2024)
- Cook et al. "Whole-animal connectomes of both Caenorhabditis elegans sexes." Nature (2019)
- Lobato-Rios et al. "NeuroMechFly v2." Nature Methods (2024)
- Shiu et al. "A leaky integrate-and-fire computational model based on the connectome." bioRxiv (2024)
- Eon Systems. "Embodied Brain Emulation." (2026)
