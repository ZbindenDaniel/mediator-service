# syntax=docker/dockerfile:1

# Builder stage
FROM node:20-bullseye AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy project files and build
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-bullseye-slim AS runtime

# Install system dependencies required at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        cups-client \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HTTP_PORT=8080 \
    AGENTIC_MODEL_PROVIDER=ollama \
    AGENTIC_OLLAMA_BASE_URL=http://127.0.0.1:11434 \
    AGENTIC_OLLAMA_MODEL=qwen3:0.6b \
    AGENTIC_OPENAI_BASE_URL=https://api.openai.com/v1 \
    AGENTIC_OPENAI_MODEL=gpt-4o-mini \
    AGENTIC_SEARCH_BASE_URL=http://127.0.0.1 \
    AGENTIC_SEARCH_PORT=8000 \
    AGENTIC_SEARCH_PATH=/search \
    AGENTIC_QUEUE_POLL_INTERVAL_MS=5000 \
    SEARCH_WEB_ALLOWED_ENGINES=google,duckduckgo,brave

WORKDIR /app

# Copy package manifests and install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy build artifacts and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/public ./dist/frontend/public

# Ensure required directories exist
RUN mkdir -p dist/backend/data dist/backend/media dist/frontend/public

EXPOSE 8080 8443

ENTRYPOINT ["node", "dist/backend/server.js"]
