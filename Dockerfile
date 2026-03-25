# Stage 1: Frontend build
FROM node:20-alpine AS frontend
WORKDIR /app/creatures-web
COPY creatures-web/package*.json ./
RUN npm ci
COPY creatures-web/ ./
RUN npm run build

# Stage 2: Python API
FROM python:3.13-slim AS api
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY creatures-core/ creatures-core/
RUN pip install --no-cache-dir \
    numpy brian2 h5py pydantic requests pandas scipy cython \
    fastapi "uvicorn[standard]" websockets httpx

# Copy API code
COPY creatures-api/ creatures-api/

# Copy frontend build
COPY --from=frontend /app/creatures-web/dist creatures-web/dist

# Copy scripts and data
COPY scripts/ scripts/
COPY data/ data/
COPY landing/ landing/

# Environment
ENV PYTHONPATH="/app/creatures-core:/app/creatures-api"
ENV BRIAN2_CODEGEN_TARGET="numpy"

# Railway uses $PORT, default to 8420 for local
EXPOSE 8420
CMD python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8420}
