# Shopware Integration — Audit & Extension Plan

**Status:** Audit / planning (no behaviour changed by this document)
**Date:** 2026-08-20
**Scope:** Current state of the Shopware integration and what it takes to reach the goal:
sync stock, extend Langtext into filterable custom fields, upload docs, sync images,
add quality/CO₂ badges, and cross-link accessories.

---

## TL;DR

- **The read path works.** Product *search* against the Shopware **Store API** is implemented,
  wired to `/api/shopware/search`, used by the agentic enrichment shortcut, and covered by tests.
- **The write path does not exist yet.** Inventory mutations *are* recorded into a Postgres
  `shopware_sync_queue`, but **nothing ever sends them to Shopware**: the worker is not started,
  and even if it were, `queueClient.dispatchJob()` is a stub that throws `not implemented`.
  **No stock, product, field, image, or document has ever been pushed to Shopware.**
- **Only the Store API is implemented.** Everything the goal needs — writing products, custom
  fields, media, documents, cross-selling — requires the **Admin API** (`/api/…`), which is
  entirely unwritten. The `backend/shopware/README.md` claim that the client does "product
  create/update" is **aspirational, not true**.
- **One latent bug to fix regardless of direction:** every `persistItem` enqueues a queue row
  *unconditionally* (no `SHOPWARE_ENABLED`/`SHOPWARE_SYNC_ENABLED` gate), and nothing ever drains
  or trims the table — so `shopware_sync_queue` grows without bound in production today.
- **The data the goal wants already exists** in the mediator model (structured Langtext, quality
  grade, CO₂ score, `item_relations` accessories, images) — the missing piece is a **mapping +
  write layer**, not new capture.
