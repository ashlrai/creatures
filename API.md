# Neurevo API Reference

Complete REST API and WebSocket reference for the Creatures virtual organism simulation platform.

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://creatures-production.up.railway.app` |
| Local | `http://localhost:8420` |

Interactive Swagger docs are available at `{BASE_URL}/docs`.

## Authentication

No authentication is required. All endpoints are publicly accessible. CORS is configured to allow all origins.

## Route Prefix Note

Most endpoints are available at both their canonical path and under an `/api` prefix for frontend compatibility. For example, `/experiments` is also reachable at `/api/experiments`. The tables below show the canonical paths; prepend `/api` if your client uses that convention.

---

## Health & Info

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api` | API name, version, and docs link |

**GET /health**
```json
{ "status": "ok" }
```

**GET /api**
```json
{
  "name": "Creatures API",
  "version": "0.2.0",
  "description": "Virtual organism simulation powered by real connectome data",
  "docs": "/docs"
}
```

---

## Experiments

Manage neural simulation experiments. Each experiment loads a real connectome (C. elegans, Drosophila, or zebrafish) and runs a spiking neural network coupled to a physics body.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/experiments` | Create a new simulation experiment |
| GET | `/experiments` | List all experiments |
| GET | `/experiments/{sim_id}` | Get experiment info |
| POST | `/experiments/{sim_id}/start` | Start or resume simulation |
| POST | `/experiments/{sim_id}/pause` | Pause simulation |
| POST | `/experiments/{sim_id}/stop` | Stop simulation |
| DELETE | `/experiments/{sim_id}` | Delete an experiment |
| POST | `/experiments/{sim_id}/poke` | Poke a body segment |
| POST | `/experiments/{sim_id}/stimulate` | Inject current into neurons |
| POST | `/experiments/{sim_id}/lesion` | Lesion a synapse or neuron |

### POST /experiments

Create a new simulation experiment.

