# backend/shopware/

## Purpose
Shopware ERP integration — HTTP client for the Shopware API and queue management for product sync dispatch.

## Contents
- `client.ts` — Shopware store-api client: OAuth **or** static-access-token auth, product search, and
  a `checkConnection()` probe (used by the admin connection check). No write/create-update path yet.
- `queueClient.ts` — dispatch-client interface for the sync queue; `dispatchJob()` is still a stub
  (throws `not implemented`) until the Admin-API write client is built.
- `queueTypes.ts` — TypeScript types for queue entries and dispatch results

## Relations
- Used by: `../workers/processShopwareQueue.ts` (queue processing), `../actions/searchShopware.ts` (search proxy), `../agentic/tools/shopware.ts` (LLM tool)
- External: Shopware 6 API (requires `SHOPWARE_*` env vars in `../config.ts`)

## Scope
Shopware-specific HTTP and queue logic only. Item DB persistence belongs in `../db.ts`.

## Decisions
- **Read-only product discovery currently**: the sync queue and dispatch client are built but the write path (publishing items to Shopware) awaits the Admin-API client + field mapping; search proxy is live
- **Single config source**: all Shopware settings resolve from `../config.ts` `SHOPWARE_CONFIG` (shared by the search action, admin surface, and agentic tool) — the former duplicate in `../agentic/config.ts` was removed
- **Two auth modes**: `client.ts` accepts either a static access token (API key) or a client-credentials pair
- **Postgres-backed queue**: allows concurrent safe reads without SQLite lock contention

## See also
- [docs/detailed/Shopware integration.md](../../docs/detailed/Shopware%20integration.md)
