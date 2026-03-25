.PHONY: setup dev api web notebook test clean docker-build docker-run docker-compose

# Setup everything
setup:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -e "creatures-core[dev]"
	. .venv/bin/activate && pip install fastapi "uvicorn[standard]" websockets msgpack
	. .venv/bin/activate && pip install flygym opencv-python-headless numba dm-env protobuf pyarrow
	cd creatures-web && npm install
	@echo "\n=== Setup complete! Run 'make dev' to start. ==="

# Start both servers for development
dev:
	@echo "Starting API on :8420 and frontend on :5173..."
	@trap 'kill 0' EXIT; \
	cd creatures-api && PYTHONPATH="../creatures-core:." ../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8420 --reload & \
	cd creatures-web && npm run dev & \
	wait

# Start just the API
api:
	cd creatures-api && PYTHONPATH="../creatures-core:." ../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8420 --reload

# Start just the frontend
web:
	cd creatures-web && npm run dev

# Open Jupyter notebooks
notebook:
	. .venv/bin/activate && jupyter notebook notebooks/

# Run tests
test:
	. .venv/bin/activate && python -m pytest creatures-core/tests/ -v

# Download all organism data
data:
	. .venv/bin/activate && python3 -c "from creatures.connectome.openworm import load; print(load().summary())"
	. .venv/bin/activate && python3 -c "from creatures.connectome.flywire import download_data; download_data()"

# Build frontend for production
build:
	cd creatures-web && npm run build

# Docker
docker-build:
	docker build -t neurevo .

docker-run:
	docker run -p 8420:8420 --env-file .env neurevo

docker-compose:
	docker compose up --build

# Clean build artifacts
clean:
	rm -rf creatures-web/dist creatures-web/node_modules
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
