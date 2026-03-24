"""Generate publication-quality scientific reports from evolution runs.

Produces structured markdown reports suitable for inclusion in a paper's
supplementary materials. Reports include run metadata, fitness trajectory
statistics, connectome drift analysis, behavioral findings, God Agent
intervention summaries, and methodology sections.

Usage (standalone):
    from creatures.reporting.report_generator import generate_report
    report = generate_report(run_data)

Usage (from results.json on disk):
    from creatures.reporting.report_generator import generate_report_from_dir
    report = generate_report_from_dir(Path("evolution_results/run_abc123/"))
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_report(run_data: dict[str, Any]) -> str:
    """Generate a markdown scientific report from structured run data.

    Parameters
    ----------
    run_data : dict
        A dictionary containing evolution run results. Expected keys:

        - ``run_id`` (str): unique run identifier
        - ``organism`` (str): e.g. ``"c_elegans"``
        - ``config`` (dict): run configuration parameters
        - ``fitness_history`` (list[dict]): per-generation stats with keys
          ``generation``, ``best_fitness``, ``mean_fitness``, ``std_fitness``,
          ``n_species``
        - ``summary`` (dict, optional): high-level statistics
        - ``drift`` (dict, optional): connectome drift metrics
        - ``best_genome`` (dict, optional): info about the best genome
        - ``god_report`` (dict, optional): God Agent summary
        - ``total_elapsed_seconds`` (float, optional): wall-clock time
        - ``connection_analysis`` (dict, optional): pre-computed per-edge data

    Returns
    -------
    str
        A complete markdown report.
    """
    config = run_data.get("config", {})
    summary = run_data.get("summary", {})
    drift = run_data.get("drift", {})
    fitness_history = run_data.get("fitness_history", [])
    god_report = run_data.get("god_report")
    connection_analysis = run_data.get("connection_analysis", {})

    run_id = run_data.get("run_id", "unknown")
    organism = run_data.get("organism", "c_elegans")
    n_gen = config.get("generations", config.get("n_generations", 0))
    pop_size = config.get("population", config.get("population_size", 0))
    fitness_mode = config.get("fitness_mode", "fast")
    elapsed = run_data.get("total_elapsed_seconds", 0)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # --- Fitness statistics ---
    initial_fitness = fitness_history[0]["best_fitness"] if fitness_history else 0
    final_fitness = fitness_history[-1]["best_fitness"] if fitness_history else 0
    improvement_pct = (
        ((final_fitness - initial_fitness) / max(abs(initial_fitness), 1e-6)) * 100
    )

    best_vals = [h["best_fitness"] for h in fitness_history] if fitness_history else []
    mean_vals = [h["mean_fitness"] for h in fitness_history] if fitness_history else []
    std_vals = [h.get("std_fitness", 0) for h in fitness_history] if fitness_history else []

    peak_fitness = max(best_vals) if best_vals else 0
    peak_gen = best_vals.index(peak_fitness) if best_vals else 0
    mean_of_means = float(np.mean(mean_vals)) if mean_vals else 0
    final_std = std_vals[-1] if std_vals else 0
    convergence_gen = _estimate_convergence(best_vals) if best_vals else None

    # --- Build sections ---
    sections: list[str] = []

    # Title
    sections.append(f"# Neurevo Scientific Report")
    sections.append(f"## Run {run_id} | *{_format_organism(organism)}* | {n_gen} Generations")
    sections.append("")
    sections.append("---")
    sections.append("")

    # Abstract / overview
    sections.append("## 1. Overview")
    sections.append("")
    sections.append(f"| Parameter | Value |")
    sections.append(f"|-----------|-------|")
    sections.append(f"| Run ID | `{run_id}` |")
    sections.append(f"| Organism | {_format_organism(organism)} |")
    sections.append(f"| Generations | {n_gen} |")
    sections.append(f"| Population size | {pop_size} |")
    sections.append(f"| Fitness evaluation | {fitness_mode} |")
    sections.append(f"| Wall-clock time | {elapsed:.1f}s ({elapsed / max(n_gen, 1):.2f}s/gen) |")
    sections.append(f"| Generated | {timestamp} |")
    sections.append("")

    # Fitness trajectory
    sections.append("## 2. Fitness Trajectory")
    sections.append("")
    sections.append("### Key Statistics")
    sections.append("")
    sections.append("| Metric | Value |")
    sections.append("|--------|------:|")
    sections.append(f"| Initial best fitness | {initial_fitness:.4f} |")
    sections.append(f"| Final best fitness | {final_fitness:.4f} |")
    sections.append(f"| Peak fitness | {peak_fitness:.4f} (gen {peak_gen + 1}) |")
    sections.append(f"| Improvement | {improvement_pct:+.1f}% |")
    sections.append(f"| Mean population fitness | {mean_of_means:.4f} |")
    sections.append(f"| Final std deviation | {final_std:.4f} |")
    if convergence_gen is not None:
        sections.append(f"| Estimated convergence | Generation {convergence_gen + 1} |")
    sections.append("")

    # ASCII sparkline
    sparkline = _ascii_sparkline(best_vals, width=50)
    if sparkline:
        sections.append(f"**Fitness curve** (gen 1 -> {n_gen}):")
        sections.append(f"```")
        sections.append(sparkline)
        sections.append(f"```")
        sections.append("")

    # Fitness history table (sampled)
    if fitness_history:
        sections.append("### Per-Generation Data (sampled)")
        sections.append("")
        sections.append("| Generation | Best | Mean | Std | Species |")
        sections.append("|:----------:|-----:|-----:|----:|--------:|")
        step = max(1, len(fitness_history) // 25)
        for h in fitness_history[::step]:
            gen = h.get("generation", 0)
            sections.append(
                f"| {gen + 1} | {h['best_fitness']:.4f} | "
                f"{h['mean_fitness']:.4f} | {h.get('std_fitness', 0):.4f} | "
                f"{h.get('n_species', 'N/A')} |"
            )
        # Always include last
        last = fitness_history[-1]
        if fitness_history[-1] is not fitness_history[::step][-1]:
            sections.append(
                f"| {last.get('generation', 0) + 1} | {last['best_fitness']:.4f} | "
                f"{last['mean_fitness']:.4f} | {last.get('std_fitness', 0):.4f} | "
                f"{last.get('n_species', 'N/A')} |"
            )
        sections.append("")

    # Connectome drift
    sections.append("## 3. Connectome Drift Analysis")
    sections.append("")
    if drift:
        sections.append("| Metric | Value |")
        sections.append("|--------|------:|")
        sections.append(f"| Synapses preserved | {drift.get('preserved_fraction', 0) * 100:.1f}% |")
        sections.append(f"| Synapses modified (weight > threshold) | {drift.get('modified_weight_fraction', 0) * 100:.1f}% |")
        sections.append(f"| Novel synapses | {drift.get('novel_synapses', 0)} |")
        sections.append(f"| Deleted synapses | {drift.get('deleted_synapses', 0)} |")
        sections.append(f"| Novel neurons (EVO_) | {drift.get('novel_neurons', 0)} |")
        sections.append(f"| Total weight drift (L2) | {drift.get('total_weight_change', 0):.4f} |")
        sections.append("")
    else:
        sections.append("*Drift analysis not available for this run.*")
        sections.append("")

    # Top 10 most modified connections
    most_modified = connection_analysis.get("most_modified", [])
    if most_modified:
        sections.append("### Top 10 Most Modified Connections")
        sections.append("")
        sections.append("These connections diverged most from the biological template,")
        sections.append("suggesting evolutionary pressure to reshape these pathways.")
        sections.append("")
        sections.append("| Pre | Post | Original Weight | Evolved Weight | Delta |")
        sections.append("|-----|------|----------------:|---------------:|------:|")
        for c in most_modified[:10]:
            sections.append(
                f"| {c['pre']} | {c['post']} | {c['original']:.2f} | "
                f"{c['evolved']:.2f} | {c['delta']:+.2f} |"
            )
        sections.append("")

    # Top 10 most preserved connections
    most_preserved = connection_analysis.get("most_preserved", [])
    if most_preserved:
        sections.append("### Top 10 Most Preserved Connections (Evolutionarily Robust)")
        sections.append("")
        sections.append("These connections were maintained with minimal change across")
        sections.append("evolution, indicating functional importance.")
        sections.append("")
        sections.append("| Pre | Post | Original Weight | Evolved Weight | Delta |")
        sections.append("|-----|------|----------------:|---------------:|------:|")
        for c in most_preserved[:10]:
            sections.append(
                f"| {c['pre']} | {c['post']} | {c['original']:.2f} | "
                f"{c['evolved']:.2f} | {c['delta']:+.2f} |"
            )
        sections.append("")

    # Novel connections
    novel_connections = connection_analysis.get("novel_connections", [])
    if novel_connections:
        sections.append("### Novel Connections Discovered")
        sections.append("")
        sections.append("Connections that do not exist in the biological template,")
        sections.append("created by topology mutation during evolution.")
        sections.append("")
        sections.append("| Pre | Post | Weight | Pre Type | Post Type |")
        sections.append("|-----|------|-------:|---------:|----------:|")
        for c in novel_connections[:20]:
            sections.append(
                f"| {c['pre']} | {c['post']} | {c['weight']:.2f} | "
                f"{c.get('pre_type', '?')} | {c.get('post_type', '?')} |"
            )
        sections.append("")

    # Behavioral analysis
    behavior = run_data.get("behavior", {})
    if behavior:
        sections.append("## 4. Behavioral Analysis of Best Genome")
        sections.append("")
        sections.append("| Trait | Score (0-1) | Interpretation |")
        sections.append("|-------|:-----------:|----------------|")
        _interpretations = {
            "linearity": lambda v: "Straight-line motion" if v > 0.7 else "Curved/exploratory",
            "speed": lambda v: "Fast" if v > 0.6 else "Moderate" if v > 0.3 else "Slow",
            "persistence": lambda v: "Consistent heading" if v > 0.7 else "Frequent turns",
            "exploration": lambda v: "Wide exploration" if v > 0.6 else "Localized",
            "activity": lambda v: "High neural activity" if v > 0.6 else "Low activity",
        }
        for trait, score in behavior.items():
            interp = _interpretations.get(trait, lambda v: "")(score)
            sections.append(f"| {trait.capitalize()} | {score:.3f} | {interp} |")
        sections.append("")
    else:
        sections.append("## 4. Behavioral Analysis")
        sections.append("")
        sections.append("*Behavioral analysis not available for this run.*")
        sections.append("")

    # Biological vs evolved comparison
    sections.append("## 5. Biological vs Evolved Connectome")
    sections.append("")
    template_neurons = summary.get("template_neurons", "N/A")
    evolved_neurons = summary.get("evolved_neurons", "N/A")
    template_synapses = summary.get("template_synapses", "N/A")
    evolved_synapses = summary.get("evolved_synapses", "N/A")
    sections.append("| Property | Biological Template | Evolved |")
    sections.append("|----------|:-------------------:|:-------:|")
    sections.append(f"| Neurons | {template_neurons} | {evolved_neurons} |")
    sections.append(f"| Synapses | {template_synapses} | {evolved_synapses} |")
    sections.append(f"| Density | {summary.get('template_density', 'N/A')} | {summary.get('evolved_density', 'N/A')} |")
    sections.append(f"| Novel neurons | 0 | {drift.get('novel_neurons', 0)} |")
    sections.append(f"| Novel synapses | 0 | {drift.get('novel_synapses', 0)} |")
    sections.append("")

    # God Agent section
    sections.append("## 6. God Agent Interventions")
    sections.append("")
    if god_report and god_report.get("n_interventions", 0) > 0:
        sections.append(f"- **Mode**: {god_report.get('mode', 'unknown')}")
        sections.append(f"- **Total observations**: {god_report.get('n_observations', 0)}")
        sections.append(f"- **Total interventions**: {god_report.get('n_interventions', 0)}")
        sections.append("")
        history = god_report.get("history", [])
        if history:
            sections.append("### Intervention Log (last 10)")
            sections.append("")
            sections.append("| Generation | Analysis | Actions Taken |")
            sections.append("|:----------:|----------|---------------|")
            for entry in history[-10:]:
                gen = entry.get("generation", "?")
                analysis = entry.get("analysis", "N/A")[:100]
                actions = entry.get("actions_applied", [])
                action_str = "; ".join(str(a) for a in actions[:3]) if actions else "none"
                sections.append(f"| {gen} | {analysis} | {action_str} |")
            sections.append("")
    else:
        sections.append("*No God Agent interventions during this run.*")
        sections.append("")

    # Methods section
    sections.append("## 7. Methods")
    sections.append("")
    sections.append("### Simulation Parameters")
    sections.append("")
    sections.append("```json")
    sections.append(json.dumps(config, indent=2, default=str))
    sections.append("```")
    sections.append("")
    sections.append("### Evolutionary Algorithm")
    sections.append("")
    mutation_config = config.get("mutation", {})
    sections.append(f"- **Selection**: Tournament selection (size {config.get('tournament_size', 5)})")
    sections.append(f"- **Elitism**: Top {config.get('elitism', 3)} genomes preserved")
    sections.append(f"- **Crossover rate**: {config.get('crossover_rate', 0.3)}")
    sections.append(f"- **Weight perturbation rate**: {mutation_config.get('weight_perturb_rate', 0.8)}")
    sections.append(f"- **Weight perturbation sigma**: {mutation_config.get('weight_perturb_sigma', 0.3)}")
    sections.append(f"- **Add synapse rate**: {mutation_config.get('add_synapse_rate', 0.1)}")
    sections.append(f"- **Remove synapse rate**: {mutation_config.get('remove_synapse_rate', 0.02)}")
    sections.append(f"- **Add neuron rate**: {mutation_config.get('add_neuron_rate', 0.01)}")
    sections.append(f"- **Remove neuron rate**: {mutation_config.get('remove_neuron_rate', 0.005)}")
    sections.append(f"- **Speciation**: {'Enabled' if config.get('enable_speciation', True) else 'Disabled'}")
    sections.append(f"- **Random seed**: {config.get('seed', 42)}")
    sections.append("")
    sections.append("### Neuron Model")
    sections.append("")
    sections.append(
        "The simulation uses a leaky integrate-and-fire (LIF) neuron model with "
        "current-based synapses implemented in Brian2. Excitatory/inhibitory "
        "neurotransmitter identity is preserved from the biological data (ACh, "
        "GABA, glutamate, dopamine, serotonin)."
    )
    sections.append("")
    sections.append("### Connectome Source")
    sections.append("")
    sections.append(
        f"The biological template is the *{_format_organism(organism)}* connectome "
        f"derived from OpenWorm/WormWiring data ({template_neurons} neurons, "
        f"{template_synapses} synapses). The biological connectome topology "
        "was preserved while synaptic weights were optimized through "
        "neuroevolution (mutation + crossover + selection)."
    )
    sections.append("")

    # References
    sections.append("## 8. References")
    sections.append("")
    sections.append(
        "1. Varshney, L. R., Chen, B. L., Paniagua, E., Hall, D. H., & Chklovskii, D. B. (2011). "
        "Structural properties of the *Caenorhabditis elegans* neuronal network. "
        "*PLoS Computational Biology*, 7(2), e1001066."
    )
    sections.append(
        "2. Gleeson, P., et al. (2018). c302: A multiscale framework for modelling "
        "the nervous system of *Caenorhabditis elegans*. "
        "*Philosophical Transactions of the Royal Society B*, 373(1758), 20170379."
    )
    sections.append(
        "3. OpenWorm Project. (2014-2024). OpenWorm: An open science approach to modelling "
        "*Caenorhabditis elegans*. https://openworm.org"
    )
    sections.append(
        "4. Stanley, K. O., & Miikkulainen, R. (2002). Evolving neural networks through "
        "augmenting topologies. *Evolutionary Computation*, 10(2), 99-127."
    )
    sections.append(
        "5. Goodman, D. F. M., & Brette, R. (2009). The Brian simulator. "
        "*Frontiers in Neuroscience*, 3(2), 192-197."
    )
    sections.append("")

    # Footer
    sections.append("---")
    sections.append("")
    sections.append(f"*Report generated by Neurevo `report_generator.py` at {timestamp}*")
    sections.append("")

    return "\n".join(sections)


def generate_report_from_dir(run_dir: Path) -> str:
    """Load results.json from a run directory and generate a report.

    Also attempts to load the best genome HDF5 for detailed connection
    analysis if available.
    """
    results_path = run_dir / "results.json"
    if not results_path.exists():
        raise FileNotFoundError(f"No results.json found in {run_dir}")

    with open(results_path) as f:
        run_data = json.load(f)

    # Try to enrich with detailed genome analysis
    try:
        run_data = _enrich_with_genome_analysis(run_data, run_dir)
    except Exception as e:
        logger.warning("Could not enrich report with genome analysis: %s", e)

    return generate_report(run_data)


def generate_report_from_run(
    run_id: str,
    config: dict[str, Any],
    history: list[dict[str, Any]],
    god_reports: list[dict[str, Any]] | None = None,
    elapsed: float = 0.0,
    organism: str = "c_elegans",
) -> str:
    """Generate a report from in-memory evolution run data (API context).

    This is the primary entry point when called from the API server where
    we have the EvolutionRun object but no on-disk results.json.
    """
    fitness_history = []
    for h in history:
        fitness_history.append({
            "generation": h.get("generation", 0),
            "best_fitness": h.get("best_fitness", 0),
            "mean_fitness": h.get("mean_fitness", 0),
            "std_fitness": h.get("std_fitness", 0),
            "n_species": h.get("n_species", 0),
        })

    # Build god_report summary from list of reports
    god_summary = None
    if god_reports:
        interventions_total = sum(
            len(r.get("interventions", r.get("applied", [])))
            for r in god_reports
            if r.get("type") != "god_final_report"
        )
        god_summary = {
            "n_observations": sum(1 for r in god_reports if r.get("type") != "god_final_report"),
            "n_interventions": interventions_total,
            "mode": next(
                (r.get("mode", "fallback") for r in reversed(god_reports) if r.get("mode")),
                "fallback",
            ),
            "history": [
                {
                    "generation": r.get("generation"),
                    "analysis": r.get("analysis", ""),
                    "actions_applied": r.get("applied", r.get("interventions", [])),
                }
                for r in god_reports
                if r.get("type") != "god_final_report"
            ],
        }

    run_data: dict[str, Any] = {
        "run_id": run_id,
        "organism": organism,
        "config": config,
        "fitness_history": fitness_history,
        "god_report": god_summary,
        "total_elapsed_seconds": elapsed,
        "summary": {},
        "drift": {},
    }

    return generate_report(run_data)


def generate_sample_report() -> str:
    """Generate a sample/demo report with realistic mock data.

    Used by the frontend in demo mode when no real backend is available.
    """
    n_gen = 100
    fitness_history = []
    for g in range(n_gen):
        progress = g / n_gen
        best = 0.15 + progress * 0.72 + (0.02 * math.sin(g * 0.3))
        mean = best * (0.45 + progress * 0.35)
        fitness_history.append({
            "generation": g,
            "best_fitness": round(best, 4),
            "mean_fitness": round(mean, 4),
            "std_fitness": round(0.12 - progress * 0.07, 4),
            "n_species": max(3, 12 - int(progress * 6)),
        })

    run_data: dict[str, Any] = {
        "run_id": "demo_001",
        "organism": "c_elegans",
        "config": {
            "n_generations": 100,
            "population_size": 150,
            "fitness_mode": "fast",
            "tournament_size": 5,
            "elitism": 5,
            "crossover_rate": 0.3,
            "seed": 42,
            "mutation": {
                "weight_perturb_rate": 0.8,
                "weight_perturb_sigma": 0.3,
                "add_synapse_rate": 0.1,
                "remove_synapse_rate": 0.02,
                "add_neuron_rate": 0.01,
                "remove_neuron_rate": 0.005,
            },
        },
        "fitness_history": fitness_history,
        "total_elapsed_seconds": 342.7,
        "summary": {
            "template_neurons": 302,
            "evolved_neurons": 305,
            "template_synapses": 2194,
            "evolved_synapses": 2247,
            "template_density": "0.024",
            "evolved_density": "0.024",
        },
        "drift": {
            "preserved_fraction": 0.94,
            "modified_weight_fraction": 0.37,
            "novel_synapses": 53,
            "deleted_synapses": 12,
            "novel_neurons": 3,
            "total_weight_change": 18.42,
        },
        "connection_analysis": {
            "most_modified": [
                {"pre": "AVAL", "post": "DA01", "original": 2.5, "evolved": 6.8, "delta": 4.3},
                {"pre": "AVAR", "post": "DA02", "original": 2.3, "evolved": 6.1, "delta": 3.8},
                {"pre": "AVBL", "post": "VB01", "original": 3.1, "evolved": 6.7, "delta": 3.6},
                {"pre": "AVBR", "post": "VB02", "original": 2.9, "evolved": 6.3, "delta": 3.4},
                {"pre": "DD01", "post": "VD01", "original": -2.0, "evolved": -5.1, "delta": -3.1},
                {"pre": "AVAL", "post": "VA01", "original": 1.8, "evolved": 4.7, "delta": 2.9},
                {"pre": "RIML", "post": "SMDVL", "original": 1.2, "evolved": 3.9, "delta": 2.7},
                {"pre": "RIMR", "post": "SMDVR", "original": 1.1, "evolved": 3.6, "delta": 2.5},
                {"pre": "AVDL", "post": "DA03", "original": 1.5, "evolved": 3.8, "delta": 2.3},
                {"pre": "AVDR", "post": "DA04", "original": 1.4, "evolved": 3.5, "delta": 2.1},
            ],
            "most_preserved": [
                {"pre": "ADAL", "post": "AIAL", "original": 1.0, "evolved": 1.02, "delta": 0.02},
                {"pre": "ADAR", "post": "AIAR", "original": 1.0, "evolved": 0.98, "delta": -0.02},
                {"pre": "ASEL", "post": "AIAL", "original": 2.0, "evolved": 2.03, "delta": 0.03},
                {"pre": "ASER", "post": "AIAR", "original": 2.0, "evolved": 1.96, "delta": -0.04},
                {"pre": "AWCL", "post": "AIAL", "original": 1.5, "evolved": 1.55, "delta": 0.05},
                {"pre": "AWCR", "post": "AIAR", "original": 1.5, "evolved": 1.44, "delta": -0.06},
                {"pre": "AIBL", "post": "RIML", "original": 1.0, "evolved": 1.07, "delta": 0.07},
                {"pre": "AIBR", "post": "RIMR", "original": 1.0, "evolved": 0.92, "delta": -0.08},
                {"pre": "AIZL", "post": "RIAL", "original": 1.2, "evolved": 1.29, "delta": 0.09},
                {"pre": "AIZR", "post": "RIAR", "original": 1.2, "evolved": 1.10, "delta": -0.10},
            ],
            "novel_connections": [
                {"pre": "ADAL", "post": "VA01", "weight": 1.2, "pre_type": "sensory", "post_type": "motor"},
                {"pre": "ASEL", "post": "DA01", "weight": 0.9, "pre_type": "sensory", "post_type": "motor"},
                {"pre": "EVO_001", "post": "AVAL", "weight": 2.1, "pre_type": "inter", "post_type": "inter"},
            ],
        },
        "behavior": {
            "linearity": 0.62,
            "speed": 0.71,
            "persistence": 0.58,
            "exploration": 0.45,
            "activity": 0.67,
        },
        "god_report": {
            "mode": "fallback",
            "n_observations": 10,
            "n_interventions": 3,
            "history": [
                {
                    "generation": 30,
                    "analysis": "Population diversity declining. Std fitness below threshold.",
                    "actions_applied": ["increase_mutation_rate"],
                },
                {
                    "generation": 60,
                    "analysis": "Fitness plateau detected for 15 generations.",
                    "actions_applied": ["inject_random_genomes", "increase_mutation_rate"],
                },
                {
                    "generation": 90,
                    "analysis": "Strong convergence. Final push towards optimization.",
                    "actions_applied": ["reduce_mutation_rate"],
                },
            ],
        },
    }

    return generate_report(run_data)


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------


def fitness_history_to_csv(fitness_history: list[dict[str, Any]]) -> str:
    """Convert fitness history to CSV format.

    Returns a string with header and rows.
    """
    lines = ["generation,best_fitness,mean_fitness,std_fitness,n_species"]
    for h in fitness_history:
        lines.append(
            f"{h.get('generation', 0)},"
            f"{h.get('best_fitness', 0):.6f},"
            f"{h.get('mean_fitness', 0):.6f},"
            f"{h.get('std_fitness', 0):.6f},"
            f"{h.get('n_species', 0)}"
        )
    return "\n".join(lines)


def connectome_to_export_json(genome_dict: dict[str, Any]) -> dict[str, Any]:
    """Convert a genome dict to a structured JSON export.

    Suitable for import into other analysis tools.
    """
    return {
        "format": "neurevo_connectome_v1",
        "genome_id": genome_dict.get("id", "unknown"),
        "generation": genome_dict.get("generation", 0),
        "fitness": genome_dict.get("fitness", 0),
        "template": genome_dict.get("template_name", ""),
        "neurons": {
            "ids": genome_dict.get("neuron_ids", []),
            "types": genome_dict.get("neuron_types", {}),
            "neurotransmitters": genome_dict.get("neuron_nts", {}),
        },
        "synapses": {
            "pre_indices": genome_dict.get("pre_indices", []),
            "post_indices": genome_dict.get("post_indices", []),
            "weights": genome_dict.get("weights", []),
            "synapse_types": genome_dict.get("synapse_types", []),
        },
        "statistics": {
            "n_neurons": len(genome_dict.get("neuron_ids", [])),
            "n_synapses": len(genome_dict.get("weights", [])),
        },
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _format_organism(organism: str) -> str:
    """Format organism name for display (e.g. c_elegans -> C. elegans)."""
    mapping = {
        "c_elegans": "C. elegans",
        "drosophila": "D. melanogaster",
    }
    return mapping.get(organism, organism)


def _ascii_sparkline(values: list[float], width: int = 50) -> str:
    """Generate an ASCII sparkline from a list of values."""
    if not values:
        return ""

    n = len(values)
    step = max(1, n // width)
    sampled = values[::step]

    min_v, max_v = min(sampled), max(sampled)
    range_v = max_v - min_v if max_v > min_v else 1

    blocks = list(" _.-~=*#")
    chars = []
    for v in sampled:
        level = int((v - min_v) / range_v * (len(blocks) - 1))
        level = min(len(blocks) - 1, max(0, level))
        chars.append(blocks[level])

    return "".join(chars)


def _estimate_convergence(best_vals: list[float], window: int = 10, threshold: float = 0.001) -> int | None:
    """Estimate the generation at which fitness converged.

    Convergence is defined as the first generation after which the
    rolling improvement over ``window`` generations stays below
    ``threshold``.
    """
    if len(best_vals) < window * 2:
        return None

    for i in range(window, len(best_vals)):
        recent_improvement = abs(best_vals[i] - best_vals[i - window])
        if recent_improvement < threshold:
            return i

    return None


def _enrich_with_genome_analysis(run_data: dict, run_dir: Path) -> dict:
    """Load best genome HDF5 and add connection analysis to run_data."""
    from creatures.connectome.openworm import load as load_connectome
    from creatures.evolution.genome import Genome

    connectome = load_connectome("edge_list")
    h5_path = run_dir / "best_genome.h5"
    if not h5_path.exists():
        return run_data

    evolved = Genome.load(h5_path, connectome)
    template = Genome.from_connectome(connectome)

    # Build edge dicts
    t_edges = dict(zip(
        zip(template.pre_indices.tolist(), template.post_indices.tolist()),
        template.weights.tolist(),
    ))
    e_edges = dict(zip(
        zip(evolved.pre_indices.tolist(), evolved.post_indices.tolist()),
        evolved.weights.tolist(),
    ))

    # Most modified
    changes = []
    for edge, t_w in t_edges.items():
        e_w = e_edges.get(edge)
        if e_w is not None:
            diff = e_w - t_w
            changes.append({
                "pre": template.neuron_ids[edge[0]],
                "post": template.neuron_ids[edge[1]],
                "original": t_w,
                "evolved": e_w,
                "delta": diff,
                "abs_delta": abs(diff),
            })

    changes.sort(key=lambda x: -x["abs_delta"])
    most_modified = [{k: v for k, v in c.items() if k != "abs_delta"} for c in changes[:10]]

    # Most preserved (smallest delta)
    preserved_sorted = sorted(changes, key=lambda x: x["abs_delta"])
    most_preserved = [{k: v for k, v in c.items() if k != "abs_delta"} for c in preserved_sorted[:10]]

    # Novel connections
    novel = []
    for edge, e_w in e_edges.items():
        if edge not in t_edges:
            pre_id = evolved.neuron_ids[edge[0]]
            post_id = evolved.neuron_ids[edge[1]]
            pre_type = evolved.neuron_types.get(pre_id, "?")
            post_type = evolved.neuron_types.get(post_id, "?")
            if hasattr(pre_type, "value"):
                pre_type = pre_type.value
            if hasattr(post_type, "value"):
                post_type = post_type.value
            novel.append({
                "pre": pre_id,
                "post": post_id,
                "weight": e_w,
                "pre_type": pre_type,
                "post_type": post_type,
            })

    run_data["connection_analysis"] = {
        "most_modified": most_modified,
        "most_preserved": most_preserved,
        "novel_connections": novel,
    }

    # Enrich summary
    run_data.setdefault("summary", {})
    run_data["summary"]["template_neurons"] = template.n_neurons
    run_data["summary"]["evolved_neurons"] = evolved.n_neurons
    run_data["summary"]["template_synapses"] = template.n_synapses
    run_data["summary"]["evolved_synapses"] = evolved.n_synapses

    # Drift
    from creatures.evolution.analytics import analyze_drift
    drift_result = analyze_drift(template, evolved)
    run_data["drift"] = {
        "preserved_fraction": drift_result.preserved_fraction,
        "modified_weight_fraction": drift_result.modified_weight_fraction,
        "novel_synapses": drift_result.novel_synapses,
        "deleted_synapses": drift_result.deleted_synapses,
        "novel_neurons": drift_result.novel_neurons,
        "total_weight_change": drift_result.total_weight_change,
    }

    return run_data
