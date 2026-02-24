# Project Overview & Task Tracker

## Current focus
- Stabilize ERP sync by removing unproven continuation heuristics and preserving only behavior backed by known request evidence.
- Harden pricing-agent JSON reliability by repairing malformed model output before schema validation.

## Next steps
25. ✅ Fix export projection parity by joining `agentic_runs` in export item queries, selecting `AgenticStatus`/`AgenticReviewState` defaults, adding export diagnostics when metadata is absent, and covering the projection with a focused DB export test.
25. ✅ Fix `backend/actions/export-items.ts` published flag normalization by replacing truthy coercion with explicit true/false token handling (`1/true/yes/ja` vs `0/false/no/nein/empty`), keep CSV `0/1` output semantics stable, add unknown-value warning telemetry, and extend export action tests for `'0'/'false'/'1'/'true'` handling.
25. ✅ Preserve source `UpdatedAt` chronology during `/api/import/item`: parse optional payload timestamps with guarded fallback logging, keep shared persistence path via `data.UpdatedAt`, add import-action tests for valid/invalid timestamp handling, and annotate DB upsert semantics near `UpdatedAt=excluded.UpdatedAt`.
24. ✅ Refine `backend/importer.ts` UUID source resolution to keep CSV `itemUUID` precedence, guard Artikel-Nummer fallback behind missing UUID checks, add structured UUID-source telemetry (including fallback lookup errors), and verify persisted `Item.ItemUUID` stays aligned with the selected source.
23. ✅ Improve `backend/importer.ts` persistence observability with explicit reference-skip and per-instance decision logs (`rowNumber`, `artikelNummer`, `itemUUID`, `refAction`, `instanceAction`) while keeping item/ref payload contracts unchanged.
22. ✅ Align `backend/actions/import-item.ts` deterministic import identity behavior: accept caller-provided `ItemUUID` + `Artikel_Nummer` for new imports, reject UUID conflicts with explicit 409 logs, remove dead update-path branching, and add focused import action tests for accepted/conflict/minted flows.
21. ✅ Collapse media path configuration to a single mounted root and derive fixed `shopbilder` / `shopbilder-import` subfolders for WebDAV + ERP mirror usage.
1. ✅ Add explicit ERP sync media mirroring flow telemetry: pre-run expectation logging in `/api/sync/erp`, script-level media copy execution/skipping markers, and fail-fast propagation when mirroring is expected but copy fails.
1. ✅ Remove non-essential import continuation fallback probe logic that has not been proven against browser request captures.
2. ✅ Align browser-parity action contract for preview/import (`CsvImport/test` + `CsvImport/import`) and remove legacy action flag emission in browser-parity mode.
3. ✅ Re-validate parser and completion criteria with deterministic logs and minimal branching.
4. ✅ Refine extraction iteration logging/outcome handling for additional context requests (single-query append).
5. ✅ Add explicit browser-parity mapping emission (`mappings[+].from` / `mappings[].to`) based on captured HAR payloads.
6. ✅ Add pricing-stage JSON repair fallback when the pricing model emits narrative text instead of contract JSON.
7. ✅ Extend ERP identifier extraction for script payload encodings (URL-encoded + HTML-escaped query strings) with source/pattern evidence logging to support continuation URL reconstruction when only `job` is recoverable.
8. ✅ Enforce reviewer-marked unnecessary Langtext spec pruning after review and at next agentic run start so removed fields are not re-delivered.
9. ✅ Extend export mode handling to support import-specific mode identifiers (`manual_import`/`automatic_import`) while reusing existing backup/erp serialization paths and adding structured mode/header logging.
10. ✅ Split export header contracts by import regime: keep `manual_import` legacy labels/order, add dedicated ERP-compatible `automatic_import` labels/order, and enforce CSV header/row field-count parity with fail-fast logging.
11. ✅ Force ERP sync export staging to explicit `automatic_import` regime, add start telemetry (`exportRegime`, CSV path/name, profile identifiers), and emit structured `phase: export-stage` errors when staging fails.
12. ✅ Replace `backend/actions/sync-erp.ts` with a minimal flow: request parsing (`itemIds`), CSV staging, `docs/erp-sync.sh` execution, structured JSON response handling, and guaranteed staging cleanup telemetry.
13. ✅ Make `agentic_runs.csv` imports deterministic by skipping known `item_refs` FK-mismatch rows with structured skip telemetry (`rowNumber`, `artikelNummer`, reason) and explicit skipped-count reporting.
14. ✅ Add explicit ERP media mirror destination config (`ERP_MEDIA_MIRROR_DIR`) with path validation + runtime logging, and consume it in sync orchestration instead of hardcoded mirror destination assumptions.
15. ✅ Refresh `.env.example` coverage for backend/agentic ERP config keys (including mirror destination + browser-parity import toggles) to reduce hidden runtime defaults.
14. ✅ Preserve duplicate-import reliability by deferring `agentic_runs.csv` in duplicate item uploads (instead of immediate ingestion), with structured action telemetry and additive response flags for operator visibility.

