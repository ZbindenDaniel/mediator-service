# Shopware Integration Runbook

The mediator service integrates with Shopware in two distinct ways:

1. **Read-only product discovery** through the `/api/shopware/search` action. This route proxies queries to Shopware's
   product search endpoint so warehouse staff can look up catalogue entries while editing items locally.
2. **Stock sync** — inventory mutations enqueue jobs that a background worker dispatches to Shopware's Admin API
   (create-if-missing product, then set absolute stock). Gated on `SHOPWARE_SYNC_ENABLED` (default off).

This document captures the current architecture, required configuration, and operational expectations.

## Components

### Search API (`backend/actions/searchShopware.ts`)

- Validates JSON payloads containing a `query` string and optional `limit` (capped at 25 results).
- Lazily instantiates `ShopwareClient` (`backend/shopware/client.ts`) using the shared `SHOPWARE_CONFIG` settings.
- Wraps outbound requests in `try/catch` blocks and logs structured context for successful and failed calls.
- Returns `{ ok: true, products: [...] }` on success or structured error payloads on failure.

### Stock sync (queue + worker + Admin-API write client) — **live**

- The Postgres table `shopware_sync_queue` persists pending jobs (correlation id, retry counters, JSON payload).
  Enqueue is gated on `SHOPWARE_SYNC_ENABLED`; item saves/moves/stock changes enqueue `item-upsert` /
  `item-move` / `stock-decrement` jobs (thin payloads — just ids).
- `processShopwareQueue` (worker) claims a batch (`FOR UPDATE SKIP LOCKED`), dispatches each job, and records
  success / retry-with-backoff / terminal failure. It is started from `backend/server.ts` on a 10s interval
  (reentrancy-guarded) whenever `SHOPWARE_SYNC_ENABLED` and the config is ready.
- Dispatch (`backend/shopware/syncClient.ts`) resolves the job to a DB snapshot
  (`getShopwareSyncSnapshotForPayload` → `productNumber`, name, price, **summed stock**), then calls
  `ShopwareAdminClient.upsertProductStock` (`backend/shopware/adminClient.ts`): match by `productNumber`,
  `PATCH` absolute `stock` if it exists, else **create** the product (name, number, price, resolved tax +
  currency) and persist the new `ShopwareProductId` back. Absolute-stock ⇒ a missed/duplicated job self-heals.
- Failure classification: 4xx (except 408/429) is terminal; network / 408 / 429 / 5xx retry with exponential
  backoff. A deleted reference (no snapshot) drains as success.

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

## Enabling stock sync

1. Create a Shopware **integration** (Settings → System → Integrations) with write access; put its id/secret in
   `SHOPWARE_CLIENT_ID` / `SHOPWARE_CLIENT_SECRET` (or set `SHOPWARE_ACCESS_TOKEN`). Admin writes use the bearer
   token, not the sales-channel access key.
2. Confirm the connection card is green, then set `SHOPWARE_SYNC_ENABLED=true` and restart. The worker logs
   `[server] Shopware sync worker started`.
3. Watch the queue drain on the admin card (queued → succeeded). Optionally pin `SHOPWARE_DEFAULT_TAX_ID` /
   `SHOPWARE_DEFAULT_CURRENCY_ID` if runtime resolution picks the wrong ones.

## Deferred (next phases)

- **Queue retention/trim** — succeeded rows are not yet pruned.
- **Richer product data** — custom fields (Langtext), media (images/docs), quality/CO₂ badges, accessory
  cross-selling (P2–P4). Today the worker syncs stock (+ minimal create), not full catalogue data.
- **Created products are not made visible** in a sales channel (no `visibilities` on create) — operators
  publish via the existing shop flow; auto-visibility is a follow-up.
- **No max-retry ceiling** on transient failures — a job retries with backoff until Shopware recovers.
