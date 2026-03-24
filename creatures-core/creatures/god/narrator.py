"""Evolution narrator — generates rich, compelling scientific narratives of evolutionary events.

Detects evolutionary milestones (breakthroughs, speciation, extinction, plateaus,
convergence, divergence, novel circuits, drug resistance) and produces vivid
descriptions that make evolution feel alive.
"""

from __future__ import annotations

import os
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Organism-specific vocabulary
# ---------------------------------------------------------------------------

ORGANISM_VOCAB: dict[str, dict[str, Any]] = {
    "c_elegans": {
        "name": "C. elegans",
        "common": "worm",
        "movement": "crawling",
        "neurons": ["AVAL", "AVAR", "ASEL", "ASER", "PLML", "PLMR", "PVDL", "PVDR",
                     "DD01", "DD02", "VD01", "VD02", "VA01", "VA02", "DB01", "DB02",
                     "RIML", "RIMR", "AVBL", "AVBR", "AIYL", "AIYR"],
        "motor_neurons": ["DD01", "DD02", "VD01", "VD02", "VA01", "VA02", "DB01", "DB02"],
        "sensory_neurons": ["ASEL", "ASER", "PLML", "PLMR", "PVDL", "PVDR"],
        "interneurons": ["AVAL", "AVAR", "AVBL", "AVBR", "AIYL", "AIYR", "RIML", "RIMR"],
        "circuits": ["locomotion", "chemotaxis", "mechanosensation", "thermotaxis",
                      "nose-touch avoidance", "omega turn"],
        "behaviors": ["sinusoidal crawling", "omega turns", "reversals",
                       "chemotaxis toward food", "dwelling near bacteria",
                       "mechanosensory withdrawal"],
    },
    "drosophila": {
        "name": "Drosophila",
        "common": "fly",
        "movement": "walking",
        "neurons": ["DNa01", "DNa02", "DNb01", "DNb02", "DNg01", "DNg02",
                     "MN1", "MN2", "MN3", "MN4", "MN5", "MN9",
                     "IN1", "IN2", "IN3", "IN4"],
        "motor_neurons": ["MN1", "MN2", "MN3", "MN4", "MN5", "MN9"],
        "sensory_neurons": ["DNa01", "DNa02", "DNb01", "DNb02"],
        "interneurons": ["DNg01", "DNg02", "IN1", "IN2", "IN3", "IN4"],
        "circuits": ["tripod gait", "descending command", "leg coordination",
                      "flight initiation", "grooming", "courtship song"],
        "behaviors": ["tripod gait walking", "turning", "grooming sequences",
                       "flight initiation", "courtship wing extension",
                       "escape response"],
    },
}

DEFAULT_ORGANISM = "c_elegans"


def _vocab(organism: str | None) -> dict[str, Any]:
    """Return vocabulary dict for the given organism, falling back to c_elegans."""
    return ORGANISM_VOCAB.get(organism or DEFAULT_ORGANISM, ORGANISM_VOCAB[DEFAULT_ORGANISM])


def _pick(items: list[str], n: int = 1) -> list[str]:
    """Pick n random items without replacement (or fewer if list is short)."""
    return random.sample(items, min(n, len(items)))


# ---------------------------------------------------------------------------
# WorldEvent + WorldLog
# ---------------------------------------------------------------------------

@dataclass
class WorldEvent:
    """A single narrated event in the evolutionary history."""
    generation: int
    event_type: str       # breakthrough, speciation, extinction, plateau, convergence,
                          # divergence, novel_circuit, drug_resistance, intervention,
                          # origin, improvement, decline
    title: str            # short headline
    description: str      # rich 2-3 sentence narrative
    icon: str             # emoji icon
    data: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "generation": self.generation,
            "event_type": self.event_type,
            "title": self.title,
            "description": self.description,
            "icon": self.icon,
            "data": self.data,
            "timestamp": self.timestamp,
        }


class WorldLog:
    """Accumulates WorldEvents across the simulation lifetime."""

    def __init__(self) -> None:
        self.events: list[WorldEvent] = []

    def add_event(self, event: WorldEvent) -> None:
        self.events.append(event)

    def get_recent(self, n: int = 20) -> list[WorldEvent]:
        return self.events[-n:]

    def get_by_type(self, event_type: str) -> list[WorldEvent]:
        return [e for e in self.events if e.event_type == event_type]

    def to_dict_list(self) -> list[dict]:
        return [e.to_dict() for e in self.events]

    def __len__(self) -> int:
        return len(self.events)