15. ✅ Preserve incoming `BoxID` values during CSV ingestion (no remint), add strict shelf/non-shelf format validation with structured skip logging, and keep box/item persistence flow unchanged for valid rows.

16. ✅ Refactor `backend/actions/csv-import.ts` archive stage flow to enforce deterministic execution order (`ingestBoxesCsv` -> `ingestCsvFile` -> `ingestAgenticRunsCsv` -> `ingestEventsCsv`) across duplicate/non-item branches with stage-level try/catch telemetry and partial-failure response summaries.
17. ✅ Streamline manual review checklist flow by replacing spec pre-check yes/no prompts with direct selection modals, adding explicit price confirmation input, and adding conditional shop/notiz steps based on overall review outcome.
18. ✅ Consolidate manual specification review into a single modal containing both unnecessary and missing field sections to reduce reviewer clicks while preserving existing payload mapping.
19. ✅ Simplify spec review capture to one section: select unnecessary spec keys and provide missing spec keys via a single free-text input (no duplicated field lists).

17. ✅ Add strict archive import identifier semantics in `backend/importer.ts`: reject rows missing/invalid `Artikel-Nummer` or `itemUUID`, disable identifier minting in strict mode (including split rows), and emit structured row-failure telemetry (`rowNumber`, `artikelNummer`, `itemUUID`, `failureCode`).

20. ✅ Add bounded print/lpstat transient retry wrapper with structured attempt/final logs and env-configurable backoff, plus targeted retry behavior tests.

26. ✅ Add focused importer coverage for duplicate Artikel-Nummer CSV rows with distinct ItemUUID persistence checks (instance count + exact UUID set + single item_refs row), plus a companion missing-ItemUUID fallback/mint regression test using existing DB harness patterns.

## Notes
- ✅ ERP readiness parser now treats HAR-observed `CsvImport/report` headings `Import-Vorschau` and `Import-Ergebnis` as terminal ready markers with explicit evidence flags in logs.
- ✅ Default ERP import runtime now expects `polling-enabled` mode with `browser-parity` contract and logs both flags at import start to surface misconfiguration early.
- ✅ Extraction iteration dispatcher: parse/correction/validation/evaluation now emit explicit outcomes with centralized transition handling and decision-path logging.
- Browser request captures indicate `CsvImport/import` probe requests without multipart context are insufficient to recover continuation identifiers.
- Changes should stay minimal and reuse existing request assembly/polling structures.

- ✅ ERP CSV HTML formatting refinement: `Langtext` HTML export now renders as a table and `Kurzbeschreibung` is wrapped in `<p>` for future styling hooks.
- Pricing stage now retries malformed responses through a constrained JSON-repair pass before dropping the pricing update.
- Pricing prompt now explicitly forbids prose/markdown and requires a single contract JSON object to reduce parser failures before repair fallback.

- ✅ Extraction follow-up query contract now enforces a single `__searchQueries` entry per iteration while preserving truncation telemetry (`requestedCount`, `usedCount=1`) and supervisor-driven attempt progression.
- ✅ Manual review now prunes reviewer-marked `unneeded_spec` keys from `ItemRef.Langtext`, and agentic invocation prunes those same keys from the next-run target snapshot before prompting extraction.

- ✅ ERP browser-parity mapping emission now supports ordered config parsing (JSON array or newline `from=to` pairs) with strict validation (`from`/`to`) and per-phase mapping telemetry logs (`mappingCount`, `mappingValidationPassed`, `mappingsInjected`).
- ✅ ERP test-phase continuation fallback now proceeds to import when state remains `processing`, with structured diagnostics and explicit fallback error context.
- ✅ ERP browser-parity import contract now requires explicit `profile.id` + `tmp_profile_id` configuration and rejects empty/default placeholder values before curl execution.
- ✅ Export items action now accepts `manual_import`/`automatic_import` aliases, maps them onto existing backup/erp export logic, and logs mode/header regime metadata in one structured entry.
- ✅ CSV item serialization now emits dedicated key-based `automatic_import` headers/order (ERP contract), preserves legacy `manual_import` headers/order, logs selected contract + first three headers, and fails fast on header/data count mismatches.
