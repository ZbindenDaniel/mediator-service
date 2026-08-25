# Shopware Integration Runbook

The mediator service integrates with Shopware in two distinct ways:

1. **Read-only product discovery** through the `/api/shopware/search` action. This route proxies queries to Shopware's
   product search endpoint so warehouse staff can look up catalogue entries while editing items locally.
2. **A local sync queue** that records inventory mutations and prepares jobs for eventual dispatch to Shopware. The
   background worker that would send those jobs downstream is intentionally disabled until the HTTP client is implemented.

This document captures the current architecture, required configuration, and operational expectations.

## Components

### Search API (`backend/actions/searchShopware.ts`)

- Validates JSON payloads containing a `query` string and optional `limit` (capped at 25 results).
- Lazily instantiates `ShopwareClient` (`backend/shopware/client.ts`) using the shared `SHOPWARE_CONFIG` settings.
- Wraps outbound requests in `try/catch` blocks and logs structured context for successful and failed calls.
- Returns `{ ok: true, products: [...] }` on success or structured error payloads on failure.

### Sync Queue (`backend/db.ts` & `backend/workers/processShopwareQueue.ts`)

- The Postgres table `shopware_sync_queue` persists pending jobs with correlation IDs, retry counters, timestamps, and the JSON
  payload to send to Shopware. Enqueue is gated on `SHOPWARE_SYNC_ENABLED`.
- Helper functions in `backend/db.ts` provide enqueue (`enqueueShopwareSyncJob`), claim, success, retry, and failure mutations
  with defensive logging.
- `processShopwareQueue` contains the worker logic (retry backoff, result handling, and metrics hooks) but is not wired into the
  server because the queue client currently throws a `ShopwareQueueClientError('dispatchJob not implemented')`.
- This separation lets actions and tests cover queue behaviour without risking network calls.

### Admin connection check (`backend/actions/admin-shopware.ts`)

- `GET /api/admin/shopware/status` — secret-free config summary (`enabled`, `baseUrl`,
  `salesChannelConfigured`, `credentialMode`, `issues[]`, `checkSupported`) plus `shopware_sync_queue`
  depth counts (`getShopwareSyncQueueCounts`). The queue counts are how an operator confirms jobs are
  only accumulating while dispatch remains unimplemented.
- `POST /api/admin/shopware/check` — actively probes the connection via `ShopwareClient.checkConnection()`:
  step 1 fetches an admin OAuth token (`/api/oauth/token`), step 2 runs a store-api search. Returns
  per-step `{ ok, status, durationMs, error }`. A failure at step 1 points at admin credentials/base URL;
  a failure at step 2 points at the sales-channel key.
- Both routes require `Authorization: Bearer <ADMIN_SECRET>`. Surfaced in the SPA by `ShopwareStatusCard`
  on the Admin page.
- **Note:** the probe exercises the read/store-api path only. Both auth modes drive it — a static
  access token (API key) or a client-credentials pair. A config with neither reports `no_credentials`.

## Configuration

All Shopware settings resolve from one place — `backend/config.ts` → `SHOPWARE_CONFIG` — shared by the
search action, the admin surface, and the agentic tool (the former duplicate config in
`backend/agentic/config.ts` was removed).

- Read/search path — populate to enable (blank required fields surface as issues on the admin card):
  - `SHOPWARE_ENABLED=true`
  - `SHOPWARE_BASE_URL=https://…`
  - `SHOPWARE_SALES_CHANNEL_ACCESS_KEY` — the `sw-access-key` (NOT the sales-channel UUID). Legacy
    `SHOPWARE_SALES_CHANNEL_ID` / `SHOPWARE_SALES_CHANNEL` still accepted as deprecated aliases.
  - Auth: **either** `SHOPWARE_ACCESS_TOKEN` (legacy alias `SHOPWARE_API_TOKEN`) **or** both
    `SHOPWARE_CLIENT_ID` + `SHOPWARE_CLIENT_SECRET`. Both modes are fully supported by the client.
  - `SHOPWARE_REQUEST_TIMEOUT_MS` (optional, defaults to 10 s).
- Write path — `SHOPWARE_SYNC_ENABLED` (default false) gates sync-queue enqueue. When false, item
  saves/moves/stock changes enqueue **nothing**; when true they record jobs the (still-unimplemented)
  dispatcher will drain. Removed as dead: `SHOPWARE_API_BASE_URL`, `SHOPWARE_QUEUE_POLL_INTERVAL_MS`,
  and the `SHOPWARE_QUEUE_ENABLED` alias.
- When the dispatcher is implemented, replace the stub in `backend/shopware/queueClient.ts` and start
  the worker in `backend/server.ts` before flipping `SHOPWARE_SYNC_ENABLED=true` in production.

## Operational Notes

- The sync queue is Postgres-backed (`shopware_sync_queue`). Inspect depth via the admin
  `GET /api/admin/shopware/status` card or `listShopwareSyncQueue` / `getShopwareSyncQueueCounts`.
- With `SHOPWARE_SYNC_ENABLED=false` (default) no jobs are enqueued at all; with it true they accumulate
  until the dispatcher ships.
- Tests: `test/shopware-connection-check.test.ts` covers the connection probe (currently jest-ignored
  like the other `shopware-*.test.ts` — harness gap, todo #52).
- The server logs a reminder at startup if `SHOPWARE_SYNC_ENABLED=true` to flag the dormant worker.
- Keep `.env.example` aligned with the variables above so new environments are configured correctly.

## Next Steps Before Enabling Sync

1. Implement an HTTP client in `backend/shopware/queueClient.ts` that authenticates with Shopware and delivers queue payloads.
2. Re-enable the worker loop in `backend/server.ts`, wiring metrics to the production observability stack.
3. Document retry/backoff expectations for operations staff and update this runbook once the dispatcher ships.