- **One decision blocks everything:** does the mediator push to Shopware **directly**, or does it
  keep pushing to the **kivitendo ERP** (which today owns catalogue + shop images via WebDAV) and
  let the ERP feed Shopware? See [§4](#4-the-decision-that-gates-everything).

---

## 1. What exists today

### 1.1 Read path — product search (working)

| Piece | File | Notes |
|---|---|---|
| HTTP action | `backend/actions/searchShopware.ts` | `POST /api/shopware/search`, validates `{query, limit≤25}`, lazy client, structured errors, `503` when unconfigured. |
| Client #1 | `backend/shopware/client.ts` (`ShopwareClient`) | OAuth (`/api/oauth/token`, client_credentials) + `POST /store-api/search`; normalises product name/number/manufacturer/price/URL/media/dimensions. |
| Client #2 | `backend/agentic/tools/shopware.ts` (`searchShopwareRaw`) | **Near-duplicate** of client #1, used by the agentic flow. Same OAuth + store-api/search, its own token cache. |
| Config | `backend/config.ts` → `SHOPWARE_CONFIG`, `getShopwareConfigIssues()` | `SHOPWARE_ENABLED`, base URL, sales-channel id, credentials, timeout. Validated + logged at startup (`server.ts`). |
| Frontend | `frontend/src/components/admin/SystemStatusCard.tsx` | Read-only "Shopware: aktiv/inaktiv" indicator. No search UI is wired in the SPA. |

### 1.2 Agentic enrichment shortcut (working, read-only)

`backend/agentic/flow/item-flow.ts` calls `searchShopwareRaw()` during a run; if the shop already
has a matching product, `backend/agentic/flow/item-flow-shopware.ts` (`resolveShopwareMatch`) asks
the LLM (prompt `backend/agentic/prompts/shopware-verify.md`) to map that product onto the item's
target schema and short-circuit enrichment. This is a **consumer** of Shopware data, not a writer.

### 1.3 Write path — sync queue (built, but inert)

```
persistItem / bulkMoveItems / bulkRemoveItemStock / bulkUpdateShopStatus
        │  enqueueShopwareSyncJob()   ← this fires today
        ▼
  shopware_sync_queue  (Postgres table, initDb() in backend/db.ts)
        │  claimShopwareSyncJobs()  ←── processShopwareQueue() worker
        ▼                                    │
  ✗ NEVER RUNS                               │ options.client.dispatchJob(descriptor)
  (worker not started in server.ts)          ▼
                                       ✗ throws ShopwareQueueClientError('dispatchJob not implemented')
```

- **Enqueue is live.** Four write points record jobs (`backend/db.ts`):
  `item-upsert` (persistItem, bulk shop-status), `item-move` (bulkMoveItems),
  `stock-decrement` (bulkRemoveItemStock). Payloads are **thin** — just ids/trigger, e.g.
  `{artikelNummer, boxId, itemUUID, trigger}` — so any dispatcher must re-read the item from the DB.
- **Queue mechanics are solid and tested:** correlation ids, `FOR UPDATE SKIP LOCKED` claim,
  exponential-backoff reschedule, permanent-fail, retry counters
  (`test/shopware-sync-queue.test.ts`, `test/shopware-queue-worker.test.ts`).
- **The last mile is a stub.** `backend/shopware/queueClient.ts` `dispatchJob()` unconditionally
  throws. The worker (`backend/workers/processShopwareQueue.ts`) is fully written (batch, retry,
  metrics hooks) but **is not registered in `server.ts`** — `server.ts` only logs a reminder when
  `SHOPWARE_SYNC_ENABLED=true`.

### 1.4 Data model already in place

| Concept | Where | Shopware target |
|---|---|---|
| Shopware product id | `item_refs.ShopwareProductId` | product identity for updates |
| Shopware variant id | `items.ShopwareVariantId` | per-instance variant/stock |
| Structured Langtext | `item_refs.Langtext` = `LangtextPayload` (`Record<string,string\|string[]>`) | **custom fields / properties** |
| Quality grade | `item_refs.Quality` / `items.Quality` + `QualityAssessment` | **badge / custom field** |
| CO₂ score | `contracts/impact/co2.json` (label: irrelevant/low/medium/high) | **badge / custom field** |
| Accessories | `item_relations` (RelationType='Zubehör'), full CRUD exists | **cross-selling / linked products** |
| Images | `item_refs.ImageNames` / `Grafikname`; shop images today go via **ERP WebDAV Shopbilder** (`ERP_WEBDAV_SHOPBILDER_URL`) | **product media (Admin API)** |
| Docs | external-docs system (`backend/lib/external-docs.ts`, media) | **product downloads/media** |

**The capture side is done.** None of the goal's data needs new collection — it needs mapping + writing.

### 1.5 Configuration & tests

- Env (`.env.example`): `SHOPWARE_ENABLED` (search), `SHOPWARE_BASE_URL`, `SHOPWARE_SALES_CHANNEL_ID`,
  `SHOPWARE_CLIENT_ID/SECRET` or `SHOPWARE_ACCESS_TOKEN`, `SHOPWARE_REQUEST_TIMEOUT_MS`;
  and the dormant `SHOPWARE_SYNC_ENABLED`, `SHOPWARE_API_BASE_URL`, `SHOPWARE_QUEUE_POLL_INTERVAL_MS`.
- Tests: `test/shopware-sync-queue.test.ts`, `test/shopware-queue-worker.test.ts`,
  `test/shopware-search-action.test.ts` (~624 lines). They cover queue + search-action behaviour.
  They do **not** cover any real dispatch (there is none) and there is no integration test against Shopware.

> "Untested" is only half right: the queue and search *are* unit-tested. What's untested is the
> part that doesn't exist yet — the actual writing to Shopware.

---

## 2. Gaps & risks (honest assessment)

> **P0 cleanup + P1 stock sync landed (changelog #935–937).** Items 1 and 2 are now resolved — the
> Admin-API write client exists and the worker dispatches absolute-stock upserts (direct-to-Shopware,
> create-if-missing). Items 3, 5, 7 resolved in P0; 4 partially (config unified, product-normaliser
> still duplicated). Item 6 (full mapping layer) is now the P2+ work: custom fields, media, badges,
> cross-links on top of the working stock path.

1. **No write client at all.** Store API (`/store-api`, sales-channel, read) is implemented; the
   **Admin API** (`/api`, OAuth admin scope, read/write) needed for products, custom fields, media,
   documents, cross-selling is **not**. *(open — P1)*
2. **Dispatcher is a stub** (`queueClient.dispatchJob` throws) and the **worker is not started**.
   *(open — P1)*
3. ✅ **~~Unbounded queue growth~~** — fixed (#936): `enqueueShopwareSyncJob` now no-ops unless
   `SHOPWARE_SYNC_ENABLED`. Retention/trim still deferred to the dispatcher.
4. ⚠️ **Duplicated client code** — config unified onto one `SHOPWARE_CONFIG` (#936); the two token
   caches are gone, but `client.ts` and `agentic/tools/shopware.ts` still have separate product
   normalisers. Collapse fully when the write layer lands.
5. ✅ **~~Auth muddle~~** — the client now authenticates with **either** a static access token (API
   key) **or** client credentials, cleanly (#936). Store-api still receives both headers, which is
   harmless; the Admin-API write client (P1) will use the bearer alone.
6. **No mapping layer.** There is no `Item → Shopware product` translator (field names, price/tax,
   variant resolution, custom-field keys). This is the real bulk of the work. *(open — P2+)*
7. ✅ **~~Stale docs~~** — README, runbook, `.env.example`, `setup.md`, `ENVIRONMENT.md` reconciled (#936).

---

## 3. What each goal needs

Assumes the **direct-to-Shopware** direction (see §4). Effort is relative (S/M/L).

### 3.1 Sync stock — the foundation (L)
The prerequisite for everything else. Build the **Admin API write client** + a real `dispatchJob`,
start the worker, and add job handlers:
- OAuth admin token (client_credentials, `/api/oauth/token`) against `SHOPWARE_BASE_URL` — or reuse
  the existing `ShopwareClient` static-access-token path.
- Resolve product/variant by `ShopwareProductId`/`ShopwareVariantId` (or `productNumber` = Artikel_Nummer),
  create if missing (decision: create vs. skip-unknown).
- Job handlers for `stock-decrement`/`item-move`/`item-upsert` → `PATCH /api/product/{id}` (stock,
  `availableStock`). Persist the returned Shopware ids back onto the item/ref.
- Register the worker loop in `server.ts` behind `SHOPWARE_SYNC_ENABLED`; fix the enqueue gate;
  add queue retention + an admin view of failed jobs.

### 3.2 Langtext → filterable custom fields (M)
- Define a **custom field set** in Shopware (one-time, via Admin API or manually) keyed to the
  `LangtextPayload` keys (RAM, storage, CPU, …).
- Mapping: `LangtextPayload` → `product.customFields[...]`. Write during `item-upsert`.
- **Filterable** = surface the fields as **properties** (property group/option) or configure the
  custom fields as filterable in the storefront listing — a Shopware-side config choice we should
  confirm against their catalogue (this is where your Shopware doc would help).

### 3.3 Upload docs (M)
- Reuse `backend/lib/external-docs.ts` to enumerate an item's docs, upload each via Admin API media
  (`/api/_action/media/{id}/upload`) into a folder, associate to the product (media or a downloads
  custom field). Idempotency by filename/hash so re-sync doesn't duplicate.

### 3.4 Sync images (M)
- Today shop images flow through the **ERP WebDAV Shopbilder** path, *not* Shopware. Direct sync =
  upload `ImageNames` via Admin API media + set `product.cover`/media associations, dedup by hash.
- **Decide** whether Shopware images should come from the mediator (this work) or keep flowing
  ERP→Shopware (then this is out of scope). Ties directly to §4.

### 3.5 Quality & CO₂ badges (S–M)
- Data exists (`Quality`, CO₂ label). Emit as custom fields; render as storefront **badges** via a
  small theme/snippet change or a property. Low backend effort; the badge visual is Shopware-side.

### 3.6 Accessory cross-links (M)
- `item_relations` (RelationType='Zubehör') already models this. Map to Shopware **cross-selling**
  (`/api/product-cross-selling`) or linked products, resolving each accessory's `ShopwareProductId`.
  Ordering/second-pass needed because a link requires *both* products to exist in Shopware first.

---

## 4. The decision that gates everything

**Does the mediator talk to Shopware directly, or through the ERP?**

Today the mediator pushes catalogue data (Langtext, images via WebDAV) to **kivitendo ERP**
(`backend/scripts/erp-sync.sh`, nightly sync). If kivitendo already feeds Shopware, then the
"Shopware integration" should arguably be **ERP-mediated**, and the direct-write work in §3 is
partly redundant (especially images §3.4). If Shopware is an **independent channel**, the
direct-write path is correct and the queue was built for exactly this.

- **Direct-to-Shopware** → build §3.1 write client; richest control (custom fields, cross-selling,
  badges) that the ERP/WebDAV path can't express; the existing queue is the right backbone.
- **ERP-mediated** → extend the ERP export/WebDAV mapping instead; retire or repurpose the queue.

Everything downstream (custom fields, images, docs, badges, cross-links) inherits this choice, so
it should be settled **before** implementation starts.

---

## 5. Recommended phased plan (if direct-to-Shopware)

| Phase | Deliverable | Goal items |
|---|---|---|
| **0** ✅ | Enqueue gate fixed; config unified onto one source; API-key auth working; dead vars retired; docs reconciled; admin connection check added (#935–936). | risk cleanup |
| **1** ✅ | Admin-API write client + real dispatch client + worker wired + create-if-missing + **absolute stock sync** end-to-end (#937). *Remaining: queue retention, sales-channel visibility on create, product-normaliser dedup.* | 3.1 |
| **2a** ✅ | Langtext/Spezifikationen → **filterable properties** (property groups + options), not custom fields — native storefront filters (#938). *Remaining (2b): contract-driven curation of which keys are filterable + display labels/units.* | 3.2 |
| **2c** ✅ | **Variants**: ref → parent product, distinct InstanceSpecs combos → variant children (configurator + child products, per-variant stock, `ShopwareVariantId` persisted) (#941). *Validate configurator/child-option write on a live shop.* | variants |
| **2d** | Quality/CO₂ → badges (custom field or property) | 3.5 |
| **3** | Media: **images** ✅ (binary upload + cover, #943) — docs still pending a decision (see changelog options) | 3.3, 3.4 |
| **4** | Accessory cross-selling (two-pass) + filterable-property config | 3.6, filter part of 3.2 |

Each phase is shippable and testable behind `SHOPWARE_SYNC_ENABLED` in staging before prod.

---

## 6. Open questions (need your input)

1. **Direction:** direct-to-Shopware, or ERP-mediated? (§4 — blocks everything.)
2. **Shopware version & API:** Shopware 6? Admin API reachable from the mediator host? Admin
   integration credentials (client id/secret with write scope) available?
3. **Product identity:** is `Artikel_Nummer` the Shopware `productNumber`? Should unknown items be
   **created** in Shopware or only **updated** if they already exist?
4. **Custom fields:** may we create a custom field set, or must we map onto existing fields/properties?
   Which Langtext keys must be **filterable**?
5. **Images:** keep the ERP→WebDAV image path, or move image publishing to the mediator?
6. **Stock semantics:** push absolute `availableStock`, or deltas? Per-variant (`ShopwareVariantId`)
   or per-product?

**Yes — please share the Shopware docs**, especially: the Admin API custom-field/property model,
media upload/association, cross-selling, and how your storefront exposes filters. Items 3–5 above
are the ones the docs would let me pin down precisely.

---

### Appendix — key files

- `backend/actions/searchShopware.ts` · `backend/shopware/{client,queueClient,queueTypes}.ts`
- `backend/workers/processShopwareQueue.ts` · `backend/server.ts` (worker gate ~L594)
- `backend/db.ts` (queue helpers ~L2588+, enqueue call sites ~L1041/1427/1468/1508, schema ~L215)
- `backend/agentic/tools/shopware.ts` · `backend/agentic/flow/item-flow-shopware.ts` · `backend/agentic/prompts/shopware-verify.md`
- `backend/config.ts` (~L249, L515–638) · `.env.example` (L204–223)
- `docs/detailed/Shopware integration.md` · `docs/detailed/nightly-erp-sync.md`