# ---------------------------------------------------------------------------
# Event icons
# ---------------------------------------------------------------------------

EVENT_ICONS: dict[str, str] = {
    "origin": "\U0001f331",          # seedling
    "breakthrough": "\U0001f4a5",    # collision / explosion
    "speciation": "\U0001f333",      # deciduous tree
    "extinction": "\U0001f480",      # skull
    "plateau": "\U0001f3dc\ufe0f",   # desert
    "convergence": "\U0001f300",     # cyclone
    "divergence": "\U0001f30b",      # volcano
    "novel_circuit": "\U000026a1",   # high voltage
    "drug_resistance": "\U0001f9ea", # test tube
    "intervention": "\U0001f52e",    # crystal ball
    "improvement": "\U0001f4c8",     # chart increasing
    "decline": "\U0001f4c9",         # chart decreasing
}


# ---------------------------------------------------------------------------
# Narrative templates
# ---------------------------------------------------------------------------

def _breakthrough_narrative(gen: int, best: float, prev_best: float,
                            jump_pct: float, vocab: dict) -> WorldEvent:
    """A fitness jump > 5% in one generation."""
    sensory = _pick(vocab["sensory_neurons"])
    motor = _pick(vocab["motor_neurons"])
    circuit = _pick(vocab["circuits"])

    templates = [
        (f"A mutation in the {circuit[0]} circuit gives a {vocab['common']} a "
         f"{jump_pct:.0f}% fitness advantage. Its descendants begin to dominate the "
         f"population, displacing slower lineages."),
        (f"After generations of incremental gains, a novel synapse between sensory neuron "
         f"{sensory[0]} and motor neuron {motor[0]} creates a shortcut that bypasses the "
         f"normal interneuron relay. Fitness jumps {jump_pct:.1f}%."),
        (f"Natural selection rewards a bold new strategy. Organisms with enhanced "
         f"{circuit[0]} outperform their peers by {jump_pct:.0f}%, triggering a rapid "
         f"selective sweep through the population."),
    ]

    desc = random.choice(templates)
    return WorldEvent(
        generation=gen,
        event_type="breakthrough",
        title=f"Breakthrough: fitness leaps {jump_pct:.1f}%",
        description=desc,
        icon=EVENT_ICONS["breakthrough"],
        data={"best_fitness": best, "prev_best": prev_best, "jump_pct": jump_pct},
    )


