"""Neural Development Engine — grow a brain from progenitor cells.

Simulates key stages of neural development:
1. **Proliferation** — progenitor cells divide, producing neurons
2. **Migration** — newborn neurons move to their target positions
3. **Axon guidance** — growth cones extend along chemical gradients
4. **Synaptogenesis** — synapses form when growth cones reach target neurons
5. **Activity-dependent refinement** — active synapses strengthen, silent ones prune
6. **Apoptosis** — neurons that fail to integrate die

The result is a self-organized connectome that can be compared to
real biological data (C. elegans, Drosophila).

Usage::

    dev = DevelopmentEngine(target_neurons=299)
    dev.run(n_steps=1000)
    connectome = dev.to_connectome()
    # Compare to real C. elegans connectome

References:
    - Tessier-Lavigne & Goodman (1996) "The Molecular Biology of Axon Guidance"
    - Huttenlocher (1979) "Synaptic density in human frontal cortex"
    - Katz & Shatz (1996) "Synaptic Activity and Construction of Cortical Circuits"
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CellType:
    """Neural cell type with differentiation parameters."""
    name: str
    iz_a: float = 0.02
    iz_b: float = 0.2
    iz_c: float = -65.0
    iz_d: float = 8.0
    neurotransmitter: str = "glutamate"
    is_inhibitory: bool = False
    # Growth cone properties
    axon_speed: float = 1.0         # growth rate per step
    axon_branch_prob: float = 0.05  # probability of branching
    target_affinity: float = 1.0    # how strongly attracted to targets


# Biological cell type presets
CELL_TYPES = {
    "excitatory": CellType("excitatory", 0.02, 0.2, -65, 8, "glutamate", False),
    "inhibitory": CellType("inhibitory", 0.1, 0.2, -65, 2, "GABA", True),
    "sensory": CellType("sensory", 0.02, 0.25, -65, 0.05, "acetylcholine", False,
                         axon_speed=1.5, target_affinity=0.8),
    "motor": CellType("motor", 0.02, 0.2, -55, 4, "acetylcholine", False,
                       axon_speed=0.8, axon_branch_prob=0.02),
    "modulatory": CellType("modulatory", 0.02, 0.25, -65, 0.05, "dopamine", False,
                            axon_speed=0.5, axon_branch_prob=0.1),
}


@dataclass
class Neuron:
    """A developing neuron with position and growth state."""
    id: int
    x: float
    y: float
    z: float
    cell_type: CellType
    born_step: int
    alive: bool = True
    mature: bool = False  # fully differentiated
    # Growth cone state
    growth_x: float = 0.0
    growth_y: float = 0.0
    growth_z: float = 0.0
    growth_active: bool = True  # growth cone still extending


@dataclass
class GrowthCone:
    """An extending axon tip seeking target neurons."""
    neuron_id: int
    x: float
    y: float
    z: float
    dx: float  # direction
    dy: float
    dz: float
    active: bool = True
    steps_alive: int = 0


@dataclass
class DevelopingSynapse:
    """A synapse being formed/refined during development."""
    pre_id: int
    post_id: int
    weight: float
    formed_step: int
    activity_count: int = 0  # times both neurons were co-active
    stable: bool = False


@dataclass
class DevelopmentConfig:
    """Configuration for neural development simulation."""
    target_neurons: int = 299              # target neuron count
    initial_progenitors: int = 10          # starting cells
    arena_size: float = 10.0              # 3D space size

    # Proliferation
    division_rate: float = 0.15           # probability of division per step
    division_noise: float = 0.5           # spatial noise on daughter cell position

    # Cell fate
    excitatory_fraction: float = 0.60
    inhibitory_fraction: float = 0.15
    sensory_fraction: float = 0.15
    motor_fraction: float = 0.10

    # Axon guidance
    guidance_noise: float = 0.3           # noise in growth cone direction
    synapse_formation_radius: float = 1.0  # max distance for synapse formation
    initial_synapse_weight: float = 1.0

    # Refinement
    activity_threshold: int = 3           # min co-activations to stabilize synapse
    pruning_rate: float = 0.01           # probability of removing unstable synapses
    apoptosis_rate: float = 0.005        # probability of killing unconnected neurons

    # Simulation
    maturation_delay: int = 20           # steps after birth before neuron is functional
    max_synapses_per_neuron: int = 50
    chemical_gradient_strength: float = 2.0


class DevelopmentEngine:
    """Simulate neural development from progenitor cells to a full connectome.

    Grows a brain through biologically-inspired stages:
    proliferation → migration → axon guidance → synaptogenesis → refinement.
    """

    def __init__(self, config: DevelopmentConfig | None = None) -> None:
        self.config = config or DevelopmentConfig()
        self.rng = np.random.default_rng(42)

        # State
        self.neurons: list[Neuron] = []
        self.growth_cones: list[GrowthCone] = []
        self.synapses: list[DevelopingSynapse] = []
        self.step_count: int = 0

        # Chemical gradients (3D attractant fields)
        # Gradient sources: sensory region, motor region, midline
        self._gradient_sources: list[tuple[float, float, float, str]] = []

        # History for visualization
        self.history: list[dict] = []

        # Initialize progenitor cells
        self._init_progenitors()

    def _init_progenitors(self) -> None:
        """Create initial progenitor cells at the center of the arena."""
        half = self.config.arena_size / 2
        for i in range(self.config.initial_progenitors):
            x = self.rng.normal(0, half * 0.1)
            y = self.rng.normal(0, half * 0.1)
            z = self.rng.normal(0, half * 0.1)
            cell_type = self._assign_cell_type()
            self.neurons.append(Neuron(
                id=i, x=x, y=y, z=z,
                cell_type=cell_type,
                born_step=0,
            ))

        # Set up chemical gradient sources
        half = self.config.arena_size / 2
        self._gradient_sources = [
            (-half * 0.8, 0, 0, "sensory"),   # sensory attractant at one end
            (half * 0.8, 0, 0, "motor"),       # motor attractant at other end
            (0, half * 0.5, 0, "dorsal"),       # dorsal-ventral gradient
        ]

        logger.info(f"Development initialized: {len(self.neurons)} progenitor cells")

    def _assign_cell_type(self) -> CellType:
        """Assign a cell type based on configured fractions."""
        r = self.rng.random()
        cfg = self.config
        if r < cfg.sensory_fraction:
            return CELL_TYPES["sensory"]
        elif r < cfg.sensory_fraction + cfg.motor_fraction:
            return CELL_TYPES["motor"]
        elif r < cfg.sensory_fraction + cfg.motor_fraction + cfg.inhibitory_fraction:
            return CELL_TYPES["inhibitory"]
        elif r < cfg.sensory_fraction + cfg.motor_fraction + cfg.inhibitory_fraction + 0.03:
            return CELL_TYPES["modulatory"]
        else:
            return CELL_TYPES["excitatory"]

    # ------------------------------------------------------------------
    # Main simulation
    # ------------------------------------------------------------------

    def run(self, n_steps: int = 1000, verbose: bool = True) -> None:
        """Run the full development simulation."""
        for step in range(n_steps):
            self.step_count += 1
            self._step_proliferation()
            self._step_migration()
            self._step_axon_guidance()
            self._step_synaptogenesis()
            self._step_activity_refinement()
            self._step_pruning()

            if verbose and step % 100 == 0:
                alive = sum(1 for n in self.neurons if n.alive)
                n_syn = len(self.synapses)
                stable = sum(1 for s in self.synapses if s.stable)
                logger.info(
                    f"Dev step {step}: {alive} neurons, {n_syn} synapses "
                    f"({stable} stable), {len(self.growth_cones)} growth cones"
                )
                self.history.append({
                    "step": step,
                    "n_neurons": alive,
                    "n_synapses": n_syn,
                    "n_stable": stable,
                    "n_growth_cones": len(self.growth_cones),
                })

            # Stop if we've reached target neuron count
            alive_count = sum(1 for n in self.neurons if n.alive)
            if alive_count >= self.config.target_neurons:
                # Stop proliferating, continue refinement
                self.config.division_rate = 0.0

    # ------------------------------------------------------------------
    # Development stages
    # ------------------------------------------------------------------

    def _step_proliferation(self) -> None:
        """Cell division: progenitors divide to produce new neurons."""
        if len(self.neurons) >= self.config.target_neurons * 1.2:
            return  # overshoot buffer

        new_neurons = []
        for neuron in self.neurons:
            if not neuron.alive or neuron.mature:
                continue
            if self.rng.random() < self.config.division_rate:
                # Create daughter cell nearby
                noise = self.config.division_noise
                daughter = Neuron(
                    id=len(self.neurons) + len(new_neurons),
                    x=neuron.x + self.rng.normal(0, noise),
                    y=neuron.y + self.rng.normal(0, noise),
                    z=neuron.z + self.rng.normal(0, noise),
                    cell_type=self._assign_cell_type(),
                    born_step=self.step_count,
                )
                new_neurons.append(daughter)

                # Parent matures (stops dividing)
                if self.step_count - neuron.born_step > self.config.maturation_delay:
                    neuron.mature = True

        self.neurons.extend(new_neurons)

    def _step_migration(self) -> None:
        """Neurons migrate toward their target regions based on gradients."""
        for neuron in self.neurons:
            if not neuron.alive or neuron.mature:
                continue

            # Chemical gradient attraction
            fx, fy, fz = 0.0, 0.0, 0.0
            for gx, gy, gz, gtype in self._gradient_sources:
                # Sensory neurons attracted to sensory gradient, etc.
                affinity = 0.1  # baseline
                if gtype == "sensory" and neuron.cell_type.name == "sensory":
                    affinity = self.config.chemical_gradient_strength
                elif gtype == "motor" and neuron.cell_type.name == "motor":
                    affinity = self.config.chemical_gradient_strength
                elif gtype == "dorsal":
                    affinity = 0.3  # weak dorsal-ventral bias

                dx = gx - neuron.x
                dy = gy - neuron.y
                dz = gz - neuron.z
                dist = np.sqrt(dx*dx + dy*dy + dz*dz) + 0.1
                fx += affinity * dx / dist
                fy += affinity * dy / dist
                fz += affinity * dz / dist

            # Add noise
            fx += self.rng.normal(0, 0.2)
            fy += self.rng.normal(0, 0.2)
            fz += self.rng.normal(0, 0.2)

            # Move (small steps)
            speed = 0.1
            neuron.x += fx * speed
            neuron.y += fy * speed
            neuron.z += fz * speed

    def _step_axon_guidance(self) -> None:
        """Growth cones extend from mature neurons toward targets."""
        # Cap total growth cones to prevent explosion
        max_cones = min(len(self.neurons) * 3, 2000)
        if len(self.growth_cones) > max_cones:
            # Keep newest cones
            self.growth_cones = self.growth_cones[-max_cones:]

        # Pre-compute outgoing synapse counts
        out_counts: dict[int, int] = {}
        for s in self.synapses:
            out_counts[s.pre_id] = out_counts.get(s.pre_id, 0) + 1

        # Spawn new growth cones from mature neurons without enough synapses
        for neuron in self.neurons:
            if not neuron.alive or not neuron.growth_active:
                continue
            if self.step_count - neuron.born_step < self.config.maturation_delay:
                continue

            neuron.mature = True

            if out_counts.get(neuron.id, 0) >= self.config.max_synapses_per_neuron // 2:
                neuron.growth_active = False
                continue

            # Spawn growth cone if none active (limit check)
            has_cone = any(gc.neuron_id == neuron.id and gc.active for gc in self.growth_cones)
            if not has_cone and self.rng.random() < 0.1:
                # Direction: toward nearest unconnected neuron + gradient + noise
                target = self._find_growth_target(neuron)
                if target is not None:
                    dx = target.x - neuron.x
                    dy = target.y - neuron.y
                    dz = target.z - neuron.z
                    dist = np.sqrt(dx*dx + dy*dy + dz*dz) + 0.01
                    self.growth_cones.append(GrowthCone(
                        neuron_id=neuron.id,
                        x=neuron.x, y=neuron.y, z=neuron.z,
                        dx=dx/dist, dy=dy/dist, dz=dz/dist,
                    ))

        # Extend existing growth cones
        for gc in self.growth_cones:
            if not gc.active:
                continue
            gc.steps_alive += 1

            # Add noise to direction
            noise = self.config.guidance_noise
            gc.dx += self.rng.normal(0, noise)
            gc.dy += self.rng.normal(0, noise)
            gc.dz += self.rng.normal(0, noise)
            mag = np.sqrt(gc.dx**2 + gc.dy**2 + gc.dz**2) + 0.01
            gc.dx /= mag
            gc.dy /= mag
            gc.dz /= mag

            # Move
            source_neuron = self.neurons[gc.neuron_id] if gc.neuron_id < len(self.neurons) else None
            speed = source_neuron.cell_type.axon_speed if source_neuron else 1.0
            gc.x += gc.dx * speed * 0.3
            gc.y += gc.dy * speed * 0.3
            gc.z += gc.dz * speed * 0.3

            # Die if too old
            if gc.steps_alive > 200:
                gc.active = False

            # Branch with small probability
            if source_neuron and self.rng.random() < source_neuron.cell_type.axon_branch_prob:
                self.growth_cones.append(GrowthCone(
                    neuron_id=gc.neuron_id,
                    x=gc.x, y=gc.y, z=gc.z,
                    dx=gc.dx + self.rng.normal(0, 0.5),
                    dy=gc.dy + self.rng.normal(0, 0.5),
                    dz=gc.dz + self.rng.normal(0, 0.5),
                ))

    def _find_growth_target(self, source: Neuron) -> Neuron | None:
        """Find the nearest unconnected neuron as growth target."""
        connected = {s.post_id for s in self.synapses if s.pre_id == source.id}
        best = None
        best_dist = float('inf')
        for n in self.neurons:
            if n.id == source.id or not n.alive or not n.mature:
                continue
            if n.id in connected:
                continue
            dx = n.x - source.x
            dy = n.y - source.y
            dz = n.z - source.z
            dist = dx*dx + dy*dy + dz*dz
            if dist < best_dist:
                best_dist = dist
                best = n
        return best

    def _step_synaptogenesis(self) -> None:
        """Form synapses when growth cones reach target neurons."""
        radius = self.config.synapse_formation_radius
        r2 = radius * radius

        # Build spatial lookup: neuron positions as arrays for vectorized distance
        mature_neurons = [n for n in self.neurons if n.alive and n.mature]
        if not mature_neurons:
            return
        n_pos = np.array([(n.x, n.y, n.z) for n in mature_neurons])
        n_ids = [n.id for n in mature_neurons]

        # Pre-compute existing synapse set for O(1) lookup
        existing = {(s.pre_id, s.post_id) for s in self.synapses}

        active_cones = [gc for gc in self.growth_cones if gc.active]
        for gc in active_cones:
            # Vectorized distance to all mature neurons
            gc_pos = np.array([gc.x, gc.y, gc.z])
            dists2 = np.sum((n_pos - gc_pos) ** 2, axis=1)

            # Find nearest within radius (excluding self)
            for idx in np.argsort(dists2):
                if dists2[idx] > r2:
                    break
                target_id = n_ids[idx]
                if target_id == gc.neuron_id:
                    continue
                if (gc.neuron_id, target_id) in existing:
                    continue

                # Form synapse
                source = self.neurons[gc.neuron_id] if gc.neuron_id < len(self.neurons) else None
                weight = self.config.initial_synapse_weight
                if source and source.cell_type.is_inhibitory:
                    weight = -weight

                self.synapses.append(DevelopingSynapse(
                    pre_id=gc.neuron_id,
                    post_id=target_id,
                    weight=weight,
                    formed_step=self.step_count,
                ))
                existing.add((gc.neuron_id, target_id))
                gc.active = False
                break

    def _step_activity_refinement(self) -> None:
        """Simulate spontaneous activity and strengthen co-active synapses."""
        # Simple spontaneous activity model:
        # Random subset of neurons are "active" each step
        alive_neurons = [n for n in self.neurons if n.alive and n.mature]
        if not alive_neurons:
            return

        # ~10% of neurons spontaneously active
        n_active = max(1, len(alive_neurons) // 10)
        active_ids = set()
        for n in self.rng.choice(alive_neurons, size=min(n_active, len(alive_neurons)), replace=False):
            active_ids.add(n.id)

        # Propagate activity through existing synapses (1 hop)
        propagated = set()
        for s in self.synapses:
            if s.pre_id in active_ids:
                propagated.add(s.post_id)
                # Co-activation: strengthen synapse
                if s.post_id in active_ids or self.rng.random() < 0.3:
                    s.activity_count += 1
                    if s.activity_count >= self.config.activity_threshold:
                        s.stable = True
                        # Hebbian strengthening
                        s.weight *= 1.01

    def _step_pruning(self) -> None:
        """Remove unstable synapses and disconnected neurons."""
        # Prune weak synapses
        if self.step_count > 200:  # only after initial growth
            self.synapses = [
                s for s in self.synapses
                if s.stable or
                self.step_count - s.formed_step < 100 or
                self.rng.random() > self.config.pruning_rate
            ]

        # Apoptosis: kill neurons with no connections
        if self.step_count > 300:
            connected_ids = set()
            for s in self.synapses:
                connected_ids.add(s.pre_id)
                connected_ids.add(s.post_id)

            for neuron in self.neurons:
                if neuron.alive and neuron.mature and neuron.id not in connected_ids:
                    if self.rng.random() < self.config.apoptosis_rate:
                        neuron.alive = False

        # Clean up dead growth cones
        self.growth_cones = [gc for gc in self.growth_cones if gc.active]

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------

    def to_connectome(self) -> Any:
        """Convert the developed brain to a Connectome object."""
        from creatures.connectome.types import (
            Connectome, Neuron as CNeuron, NeuronType,
            Synapse as CSynapse, SynapseType,
        )

        alive = [n for n in self.neurons if n.alive and n.mature]
        id_map = {n.id: i for i, n in enumerate(alive)}

        neurons = {}
        for n in alive:
            nid = f"DEV_{n.id:04d}"
            nt = NeuronType.INTER
            if n.cell_type.name == "sensory":
                nt = NeuronType.SENSORY
            elif n.cell_type.name == "motor":
                nt = NeuronType.MOTOR

            neurons[nid] = CNeuron(
                id=nid,
                neuron_type=nt,
                neurotransmitter=n.cell_type.neurotransmitter,
                metadata={
                    "x": str(n.x), "y": str(n.y), "z": str(n.z),
                    "cell_type": n.cell_type.name,
                    "born_step": str(n.born_step),
                },
            )

        synapses = []
        for s in self.synapses:
            if s.pre_id in id_map and s.post_id in id_map:
                pre_n = alive[id_map[s.pre_id]]
                post_n = alive[id_map[s.post_id]]
                synapses.append(CSynapse(
                    pre_id=f"DEV_{pre_n.id:04d}",
                    post_id=f"DEV_{post_n.id:04d}",
                    weight=abs(s.weight),
                    synapse_type=SynapseType.CHEMICAL,
                    neurotransmitter=pre_n.cell_type.neurotransmitter,
                ))

        return Connectome(
            name=f"developed_brain_{len(alive)}n_{len(synapses)}s",
            neurons=neurons,
            synapses=synapses,
            metadata={
                "source": "DevelopmentEngine",
                "development_steps": self.step_count,
                "target_neurons": self.config.target_neurons,
            },
        )

    def get_state(self) -> dict:
        """Get current development state for visualization."""
        alive = [n for n in self.neurons if n.alive]
        return {
            "step": self.step_count,
            "n_neurons": len(alive),
            "n_mature": sum(1 for n in alive if n.mature),
            "n_synapses": len(self.synapses),
            "n_stable_synapses": sum(1 for s in self.synapses if s.stable),
            "n_growth_cones": sum(1 for gc in self.growth_cones if gc.active),
            "positions": [(n.x, n.y, n.z) for n in alive],
            "cell_types": [n.cell_type.name for n in alive],
            "history": self.history,
        }
