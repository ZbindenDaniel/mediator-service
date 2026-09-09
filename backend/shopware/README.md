# backend/shopware/

## Purpose
Shopware ERP integration — HTTP client for the Shopware API and queue management for product sync dispatch.

## Contents
- `client.ts` — Shopware **store-api** client (read): OAuth **or** static-access-token auth, product
  search, and a `checkConnection()` probe (used by the admin connection check).
- `adminClient.ts` — Shopware **Admin-API** client (write): resolves a product by `productNumber`,
  creates it if missing (resolved/default tax + currency), sets absolute stock, and reconciles its
  **filterable properties** from the Langtext spec map (`upsertProduct`). Bearer-token auth
  (client-credentials grant preferred; static access token accepted).
- `syncClient.ts` — the queue dispatch client (`dispatchJob`): maps a queue job → DB snapshot →
  `adminClient.upsertProduct`, classifies retryable vs terminal failures, persists the new
  product id back. DB access is injected so it stays unit-testable.
- `queueClient.ts` — shared queue types + error normalizer used by the worker.
- `queueTypes.ts` — TypeScript types for queue entries and dispatch results

## Relations
- Used by: `../workers/processShopwareQueue.ts` (queue processing), `../actions/searchShopware.ts` (search proxy), `../agentic/tools/shopware.ts` (LLM tool)
- External: Shopware 6 API (requires `SHOPWARE_*` env vars in `../config.ts`)

## Scope
Shopware-specific HTTP and queue logic only. Item DB persistence belongs in `../db.ts`.

## Decisions
- **Stock sync is live (P1)**: with `SHOPWARE_SYNC_ENABLED`, the worker publishes each changed item's absolute stock to Shopware, creating the product if missing. Richer product data (custom fields, media, cross-selling) is still to come (P2+)
- **Absolute stock, create-if-missing**: every job type converges to one idempotent op — reload the item, upsert the product by `productNumber = Artikel_Nummer`, set stock = current total quantity. A missed/duplicated job self-heals
- **Single config source**: all Shopware settings resolve from `../config.ts` `SHOPWARE_CONFIG` (shared by the search action, admin surface, and agentic tool) — the former duplicate in `../agentic/config.ts` was removed
- **Two auth modes**: `client.ts` accepts either a static access token (API key) or a client-credentials pair
- **Postgres-backed queue**: allows concurrent safe reads without SQLite lock contention

## See also
- [docs/detailed/Shopware integration.md](../../docs/detailed/Shopware%20integration.md)
