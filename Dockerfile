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
    HTTP_PORT=8080

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
