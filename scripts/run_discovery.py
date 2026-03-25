#!/usr/bin/env python3
"""Autonomous overnight discovery: generate hypotheses, run experiments, report findings.

Start before bed, wake up to real scientific discoveries about neural circuits.

Usage:
    python scripts/run_discovery.py --organism c_elegans --max-hours 1
    python scripts/run_discovery.py --organism c_elegans --max-hypotheses 5 --output results/
    python scripts/run_discovery.py --use-god-agent  # uses xAI to generate extra hypotheses

Output:
    - Console: live progress + discovered findings
    - JSON:    detailed results with all measurements
    - Markdown: human-readable morning briefing report
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Ensure project packages are importable
_project_root = Path(__file__).resolve().parents[1]
_core_root = _project_root / "creatures-core"
for p in (_project_root, _core_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from creatures.discovery.engine import DiscoveryEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("discovery")


def _god_agent_hypotheses(engine: DiscoveryEngine, api_key: str) -> None:
    """Use the xAI God Agent to generate additional hypotheses from findings.

    This is the feedback loop: the God Agent reads the current discoveries
    and generates NEW hypotheses to test, enabling iterative deepening.
    """
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not installed; skipping God Agent hypothesis generation")
        return

    if not engine.discoveries:
        logger.info("No discoveries yet; skipping God Agent feedback loop")
        return

    # Build a summary of current findings for the LLM
    findings_summary = "\n".join(
        f"- {d.title} (effect: {d.significance:.1f}%)"
        for d in engine.discoveries
    )

    prompt = f"""You are a computational neuroscientist studying C. elegans neural circuits.
Based on these experimental findings from our automated discovery system:

{findings_summary}

Generate 3 NEW testable hypotheses. For each, provide:
1. A clear statement
2. Category: "circuit", "drug", or "learning"
3. The experiment type: "lesion_comparison", "drug_effect", or "learning_comparison"
4. Specific parameters

