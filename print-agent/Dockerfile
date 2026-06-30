# syntax=docker/dockerfile:1
# Standalone image for backend/print-agent.ts (docs/PLANNING_multi_instance.md, Component 2).
# Deliberately separate from the main Dockerfile: the agent holds no DB credentials and the
# running container needs only `ws` + the compiled print-agent.js — not chromium, cups-client.ts,
# postgres, or any of the rest of the app's dependency tree. Build context is the repo root
# (needs backend/ + tsconfig.json), but only print-agent/package.json's slim deps ship at runtime.

FROM node:20-bullseye AS builder
WORKDIR /app
# Full root package.json here is build-time only — needed for @types/node, @types/ws etc.
# during tsc; none of it reaches the runtime stage.
COPY package.json package-lock.json tsconfig.json ./
COPY backend ./backend
COPY models ./models
COPY types ./types
RUN npm ci && npx tsc -p tsconfig.json

FROM node:20-bullseye-slim AS runtime
WORKDIR /app
# lp/lpstat CLI only — printing happens against CUPS_HOST over the network, not locally.
RUN apt-get update \
    && apt-get install -y --no-install-recommends cups-client \
    && rm -rf /var/lib/apt/lists/*
COPY print-agent/package.json print-agent/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist/backend/print-agent.js ./dist/backend/print-agent.js
USER node
ENTRYPOINT ["node", "dist/backend/print-agent.js"]
