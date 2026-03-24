"""Data export and scientific reporting endpoints.

Provides CSV, JSON, and markdown export for evolution runs, connectomes,
and fitness data. Designed for researchers who need to export data for
papers and external analysis tools.
"""

from __future__ import annotations

import io
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.services.evolution_manager import EvolutionManager

router = APIRouter(prefix="/export", tags=["export"])
logger = logging.getLogger(__name__)

# Set by main.py lifespan
manager: EvolutionManager | None = None


def _mgr() -> EvolutionManager:
    if manager is None:
        raise RuntimeError("EvolutionManager not initialized")
    return manager


# ---------------------------------------------------------------------------
# Fitness CSV export
# ---------------------------------------------------------------------------


@router.get("/evolution/{run_id}/fitness")
async def export_fitness_csv(run_id: str):
    """Export fitness history as a CSV file.

    Columns: generation, best_fitness, mean_fitness, std_fitness, n_species
    """
    from creatures.reporting.report_generator import fitness_history_to_csv

    mgr = _mgr()
    run = mgr.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")

    csv_content = fitness_history_to_csv(run.history)

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="fitness_{run_id}.csv"',
        },
    )


# ---------------------------------------------------------------------------
# Scientific report
# ---------------------------------------------------------------------------


@router.get("/evolution/{run_id}/report")
async def export_report(run_id: str):
    """Generate and return a scientific markdown report for an evolution run.

    The report includes run metadata, fitness trajectory, connectome drift
    analysis, God Agent interventions, and methodology sections.
    """
    from creatures.reporting.report_generator import generate_report_from_run

    mgr = _mgr()
    run = mgr.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")

    report = generate_report_from_run(
        run_id=run.id,
        config=run.config,
        history=run.history,
        god_reports=run.god_reports,
        elapsed=run.elapsed_seconds,
        organism=run.config.get("organism", "c_elegans"),
    )

    return PlainTextResponse(
        content=report,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="report_{run_id}.md"',
        },
    )


# ---------------------------------------------------------------------------
# Connectome export
# ---------------------------------------------------------------------------


@router.get("/evolution/{run_id}/connectome")
async def export_connectome(run_id: str, format: str = "json"):
    """Export the best genome's connectome.

    Query parameters:
        format: 'json' (default) or 'neuroml' (placeholder)
    """
    from creatures.reporting.report_generator import connectome_to_export_json

    mgr = _mgr()
    run = mgr.get_run(run_id)
    if run is None:
        raise HTTPException(404, f"Run {run_id} not found")

    if run.population is None:
        raise HTTPException(400, "Population not initialized")

    # Get the best genome from the population
    try:
        best = run.population.best_genome()
    except (RuntimeError, AttributeError):
        raise HTTPException(400, "No best genome available")

    genome_dict = best.to_dict()

    if format == "json":
        export_data = connectome_to_export_json(genome_dict)
        content = json.dumps(export_data, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode("utf-8")),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="connectome_{run_id}.json"',
            },
        )
    elif format == "neuroml":
        # NeuroML export: produce a simplified NeuroML2 representation
        export_data = connectome_to_export_json(genome_dict)
        neuroml_content = _genome_to_neuroml(export_data)
        return PlainTextResponse(
            content=neuroml_content,
            media_type="application/xml",
            headers={
                "Content-Disposition": f'attachment; filename="connectome_{run_id}.nml"',
            },
        )
    else:
        raise HTTPException(400, f"Unsupported format: {format}. Use 'json' or 'neuroml'.")


# ---------------------------------------------------------------------------
# Simulation frames CSV
# ---------------------------------------------------------------------------


@router.get("/{sim_id}/csv")
async def export_simulation_csv(sim_id: str):
    """Export simulation frames as CSV.

    Columns: time_ms, neuron_id, activity, body_x, body_y, body_z

    Note: This endpoint requires a simulation to have been run and its
    frames stored. Returns 404 if no simulation data is available.
    """
    # Try to find simulation data in the evolution manager's runs
    mgr = _mgr()
    run = mgr.get_run(sim_id)
    if run is None:
        raise HTTPException(404, f"Simulation or run {sim_id} not found")

    # Export the fitness history as a proxy for simulation data
    # (full frame-by-frame data requires Brian2 simulation storage,
    # which is not persisted by default)
    lines = ["time_step,generation,best_fitness,mean_fitness,std_fitness,n_species"]
    for h in run.history:
        gen = h.get("generation", 0)
        lines.append(
            f"{gen},"
            f"{gen},"
            f"{h.get('best_fitness', 0):.6f},"
            f"{h.get('mean_fitness', 0):.6f},"
            f"{h.get('std_fitness', 0):.6f},"
            f"{h.get('n_species', 0)}"
        )

    csv_content = "\n".join(lines)
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="simulation_{sim_id}.csv"',
        },
    )


# ---------------------------------------------------------------------------
# Demo / sample report (no run required)
# ---------------------------------------------------------------------------


@router.get("/demo/report")
async def export_demo_report():
    """Generate a sample scientific report with mock data.

    Useful for demo mode or testing the report format.
    """
    from creatures.reporting.report_generator import generate_sample_report

    report = generate_sample_report()
    return PlainTextResponse(
        content=report,
        media_type="text/markdown",
        headers={
            "Content-Disposition": 'attachment; filename="neurevo_demo_report.md"',
        },
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _genome_to_neuroml(export_data: dict) -> str:
    """Convert genome export data to a simplified NeuroML2 XML string."""
    neurons = export_data.get("neurons", {})
    synapses = export_data.get("synapses", {})
    neuron_ids = neurons.get("ids", [])
    pre_indices = synapses.get("pre_indices", [])
    post_indices = synapses.get("post_indices", [])
    weights = synapses.get("weights", [])

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<neuroml xmlns="http://www.neuroml.org/schema/neuroml2"',
        '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '         xsi:schemaLocation="http://www.neuroml.org/schema/neuroml2'
        '  https://raw.githubusercontent.com/NeuroML/NeuroML2/development/Schemas/NeuroML2/NeuroML_v2.3.xsd"',
        f'         id="neurevo_{export_data.get("genome_id", "unknown")}">',
        "",
        f"  <!-- Neurevo evolved connectome: gen {export_data.get('generation', 0)}, "
        f"fitness {export_data.get('fitness', 0):.4f} -->",
        f"  <!-- {len(neuron_ids)} neurons, {len(weights)} synapses -->",
        "",
    ]

    # Populations (one cell per neuron)
    lines.append('  <network id="evolved_network">')
    lines.append(f'    <population id="neurons" component="iafCell" size="{len(neuron_ids)}"/>')

    # Projections
    if pre_indices and post_indices and weights:
        lines.append('    <projection id="synapses" presynapticPopulation="neurons" postsynapticPopulation="neurons">')
        for i, (pre, post, w) in enumerate(zip(pre_indices, post_indices, weights)):
            lines.append(
                f'      <connection id="{i}" preCellId="../neurons/{pre}" '
                f'postCellId="../neurons/{post}" '
                f'weight="{w:.4f}"/>'
            )
        lines.append("    </projection>")

    lines.append("  </network>")
    lines.append("</neuroml>")

    return "\n".join(lines)
