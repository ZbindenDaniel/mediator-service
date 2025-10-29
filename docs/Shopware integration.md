# Shopware Integration Implementation Guide

## Purpose
This document decomposes the work required to integrate the application with Shopware 6 so that item data and stock levels remain synchronized with an external Shopware storefront. It captures architectural considerations, required configuration, API usage, and actionable workstreams that can be tracked as subtasks.

## Background Context
- The backend uses an action-oriented architecture (`backend/actions/*`) where each action wraps database transactions and emits audit events. Inventory mutations flow through helpers defined in `backend/db.ts`.
- Item data lives in the shared models (`models/Item.ts`, `models/ItemRef.ts`, etc.), mixing catalog metadata with stock state. Any Shopware integration must respect these structures to avoid regressions.
- The HTTP server (`backend/server.ts`) composes handlers with shared context objects and already boots long-running workers (e.g., the agentic queue processor). This provides a template for a Shopware worker lifecycle.
- There is legacy/placeholder Shopware logic inside `backend/actions/searchShopware.ts` with TODO markers indicating the need for a full integration.

## Objectives
1. Keep item stock in sync between the local database and Shopware.
2. Support future enhancements such as product creation, price updates, and order imports.
3. Maintain resilience through retries, logging, and feature toggles to support gradual rollout.

## Assumptions & Constraints
- Shopware 6 API endpoints will be used: `/api/_action/sync` for bulk operations, `/api/product` for CRUD, and `/api/search/product` for discovery.
- The integration should be optional via configuration so environments without Shopware credentials remain unaffected.
- Database migrations must avoid downtime and preserve existing inventory data.

## Workstreams & Subtasks

### 1. Configuration Scaffold
- [ ] Extend `backend/config.ts` with typed Shopware settings (base URL, API key/client credentials, sales channel ID, timeouts, enable flag).
- [ ] Update `.env.example` or equivalent and `docs/setup.md` to document the new variables and feature toggle semantics.
- [ ] Inject the configuration into the server context so actions and workers can access it safely.

### 2. Shopware Integration Module
- [ ] Create `backend/shopware/` to house reusable logic.
- [ ] Implement a `ShopwareClient` that handles authentication/token refresh, HTTP requests, retry/backoff, and structured logging. Wrap outbound calls in `try/catch` blocks with meaningful error messages.
- [ ] Define mapper utilities to translate between local `Item`/`ItemRef` structures and Shopware payloads (stock updates, product creation). Ensure data-structure changes are type-safe.
- [ ] Add unit tests covering request signing, retries, and mapping edge cases using mocked HTTP responses.

### 3. Persistence & Queueing
- [ ] Design database schema additions (e.g., `shopware_sync_queue` table) to capture pending sync jobs, last attempt timestamps, retry counters, error payloads, and Shopware identifiers.
- [ ] Update `backend/db.ts` with transactional helpers to enqueue jobs, mark them as processed, and update retry state. Include logging inside these helpers to trace queue state.
- [ ] Introduce nullable Shopware identifier columns on relevant item tables to store product IDs or sales channel mappings. Provide migrations and update models accordingly.
- [ ] Ensure migrations include backward-compatible defaults and roll-forward plans.

### 4. Worker Lifecycle
- [ ] Implement a queue processor (`backend/workers/processShopwareQueue.ts`) that fetches due jobs, calls `ShopwareClient`, and updates job status with retries and exponential backoff.
- [ ] Wire the worker into `backend/server.ts`, respecting the feature flag, and align intervals with existing background tasks.
- [ ] Add observability hooks: structured logs, metrics counters (even if stubbed), and optional tracing so failures are diagnosable.

### 5. Action Hooks & Triggers
- [ ] Identify all actions that mutate inventory (`add-item`, `remove-item`, `save-item`, CSV importer, bulk operations) and add hooks to enqueue corresponding Shopware sync jobs within the existing transaction scope.
- [ ] Confirm that queue writes are atomic with item mutations to prevent desynchronization.
- [ ] Add integration tests to verify that performing an action enqueues the correct Shopware job and that failures are surfaced via logs without breaking user flows.

### 6. Search & Catalog Discovery
- [ ] Replace the TODO stub in `backend/actions/searchShopware.ts` with a fully implemented action that leverages the new `ShopwareClient` to call `/api/search/product`.
- [ ] Normalize search results into existing model shapes and ensure pagination/filters align with frontend expectations.
- [ ] Add tests that mock Shopware responses and validate transformation logic.

### 7. Observability & Error Handling
- [ ] Define consistent logging formats for client calls, queue transitions, and action hooks. Include correlation IDs/job IDs for traceability.
- [ ] Establish error classifications (retryable vs. permanent) and surface them in logs and queue state.
- [ ] Document operational playbooks for monitoring, alerting, and manual retries.

### 8. Rollout Strategy
- [ ] Prepare a staged rollout plan: enable read-only search first, then stock synchronization, and finally write operations.
- [ ] Provide a feature toggle runbook detailing how to enable/disable the integration in each environment.
- [ ] Outline a backfill script/command to bootstrap existing items into Shopware using the queue infrastructure.

## API Usage Details
- **Bulk Sync (`POST /api/_action/sync`)**: Best suited for batching stock updates or metadata changes. Requires payloads with entity definitions and operations.
- **Product CRUD (`GET|POST|PATCH /api/product`)**: Used for creating or updating individual products, especially when mapping new items or editing metadata.
- **Product Search (`POST /api/search/product`)**: Accepts filter criteria for name/number queries, supports pagination. Useful for admin tooling and data verification.

Each endpoint should be accessed via the shared client with retry logic, backoff, and comprehensive error logging.

## Testing Strategy
- Unit tests for the client, mappers, and queue helpers using mocked HTTP and database layers.
- Integration tests covering end-to-end flows: action triggers → queue entries → worker processing (with Shopware responses stubbed).
- Manual smoke tests in a staging environment pointing to a Shopware sandbox, ensuring stock changes propagate correctly.

## Documentation Updates
- Expand `docs/OVERVIEW.md` (and related architecture docs) with the Shopware integration architecture, queue design, and operational guidelines.
- Maintain this document as the master checklist, updating completion status as subtasks are delivered.

## Open Questions
- How will Shopware authentication be handled (API key vs. OAuth)? Decide early to shape client implementation.
- Do we need to sync price lists or only stock initially? Clarify scope with stakeholders.
- Are there rate limits or performance considerations that require batching or throttling?

Addressing these questions should precede implementation to avoid rework.