Respond in JSON format:
[
  {{
    "statement": "...",
    "category": "circuit",
    "experiment": {{
      "type": "lesion_comparison",
      "neuron_id": "AVAL",
      "duration_ms": 500,
      "stimulus_neurons": ["PLML", "PLMR"],
      "stimulus_current": 30.0
    }},
    "priority": 0.8
  }}
]"""

    try:
        response = httpx.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "grok-3-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 2048,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]

        # Parse JSON from the response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        new_hypotheses_data = json.loads(content)

        from creatures.discovery.engine import Hypothesis

        for i, hd in enumerate(new_hypotheses_data):
            h = Hypothesis(
                id=f"god_agent_{i}_{int(time.time())}",
                statement=hd["statement"],
                category=hd.get("category", "circuit"),
                experiment=hd.get("experiment", {
                    "type": "lesion_comparison",
                    "neuron_id": "AVAL",
                    "duration_ms": 500,
                    "stimulus_neurons": ["PLML", "PLMR"],
                    "stimulus_current": 30.0,
                }),
                priority=hd.get("priority", 0.6),
            )
            engine.hypotheses.append(h)
            logger.info("God Agent hypothesis: %s", h.statement)

    except Exception as exc:
        logger.warning("God Agent hypothesis generation failed: %s", exc)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Neurevo Autonomous Discovery System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--organism", default="c_elegans",
        help="Organism connectome to study (default: c_elegans)",
    )
    parser.add_argument(
        "--max-hours", type=float, default=1.0,
        help="Maximum runtime in hours (default: 1.0)",
    )
    parser.add_argument(
        "--max-hypotheses", type=int, default=None,
        help="Maximum number of hypotheses to test (default: all)",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output directory for results (default: evolution_results/discovery/)",
    )
    parser.add_argument(
        "--use-god-agent", action="store_true",
        help="Use xAI God Agent to generate additional hypotheses from findings",
    )
    args = parser.parse_args()

    # Setup output directory
    output_dir = Path(args.output) if args.output else _project_root / "evolution_results" / "discovery"
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    max_seconds = args.max_hours * 3600
    start_time = time.time()

    print("=" * 70)
    print("  NEUREVO AUTONOMOUS DISCOVERY SYSTEM")
    print(f"  Organism: {args.organism}")
    print(f"  Max runtime: {args.max_hours:.1f} hours")
    print(f"  Output: {output_dir}")
    print("=" * 70)
    print()

    # Initialize discovery engine
    xai_key = os.environ.get("XAI_API_KEY")
    engine = DiscoveryEngine(xai_api_key=xai_key)

    # Phase 1: Generate hypotheses
    print("[Phase 1] Generating hypotheses...")
    hypotheses = engine.generate_hypotheses(args.organism)
    print(f"  Generated {len(hypotheses)} hypotheses:")
    for h in hypotheses:
        print(f"    [{h.priority:.2f}] {h.statement}")
    print()

    # Phase 2: Run experiments
    print("[Phase 2] Running experiments...")
    tested = 0
    for h in sorted(engine.hypotheses, key=lambda x: -x.priority):
        if h.status != "pending":
            continue

        # Check time limit
        elapsed = time.time() - start_time
        if elapsed > max_seconds:
            print(f"\n  Time limit reached ({args.max_hours:.1f}h). Stopping.")
            break

        # Check hypothesis limit
        if args.max_hypotheses and tested >= args.max_hypotheses:
            print(f"\n  Hypothesis limit reached ({args.max_hypotheses}). Stopping.")
            break

        tested += 1
        print(f"\n  [{tested}/{len(engine.hypotheses)}] Testing: {h.statement}")

        t0 = time.time()
        result = engine.run_experiment(h)
        dt = time.time() - t0
        h.result = result

        if result.get("error"):
            h.status = "inconclusive"
            print(f"    ERROR ({dt:.1f}s): {result['error']}")
        elif result.get("significant"):
            h.status = "confirmed"
            # Create discovery
            from creatures.discovery.engine import Discovery
            import uuid as _uuid

            discovery = Discovery(
                id=f"disc_{h.id}_{_uuid.uuid4().hex[:6]}",
                title=engine._make_discovery_title(h, result),
                description=engine._make_discovery_description(h, result),
                hypothesis=h,
                evidence=result,
                significance=abs(result.get("delta_percent", 0)),
                timestamp=datetime.now().isoformat(),
            )
            engine.discoveries.append(discovery)
            delta = result.get("delta_percent", 0)
            print(f"    CONFIRMED ({dt:.1f}s): effect = {delta:+.1f}%")
        else:
            h.status = "rejected"
            delta = result.get("delta_percent", 0)
            print(f"    REJECTED ({dt:.1f}s): effect = {delta:+.1f}% (below threshold)")

    # Phase 2.5: God Agent feedback loop (if enabled)
    if args.use_god_agent and xai_key:
        print("\n[Phase 2.5] God Agent generating new hypotheses from findings...")
        n_before = len(engine.hypotheses)
        _god_agent_hypotheses(engine, xai_key)
        n_new = len(engine.hypotheses) - n_before
        if n_new > 0:
            print(f"  God Agent added {n_new} new hypotheses. Testing...")
            for h in engine.hypotheses:
                if h.status != "pending":
                    continue
                elapsed = time.time() - start_time
                if elapsed > max_seconds:
                    break
                tested += 1
                print(f"\n  [{tested}] Testing (God Agent): {h.statement}")
                t0 = time.time()
                result = engine.run_experiment(h)
                dt = time.time() - t0
                h.result = result
                if result.get("significant"):
                    h.status = "confirmed"
                    discovery = Discovery(
                        id=f"disc_{h.id}_{_uuid.uuid4().hex[:6]}",
                        title=engine._make_discovery_title(h, result),
                        description=engine._make_discovery_description(h, result),
                        hypothesis=h,
                        evidence=result,
                        significance=abs(result.get("delta_percent", 0)),
                        timestamp=datetime.now().isoformat(),
                    )
                    engine.discoveries.append(discovery)
                    print(f"    CONFIRMED ({dt:.1f}s): {result.get('delta_percent', 0):+.1f}%")
                elif result.get("error"):
                    h.status = "inconclusive"
                    print(f"    ERROR ({dt:.1f}s): {result['error']}")
                else:
                    h.status = "rejected"
                    print(f"    REJECTED ({dt:.1f}s): {result.get('delta_percent', 0):+.1f}%")

    # Phase 3: Generate report
    print("\n" + "=" * 70)
    print("[Phase 3] Generating report...")

    report = engine.generate_report()
    results_json = engine.to_json()

    # Save outputs
    report_path = output_dir / f"discovery_report_{timestamp}.md"
    json_path = output_dir / f"discovery_results_{timestamp}.json"

    report_path.write_text(report)
    json_path.write_text(json.dumps(results_json, indent=2, default=str))

    elapsed_total = time.time() - start_time

    print(f"\n  Report saved to: {report_path}")
    print(f"  Results saved to: {json_path}")
    print(f"  Total runtime: {elapsed_total / 60:.1f} minutes")

    # Print summary
    print("\n" + "=" * 70)
    print("  DISCOVERY SUMMARY")
    print("=" * 70)
    n_confirmed = len([h for h in engine.hypotheses if h.status == "confirmed"])
    n_rejected = len([h for h in engine.hypotheses if h.status == "rejected"])
    n_error = len([h for h in engine.hypotheses if h.status == "inconclusive"])
    print(f"  Hypotheses tested: {tested}")
    print(f"  Confirmed: {n_confirmed}")
    print(f"  Rejected:  {n_rejected}")
    print(f"  Errors:    {n_error}")

    if engine.discoveries:
        print(f"\n  TOP DISCOVERIES:")
        for d in sorted(engine.discoveries, key=lambda x: -x.significance)[:5]:
            print(f"    * {d.title}")

    print()


if __name__ == "__main__":
    main()
