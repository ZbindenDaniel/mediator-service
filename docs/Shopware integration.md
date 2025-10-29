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

- The SQLite table `shopware_sync_queue` persists pending jobs with correlation IDs, retry counters, timestamps, and the JSON
  payload to send to Shopware.
- Helper functions in `backend/db.ts` provide enqueue (`enqueueShopwareSyncJob`), claim, success, retry, and failure mutations
  with defensive logging.
- `processShopwareQueue` contains the worker logic (retry backoff, result handling, and metrics hooks) but is not wired into the
  server because the queue client currently throws a `ShopwareQueueClientError('dispatchJob not implemented')`.
- This separation lets actions and tests cover queue behaviour without risking network calls.

## Configuration

- Populate the following variables to enable search:
  - `SHOPWARE_ENABLED=true`
  - `SHOPWARE_BASE_URL=https://…`
  - `SHOPWARE_CLIENT_ID` / `SHOPWARE_CLIENT_SECRET` **or** `SHOPWARE_ACCESS_TOKEN`
  - `SHOPWARE_SALES_CHANNEL_ID`
  - `SHOPWARE_REQUEST_TIMEOUT_MS` (optional override, defaults to 10 seconds)
- Leave queue-specific flags at their defaults because the worker is inactive:
  - `SHOPWARE_SYNC_ENABLED=false`
  - `SHOPWARE_API_BASE_URL` empty
  - `SHOPWARE_QUEUE_POLL_INTERVAL_MS` (unused while the worker is disabled)
- When the HTTP dispatcher is implemented, remove the guard in `backend/server.ts` and ensure the queue client performs real
  HTTP requests before flipping `SHOPWARE_SYNC_ENABLED=true` in production.

## Operational Notes

- Until dispatch is implemented, queued jobs accumulate safely for inspection via SQLite or helper functions
  (e.g., `listShopwareSyncQueue`).
- Tests under `test/shopware-sync-queue.test.ts` validate enqueue/claim semantics. Run them with `npm test -- shopware`.
- The server logs a reminder at startup if `SHOPWARE_SYNC_ENABLED=true` to prevent accidentally running the dormant worker.
- Keep `.env.example` aligned with the variables above so new environments are configured correctly.

## Next Steps Before Enabling Sync

1. Implement an HTTP client in `backend/shopware/queueClient.ts` that authenticates with Shopware and delivers queue payloads.
2. Re-enable the worker loop in `backend/server.ts`, wiring metrics to the production observability stack.
3. Document retry/backoff expectations for operations staff and update this runbook once the dispatcher ships.
