#!/usr/bin/env bash
# Run preflight check against local dev server
exec python "$(dirname "$0")/preflight.py" --url http://localhost:8420 "$@"
