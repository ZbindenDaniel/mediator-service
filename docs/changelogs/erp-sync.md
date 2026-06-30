# Changelog: ERP Sync & Import/Export

Covers: ERP import/export, CSV ingestion, Langtext formatting, nightly sync scheduler, Shopware integration, export regimes.

---

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
