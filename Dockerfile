# syntax=docker/dockerfile:1
# TODO(agent): Update the runtime stage with a supported headless PDF renderer and document its env configuration.

############################
# Builder stage
############################
FROM node:20-bullseye AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy project files and build
COPY . .
RUN npm run build


############################
# Runtime stage
############################
FROM node:20-bullseye-slim AS runtime

# Install system dependencies required at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        cups-client \
        unzip \
        zip \
        chromium \
        fonts-liberation \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# TODO(media-storage): Ensure media directory defaults remain aligned with compose and runtime overrides.
ENV NODE_ENV=production \
    HTTP_PORT=8080 \
    MEDIA_DIR=/app/dist/backend/media \
    WEB_DAV_DIR=/app/dist/backend/webDav \
    AGENTIC_MODEL_PROVIDER=ollama \
    AGENTIC_OLLAMA_BASE_URL=http://127.0.0.1:11434 \
    AGENTIC_OLLAMA_MODEL=gpt-oss:20b \
    AGENTIC_OPENAI_BASE_URL=https://api.openai.com/v1 \
    AGENTIC_OPENAI_MODEL=gpt-4o-mini \
    SEARCH_WEB_ALLOWED_ENGINES=google,duckduckgo,brave

WORKDIR /app

# Copy env file
COPY .env /app/.env

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy build artifacts and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/public ./dist/frontend/public

# Ensure required directories exist AND fix ownership
# TODO(media-storage): Revisit directory creation if media paths move outside /app.
RUN mkdir -p \
        dist/backend/data \
        "${MEDIA_DIR}" \
        "${WEB_DAV_DIR}" \
        dist/frontend/public \
        /var/lib/mediator/inbox \
        /var/lib/mediator/archive \
    && chown -R 33:33 /app \
    && chown -R 33:33 /var/lib/mediator

# Switch to non-root user (www-data)
USER 33:33

EXPOSE 8080 8443

ENTRYPOINT ["node", "dist/backend/server.js"]
