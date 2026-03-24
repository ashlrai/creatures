#!/usr/bin/env python3
"""Generate a scientific markdown report from an evolution run.

Reads evolution results (JSON + HDF5) from an output directory and
produces a structured report suitable for research documentation.

Usage:
    python scripts/generate_report.py evolution_results/run_abc123/
    python scripts/generate_report.py evolution_results/run_abc123/ --output report.md
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

# Ensure project packages are importable
_project_root = Path(__file__).resolve().parents[1]
_core_root = _project_root / "creatures-core"
for p in (_project_root, _core_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from creatures.connectome.openworm import load as load_connectome
from creatures.evolution.analytics import analyze_drift, identify_robust_connections
from creatures.evolution.genome import Genome


def load_run_data(run_dir: Path) -> dict:
    """Load results.json and best_genome.h5 from a run directory."""
    results_path = run_dir / "results.json"
    if not results_path.exists():
        raise FileNotFoundError(f"No results.json in {run_dir}")

    with open(results_path) as f:
        results = json.load(f)

    return results


def generate_report(run_dir: Path) -> str:
    """Generate a markdown report from an evolution run directory.

    Args:
        run_dir: Path to the evolution run output directory.

    Returns:
        Markdown string of the report.
    """
    results = load_run_data(run_dir)
    config = results.get("config", {})
    summary = results.get("summary", {})
    drift = results.get("drift", {})
    fitness_history = results.get("fitness_history", [])
    best_info = results.get("best_genome", {})
    god_report = results.get("god_report")

    run_id = results.get("run_id", "unknown")
    organism = results.get("organism", "c_elegans")
    n_gen = config.get("generations", 0)
    pop_size = config.get("population", 0)
    fitness_mode = config.get("fitness_mode", "fast")
    elapsed = results.get("total_elapsed_seconds", 0)

    initial_fitness = fitness_history[0]["best_fitness"] if fitness_history else 0
    final_fitness = fitness_history[-1]["best_fitness"] if fitness_history else 0
    improvement_pct = ((final_fitness - initial_fitness) / max(abs(initial_fitness), 1e-6)) * 100

    # Try loading genome + connectome for detailed analysis
    genome_analysis = ""
    connection_table = ""
    try:
        connectome = load_connectome("edge_list")
        h5_path = run_dir / "best_genome.h5"
        if h5_path.exists():
            evolved = Genome.load(h5_path, connectome)
            template = Genome.from_connectome(connectome)

            # Analyze weight changes per neuron class
            motor_weight_changes = []
            gaba_weight_changes = []
            sensory_motor_shortcuts = []

            t_edges = dict(zip(
                zip(template.pre_indices.tolist(), template.post_indices.tolist()),
                template.weights.tolist(),
            ))
            e_edges = dict(zip(
                zip(evolved.pre_indices.tolist(), evolved.post_indices.tolist()),
                evolved.weights.tolist(),
            ))

            # Find most changed connections
            changes = []
            for edge, t_w in t_edges.items():
                e_w = e_edges.get(edge)
                if e_w is not None:
                    diff = e_w - t_w
                    pre_id = template.neuron_ids[edge[0]]
                    post_id = template.neuron_ids[edge[1]]
                    changes.append((pre_id, post_id, t_w, e_w, diff, abs(diff)))

            changes.sort(key=lambda x: -x[5])

            # Novel connections
            novel = []
            for edge, e_w in e_edges.items():
                if edge not in t_edges:
                    pre_id = evolved.neuron_ids[edge[0]]
                    post_id = evolved.neuron_ids[edge[1]]
                    novel.append((pre_id, post_id, e_w))

            # Build connection table (top 20 most modified)
            if changes:
                rows = ["| Pre | Post | Original Weight | Evolved Weight | Change |",
                        "|-----|------|----------------:|---------------:|-------:|"]
                for pre, post, tw, ew, diff, _ in changes[:20]:
                    rows.append(f"| {pre} | {post} | {tw:.2f} | {ew:.2f} | {diff:+.2f} |")
                connection_table = "\n".join(rows)

            # Categorize key findings
            findings = []

            # Motor circuit changes
            motor_changes = [c for c in changes if any(
                c[1].startswith(p) for p in ("VA", "DA", "VB", "DB", "DD", "VD")
            )]
            if motor_changes:
                avg_change = np.mean([abs(c[4]) for c in motor_changes[:10]])
                direction = "strengthened" if np.mean([c[4] for c in motor_changes[:10]]) > 0 else "weakened"
                findings.append(
                    f"**Motor circuit modification**: Motor neuron input connections "
                    f"{direction} by avg {avg_change:.2f} weight units"
                )

            # GABA changes
            gaba_changes = [c for c in changes if any(
                c[0].startswith(p) for p in ("DD", "VD")
            )]
            if gaba_changes:
                avg_gaba = np.mean([c[4] for c in gaba_changes[:10]])
                findings.append(
                    f"**GABA adaptation**: Inhibitory (DD/VD) neuron outputs changed by "
                    f"avg {avg_gaba:+.2f} weight units"
                )

            # Novel sensory-motor shortcuts
            sensory_motor_novel = [
                n for n in novel
                if connectome.neurons.get(n[0]) and
                connectome.neurons[n[0]].neuron_type.value == "sensory" and
                connectome.neurons.get(n[1]) and
                connectome.neurons[n[1]].neuron_type.value == "motor"
            ]
            for pre, post, w in sensory_motor_novel[:5]:
                findings.append(
                    f"**Novel sensory-motor shortcut**: New connection {pre} -> {post} "
                    f"(weight {w:.1f})"
                )

            if not findings:
                findings.append("No major structural reorganization detected")

            genome_analysis = "\n".join(f"{i+1}. {f}" for i, f in enumerate(findings))

    except Exception as e:
        genome_analysis = f"Could not perform detailed genome analysis: {e}"
        connection_table = ""

    # Fitness trajectory sparkline (ASCII)
    if fitness_history:
        best_vals = [h["best_fitness"] for h in fitness_history]
        min_f, max_f = min(best_vals), max(best_vals)
        range_f = max_f - min_f if max_f > min_f else 1
        # Sample ~40 points for sparkline
        step = max(1, len(best_vals) // 40)
        sampled = best_vals[::step]
        blocks = " ".join(["_", ".", "-", "~", "+", "*", "#"])
        sparkline_chars = []
        for v in sampled:
            level = int((v - min_f) / range_f * 6)
            level = min(6, max(0, level))
            sparkline_chars.append(blocks.split()[level])
        sparkline = "".join(sparkline_chars)
    else:
        sparkline = "N/A"

    # Build the report
    report = f"""# Neurevo Evolution Report
