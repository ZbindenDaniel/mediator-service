# backend/workers/

## Purpose
Background job schedulers — long-running tasks that execute on a timer outside the HTTP request cycle.

## Contents
- `processShopwareQueue.ts` — processes the Shopware product sync queue; dispatches pending items to the Shopware API

## Relations
- Started by: `../server.ts` on application startup (conditional on `SHOPWARE_SYNC_ENABLED`)
- Uses: `../shopware/queueClient.ts` (queue reads), `../shopware/client.ts` (Shopware API calls)

## Scope
Scheduler wiring only. Business logic for each job lives in the domain module it calls (`../shopware/`, `../agentic/`).

## Decisions
- **ERP nightly sync is not here**: the nightly ERP sync runs as a cron-style scheduler inside `server.ts` rather than a worker module — it predates this folder and has not been moved
