# syntax=docker/dockerfile:1

# Stage for installing production dependencies
FROM node:20-bookworm AS deps

WORKDIR /app

# Install build tools required for native dependencies like sqlite3
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Final runtime image
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Ensure TLS dependencies are available in the runtime image
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules and package manifests
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy application source
COPY . .

# Ensure the MCP web-search tool is bundled alongside the API runtime
COPY web-search ./web-search

# Expose the default Fastify port
EXPOSE 3000

CMD ["npm", "start"]