## Run: {run_id} | {organism} | {n_gen} Generations

**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Fitness mode**: {fitness_mode}
**Population**: {pop_size}
**Total runtime**: {elapsed:.1f}s ({elapsed / max(n_gen, 1):.2f}s/generation)

---

### Summary

| Metric | Value |
|--------|------:|
| Initial fitness | {initial_fitness:.1f} |
| Final fitness | {final_fitness:.1f} |
| Improvement | {improvement_pct:+.1f}% |
| Novel connections | {drift.get('novel_synapses', 'N/A')} |
| Deleted connections | {drift.get('deleted_synapses', 'N/A')} |
| Connections preserved | {drift.get('preserved_fraction', 0) * 100:.1f}% |
| Weight drift (L2) | {drift.get('total_weight_change', 0):.2f} |
| Novel neurons | {drift.get('novel_neurons', 0)} |

**Fitness trajectory** (gen 1 -> {n_gen}): `{sparkline}`

---

### Key Findings

{genome_analysis if genome_analysis else "No detailed analysis available."}

---

### Preserved vs Modified Connections (Top 20)

{connection_table if connection_table else "Detailed connection table not available (genome HDF5 not found)."}

---

### Evolution Configuration

```json
{json.dumps(config, indent=2)}
```

### Fitness History

| Generation | Best | Mean | Std | Species |
|:----------:|-----:|-----:|----:|--------:|"""

    # Add fitness history rows (sample if too many)
    if fitness_history:
        step = max(1, len(fitness_history) // 25)
        for h in fitness_history[::step]:
            report += (
                f"\n| {h['generation'] + 1} | {h['best_fitness']:.1f} | "
                f"{h['mean_fitness']:.1f} | {h['std_fitness']:.2f} | "
                f"{h.get('n_species', 'N/A')} |"
            )
        # Always include last generation
        h = fitness_history[-1]
        if fitness_history[-1] != fitness_history[::step][-1]:
            report += (
                f"\n| {h['generation'] + 1} | {h['best_fitness']:.1f} | "
                f"{h['mean_fitness']:.1f} | {h['std_fitness']:.2f} | "
                f"{h.get('n_species', 'N/A')} |"
            )

    # God Agent section
    if god_report and god_report.get("n_interventions", 0) > 0:
        report += f"""

---

### God Agent Interventions

- **Mode**: {god_report.get('mode', 'unknown')}
- **Observations**: {god_report.get('n_observations', 0)}
- **Interventions**: {god_report.get('n_interventions', 0)}
"""
        if god_report.get("history"):
            report += "\n| Generation | Analysis | Actions |\n|:----------:|----------|--------|\n"
            for entry in god_report["history"][-10:]:
                gen = entry.get("generation", "?")
                analysis = entry.get("analysis", "N/A")[:80]
                actions = entry.get("actions_applied", [])
                action_str = ", ".join(str(a) for a in actions[:3]) if actions else "none"
                report += f"| {gen} | {analysis} | {action_str} |\n"

    report += f"""

---

### Methodology

This evolution run used the Neurevo platform to evolve a C. elegans connectome
derived from OpenWorm/WormWiring data ({summary.get('template_neurons', '~300')} neurons,
{summary.get('template_synapses', '~2000+')} synapses). The biological connectome topology
was preserved while synaptic weights were optimized through neuroevolution
(mutation + crossover + selection). Fitness was evaluated using the
**{fitness_mode}** evaluation mode.

The simulation uses a leaky integrate-and-fire (LIF) neuron model with
current-based synapses implemented in Brian2. Excitatory/inhibitory
neurotransmitter identity is preserved from the biological data (ACh,
GABA, glutamate, dopamine, serotonin).

---

*Report generated by Neurevo `generate_report.py`*
"""

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a scientific report from an evolution run."
    )
    parser.add_argument(
        "run_dir",
        type=str,
        help="Path to evolution run output directory",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Output file path (default: <run_dir>/report.md)",
    )
    args = parser.parse_args(argv)

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        print(f"Error: {run_dir} does not exist", file=sys.stderr)
        return 1

    try:
        report = generate_report(run_dir)
    except Exception as e:
        print(f"Error generating report: {e}", file=sys.stderr)
        return 1

    output_path = Path(args.output) if args.output else run_dir / "report.md"
    output_path.write_text(report)
    print(f"Report written to {output_path}")
    print(f"({len(report)} characters, {report.count(chr(10))} lines)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
