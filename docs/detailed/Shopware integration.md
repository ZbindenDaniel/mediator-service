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
- **Shop-eligibility gate.** The snapshot computes `shopEligible = Shopartikel=1 AND agentically approved`
  (same approval as the ERP export gate). An **ineligible** item is never published: `upsertProduct`
  **deactivates** it (`active:false`) if it already exists in Shopware, else **skips** it. So unreviewed /
  non-shop items never go (or stay) live. `Veröffentlicht_Status='yes'` maps to Shopware `active`.
- Dispatch (`backend/shopware/syncClient.ts`) resolves the job to a DB snapshot
  (`getShopwareSyncSnapshotForPayload` → productNumber, name, description, price, **summed stock**, active,
  shopEligible, parsed Langtext), then calls `ShopwareAdminClient.upsertProduct` (`adminClient.ts`): match by
  `productNumber`; write **full data** (name, description, price [net from tax, sales-channel currency],
  active, stock) on both **update** and **create** — not stock alone. Create also sets a sales-channel
  **visibility** (`visibility:30`) so a published+active product actually appears in the storefront, and
  persists the new `ShopwareProductId` back. Absolute-stock ⇒ a missed/duplicated job self-heals.
- **Properties (P2a):** after stock, `syncProductProperties` turns each structured Langtext entry
  (group name → value(s)) into Shopware **filterable properties** — `ensurePropertyGroup`
  (`filterable:true`) + `ensurePropertyOption` (both cached), then reconciles the product's option
  associations to exactly the desired set (PATCH full list + 404-tolerant DELETE of stale links). Array
  values become multiple options. Property failures share the retry classification; stock is written
  first so it never depends on properties succeeding.
- **Images (P3).** `syncProductImages` (on the parent, after properties) uploads each of the ref's images
  as **binary** to Shopware — resolved from `Grafikname` (cover) + `ImageNames` via `lib/shopware-media.ts`
  (on-disk files under the media root, folder = 6-digit Artikel_Nummer). `ensureMedia` searches `media` by a
  deterministic fileName (reuse) else creates the entity **in the Product Media default folder**
  (`mediaFolderId` resolved once via `/api/search/media-folder` on `defaultFolder.entity=product`, cached) so
  Shopware generates thumbnails and the preview renders — then uploads (`POST /api/_action/media/{id}/upload`,
  raw bytes); the product's `media` list is PATCHed with `coverId` = the first image. Variant children inherit parent media.
- **Variants (P2c).** Each instance carries its `ItemUUID` as a variant axis, so **one variant = one physical
  instance** (the UUID makes every signature unique — instances never merge). When a ref has **≥2 instances** the
  product becomes a **variant parent**: `db.buildVariantGroups` builds one group per instance with options =
  InstanceSpecs axes + `Zustand` (quality) + `itemUUID`; `adminClient.syncVariants` resolves each group's option
  values to property options (P2a machinery), PATCHes the parent's `configuratorSettings` with the axis
  options (it first searches `product-configurator-setting` and **reuses each option's existing setting id** so
  the PATCH updates in place — a new id for an option that already has a row would INSERT and violate
  `uniq.product_configurator_setting`; only genuinely-new options get a deterministic `sha1(parentId:optionId)` id,
  and stale axes are deleted 404-tolerantly), and upserts one
  **child product** per instance (`productNumber = parent.<sha1(sig)>`, `parentId` + `options` + the instance's
  stock, inheriting price/tax/visibility from the parent). Existing children get stock/active updated; an instance
  that no longer exists is retired (`active:false, stock:0`). Each instance's `ShopwareVariantId` is persisted.
  A single-instance ref → the single-product path (summed stock on the ref product). The operator switches the
  storefront configurator on `itemUUID` and groups the spec axes as descriptive (they aren't customer-configurable).
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
- With `SHOPWARE_SYNC_ENABLED=false` (default) no jobs are enqueued at all; with it true they are enqueued
  and the worker dispatches them (`[server] Shopware sync worker started` at boot).
- Tests: `test/shopware-connection-check.test.ts` (connection probe) and `test/shopware-admin-sync.test.ts`
  (write client + property sync + dispatch), both jest-ignored like the other `shopware-*.test.ts` (harness
  gap, todo #52); logic verified via injected-fetch mocks.
- Keep `.env.example` aligned with the variables above so new environments are configured correctly.

## Enabling stock sync

1. Create a Shopware **integration** (Settings → System → Integrations) with write access; put its id/secret in
   `SHOPWARE_CLIENT_ID` / `SHOPWARE_CLIENT_SECRET` (or set `SHOPWARE_ACCESS_TOKEN`). Admin writes use the bearer
   token, not the sales-channel access key.
2. Confirm the connection card is green, then set `SHOPWARE_SYNC_ENABLED=true` and restart. The worker logs
   `[server] Shopware sync worker started`.
3. Watch the queue drain on the admin card (queued → succeeded). Optionally pin `SHOPWARE_DEFAULT_TAX_ID` /
   `SHOPWARE_DEFAULT_CURRENCY_ID` if runtime resolution picks the wrong ones.

## Reverse sync — getting stock changes back (design, not yet built)

The mediator → Shopware path is outbound only. When an order is placed in Shopware, the sold unit
must be booked out of mediator stock. Options:

- **Recommended: `checkout.order.placed` webhook.** Register a Shopware webhook (Admin API
  `/api/webhook`) pointing at a mediator endpoint. On each order, read the line items' product/variant
  ids → map to the mediator instance(s) via `items.ShopwareVariantId` (a variant = a spec/quality combo;
  decrement one matching instance's `Auf_Lager` per ordered qty) → book out stock. Needs a
  publicly-reachable endpoint + webhook signature verification.
- **Poll fallback.** Periodically query the Admin API for orders since a cursor (or per-product
  `availableStock`) and reconcile decreases. No inbound endpoint required; higher latency.

Open questions: which mediator instance to book out when a variant groups several (FIFO by entry date?),
how to reflect Shopware-side stock corrections, and whether to also pull order metadata (buyer, order id)
onto the item. Recommendation: start with the webhook + a simple "decrement one instance of the ordered
variant" rule, behind a flag.

## Deferred (next phases)

- **Queue retention/trim** — succeeded rows are not yet pruned.
- **Property curation** — today *all* structured Langtext keys become filterable properties; using the spec
  contracts to pick which are filterable / rename display labels / add units is a follow-up (P2b).
- **Richer product data** — media (images/docs), quality/CO₂ badges, accessory
  cross-selling (P2–P4). Today the worker syncs stock (+ minimal create), not full catalogue data.
- **Created products are not made visible** in a sales channel (no `visibilities` on create) — operators
  publish via the existing shop flow; auto-visibility is a follow-up.
- **No max-retry ceiling** on transient failures — a job retries with backoff until Shopware recovers.
