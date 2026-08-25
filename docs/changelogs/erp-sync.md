# Changelog: ERP Sync & Import/Export

Covers: ERP import/export, CSV ingestion, Langtext formatting, nightly sync scheduler, Shopware integration, export regimes.

---

## 935. ✅ Admin Shopware connection check + status/queue card
**Why:** "Double down on Shopware" needs a way to confirm the service can actually reach a Shopware instance before any write work — and the first natural piece of the admin surface the plan calls for. Two admin endpoints (both `ADMIN_SECRET`-gated, matching `admin-nightly-erp-sync`): `GET /api/admin/shopware/status` returns a **secret-free** config summary (`enabled`, `baseUrl`, `salesChannelConfigured`, `credentialMode`, `requestTimeoutMs`, `issues[]`, `checkSupported`) plus `shopware_sync_queue` depth counts via the new `getShopwareSyncQueueCounts()`; `POST /api/admin/shopware/check` runs `ShopwareClient.checkConnection()`, which probes the exact two auth surfaces the read path uses — admin OAuth token (`/api/oauth/token`) then store-api search — and returns per-step `{ok,status,durationMs,error}` so a failure is attributable to admin credentials vs. sales-channel key vs. reachability. Frontend `ShopwareStatusCard` renders both on the Admin page; its queue panel doubles as the "watch jobs accumulate" inspector that makes the still-missing dispatcher visible. The check deliberately surfaces a config truth found during the audit: the search client (`shopware/client.ts`) authenticates only with client credentials and never uses `SHOPWARE_ACCESS_TOKEN`, so an access-token-only config reports `access_token_unsupported` rather than silently failing. Logic verified via injected-fetch mock (9/9 assertions across happy path, 401 admin-auth, 412 sales-channel-key).
**Deferred:** The check exercises the **read**/store-api path only — there is no Admin-API *write* probe yet (nothing to write against until the P1 write client lands). Test `test/shopware-connection-check.test.ts` is in-repo but jest-ignored like every other `shopware-*.test.ts` (local esbuild harness can't resolve the client module graph — todo #52); it runs once that gap closes. Config/env cleanup (two overlapping config systems, dead `SHOPWARE_API_BASE_URL`/`SHOPWARE_QUEUE_POLL_INTERVAL_MS`, `SALES_CHANNEL` vs `SALES_CHANNEL_ID` aliasing, the dead access-token path) is scoped but **not** done here — it removes/renames env vars and needs operator sign-off first.

## 934. ✅ Shopware integration audit + extension plan (no behaviour change)
**Why:** Before committing to "double down on Shopware" (sync stock, then extend to custom fields, docs, images, quality/CO₂ badges, accessory cross-links), the actual state needed characterizing rather than assuming. Findings, captured in `docs/PLANNING_shopware_integration.md` (and a shareable HTML artifact): the **read** path is real and unit-tested — Store-API product search at `POST /api/shopware/search` (`actions/searchShopware.ts` + `shopware/client.ts`) plus a near-duplicate client in `agentic/tools/shopware.ts` powering the agentic enrichment shortcut (`item-flow-shopware.ts`). The **write** path is built but has never executed: the four enqueue sites (`persistItem`, `bulkMoveItems`, `bulkRemoveItemStock`, `bulkUpdateShopStatus`) record jobs into `shopware_sync_queue`, but `queueClient.dispatchJob()` throws `not implemented` and `processShopwareQueue` is never registered in `server.ts`. Only the Store API exists; every stated goal requires the **Admin API** (products/custom-fields/media/cross-selling) which is entirely unwritten, plus an `Item → Shopware product` mapping layer. Also surfaced: (a) a latent prod bug — `enqueueShopwareSyncJob` runs on every `persistItem` with no `SHOPWARE_*` gate and nothing drains/trims the table, so it grows unbounded; (b) duplicated client code with two token caches; (c) an auth muddle (admin OAuth token sent to the store-api alongside `sw-access-key`); (d) stale docs (README claims product create/update the client can't do; runbook still says "SQLite"). The report frames the one decision that gates all downstream work — **direct-to-Shopware vs. ERP-mediated**, since catalogue data and images already flow mediator→kivitendo→WebDAV today — and proposes a P0–P4 phasing (cleanup → stock sync → fields/badges → media → cross-links).
**Deferred:** Everything — this is analysis only, no code changed. Awaiting the direction decision and answers on Shopware version/Admin-API reachability, product identity (`Artikel_Nummer` = `productNumber`?), custom-field creation rights, and image ownership before implementation starts.

## 931. ✅ Admin "Backup" made a complete, restorable, env-independent snapshot
**Why:** The admin "Backup" button was underdefined and could not actually restore current state. It routed to `GET /api/export/items?mode=backup`, which has two disqualifying properties for a backup: (1) it emits **only** `items.csv` + `boxes.csv` — agentic runs and the event log are absent — and (2) its Langtext serialization went through `resolveLangtextExportFormat`, which honored `LANGTEXT_EXPORT_FORMAT` **first**. When that env var was set to `html` (its whole purpose is the ERP boundary, changelog #830), even a *backup* serialized Langtext as an HTML `<table>` and wrapped Kurzbeschreibung in `<p>…</p>` — HTML in CSV cells that the importer cannot parse back, so the "backup" was not restorable. The operator's requirement: a backup must be a full CSV archive (restorable via the existing `/api/import` ZIP path, which already ingests `items/boxes/agentic_runs/events`), with Langtext as JSON and every other cell plain text, regardless of env config.

Changes:
- **Backend `export-items.ts`:** `resolveLangtextExportFormat` now returns `'json'` for every non-ERP mode **unconditionally** — the `LANGTEXT_EXPORT_FORMAT` override is confined to `erp` mode (default `html`). This makes backup cells deterministic (JSON Langtext; the HTML Kurzbeschreibung path is gated on `format==='html'` and therefore never fires for a backup).
- **Frontend `ExportCard.tsx`:** the "Backup" button routes to `/api/export/data?format=zip&mode=backup&entities=items,boxes,agentic,events` — the only multi-entity export — producing one ZIP with all four CSVs the importer ingests. The ERP/partner modes (`erp`, `manual_import`, `automatic_import`) stay on `/api/export/items`.
- **Backend `export-data.ts` (latent bugs fixed while wiring backup through it):** the boxes, agentic, and events queries used **unquoted CamelCase identifiers** (`SELECT Id, Artikel_Nummer, …`) against columns defined as case-sensitive quoted CamelCase, so Postgres folded them to lowercase and every one of these three queries threw at runtime — this endpoint had never actually produced boxes/agentic/events output. Quoted all identifiers. Added `"LastSearchLinksJson"` to the agentic SELECT/columns (the importer's `ingestAgenticRunsCsv` reads it, so a backup must carry it or stored search evidence is lost on restore). Made backup **uncapped** — the 500-row (`MAX 5000`) `LIMIT` on agentic/events would silently truncate a real backup; it now applies only to non-backup callers.

**Deferred:** No JSON restore importer — restore stays CSV/ZIP-based per the operator's decision that a backup "should be CSV", so the backup is a ZIP-of-CSVs rather than a single JSON file. The `manual_import`/`automatic_import` buttons remain distinct UI entries even though internally `manual_import`≡`backup` and `automatic_import`≡`erp` (only two real regimes); collapsing/relabeling that UI is a follow-up, not done here. `/api/export/data` remains unauthenticated (same as `/api/export/items`); gate under the Authentik/role model (todo 33c) if backups should be access-controlled.

## 927. ✅ Admin Datenexport was completely non-functional (missing `actor` param)
**Why:** The admin `ExportCard` ("Datenexport": Backup / ERP-Export / Manuelle Übernahme / Automatischer Import) called `GET /api/export/items?mode=<mode>` **without the `actor` query param**. The endpoint hard-requires it — it logs an `Exported` event per item and returns `400 { error: 'actor is required' }` when it's absent — so every request 400'd. The card's `if (!res.ok) throw` funneled that straight into a `catch` that only called `logError`, so the button spun ("Wird exportiert…") and then silently returned with no download and no visible error: the whole export section looked dead. Fix keeps the endpoint contract unchanged (it must attribute the export) and repairs the caller: `handleExport` now resolves the operator via `ensureUser()` (same username source the other admin cards read), refuses with an inline message if none is set, appends `&actor=<actor>` (both params `encodeURIComponent`-escaped), and renders a red `alert-error` on failure instead of swallowing it. No backend change — the export handler, ERP approval gate (#879), and zip staging were already correct.
**Deferred:** `/api/export/items` stays unauthenticated (not under `/api/admin/*`, so `ADMIN_SECRET` doesn't gate it) — unchanged here; wire it into the forthcoming Authentik/role model (todo 33c) if downloads should be access-controlled. `export-data`/`sync-erp` callers already pass `actor`; only the admin export card was affected.


**Why:** `backend/scripts/erp-sync.sh` hardcoded the live kivitendo login, password, client id, controller URL, and WebDAV shopbilder URL — so a sync ran with baked-in production credentials even when the operator had configured none, and the secrets were committed to the repo. The script now reads `ERP_IMPORT_USERNAME`/`ERP_IMPORT_PASSWORD`/`ERP_IMPORT_URL`/`ERP_IMPORT_CLIENT_ID`/`ERP_WEBDAV_SHOPBILDER_URL` from the environment (these config vars existed and were documented but had no consumer). `sync-erp.ts` injects the normalized config values into the script's child env and adds an API-level preflight: `/api/sync/erp` returns `503 credentials_missing` when login/password/URL are unset, instead of spawning an unauthenticated import. The shell script keeps a defense-in-depth guard that exits non-zero with the same message. Added `ERP_WEBDAV_SHOPBILDER_URL` config (the media-mirror endpoint); it's optional and the mirror stage still skips gracefully when unset. Also corrected docs that overstated `ERP_SYNC_ENABLED` as a "master ERP switch" — it only gates the nightly automated tick; manual sync/exports ignore it.
**Deferred:** The leaked password remains in git history and **must be rotated on the ERP side** — removing it from the working tree does not purge history (tracked in todo). `profile.id=2183` and other kivitendo import settings in the script stay hardcoded (not secrets, out of scope). The dead browser-parity ERP importer config (`ERP_IMPORT_FORM_*`, polling, mappings) was left untouched.

## 879. ✅ Gate ERP export/sync to approved items only (configurable)
**Why:** Exporting unreviewed AI-generated items to the live ERP/shop was too dangerous — previously the ERP export only forced `Veröffentlicht_Status=0` for non-approved items but still shipped the full row. Now unapproved items are dropped entirely from every ERP export path. The approval check (`ReviewState==='approved'`, with legacy `Status==='approved'` fallback) was extracted into a shared `resolveAgenticApproval()` helper reused by both the published-status gate and the new `filterErpItemsByApproval()`. The filter is applied as a single choke point inside `stageItemsExport` for `erp` mode (covers `/api/sync/erp`, `/api/export/items?mode=erp`, `/api/export/data?mode=erp`), and additionally early in `sync-erp` before media-scope resolution and `markRefsSynced` so those side effects only cover items that will actually be exported. `sync-erp` returns `422` when nothing approved remains. Gated behind `ERP_SYNC_REQUIRE_APPROVAL` (default `true`); set `false` for controlled backfills. Filtering is fail-closed — an item whose approval can't be evaluated is excluded. Backup-mode exports are intentionally unaffected (a backup must contain everything).
**Deferred:** The `/api/export/items?mode=erp` GET handler still logs a per-item `Exported` event for every fetched row before `stageItemsExport` filters unapproved ones, so suppressed items can appear in the export event log even though they're absent from the CSV; not corrected because it doesn't affect exported data. Nightly-sync approval behavior is inherited (it calls `/api/sync/erp`); no separate nightly gate added.

## 866. ✅ Fix reference-only items missing LastSyncedAt in item list query
**Why:** `listItemReferencesWithFilters()` (used for box-less/instance-less ref rows) omitted `r."LastSyncedAt"` from its SELECT, while `itemSelectColumns()` (used for instance-backed items) already included it. The frontend's "Zuletzt synchronisiert" sort/column reads `representative?.LastSyncedAt` regardless of row type, so reference-only rows always rendered blank even when manually ERP-synced. Added the missing column to the SELECT list to match the instance query's projection.
**Deferred:** Nothing — frontend already handled the field correctly once present in the API response.

## 830. ✅ Restore ERP Langtext export format to HTML; wire LANGTEXT_EXPORT_FORMAT env var
   - **Why:** Commit e3a84c2 introduced `resolveLangtextExportFormat` and changed ERP format from HTML to markdown without confirming with the downstream importer. The ERP had been receiving HTML for months and broke silently. Restored `'html'` as the default for erp mode. Also wired `LANGTEXT_EXPORT_FORMAT` env var (documented in `.env.example` but never read) so operators can override format without a code change.
   - **Deferred:** Nothing.

## 820. ✅ Fix `ctx.listItemsForExport is not a function` in kivi-sync / export actions
   - **Why:** `listItemsForExport` in `backend/db.ts` was accidentally structured as `{ async all(filters) }` instead of a plain async function, breaking all three call sites (`sync-erp`, `export-items`, `export-data`) which call it as `ctx.listItemsForExport({...})`. Converted to a plain `export async function` matching every other `list*` helper; `ActionContext` type picks up the change via `typeof` automatically.
   - **Deferred:** Nothing.

## 69. ✅ Fix four `export-items` serialization bugs: `Auf_Lager` header had underscore instead of space; published gate used `||` (published OR approved) instead of `&&` (both required); ERP Langtext format was `html` but tests require `markdown`; Langtext quality enrichment was commented out.
   - **Why:** The `||` gate was wrong — it would export items as published if they had agentic approval even when `Veröffentlicht_Status` was false, and vice versa. The test spec requires both flags. The ERP `markdown` format aligns with the `TODO` comment ("ERP markdown Langtext output") that predated the HTML change. Quality enrichment re-enabled as tests explicitly assert `Qualität`/quality label presence in serialized output.
   - **Deferred:** Nothing deferred.

## 26. ✅ Make export publication gating deterministic by using canonical `AgenticReviewState==='approved'` semantics with guarded status fallback (`AgenticStatus==='approved'`), enriched suppression telemetry (`agenticStatus`, `agenticReviewState`, `itemUUID`), try/catch fallback logging, and focused tests for approved/non-approved/status-only cases.

## 25. ✅ Fix export projection parity by joining `agentic_runs` in export item queries, selecting `AgenticStatus`/`AgenticReviewState` defaults, adding export diagnostics when metadata is absent, and covering the projection with a focused DB export test.

## 25. ✅ Fix `backend/actions/export-items.ts` published flag normalization by replacing truthy coercion with explicit true/false token handling (`1/true/yes/ja` vs `0/false/no/nein/empty`), keep CSV `0/1` output semantics stable, add unknown-value warning telemetry, and extend export action tests for `'0'/'false'/'1'/'true'` handling.

## 25. ✅ Preserve source `UpdatedAt` chronology during `/api/import/item`: parse optional payload timestamps with guarded fallback logging, keep shared persistence path via `data.UpdatedAt`, add import-action tests for valid/invalid timestamp handling, and annotate DB upsert semantics near `UpdatedAt=excluded.UpdatedAt`.

## 24. ✅ Refine `backend/importer.ts` UUID source resolution to keep CSV `itemUUID` precedence, guard Artikel-Nummer fallback behind missing UUID checks, add structured UUID-source telemetry (including fallback lookup errors), and verify persisted `Item.ItemUUID` stays aligned with the selected source.

## 23. ✅ Improve `backend/importer.ts` persistence observability with explicit reference-skip and per-instance decision logs (`rowNumber`, `artikelNummer`, `itemUUID`, `refAction`, `instanceAction`) while keeping item/ref payload contracts unchanged.

## 22. ✅ Align `backend/actions/import-item.ts` deterministic import identity behavior: accept caller-provided `ItemUUID` + `Artikel_Nummer` for new imports, reject UUID conflicts with explicit 409 logs, remove dead update-path branching, and add focused import action tests for accepted/conflict/minted flows.

## 26. ✅ Add focused importer coverage for duplicate Artikel-Nummer CSV rows with distinct ItemUUID persistence checks (instance count + exact UUID set + single item_refs row), plus a companion missing-ItemUUID fallback/mint regression test using existing DB harness patterns.

## 17. ✅ Add strict archive import identifier semantics in `backend/importer.ts`: reject rows missing/invalid `Artikel-Nummer` or `itemUUID`, disable identifier minting in strict mode (including split rows), and emit structured row-failure telemetry (`rowNumber`, `artikelNummer`, `itemUUID`, `failureCode`).

## 16. ✅ Refactor `backend/actions/csv-import.ts` archive stage flow to enforce deterministic execution order (`ingestBoxesCsv` -> `ingestCsvFile` -> `ingestAgenticRunsCsv` -> `ingestEventsCsv`) across duplicate/non-item branches with stage-level try/catch telemetry and partial-failure response summaries.

## 15. ✅ Preserve incoming `BoxID` values during CSV ingestion (no remint), add strict shelf/non-shelf format validation with structured skip logging, and keep box/item persistence flow unchanged for valid rows.

## 14. ✅ Preserve duplicate-import reliability by deferring `agentic_runs.csv` in duplicate item uploads (instead of immediate ingestion), with structured action telemetry and additive response flags for operator visibility.

## 14. ✅ Add explicit ERP media mirror destination config (`ERP_MEDIA_MIRROR_DIR`) with path validation + runtime logging, and consume it in sync orchestration instead of hardcoded mirror destination assumptions.

## 13. ✅ Make `agentic_runs.csv` imports deterministic by skipping known `item_refs` FK-mismatch rows with structured skip telemetry (`rowNumber`, `artikelNummer`, reason) and explicit skipped-count reporting.

## 12. ✅ Replace `backend/actions/sync-erp.ts` with a minimal flow: request parsing (`itemIds`), CSV staging, `backend/scripts/erp-sync.sh` execution, structured JSON response handling, and guaranteed staging cleanup telemetry.

## 11. ✅ Force ERP sync export staging to explicit `automatic_import` regime, add start telemetry (`exportRegime`, CSV path/name, profile identifiers), and emit structured `phase: export-stage` errors when staging fails.

## 10. ✅ Split export header contracts by import regime: keep `manual_import` legacy labels/order, add dedicated ERP-compatible `automatic_import` labels/order, and enforce CSV header/row field-count parity with fail-fast logging.

## 9. ✅ Extend export mode handling to support import-specific mode identifiers (`manual_import`/`automatic_import`) while reusing existing backup/erp serialization paths and adding structured mode/header logging.

## 7. ✅ Extend ERP identifier extraction for script payload encodings (URL-encoded + HTML-escaped query strings) with source/pattern evidence logging to support continuation URL reconstruction when only `job` is recoverable.

## 5. ✅ Add explicit browser-parity mapping emission (`mappings[+].from` / `mappings[].to`) based on captured HAR payloads.

## 3. ✅ Re-validate parser and completion criteria with deterministic logs and minimal branching.

## 2. ✅ Align browser-parity action contract for preview/import (`CsvImport/test` + `CsvImport/import`) and remove legacy action flag emission in browser-parity mode.

## 1. ✅ Remove non-essential import continuation fallback probe logic that has not been proven against browser request captures.

## 1. ✅ Add explicit ERP sync media mirroring flow telemetry: pre-run expectation logging in `/api/sync/erp`, script-level media copy execution/skipping markers, and fail-fast propagation when mirroring is expected but copy fails.

## (pre-numbered) ✅ ERP readiness parser now treats HAR-observed `CsvImport/report` headings `Import-Vorschau` and `Import-Ergebnis` as terminal ready markers with explicit evidence flags in logs.

## (pre-numbered) ✅ Default ERP import runtime now expects `polling-enabled` mode with `browser-parity` contract and logs both flags at import start to surface misconfiguration early.

## (pre-numbered) ✅ ERP CSV HTML formatting refinement: `Langtext` HTML export now renders as a table and `Kurzbeschreibung` is wrapped in `<p>` for future styling hooks.

## (pre-numbered) ✅ ERP browser-parity mapping emission now supports ordered config parsing (JSON array or newline `from=to` pairs) with strict validation (`from`/`to`) and per-phase mapping telemetry logs (`mappingCount`, `mappingValidationPassed`, `mappingsInjected`).

## (pre-numbered) ✅ ERP test-phase continuation fallback now proceeds to import when state remains `processing`, with structured diagnostics and explicit fallback error context.

## (pre-numbered) ✅ ERP browser-parity import contract now requires explicit `profile.id` + `tmp_profile_id` configuration and rejects empty/default placeholder values before curl execution.

## (pre-numbered) ✅ Export items action now accepts `manual_import`/`automatic_import` aliases, maps them onto existing backup/erp export logic, and logs mode/header regime metadata in one structured entry.

## (pre-numbered) ✅ CSV item serialization now emits dedicated key-based `automatic_import` headers/order (ERP contract), preserves legacy `manual_import` headers/order, logs selected contract + first three headers, and fails fast on header/data count mismatches.

## - 56. ✅ Update detailed docs for operator reliability contracts: restart preservation/replacement truth table (`docs/detailed/review-flow.md`), trigger-to-prompt injection + no-search enforcement matrix with troubleshooting (`docs/detailed/item-flow.md`), and cross-link these guarantees from overview notes.

## (pre-numbered) ✅ Browser request captures indicate `CsvImport/import` probe requests without multipart context are insufficient to recover continuation identifiers.
