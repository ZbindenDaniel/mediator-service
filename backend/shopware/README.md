# backend/shopware/

## Purpose
Shopware ERP integration — HTTP client for the Shopware API and queue management for product sync dispatch.

## Contents
- `client.ts` — Shopware API client: authentication, product search, product create/update
- `queueClient.ts` — reads and writes the Shopware sync queue (Postgres-backed)
- `queueTypes.ts` — TypeScript types for queue entries and dispatch results

## Relations
- Used by: `../workers/processShopwareQueue.ts` (queue processing), `../actions/searchShopware.ts` (search proxy), `../agentic/tools/shopware.ts` (LLM tool)
- External: Shopware 6 API (requires `SHOPWARE_*` env vars in `../config.ts`)

## Scope
Shopware-specific HTTP and queue logic only. Item DB persistence belongs in `../db.ts`.

## Decisions
- **Read-only product discovery currently**: the sync queue and dispatch client are built but the write path (publishing items to Shopware) awaits operator confirmation of field mapping; search proxy is live
- **Postgres-backed queue**: allows concurrent safe reads without SQLite lock contention

## See also
- [docs/detailed/Shopware integration.md](../../docs/detailed/Shopware%20integration.md)