**Request Body** (`ExperimentCreate`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"default"` | Experiment name |
| `connectome_source` | string | `"edge_list"` | `"edge_list"` or `"adjacency"` |
| `organism` | string | `"c_elegans"` | `"c_elegans"`, `"drosophila"`, or `"zebrafish"` |
| `weight_scale` | float | `3.0` | Synaptic weight scale factor |
| `tau_syn` | float | `8.0` | Synaptic time constant (ms) |
| `tau_m` | float | `15.0` | Membrane time constant (ms) |
| `poke_current` | float | `50.0` | Current injected on poke (mV) |
| `poke_duration_ms` | float | `50.0` | Duration of poke stimulus |
| `firing_rate_to_torque_gain` | float | `0.004` | Neural-to-motor coupling gain |
| `inhibitory_gain` | float | `-0.002` | Inhibitory coupling gain |
| `neuropils` | string\|null | `null` | Brain region preset (Drosophila only) |
| `max_neurons` | int\|null | `null` | Limit neuron count (testing) |

**Response** (`ExperimentInfo`):

```json
{
  "id": "abc12345",
  "name": "default",
  "organism": "c_elegans",
  "n_neurons": 279,
  "n_synapses": 2194,
  "status": "ready",
  "t_ms": 0.0
}
```

### POST /experiments/{sim_id}/start

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `speed` | float | `1.0` | Simulation speed multiplier |

**Response:**
```json
{ "status": "running", "id": "abc12345" }
```

### POST /experiments/{sim_id}/poke

**Request Body** (`PokeRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `segment` | string | `"seg_8"` | Body segment to poke |
| `force` | float[3] | `[0, 0.15, 0]` | Force vector [x, y, z] |

**Response:**
```json
{ "poked": "seg_8" }
```

### POST /experiments/{sim_id}/stimulate

**Request Body** (`StimulateRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `neuron_ids` | string[] | *required* | Neuron IDs to stimulate |
| `current_mV` | float | `25.0` | Injected current (mV) |
| `duration_ms` | float | `50.0` | Stimulus duration (ms) |

**Response:**
```json
{ "stimulated": ["PLML", "PLMR"] }
```

### POST /experiments/{sim_id}/lesion

**Request Body** (`LesionRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `neuron_id` | string\|null | `null` | Lesion all synapses of this neuron |
| `pre_id` | string\|null | `null` | Pre-synaptic neuron (for single synapse lesion) |
| `post_id` | string\|null | `null` | Post-synaptic neuron (for single synapse lesion) |

Provide either `neuron_id` alone, or both `pre_id` and `post_id`.

**Response:**
```json
{ "lesioned_neuron": "AVAL" }
```

---

## Experiment Protocols

Structured, reproducible experiment protocols with preset and custom definitions.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/experiments/protocols` | List all preset experiment protocols |
| GET | `/experiments/protocols/{name}` | Get details of a specific preset |
| POST | `/experiments/protocols/run` | Run a preset or custom protocol |

### GET /experiments/protocols

Returns a list of `ProtocolInfoSchema` objects:

```json
[
  {
    "name": "touch_withdrawal",
    "description": "...",
    "organism": "c_elegans",
    "duration_ms": 10000.0,
    "n_repeats": 1,
    "control": true,
    "n_steps": 3,
    "steps": [
      { "time_ms": 100.0, "action": "stimulus", "parameters": {}, "label": "" }
    ]
  }
]
```

### POST /experiments/protocols/run

**Request Body** (`ProtocolRunRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `preset` | string\|null | `null` | Name of a preset protocol to run |
| `name` | string\|null | `null` | Custom protocol name |
| `description` | string\|null | `null` | Custom protocol description |
| `organism` | string | `"c_elegans"` | Target organism |
| `steps` | StepSchema[]\|null | `null` | Custom protocol steps |
| `duration_ms` | float | `10000.0` | Total simulation duration |
| `n_repeats` | int | `1` | Number of repeats |
| `control` | bool | `true` | Whether to run a control condition |

Each `StepSchema`:

| Field | Type | Description |
|-------|------|-------------|
| `time_ms` | float | When to execute this step |
| `action` | string | `"stimulus"`, `"drug"`, `"lesion"`, `"measure"`, `"wait"`, `"poke"` |
| `parameters` | object | Action-specific parameters |
| `label` | string | Optional label |

**Response** (`ProtocolResultSchema`):

```json
{
  "protocol_name": "touch_withdrawal",
  "description": "...",
  "n_measurements": 5,
  "measurements": [
    { "time_ms": 100.0, "metric": "firing_rate", "value": 12.5, "label": "" }
  ],
  "control_measurements": [...],
  "summary": { "mean_response": 12.5 },
  "report_markdown": "# Touch Withdrawal Experiment\n..."
}
```

---

## Evolution

Create and manage evolutionary optimization runs that evolve neural connectomes for locomotion fitness.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/evolution/runs` | Create a new evolution run |
| GET | `/evolution/runs` | List all evolution runs |
| GET | `/evolution/runs/{run_id}` | Get run status |
| GET | `/evolution/runs/{run_id}/history` | Get fitness history |
| POST | `/evolution/runs/{run_id}/start` | Start or resume a run |
| POST | `/evolution/runs/{run_id}/pause` | Pause a run |
| GET | `/evolution/runs/{run_id}/events` | Get narrative world log events |

### POST /evolution/runs

**Request Body** (`EvolutionCreateRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `organism` | string | `"c_elegans"` | Target organism |
| `population_size` | int | `50` | Population size |
| `n_generations` | int | `100` | Number of generations |
| `lifetime_ms` | float | `5000.0` | Simulation lifetime per organism (ms) |
| `n_workers` | int | `4` | Parallel worker count |
| `seed` | int | `42` | Random seed |
| `fitness_mode` | string | `"fast"` | `"fast"`, `"medium"`, `"full"`, or `"vectorized"` |
| `w_consciousness` | float | `0.0` | Weight of phi (IIT) in fitness function (0=disabled) |

**Response** (`EvolutionRunInfo`):

```json
{
  "id": "run_abc123",
  "organism": "c_elegans",
  "status": "ready",
  "generation": 0,
  "n_generations": 100,
  "population_size": 50,
  "best_fitness": 0.0,
  "mean_fitness": 0.0,
  "elapsed_seconds": 0.0
}
```

### GET /evolution/runs/{run_id}/history

Returns an array of per-generation fitness records:

```json
[
  {
    "generation": 0,
    "best_fitness": 0.12,
    "mean_fitness": 0.05,
    "std_fitness": 0.03,
    "n_species": 3
  }
]
```

### GET /evolution/runs/{run_id}/events

Returns narrative world log events (e.g., speciation events, extinction, god agent interventions):

```json
[
  { "type": "speciation", "generation": 12, "message": "..." }
]
```

---

## Consciousness

Compute consciousness metrics (IIT, GWT, Neural Complexity, PCI) on running simulations.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/consciousness/{sim_id}/report` | Full consciousness report (all 4 metrics) |
| GET | `/api/consciousness/{sim_id}/phi` | Integrated Information (phi) only |
| GET | `/api/consciousness/{sim_id}/ignition` | Global Workspace ignition events |

### GET /api/consciousness/{sim_id}/report

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `bin_ms` | float | `5.0` | Bin size for spike binning (1-100) |
| `top_k` | int | `30` | Number of top neurons for phi computation (5-100) |

**Response:**

```json
{
  "phi": 0.42,
  "phi_details": { "partition": [...] },
  "ignition_events": [...],
  "ignition_rate_per_second": 2.5,
  "neural_complexity": 0.78,
  "complexity_profile": [...],
  "pci": 0.35,
  "pci_details": { ... },
  "summary": "...",
  "n_neurons": 279,
  "n_spikes": 1500,
  "duration_ms": 5000.0
}
```

### GET /api/consciousness/{sim_id}/phi

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `bin_ms` | float | `5.0` | Bin size (1-100) |
| `top_k` | int | `30` | Top neurons (5-100) |
| `n_partitions` | int | `50` | Number of partitions to test (10-500) |

### GET /api/consciousness/{sim_id}/ignition

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `threshold` | float | `0.05` | Activation threshold (0.001-0.5) |
| `window_ms` | float | `50.0` | Detection window (5-500) |

**Response:**

```json
{
  "events": [...],
  "rate_per_second": 2.5,
  "n_total": 12
}
```

---

## Neurons

Neuron data, positions, gene expression, and connectivity profiles.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/neurons/positions` | 3D positions for all C. elegans neurons |
| GET | `/neurons/{sim_id}/info` | Neuron metadata for a running experiment |
| GET | `/neurons/genes/summary` | Summary of gene expression data |
| GET | `/neurons/genes/drug/{drug_name}` | Neurons affected by a drug |
| GET | `/neurons/genes/receptor/{receptor_id}` | Drug target info for a receptor |
| GET | `/neurons/{neuron_id}/profile` | Full connectivity profile for a neuron |
| GET | `/neurons/{neuron_id}/genes` | Gene expression / receptor data for a neuron |

### GET /neurons/positions

Returns a map of neuron ID to `[x, y, z]` coordinates from OpenWorm NeuroML data:

```json
{
  "AVAL": [1.2, -120.5, 3.4],
  "AVAR": [1.2, -120.5, -3.4],
  ...
}
```

### GET /neurons/{sim_id}/info

Returns an array of neuron info for all neurons in the simulation:

```json
[
  {
    "id": "AVAL",
    "type": "interneuron",
    "neurotransmitter": "acetylcholine",
    "firing_rate": 15.2,
    "position": [1.2, -120.5, 3.4]
  }
]
```

### GET /neurons/{neuron_id}/profile

Returns full connectivity and graph metrics for a single neuron:

```json
{
  "id": "AVAL",
  "type": "interneuron",
  "neurotransmitter": "acetylcholine",
  "firing_rate": 0,
  "presynaptic": [
    { "neuronId": "PLML", "weight": 5, "type": "chemical" }
  ],
  "postsynaptic": [
    { "neuronId": "DA01", "weight": 3, "type": "chemical" }
  ],
  "in_degree": 42,
  "out_degree": 38,
  "hub_score": 0.143,
  "layer_depth": 2
}
```

### GET /neurons/{neuron_id}/genes

```json
{
  "neuron_id": "AVAL",
  "receptors": ["glr-1", "nmr-1"],
  "ion_channels": ["egl-19"],
  "drug_targets": {
    "glr-1": { "drug": "CNQX", "action": "antagonist" }
  }
}
```

### GET /neurons/genes/summary

```json
{
  "neurons_with_data": 118,
  "drug_targets": 12,
  "neuron_ids": ["ADAL", "ADAR", ...]
}
```

---

## Pharmacology

Drug library, dose-response curves, and live drug application on simulations.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pharmacology/drugs` | List all drugs in the library |
| GET | `/api/pharmacology/drugs/{drug_name}` | Get info about a specific drug |
| GET | `/api/pharmacology/drugs/{drug_name}/dose-response` | Hill-equation dose-response curve |
| POST | `/api/pharmacology/{sim_id}/apply` | Apply a drug to a running simulation |
| DELETE | `/api/pharmacology/{sim_id}/reset` | Reset all drug effects |
| GET | `/api/pharmacology/{sim_id}/active` | List active drugs on a simulation |
| POST | `/api/pharmacology/{sim_id}/screen` | Batch screen drugs (predictive, no side effects) |

### GET /api/pharmacology/drugs

Returns a list of `DrugInfo` objects:

```json
[
  {
    "key": "levamisole",
    "name": "Levamisole",
    "target_nt": "acetylcholine",
    "target_type": "agonist",
    "weight_scale": 2.0,
    "current_injection": 5.0,
    "ec50": 1.0,
    "hill_coefficient": 1.5,
    "description": "Cholinergic agonist causing paralysis"
  }
]
```

### GET /api/pharmacology/drugs/{drug_name}/dose-response

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `points` | int | `20` | Number of curve points (2-200) |

**Response** (`DoseResponseCurve`):

```json
{
  "drug": "levamisole",
  "ec50": 1.0,
  "hill_coefficient": 1.5,
  "curve": [
    { "dose": 0.0, "response": 0.0, "effective_scale": 1.0 },
    { "dose": 0.2, "response": 0.056, "effective_scale": 1.056 }
  ]
}
```

### POST /api/pharmacology/{sim_id}/apply

**Request Body** (`DrugApplyRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `drug_name` | string | *required* | Drug key from the library |
| `dose` | float | `1.0` | Dose level |

**Response** (`DrugApplyResult`):

```json
{
  "drug": "levamisole",
  "dose": 1.0,
  "synapses_affected": 450,
  "neurons_injected": 12,
  "weight_scale_applied": 1.5,
  "description": "Cholinergic agonist applied"
}
```

### POST /api/pharmacology/{sim_id}/screen

Batch screen multiple drugs at multiple doses. Predictive only -- does NOT modify the simulation.

**Request Body** (`BatchScreenRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `drugs` | string[] | *required* | Drug keys to screen |
| `doses` | float[] | `[0.25, 0.5, 1.0, 1.5, 2.0]` | Dose levels |

**Response:**

```json
{
  "results": [
    {
      "drug": "levamisole",
      "dose": 1.0,
      "response": 0.5,
      "effective_scale": 1.5,
      "synapses_affected": 450,
      "predicted_effect": "moderate acetylcholine potentiation"
    }
  ]
}
```

---

## Analysis

Connectome circuit analysis on running simulations (graph algorithms, community detection, motif counting).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analysis/{sim_id}/shortest-path` | Shortest path between two neurons (BFS) |
| GET | `/api/analysis/{sim_id}/hubs` | Most connected hub neurons by degree |
| GET | `/api/analysis/{sim_id}/communities` | Neuron community detection (spectral clustering) |
| GET | `/api/analysis/{sim_id}/motifs` | Count 3-node circuit motifs |
| GET | `/api/analysis/{sim_id}/neuron/{neuron_id}` | Full connectivity profile for a neuron |
| GET | `/api/analysis/{sim_id}/layers` | Sensory-inter-motor layer analysis |
| GET | `/api/analysis/{sim_id}/bottlenecks` | Critical information bottleneck neurons |

### GET /api/analysis/{sim_id}/shortest-path

**Query Parameters (required):**

| Param | Type | Description |
|-------|------|-------------|
| `source` | string | Source neuron ID |
| `target` | string | Target neuron ID |

**Response:**

```json
{
  "source": "PLML",
  "target": "DA01",
  "path": ["PLML", "AVAL", "DA01"],
  "length": 2
}
```

### GET /api/analysis/{sim_id}/hubs

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `top_n` | int | `10` | Number of hub neurons (1-100) |

**Response:**

```json
{
  "hubs": [
    { "id": "AVAL", "in_degree": 42, "out_degree": 38, "total_degree": 80 }
  ]
}
```

### GET /api/analysis/{sim_id}/communities

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `n` | int | `5` | Number of communities (2-50) |

**Response:**

```json
{
  "n_communities": 5,
  "assignments": { "AVAL": 0, "AVAR": 0, "PLML": 2 },
  "groups": { "0": ["AVAL", "AVAR"], "2": ["PLML"] }
}
```

### GET /api/analysis/{sim_id}/motifs

```json
{
  "motifs": {
    "feedforward": 120,
    "feedback": 45,
    "mutual": 30,
    "fan_in": 88,
    "fan_out": 92
  }
}
```

### GET /api/analysis/{sim_id}/layers

```json
{
  "sensory": { "count": 80, "neurons": ["PLML", ...] },
  "interneuron": { "count": 99, "neurons": ["AVAL", ...] },
  "motor": { "count": 100, "neurons": ["DA01", ...] }
}
```

### GET /api/analysis/{sim_id}/bottlenecks

```json
{
  "bottlenecks": [
    { "id": "AVAL", "score": 0.85 }
  ],
  "count": 10
}
```

---

## Metrics

Real-time neural metrics for running simulations.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/metrics/{sim_id}/summary` | Network state summary (active neurons, rates, synchrony) |
| GET | `/api/metrics/{sim_id}/oscillations` | FFT analysis of population activity |
| GET | `/api/metrics/{sim_id}/firing-patterns` | Classify each neuron's firing pattern |
| GET | `/api/metrics/{sim_id}/top-active` | Most active neurons by firing rate |

### GET /api/metrics/{sim_id}/summary

```json
{
  "n_active": 45,
  "mean_rate": 12.5,
  "max_rate": 85.0,
  "synchrony_index": 0.35,
  "n_neurons": 279
}
```

### GET /api/metrics/{sim_id}/oscillations

```json
{
  "peak_frequency_hz": 4.2,
  "locomotion_band_power": 0.65,
  "phase_relationships": { "AVAL-DA01": 0.3 },
  "frequencies": [0.1, 0.2, ...],
  "power": [0.01, 0.05, ...],
  "has_data": true
}
```

### GET /api/metrics/{sim_id}/firing-patterns

```json
{
  "patterns": { "AVAL": "tonic", "PLML": "bursting", "DA01": "silent" },
  "counts": { "silent": 150, "tonic": 50, "bursting": 30, "irregular": 20, "rhythmic": 29 },
  "n_neurons": 279,
  "duration_ms": 5000.0
}
```

### GET /api/metrics/{sim_id}/top-active

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `n` | int | `20` | Number of neurons to return (1-200) |

```json
{
  "neurons": [
    { "id": "AVAL", "firing_rate": 85.2 }
  ],
  "n_total": 279,
  "n_active": 45
}
```

---

## Ecosystem

Multi-organism ecosystem simulation with predation, sensory environments, and population dynamics.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ecosystem` | Create a new ecosystem |
| GET | `/api/ecosystem/{eco_id}` | Get full ecosystem state |
| POST | `/api/ecosystem/{eco_id}/step` | Advance by N steps |
| POST | `/api/ecosystem/{eco_id}/add-organism` | Add an organism |
| POST | `/api/ecosystem/{eco_id}/upgrade-brain/{organism_id}` | Upgrade organism to spiking neural brain |
| GET | `/api/ecosystem/{eco_id}/stats` | Population statistics |
| GET | `/api/ecosystem/{eco_id}/events` | Recent ecosystem events |
| POST | `/api/ecosystem/{eco_id}/drug` | Apply a drug to a species |
| POST | `/api/ecosystem/{eco_id}/event` | Trigger an environmental event |
| POST | `/api/ecosystem/{eco_id}/gradient` | Add a chemical gradient |
| POST | `/api/ecosystem/{eco_id}/toxin` | Add a toxic zone |
| POST | `/api/ecosystem/{eco_id}/temperature` | Set temperature field |
| GET | `/api/ecosystem/{eco_id}/world` | Get sensory world state |
| POST | `/api/ecosystem/{eco_id}/world` | Set world type |
| GET | `/api/ecosystem/{eco_id}/timeline` | Population time series |

### POST /api/ecosystem

**Request Body** (`EcosystemCreateRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `arena_radius` | float | `2.0` | Arena radius |
| `n_food_sources` | int | `10` | Initial food sources |
| `populations` | object | `{"c_elegans": 20, "drosophila": 5}` | Species to population count |
| `predation_enabled` | bool | `true` | Enable predation |
| `auto_start` | bool | `false` | Auto-start simulation |

**Response:**

```json
{
  "id": "eco_a1b2c3d4",
  "auto_start": false,
  "organisms": [...],
  "food_sources": [...]
}
```

### POST /api/ecosystem/{eco_id}/step

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `steps` | int | `1` | Steps to advance (1-10000) |

**Response** (`StepResponse`):

```json
{
  "time_ms": 100.0,
  "steps_run": 10,
  "events_count": 3,
  "events": [
    { "type": "predation", "predator": "org_1", "prey": "org_2" }
  ]
}
```

### POST /api/ecosystem/{eco_id}/add-organism

**Request Body** (`AddOrganismRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `species` | string | `"c_elegans"` | Species to add |
| `position` | float[2]\|null | `null` | `[x, y]` or null for random |
| `energy` | float | `100.0` | Starting energy |

### POST /api/ecosystem/{eco_id}/upgrade-brain/{organism_id}

Replaces an organism's simple movement rules with a real spiking neural network brain.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `species` | string | `"c_elegans"` | Connectome species to load |

**Response** (`UpgradeBrainResponse`):

```json
{
  "organism_id": "org_1",
  "species": "c_elegans",
  "n_neurons": 279,
  "n_synapses": 2194,
  "active_neurons": 45,
  "sensor_groups": ["nose_touch", "anterior_gentle"],
  "motor_groups": ["dorsal_A", "ventral_A"]
}
```

### POST /api/ecosystem/{eco_id}/event

**Request Body** (`EnvironmentalEventRequest`):

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | One of: `"food_scarcity"`, `"predator_surge"`, `"mutation_burst"`, `"climate_shift"` |

### POST /api/ecosystem/{eco_id}/gradient

**Request Body** (`GradientRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"NaCl"` | Chemical name |
| `source_position` | float[2] | `[1.0, 0.5]` | Gradient source position |
| `peak_concentration` | float | `1.0` | Peak concentration |
| `diffusion_radius` | float | `1.5` | Diffusion radius |
| `chemical_type` | string | `"attractant"` | `"attractant"` or `"repellent"` |

### POST /api/ecosystem/{eco_id}/toxin

**Request Body** (`ToxinRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `position` | float[2] | `[-0.5, -0.5]` | Zone position |
| `radius` | float | `0.3` | Zone radius |
| `damage_rate` | float | `5.0` | Damage per step |
| `name` | string | `"toxin"` | Zone name |

### POST /api/ecosystem/{eco_id}/temperature

**Request Body** (`TemperatureRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cold_position` | float[2] | `[-1.5, 0.0]` | Cold pole position |
| `hot_position` | float[2] | `[1.5, 0.0]` | Hot pole position |
| `cold_temp` | float | `15.0` | Cold temperature (C) |
| `hot_temp` | float | `25.0` | Hot temperature (C) |
| `preferred_temp` | float | `20.0` | Preferred temperature (C) |

### POST /api/ecosystem/{eco_id}/world

Set the world type for an ecosystem.

**Request Body** (`WorldRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | `"soil"` | `"soil"`, `"pond"`, `"lab_plate"`, or `"abstract"` |
| `challenge` | string\|null | `null` | For abstract world: `"maze"`, `"foraging"`, `"memory"`, `"social"` |
| `size` | float\|null | `null` | Size override |

### GET /api/ecosystem/{eco_id}/timeline

Returns time series of population counts sampled every 100 steps:

```json
{
  "eco_id": "eco_a1b2c3d4",
  "current_step": 500,
  "sample_interval": 100,
  "snapshots": [
    {
      "step": 100,
      "time_ms": 100.0,
      "populations": { "c_elegans": 18, "drosophila": 6 },
      "total_alive": 24,
      "total_food_energy": 850
    }
  ]
}
```

---

## Massive Brain-World

Large-scale neural ecosystem with thousands of spiking-brain organisms and emergent behavior detection.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ecosystem/massive` | Create a massive brain-world |
| POST | `/api/ecosystem/massive/{bw_id}/step` | Advance by N steps |
| GET | `/api/ecosystem/massive/{bw_id}` | Get state (subsampled for visualization) |
| GET | `/api/ecosystem/massive/{bw_id}/emergent` | Get detected emergent behaviors |

### POST /api/ecosystem/massive

**Request Body** (`MassiveCreateRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `n_organisms` | int | `10000` | Number of organisms (1-500,000) |
| `neurons_per` | int | `100` | Neurons per organism (10-1000) |
| `world_type` | string | `"soil"` | World type |
| `arena_size` | float | `50.0` | Arena size |
| `neuron_model` | string | `"lif"` | `"lif"` or `"izhikevich"` |
| `use_gpu` | bool | `true` | Enable GPU acceleration |
| `enable_stdp` | bool | `false` | Enable spike-timing-dependent plasticity |
| `enable_consciousness` | bool | `false` | Enable consciousness metrics |
| `consciousness_interval` | int | `500` | Steps between consciousness measurements |

**Response:**

```json
{
  "id": "bw_a1b2c3d4",
  "n_organisms": 10000,
  "neurons_per": 100,
  "total_neurons": 1000000,
  "total_synapses": 5000000,
  "world_type": "soil",
  "backend": "cuda",
  "neuron_model": "lif",
  "stdp_enabled": false,
  "consciousness_enabled": false
}
```

### POST /api/ecosystem/massive/{bw_id}/step

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `steps` | int | `1` | Steps to advance (1-100,000) |

### GET /api/ecosystem/massive/{bw_id}/emergent

```json
{
  "id": "bw_a1b2c3d4",
  "total_events": 5,
  "events": [
    { "type": "flocking", "time_step": 400, "n_organisms": 120 }
  ]
}
```

---

## Morphology

3D connectome graph data for visualization.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/morphology/connectome-graph` | Full connectome graph with 3D positions and edges |

### GET /morphology/connectome-graph

Returns neurons as nodes with real anatomical 3D positions (OpenWorm NeuroML) and synapses as weighted edges. Top 500 synapses by weight are included.

```json
{
  "nodes": [
    { "id": "AVAL", "type": "interneuron", "nt": "acetylcholine", "x": 0.45, "y": 0.02, "z": -0.001 }
  ],
  "edges": [
    { "pre": "PLML", "post": "AVAL", "weight": 5, "type": "chemical" }
  ],
  "n_neurons": 279,
  "n_edges": 500
}
```

---

## Export

Data export for scientific analysis and external tools.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/export/evolution/{run_id}/fitness` | Fitness history as CSV |
| GET | `/export/evolution/{run_id}/report` | Scientific markdown report |
| GET | `/export/evolution/{run_id}/connectome` | Best genome's connectome (JSON or NeuroML) |
| GET | `/export/{sim_id}/csv` | Simulation data as CSV |
| GET | `/export/demo/report` | Sample report with mock data |

### GET /export/evolution/{run_id}/fitness

Downloads a CSV file with columns: `generation, best_fitness, mean_fitness, std_fitness, n_species`

### GET /export/evolution/{run_id}/report

Downloads a scientific markdown report covering run metadata, fitness trajectory, connectome drift, God Agent interventions, and methodology.

### GET /export/evolution/{run_id}/connectome

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | string | `"json"` | `"json"` or `"neuroml"` |

Downloads the best evolved genome's connectome as JSON (for web visualization) or NeuroML2 XML (for NEURON/NEST/Brian2).

### GET /export/{sim_id}/csv

Downloads simulation frame data as CSV. Columns: `time_step, generation, best_fitness, mean_fitness, std_fitness, n_species`

---

## Export (Advanced)

NeuroML export, JSON graph export, and statistical analysis tools.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/export/{sim_id}/neuroml` | Export connectome as NeuroML2 XML |
| GET | `/export/{sim_id}/json` | Export connectome as JSON graph (D3.js-compatible) |
| GET | `/export/{sim_id}/statistics` | Statistical summary of simulation data |
| POST | `/export/compare` | Compare two experimental conditions statistically |

### GET /export/{sim_id}/neuroml

Downloads a `.nml` file compatible with OpenWorm, NEURON, NEST, and Brian2.

### GET /export/{sim_id}/json

Downloads a JSON graph structure with `nodes` and `links` arrays, compatible with D3.js.

### GET /export/{sim_id}/statistics

```json
{
  "sim_id": "abc123",
  "n_frames": 500,
  "mean_spike_count": 12.5,
  "confidence_interval_95": [11.2, 13.8],
  "total_spikes": 6250,
  "note": "For full experimental vs control comparison, use POST /api/export/compare"
}
```

### POST /export/compare

Compare two sets of measurements with automatic statistical test selection.

**Request Body** (`CompareRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `experimental` | float[] | *required* | Experimental condition measurements (min 2) |
| `control` | float[] | *required* | Control condition measurements (min 2) |
| `test` | string | `"auto"` | `"auto"`, `"welch"`, `"mann_whitney"`, or `"paired"` |
| `alpha` | float | `0.05` | Significance threshold |

**Response** (`StatisticalResultResponse`):

```json
{
  "test_name": "Welch's t-test",
  "statistic": 3.45,
  "p_value": 0.002,
  "effect_size": 1.2,
  "confidence_interval": [2.1, 5.8],
  "significant": true,
  "description": "Significant difference (p=0.002, d=1.2)"
}
```

---

## God Agent

AI-powered oversight of evolution runs with analysis, hypothesis generation, and interventions.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/god/analyze` | Trigger God Agent analysis on an evolution run |
| GET | `/god/reports/{run_id}` | Get all God Agent reports for a run |
| GET | `/god/status` | Get current God Agent status |
| POST | `/god/intervene` | Manually apply an intervention |
| POST | `/god/discover` | Start an autonomous discovery session |
| GET | `/god/discoveries` | List all discoveries |
| GET | `/god/discoveries/{discovery_id}` | Get discovery details |
| GET | `/god/share/{discovery_id}` | Get shareable discovery with evidence |

### POST /god/analyze

**Request Body** (`AnalyzeRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `run_id` | string | *required* | Evolution run ID |
| `prompt` | string\|null | `null` | Optional analysis prompt |

**Response** (`GodReportResponse`):

```json
{
  "id": "rpt_abc123",
  "run_id": "run_xyz",
  "timestamp": "2026-03-26T12:00:00Z",
  "analysis": "Population shows moderate diversity with fitness plateauing...",
  "fitness_trend": "plateauing",
  "interventions": [
    {
      "type": "mutation_rate",
      "action": "increase",
      "parameters": { "factor": 1.5 },
      "reasoning": "Increase exploration to escape local optimum."
    }
  ],
  "hypothesis": "Increasing mutation pressure will break the fitness plateau...",
  "report": "..."
}
```

### POST /god/intervene

**Request Body** (`InterventionRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `run_id` | string | *required* | Evolution run ID |
| `intervention_type` | string | *required* | `"evolution"`, `"fitness"`, `"diversity"`, `"selection"` |
| `action` | string | *required* | Action to take |
| `parameters` | object | `{}` | Action-specific parameters |

### POST /god/discover

Start an autonomous discovery session that generates hypotheses, runs experiments, and produces a report.

**Request Body** (`DiscoverRequest`):

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `organism` | string | `"c_elegans"` | Target organism |
| `max_hypotheses` | int\|null | `null` | Limit hypotheses tested |

**Response** (`DiscoveryResponse`):

```json
{
  "session_id": "abc12345",
  "status": "complete",
  "n_hypotheses": 5,
  "n_discoveries": 2,
  "report": "# Discovery Report\n..."
}
```

### GET /god/discoveries

Returns all discoveries sorted by significance:

```json
[
  {
    "id": "disc_1",
    "title": "Motor-sensory feedback loop",
    "significance": 0.92,
    "category": "circuit_analysis",
    "timestamp": "2026-03-26T12:00:00Z"
  }
]
```

### GET /god/discoveries/{discovery_id}

```json
{
  "id": "disc_1",
  "title": "Motor-sensory feedback loop",
  "description": "...",
  "significance": 0.92,
  "category": "circuit_analysis",
  "timestamp": "2026-03-26T12:00:00Z",
  "evidence": { ... },
  "hypothesis_statement": "..."
}
```

---

## History

Browse persisted experiment and evolution run history from the database.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/history/experiments` | List past experiments |
| GET | `/api/history/experiments/{exp_id}` | Get experiment details and results |
| GET | `/api/history/evolution` | List past evolution runs |
| GET | `/api/history/evolution/{run_id}` | Get evolution run details |
| GET | `/api/history/genomes/{genome_id}` | Get a specific evolved genome |
| GET | `/api/history/share/{experiment_id}` | Get shareable experiment result |
| GET | `/api/history/evolution/{run_id}/share` | Get shareable evolution run |

### GET /api/history/experiments

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | `50` | Max results |

### GET /api/history/share/{experiment_id}

Returns a shareable experiment result with all data needed for display:

```json
{
  "id": "abc123",
  "name": "touch_withdrawal",
  "organism": "c_elegans",
  "config": { ... },
  "results": { ... },
  "status": "completed",
  "share_url": "/app#/experiment/abc123"
}
```

### GET /api/history/evolution/{run_id}/share

```json
{
  "id": "run_xyz",
  "organism": "c_elegans",
  "status": "completed",
  "generations": 100,
  "best_fitness": 0.85,
  "config": { ... },
  "world_log": [ ... ],
  "final_report": "...",
  "share_url": "/app#/evolution/run_xyz"
}
```

---

## WebSocket Streams

### Simulation Stream

**Endpoint:** `ws://{host}/ws/{sim_id}`

Streams real-time simulation frames and accepts bidirectional commands.

**Server -> Client Frame** (`SimulationFrame`):

```json
{
  "t_ms": 150.0,
  "n_active": 45,
  "spikes": [12, 45, 78, 102],
  "firing_rates": [0.0, 12.5, 0.0, ...],
  "body_positions": [[0.1, 0.02, 0.0], ...],
  "joint_angles": [0.05, -0.02, ...],
  "center_of_mass": [0.44, 0.015, 0.0],
  "muscle_activations": { "dorsal_0": 0.3, "ventral_0": 0.1 }
}
```

**Client -> Server Commands:**

| Command | Fields | Description |
|---------|--------|-------------|
| `poke` | `segment`, `force` | Poke a body segment |
| `stimulate` | `neuron_ids`, `current` | Inject current into neurons |
| `clear_stimuli` | -- | Clear all active stimuli |
| `pause` | -- | Pause simulation |
| `resume` | `speed` (optional) | Resume simulation |
| `speed` | `value` | Set simulation speed |
| `lesion_neuron` | `neuron_id` | Lesion all synapses of a neuron |
| `silence_neuron` | `neuron_id` | Silence a neuron |
| `undo_lesion` | `neuron_id` | Undo a neuron lesion |
| `enable_stdp` | `enabled`, `a_plus`, `a_minus`, `w_max` | Toggle STDP learning |
| `get_weights` | -- | Request synapse weight snapshot |
| `record_neuron` | `neuron_ids` | Start recording specific neurons |

**Weight Snapshot Response** (sent in response to `get_weights`):

```json
{
  "type": "weight_snapshot",
  "weights": [1.2, 0.5, ...],
  "changes": { "potentiated": 12, "depressed": 8 }
}
```

### Evolution Stream

**Endpoint:** `ws://{host}/evolution/ws/{run_id}`

Streams evolution progress data. Each message contains generation stats, fitness values, and population info. Messages are queued (max 50) and sent as JSON.

### Ecosystem Stream

**Endpoint:** `ws://{host}/api/ecosystem/ws/{eco_id}`

Streams ecosystem state at approximately 10 FPS. Each frame contains all organism positions, food sources, and events from the latest step.

```json
{
  "organisms": [
    { "id": "org_1", "species": "c_elegans", "position": [0.5, 0.3], "energy": 85.0, "alive": true }
  ],
  "food_sources": [...],
  "events": [
    { "type": "predation", "predator": "org_5", "prey": "org_2" }
  ]
}
```

---

## Error Responses

All endpoints return standard HTTP error codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request (invalid parameters) |
| `404` | Resource not found |
| `409` | Conflict (e.g., starting an already-running evolution) |
| `500` | Internal server error |
| `503` | Server not ready (manager not initialized) |

Error response body:

```json
{
  "detail": "Experiment abc123 not found"
}
```
