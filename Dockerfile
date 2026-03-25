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

# Install system dependencies for MuJoCo and Brian2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY creatures-core/pyproject.toml creatures-core/
RUN pip install --no-cache-dir -e creatures-core/

# Copy application code
COPY creatures-core/ creatures-core/
COPY creatures-api/ creatures-api/

# Copy frontend build
COPY --from=frontend /app/creatures-web/dist creatures-web/dist

# Expose port
EXPOSE 8420

# Run with uvicorn
ENV PYTHONPATH="creatures-core:creatures-api"
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8420"]
