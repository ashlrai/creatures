#!/usr/bin/env python3
"""Pre-demo preflight health check for Creatures API.

Run 30 minutes before a demo to verify the backend is alive and responsive.

Usage:
    python scripts/preflight.py                          # Railway production
    python scripts/preflight.py --url http://localhost:8420  # local dev
"""

from __future__ import annotations

import argparse
import json
import sys
import time

try:
    import requests
except ImportError:
    print("\033[91mERROR: 'requests' package is required.\033[0m")
    print("  pip install requests")
    sys.exit(2)

# -- Defaults ----------------------------------------------------------------

RAILWAY_URL = "https://creatures-production.up.railway.app"

# -- Formatting helpers -------------------------------------------------------

BOLD = "\033[1m"
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
DIM = "\033[2m"
RESET = "\033[0m"


def banner(text: str) -> None:
    width = 60
    print()
    print(f"{CYAN}{BOLD}{'=' * width}{RESET}")
    print(f"{CYAN}{BOLD}  {text}{RESET}")
    print(f"{CYAN}{BOLD}{'=' * width}{RESET}")
    print()


def check_pass(name: str, ms: float, detail: str = "") -> None:
    tag = f"{GREEN}{BOLD} PASS {RESET}"
    timing = f"{DIM}({ms:.0f}ms){RESET}"
    extra = f"  {DIM}{detail}{RESET}" if detail else ""
    print(f"  {tag} {name} {timing}{extra}")


def check_fail(name: str, reason: str, fix: str = "") -> None:
    tag = f"{RED}{BOLD} FAIL {RESET}"
    print(f"  {tag} {name}")
    print(f"         {RED}{reason}{RESET}")
    if fix:
        print(f"         {YELLOW}Fix: {fix}{RESET}")


def check_warn(name: str, reason: str) -> None:
    tag = f"{YELLOW}{BOLD} WARN {RESET}"
    print(f"  {tag} {name}")
    print(f"         {YELLOW}{reason}{RESET}")


def section(title: str) -> None:
    print(f"\n  {BOLD}{title}{RESET}")
    print(f"  {DIM}{'-' * 50}{RESET}")


# -- Checks -------------------------------------------------------------------

def check_health(base_url: str) -> bool:
    """GET /health -- basic liveness probe."""
    section("1. Health endpoint")
    t0 = time.monotonic()
    try:
        r = requests.get(f"{base_url}/health", timeout=10)
        ms = (time.monotonic() - t0) * 1000
        if r.status_code == 200 and r.json().get("status") == "ok":
            check_pass("GET /health", ms, f"status={r.json()['status']}")
            return True
        else:
            check_fail(
                "GET /health",
                f"Unexpected response: {r.status_code} {r.text[:200]}",
                "Is the server running? Check Railway deploy logs.",
            )
            return False
    except requests.ConnectionError:
        ms = (time.monotonic() - t0) * 1000
        check_fail(
            "GET /health",
            "Connection refused",
            f"Server unreachable at {base_url}. Is it deployed/running?",
        )
        return False
    except requests.Timeout:
        check_fail("GET /health", "Timed out after 10s", "Server may be cold-starting. Wait 30s and retry.")
        return False
    except Exception as exc:
        check_fail("GET /health", str(exc))
        return False


def check_experiment_creation(base_url: str) -> str | None:
    """POST /api/experiments -- create a c_elegans experiment."""
    section("2. Experiment creation")
    payload = {"name": "Preflight Check", "organism": "c_elegans", "weight_scale": 3.0}
    t0 = time.monotonic()
    try:
        r = requests.post(
            f"{base_url}/api/experiments",
            json=payload,
            timeout=30,
        )
        ms = (time.monotonic() - t0) * 1000
        if r.status_code == 200:
            data = r.json()
            sim_id = data.get("id", "")
            n_neurons = data.get("n_neurons", "?")
            organism = data.get("organism", "?")
            check_pass(
                "POST /api/experiments",
                ms,
                f"id={sim_id[:12]}... neurons={n_neurons} organism={organism}",
            )
            return sim_id
        else:
            check_fail(
                "POST /api/experiments",
                f"HTTP {r.status_code}: {r.text[:300]}",
                "Check server logs for import errors or missing connectome data.",
            )
            return None
    except requests.Timeout:
        check_fail(
            "POST /api/experiments",
            "Timed out after 30s",
            "Experiment creation is slow. Check CPU/memory on Railway.",
        )
        return None
    except Exception as exc:
        check_fail("POST /api/experiments", str(exc))
        return None