def _speciation_narrative(gen: int, n_species: int, prev_species: int,
                          vocab: dict) -> WorldEvent:
    new_count = n_species - prev_species
    templates = [
        (f"The population fragments. {new_count} new {'species emerges' if new_count == 1 else 'species emerge'}, "
         f"each exploiting a different ecological niche. The {vocab['common']} lineage "
         f"now contains {n_species} distinct species competing for resources."),
        (f"Reproductive isolation takes hold. A subset of {vocab['common']}s with "
         f"divergent {_pick(vocab['circuits'])[0]} circuits can no longer interbreed "
         f"with the main population. {n_species} species now coexist."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="speciation",
        title=f"Speciation: {n_species} species now coexist",
        description=random.choice(templates),
        icon=EVENT_ICONS["speciation"],
        data={"n_species": n_species, "prev_species": prev_species},
    )


def _extinction_narrative(gen: int, n_species: int, prev_species: int,
                          vocab: dict) -> WorldEvent:
    lost = prev_species - n_species
    templates = [
        (f"Extinction strikes. {lost} {'species vanishes' if lost == 1 else 'species vanish'} "
         f"from the population, unable to compete with fitter lineages. "
         f"Only {n_species} {'species remains' if n_species == 1 else 'species remain'}."),
        (f"Selection pressure proves too harsh for the weaker lineages. "
         f"{lost} {'species goes' if lost == 1 else 'species go'} extinct, their neural "
         f"architectures consigned to evolutionary history. The survivors consolidate."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="extinction",
        title=f"Extinction: {lost} species lost",
        description=random.choice(templates),
        icon=EVENT_ICONS["extinction"],
        data={"n_species": n_species, "prev_species": prev_species, "lost": lost},
    )


def _plateau_narrative(gen: int, best: float, generations_stuck: int,
                       vocab: dict) -> WorldEvent:
    circuit = _pick(vocab["circuits"])
    templates = [
        (f"After {generations_stuck} generations of stagnation, the population appears "
         f"trapped in a local optimum. {vocab['name']} organisms circle fitness {best:.1f}, "
         f"unable to discover beneficial mutations in their {circuit[0]} circuits."),
        (f"Evolution stalls. The {vocab['common']}s have exhausted easy improvements "
         f"and now drift aimlessly around fitness {best:.1f}. A disruptive innovation "
         f"may be needed to escape this plateau."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="plateau",
        title=f"Plateau: fitness stuck at {best:.1f}",
        description=random.choice(templates),
        icon=EVENT_ICONS["plateau"],
        data={"best_fitness": best, "generations_stuck": generations_stuck},
    )


def _convergence_narrative(gen: int, std_fitness: float, vocab: dict) -> WorldEvent:
    templates = [
        (f"The population converges. Genetic diversity plummets as a single dominant "
         f"strategy sweeps through the {vocab['common']} population. Fitness standard "
         f"deviation drops to {std_fitness:.2f} — nearly every organism is a clone of "
         f"the champion."),
        (f"A selective sweep narrows the gene pool. The {vocab['common']}s become "
         f"genetically homogeneous (std={std_fitness:.2f}), leaving the population "
         f"vulnerable to environmental shifts."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="convergence",
        title="Convergence: diversity collapses",
        description=random.choice(templates),
        icon=EVENT_ICONS["convergence"],
        data={"std_fitness": std_fitness},
    )


def _divergence_narrative(gen: int, std_fitness: float, prev_std: float,
                          vocab: dict) -> WorldEvent:
    templates = [
        (f"Diversity explodes. The {vocab['common']} population fragments into multiple "
         f"competing strategies — fitness variance jumps from {prev_std:.2f} to "
         f"{std_fitness:.2f}. Different {_pick(vocab['circuits'])[0]} circuit architectures "
         f"now vie for dominance."),
        (f"A burst of innovation. Mutations unlock multiple viable body plans "
         f"simultaneously. The population standard deviation surges to {std_fitness:.2f}, "
         f"signaling a rich exploration of the fitness landscape."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="divergence",
        title="Divergence: diversity surges",
        description=random.choice(templates),
        icon=EVENT_ICONS["divergence"],
        data={"std_fitness": std_fitness, "prev_std": prev_std},
    )


def _novel_circuit_narrative(gen: int, vocab: dict) -> WorldEvent:
    sensory = _pick(vocab["sensory_neurons"])
    motor = _pick(vocab["motor_neurons"])
    inter = _pick(vocab["interneurons"])
    templates = [
        (f"A novel neural circuit emerges: {sensory[0]} now connects directly to "
         f"{motor[0]}, bypassing interneuron {inter[0]}. This shortcut creates a "
         f"faster reflex arc for {_pick(vocab['behaviors'])[0]}."),
        (f"Evolution invents a new pathway. Interneuron {inter[0]} develops a "
         f"previously unseen connection to {motor[0]}, creating a parallel channel "
         f"for {_pick(vocab['circuits'])[0]} control."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="novel_circuit",
        title="Novel circuit: new neural pathway",
        description=random.choice(templates),
        icon=EVENT_ICONS["novel_circuit"],
        data={"sensory": sensory[0], "motor": motor[0], "interneuron": inter[0]},
    )


def _drug_resistance_narrative(gen: int, fitness: float, vocab: dict) -> WorldEvent:
    templates = [
        (f"Life finds a way. Despite the pharmacological intervention, the {vocab['common']} "
         f"population recovers to fitness {fitness:.1f}. Organisms have evolved compensatory "
         f"synaptic weights that route around the drug's target."),
        (f"Drug resistance emerges. The {vocab['common']}s rewire their neural circuits to "
         f"circumvent the blockade. The affected pathway is now redundant — fitness "
         f"rebounds to {fitness:.1f}."),
    ]
    return WorldEvent(
        generation=gen,
        event_type="drug_resistance",
        title="Drug resistance: population adapts",
        description=random.choice(templates),
        icon=EVENT_ICONS["drug_resistance"],
        data={"fitness": fitness},
    )


def _origin_narrative(gen: int, pop_size: int, vocab: dict) -> WorldEvent:
    return WorldEvent(
        generation=gen,
        event_type="origin",
        title="Life begins",
        description=(
            f"Life begins. {pop_size} {vocab['name']} organisms emerge from the primordial "
            f"connectome, each carrying a slightly different neural wiring. "
            f"Selection will decide whose {vocab['movement']} patterns endure."
        ),
        icon=EVENT_ICONS["origin"],
        data={"population_size": pop_size},
    )


def _improvement_narrative(gen: int, mean: float, prev_mean: float,
                           vocab: dict) -> WorldEvent:
    delta = mean - prev_mean
    circuit = _pick(vocab["circuits"])
    return WorldEvent(
        generation=gen,
        event_type="improvement",
        title=f"Steady gains: mean fitness +{delta:.2f}",
        description=(
            f"The {vocab['common']} population improves steadily. Average fitness "
            f"rises to {mean:.1f} as beneficial mutations in {circuit[0]} circuits "
            f"spread through the gene pool."
        ),
        icon=EVENT_ICONS["improvement"],
        data={"mean_fitness": mean, "prev_mean": prev_mean, "delta": delta},
    )


def _decline_narrative(gen: int, mean: float, prev_mean: float,
                       vocab: dict) -> WorldEvent:
    delta = prev_mean - mean
    return WorldEvent(
        generation=gen,
        event_type="decline",
        title=f"Decline: mean fitness -{delta:.2f}",
        description=(
            f"Fitness slips. The average {vocab['common']} loses ground, dropping "
            f"to {mean:.1f}. Deleterious mutations accumulate faster than selection "
            f"can purge them — genetic drift takes its toll."
        ),
        icon=EVENT_ICONS["decline"],
        data={"mean_fitness": mean, "prev_mean": prev_mean, "delta": delta},
    )


# ---------------------------------------------------------------------------
# EvolutionNarrator
# ---------------------------------------------------------------------------

class EvolutionNarrator:
    """Generates rich, compelling scientific narratives of evolutionary events.

    Detects milestones by comparing current and previous generation statistics,
    then produces vivid descriptions with organism-specific vocabulary.
    """

    # Thresholds for event detection
    BREAKTHROUGH_PCT = 5.0       # fitness jump > 5%
    PLATEAU_GENERATIONS = 5      # unchanged for 5+ gens
    CONVERGENCE_STD = 1.0        # std_fitness below this = convergence
    DIVERGENCE_RATIO = 2.0       # std_fitness doubles = divergence

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("XAI_API_KEY")
        self.world_log = WorldLog()
        self._plateau_counter: int = 0
        self._prev_std: float | None = None
        self._drug_applied_gen: int | None = None
        self._pre_drug_fitness: float | None = None

    # ------------------------------------------------------------------
    # Public API — narrate a generation
    # ------------------------------------------------------------------

    def narrate_generation(
        self,
        stats: dict,
        prev_stats: dict | None = None,
        organism: str | None = None,
    ) -> list[WorldEvent]:
        """Detect events and produce rich narratives for this generation.

        Args:
            stats: Current generation statistics. Expected keys:
                generation, best_fitness, mean_fitness, n_species,
                population_size, std_fitness (optional), novel_connections (optional)
            prev_stats: Previous generation statistics (same keys). If None,
                only the origin event can be detected.
            organism: "c_elegans" or "drosophila" (defaults to c_elegans).

        Returns:
            List of WorldEvent objects detected this generation.
        """
        vocab = _vocab(organism)
        gen = stats.get("generation", 0)
        events: list[WorldEvent] = []

        # --- Origin ---
        if gen == 0:
            ev = _origin_narrative(gen, stats.get("population_size", 0), vocab)
            events.append(ev)
            self._plateau_counter = 0
            self._prev_std = stats.get("std_fitness")
            self._add_all(events)
            return events

        if prev_stats is None:
            # Cannot detect comparative events without previous stats
            self._add_all(events)
            return events

        best = stats.get("best_fitness", 0)
        prev_best = prev_stats.get("best_fitness", 0)
        mean = stats.get("mean_fitness", 0)
        prev_mean = prev_stats.get("mean_fitness", 0)
        n_species = stats.get("n_species", 1)
        prev_species = prev_stats.get("n_species", 1)
        std_fitness = stats.get("std_fitness")
        prev_std = prev_stats.get("std_fitness", self._prev_std)

        # --- Breakthrough ---
        if prev_best > 0:
            jump_pct = ((best - prev_best) / prev_best) * 100
            if jump_pct > self.BREAKTHROUGH_PCT:
                events.append(
                    _breakthrough_narrative(gen, best, prev_best, jump_pct, vocab)
                )
                self._plateau_counter = 0

        # --- Speciation ---
        if n_species > prev_species:
            events.append(
                _speciation_narrative(gen, n_species, prev_species, vocab)
            )

        # --- Extinction ---
        if n_species < prev_species:
            events.append(
                _extinction_narrative(gen, n_species, prev_species, vocab)
            )

        # --- Plateau ---
        if prev_best > 0 and abs(best - prev_best) / max(prev_best, 0.01) < 0.005:
            self._plateau_counter += 1
        else:
            self._plateau_counter = 0

        if self._plateau_counter >= self.PLATEAU_GENERATIONS:
            events.append(
                _plateau_narrative(gen, best, self._plateau_counter, vocab)
            )

        # --- Convergence ---
        if std_fitness is not None and std_fitness < self.CONVERGENCE_STD:
            # Only fire if we weren't already converged
            if prev_std is None or prev_std >= self.CONVERGENCE_STD:
                events.append(_convergence_narrative(gen, std_fitness, vocab))

        # --- Divergence ---
        if (std_fitness is not None and prev_std is not None
                and prev_std > 0 and std_fitness / prev_std >= self.DIVERGENCE_RATIO):
            events.append(_divergence_narrative(gen, std_fitness, prev_std, vocab))

        # --- Novel circuit ---
        novel = stats.get("novel_connections")
        if novel and isinstance(novel, list) and len(novel) > 0:
            events.append(_novel_circuit_narrative(gen, vocab))

        # --- Drug resistance ---
        if (self._drug_applied_gen is not None
                and self._pre_drug_fitness is not None
                and gen > self._drug_applied_gen
                and best >= self._pre_drug_fitness * 0.95):
            events.append(_drug_resistance_narrative(gen, best, vocab))
            # Reset so we don't fire every generation
            self._drug_applied_gen = None
            self._pre_drug_fitness = None

        # --- Fallback: improvement or decline ---
        if not events:
            if mean > prev_mean:
                events.append(_improvement_narrative(gen, mean, prev_mean, vocab))
            elif mean < prev_mean:
                events.append(_decline_narrative(gen, mean, prev_mean, vocab))

        # Track std for next comparison
        if std_fitness is not None:
            self._prev_std = std_fitness

        self._add_all(events)
        return events

    # ------------------------------------------------------------------
    # Drug tracking (called externally when a drug is applied)
    # ------------------------------------------------------------------

    def record_drug_application(self, generation: int, current_fitness: float) -> None:
        """Record that a drug was applied, so we can detect resistance later."""
        self._drug_applied_gen = generation
        self._pre_drug_fitness = current_fitness

    # ------------------------------------------------------------------
    # Intervention narration (backward-compatible)
    # ------------------------------------------------------------------

    def narrate_intervention(self, intervention: dict, organism: str | None = None) -> str:
        """Describe a God Agent intervention in narrative form.

        Returns a plain string for backward compatibility. Also appends
        a WorldEvent to the log.
        """
        actions = intervention.get("interventions", [])
        if not actions:
            return "The God Agent observes silently."

        vocab = _vocab(organism)
        descriptions: list[str] = []

        for a in actions:
            t = a.get("type")
            if t == "event":
                descriptions.append(
                    f"The God Agent reshapes the environment — food sources scatter "
                    f"to new locations, forcing the {vocab['common']}s to adapt their "
                    f"{_pick(vocab['circuits'])[0]} strategies."
                )
            elif t == "evolution":
                descriptions.append(
                    f"The forces of mutation intensify. New variations emerge faster, "
                    f"increasing the odds of a {vocab['common']} discovering a beneficial "
                    f"rewiring of its {_pick(vocab['circuits'])[0]} circuit."
                )
            elif t == "fitness":
                descriptions.append(
                    f"The rules of survival change — new traits become advantageous. "
                    f"The {vocab['common']}s must now optimize for a different balance "
                    f"of {_pick(vocab['behaviors'])[0]}."
                )
            elif t == "environment":
                descriptions.append(
                    f"New resources appear in the world, creating fresh niches for the "
                    f"{vocab['common']} population to exploit."
                )
            elif t == "experiment":
                descriptions.append(
                    f"The God Agent designs an experiment: {a.get('action', 'unknown')}. "
                    f"A hypothesis about {vocab['name']} neural architecture will be tested."
                )

        text = " ".join(descriptions)

        # Log as a WorldEvent
        ev = WorldEvent(
            generation=intervention.get("generation", -1),
            event_type="intervention",
            title="God Agent intervenes",
            description=text,
            icon=EVENT_ICONS["intervention"],
            data={"actions": [a.get("type") for a in actions]},
        )
        self.world_log.add_event(ev)

        return text

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _add_all(self, events: list[WorldEvent]) -> None:
        for ev in events:
            self.world_log.add_event(ev)
