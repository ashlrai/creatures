#!/bin/bash
# Start the full Neurevo stack (API + Frontend)
# Usage: ./scripts/start.sh

set -e
cd "$(dirname "$0")/.."

echo "Starting Neurevo..."
echo "  API:      http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""

# Start API server in background
cd creatures-api
PYTHONPATH="../creatures-core:." ../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!
cd ..

# Start Vite dev server in background
cd creatures-web
npx vite --host &
VITE_PID=$!
cd ..

echo ""
echo "Both servers started."
echo "  Open: http://localhost:5173/#/app/sim/c_elegans"
echo "  Click 'Split' for dual world+brain view"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait for Ctrl+C
trap "kill $API_PID $VITE_PID 2>/dev/null; exit" INT TERM
wait