def check_websocket(base_url: str, sim_id: str) -> bool:
    """Connect to /ws/{sim_id}, receive 1 frame, disconnect."""
    section("3. WebSocket streaming")

    # Derive ws URL from http URL
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_url}/ws/{sim_id}"

    try:
        import websocket as _ws_lib  # type: ignore
    except ImportError:
        # Fall back to a raw-socket approach using only stdlib
        check_warn(
            "WebSocket check",
            "Skipped -- 'websocket-client' package not installed. Install with: pip install websocket-client",
        )
        return True  # non-fatal

    t0 = time.monotonic()
    try:
        ws = _ws_lib.create_connection(ws_url, timeout=15)
        frame_raw = ws.recv()
        ms = (time.monotonic() - t0) * 1000
        ws.close()

        frame = json.loads(frame_raw)
        tick = frame.get("tick", frame.get("step", "?"))
        n_segments = len(frame.get("segments", []))
        check_pass("WS /ws/{sim_id}", ms, f"tick={tick} segments={n_segments}")
        return True
    except Exception as exc:
        ms = (time.monotonic() - t0) * 1000
        check_fail(
            "WS /ws/{sim_id}",
            str(exc),
            "WebSocket may not be routed through the proxy. Check Railway settings.",
        )
        return False


def check_consciousness(base_url: str, sim_id: str) -> bool:
    """GET /api/consciousness/{sim_id}/report -- may 404 if sim too young."""
    section("4. Consciousness metrics")
    t0 = time.monotonic()
    try:
        r = requests.get(
            f"{base_url}/api/consciousness/{sim_id}/report",
            timeout=15,
        )
        ms = (time.monotonic() - t0) * 1000
        if r.status_code == 200:
            data = r.json()
            phi = data.get("phi", "?")
            complexity = data.get("neural_complexity", "?")
            check_pass(
                "GET /api/consciousness/{sim_id}/report",
                ms,
                f"phi={phi} complexity={complexity}",
            )
            return True
        elif r.status_code == 422:
            # Not enough data yet -- expected for a brand-new sim
            check_warn(
                "GET /api/consciousness/{sim_id}/report",
                f"HTTP 422 -- not enough neural data yet (expected for new sim). ({ms:.0f}ms)",
            )
            return True
        else:
            check_fail(
                "GET /api/consciousness/{sim_id}/report",
                f"HTTP {r.status_code}: {r.text[:300]}",
                "Check consciousness router is mounted and simulation is valid.",
            )
            return False
    except requests.Timeout:
        check_fail(
            "GET /api/consciousness/{sim_id}/report",
            "Timed out after 15s",
            "Consciousness computation may be too heavy. Check server resources.",
        )
        return False
    except Exception as exc:
        check_fail("GET /api/consciousness/{sim_id}/report", str(exc))
        return False


def check_api_info(base_url: str) -> bool:
    """GET /api -- basic API info endpoint."""
    section("5. API info")
    t0 = time.monotonic()
    try:
        r = requests.get(f"{base_url}/api", timeout=10)
        ms = (time.monotonic() - t0) * 1000
        if r.status_code == 200:
            data = r.json()
            version = data.get("version", "?")
            check_pass("GET /api", ms, f"version={version}")
            return True
        else:
            check_fail("GET /api", f"HTTP {r.status_code}")
            return False
    except Exception as exc:
        check_fail("GET /api", str(exc))
        return False


# -- Main ---------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pre-demo preflight check for Creatures API",
    )
    parser.add_argument(
        "--url",
        default=RAILWAY_URL,
        help=f"Base URL of the backend (default: {RAILWAY_URL})",
    )
    args = parser.parse_args()
    base_url = args.url.rstrip("/")

    banner(f"Creatures Preflight Check")
    print(f"  {BOLD}Target:{RESET} {base_url}")
    print(f"  {BOLD}Time:{RESET}   {time.strftime('%Y-%m-%d %H:%M:%S %Z')}")

    total_start = time.monotonic()
    results: list[bool] = []

    # 1. Health
    ok = check_health(base_url)
    results.append(ok)
    if not ok:
        # If health fails, no point continuing
        print(f"\n  {RED}{BOLD}Aborting -- server is unreachable.{RESET}\n")
        sys.exit(1)

    # 2. API info
    ok = check_api_info(base_url)
    results.append(ok)

    # 3. Experiment creation
    sim_id = check_experiment_creation(base_url)
    results.append(sim_id is not None)

    if sim_id:
        # 4. WebSocket
        ok = check_websocket(base_url, sim_id)
        results.append(ok)

        # 5. Consciousness
        ok = check_consciousness(base_url, sim_id)
        results.append(ok)
    else:
        check_warn("WebSocket check", "Skipped -- no experiment created")
        check_warn("Consciousness check", "Skipped -- no experiment created")

    # -- Summary ---------------------------------------------------------------
    total_ms = (time.monotonic() - total_start) * 1000
    passed = sum(results)
    total = len(results)

    print(f"\n  {DIM}{'=' * 50}{RESET}")
    if all(results):
        print(f"\n  {GREEN}{BOLD}ALL {total} CHECKS PASSED{RESET}  {DIM}(total {total_ms:.0f}ms){RESET}")
        print(f"  {GREEN}Ready for demo!{RESET}\n")
        sys.exit(0)
    else:
        failed = total - passed
        print(f"\n  {RED}{BOLD}{failed}/{total} CHECKS FAILED{RESET}  {DIM}(total {total_ms:.0f}ms){RESET}")
        print(f"  {RED}Fix the issues above before the demo.{RESET}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
