# Project Overview & Task Tracker

Detailed runbooks and implementation deep-dives are indexed in [`docs/detailed/README.md`](docs/detailed/README.md).

## Current focus
- Stabilize ERP sync by removing unproven continuation heuristics and preserving only behavior backed by known request evidence.
- Harden pricing-agent JSON reliability by repairing malformed model output before schema validation.

## Next steps
54. ✅ Gate queued agentic dispatch to a single concurrent running slot so scheduled runs remain `queued`/waiting until capacity frees up, with focused dispatch concurrency tests and structured slot-occupancy logging.
55. ✅ Treat manual-review-only `review_price` updates as non-blocking for checklist decision derivation in `backend/actions/agentic-status.ts`, so price corrections can still finish as approved unless blocking review signals exist.
54. ✅ Treat manual-review-only `unneeded_spec` selections as non-blocking for checklist decision derivation in `backend/actions/agentic-status.ts` (still persisted for context), so removing unnecessary specs alone no longer forces rejection.
53. ✅ Add lightweight frontend tests covering BoxDetail item-list deep-link route wiring (`/items?box=<BoxID>`) plus ItemListPage box-filter initialization precedence (URL `box` bootstrap, URL-over-storage override) and Behälter input state editing with minimal routing/storage/fetch mocks.
50. ✅ Simplify restart review lifecycle semantics: preserve prior review only when restart omits `review`, apply provided review payload without field-level merge fallbacks, and clear prior decision/notes/reviewer when a rerun returns to pending review (`needs_review`) so each completed review cycle starts fresh.
49. ✅ Preserve agentic restart review context by default with explicit `replaceReviewMetadata` clear semantics, partial review merges, structured restart transition logging, action-level full review payload forwarding, and focused restart service/action tests for preservation/merge/clear + structured field pass-through.
50. ✅ Treat item-list deep-link query sessions as URL-authoritative (skip localStorage restoration when URL filters are present) and highlight active filter indicator with box-color background for provenance clarity.
49. ✅ Add URL query filter bootstrap on item list mount (URL `box`/`boxFilter` takes precedence over stored/default filters), with defensive parsing/logging and staged-input consistency preserved.
52. ✅ Align muted status text rows horizontally across the `Statistiken` card and further prioritize the pie by shrinking legend footprint to hover-only color dots.
51. ✅ Enlarge the `Statistiken` pie chart and compact the legend into bottom color-coded chips with hover-only value display to improve at-a-glance readability while keeping layout minimal.
50. ✅ Adjust `Statistiken` card layout so the agentic pie chart occupies the right half of the card at desktop widths, while preserving compact stacked behavior on smaller screens.
49. ✅ Add a minimal `Statistiken` pie-chart slice overview for agentic run states in `frontend/src/components/StatsCard.tsx` backed by a small aggregate payload in `backend/actions/overview.ts`, with guarded logging/error handling and a follow-up-ready shape for optional future layers (`shopArtikel`, quality).
48. ✅ Add `docs/detailed/diagrams/README.md` placeholder backlog (item lifecycle, box relocation, import/export, agentic item-flow, review-flow) and link it from `docs/detailed/README.md` for text-first diagram planning without tooling overhead.
47. ✅ Add standalone `docs/detailed/glossary.md` with canonical terminology (items/instances, boxes/shelves, printing, QR events, agentic states/review outcomes), explicit Use/Avoid pairs, and contract-sensitive model-field mapping; link glossary in `docs/detailed/_template.md` for reuse.
47. ✅ Add `docs/detailed/traceability-matrix.md` with domain-to-code mappings (backend/frontend/models + data-structure checks), and link it from `docs/detailed/README.md` as the canonical path index.
47. ✅ Expand `docs/detailed/review-flow.md` from template into a current-state reviewer lifecycle reference covering statuses/transitions, reviewer actions, restart/retrigger paths, contract-verified artifact fields, UI/backend action mappings, audit logging, and explicit open questions for unresolved policy behavior.
47. ✅ Expand `docs/detailed/item-flow.md` from template into a current-state implementation safety reference documenting stage transitions, policy gates, field-level contracts, validation behavior, and stage logging/error maps for extraction/categorization/pricing/review handoffs.
46. ✅ Expand `docs/detailed/agentic-basics.md` from template into an operator/developer orchestration reference covering lifecycle stages, backend module map, persisted run/request/review contracts, observability/failure surfacing, guardrails, and links to specialized item/review deep-dives.
45. ✅ Expand `docs/detailed/import_export.md` from template into a concrete contract reference covering API surfaces, CSV/ZIP structure requirements, alias mapping, validation/error reporting behavior, logging points, and backend/shared-model sync checklist.
45. ✅ Expand `docs/detailed/printing.md` into an operational print reference covering label concepts, preview-vs-dispatch flow, template/route mappings, config dependencies, retry/error diagnostics, and operator troubleshooting checklist.
45. ✅ Expand `docs/detailed/qr_codes.md` from template into a current-state QR reference covering generation, scanner lifecycle, route/action mapping, payload contracts, and scan observability/error handling expectations.
45. ✅ Expand `docs/detailed/boxes.md` from template into a current-state reference covering hierarchy/identifiers, contracts, relocation flows, UI mappings, and logging-backed failure modes for move/print/import behavior consistency.
44. ✅ Apply doc-context efficiency follow-up: remove detailed-doc changelog sections and add explicit Agent prompt guidance to avoid bloated documentation context.
43. ✅ Refine `docs/detailed/items.md` summary to explicitly describe item centrality/relations (refs vs instances, ERP/shop sync context) and clarify `Langtext` as enrichment-flow core output.
42. ✅ Address item-doc review feedback: rename intro section to "In short", clarify `Einheit` semantics (`Stk` vs `Menge`), and add one-line purpose glossary for key fields.
41. ✅ Expand `docs/detailed/items.md` from template into a complete item-domain reference covering identity, contracts, backend/frontend maps, and mutation/import logging expectations.
40. ✅ Add `docs/detailed/_candidates.md` listing additional high-value doc split targets (Shopware queue, ingestion pipeline, search, label rendering, prompt contracts, observability, bulk ops, runtime config) for small parallel follow-ups.
39. ✅ Scaffold `docs/detailed/` domain docs (`items`, `boxes`, `printing`, `import_export`, `qr_codes`, `agentic-basics`, `item-flow`, `review-flow`) from template with draft status, single-owner fields, core concepts, and likely code pointers for parallel authoring.
40. ✅ Simplify `docs/detailed/README.md` by removing ownership/status/TODO sections and keep only concise audience + canonical navigation links per review feedback.
39. ✅ Add `docs/detailed/README.md` as the detailed-docs navigation root with purpose/audience, ownership metadata, planned-doc status table, and canonical links to architecture/agent/overview docs.
38. ✅ Inject aggregated review-automation trigger fragments into extraction/supervisor prompt placeholders with guarded fallback logging in `backend/agentic/flow/item-flow-extraction.ts`.
37. ✅ Place `ShopBadge` exactly where requested: replace Item Detail header Quality badge with Shop badge and add a `Shop` column next to `Qualität` in Item List only.
36. ✅ Scope ShopBadge placement to Item Detail only (remove unrequested list/box table columns) to keep UI changes minimal until explicit placement confirmation.
35. ✅ Add Shop/Veröffentlichung visualization via a compact `ShopBadge` in item/box/detail views, map existing `khaki`/`--head` palette to `--negative`/`--positive` tokens, and keep status parsing resilient with guarded fallback logging.
36. ✅ Drop shelf-ID legacy compatibility: enforce only `S-<location>-<floor>-<index>` in print/import/relocation and remove shelf category filtering/selection from create/list flows.
35. ✅ Remove shelf category from minted/default shelf IDs (now `S-<location>-<floor>-<index>`), keep legacy parsing compatibility for print/import flows, and relax shelf-create payload category requirement while preserving logging/error handling.
34. ✅ Clean documentation inputs for v2.4: move stale plan/input docs to `docs/archive/plans`, add `docs/PLANNING_V_2_4.md`, and keep current bugs scoped in `docs/BUGS.md` for actionable release work.
33. ✅ Introduce versioned highlights process: split `docs/RECENT_HIGHLIGHTS.md` into v2.3 historical notes and a v2.4 upcoming section so release history stays auditable between versions.
32. ✅ Re-baseline planning documentation: clear active plan backlog in `docs/PLANS.md` (no current plans) and centralize implementation change logs in `docs/RECENT_HIGHLIGHTS.md` to keep release docs concise and auditable.
31. ✅ Build a release-documentation audit map and complete the `docs/ARCHITECTURE.md` release-alignment pass (backend/frontend layout, export mode naming, and Langtext contract wording) so doc refresh can proceed in small, reviewable batches with minimal structural churn.
30. ✅ Expand `README.md` with an aligned functionality overview (inventory, CSV/ERP, agentic, QR/print), keeping quick-start concise while restoring enough depth for onboarding context.
29. ✅ Refresh `README.md` so onboarding highlights current mediator goals (inventory + ERP + agentic review), links canonical docs, and removes stale deep-dive runtime guidance that drifts from maintained setup documentation.
28. ✅ Refine item edit binary controls by replacing range sliders with styled switch toggles for `Shopartikel` and `Veröffentlich-Status`, while preserving 0/1 payload semantics and adding focused switch rendering assertions.
27. ✅ Enable binary edit controls for `Shopartikel` and `Veröffentlich-Status` in the item edit form by adding 0/1 slider inputs, preserving reference payload contracts, and adding focused UI rendering coverage for truthy/falsy source values.
26. ✅ Tighten `backend/ops/10-validate.ts` validation telemetry: resolve `itemUUID`/`ItemUUID` aliases before warning, guard alias extraction with try/catch, and include `rowNumber` + `Artikel-Nummer` + key-variant metadata in missing-UUID warnings without changing persistence behavior.
26. ✅ Make export publication gating deterministic by using canonical `AgenticReviewState==='approved'` semantics with guarded status fallback (`AgenticStatus==='approved'`), enriched suppression telemetry (`agenticStatus`, `agenticReviewState`, `itemUUID`), try/catch fallback logging, and focused tests for approved/non-approved/status-only cases.
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
- ✅ Review checklist prompt isolation: dialog prompt inputs now remount per request so the optional review note starts empty instead of carrying over the previously entered price value.
- ✅ Documentation clarity: moved review-loop trigger rollout status from `docs/AGENT.md` into dedicated `docs/detailed/Review_loop.md` to keep agent instructions focused and roadmap details separate.
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
- ✅ Item list now supports a three-state shop/publication filter (`im Shop` 1/1, `nicht veröffentlicht` 1/0, `kein Shopartikel` 0/X) with persisted filter state + normalization logging for unexpected values. It also replaces the unplaced checkbox with a placement dropdown (`Alle`, `unplatziert`, `platziert`) including legacy filter migration logging. Follow-up: quality slider is now rendered as the final filter control for cleaner visual scan.

- ✅ Item list primary filter panel now renders the existing Behälter input again, reusing `boxFilter`/`setBoxFilter` and the existing `filter-grid` structure to keep layout and query filtering behavior aligned.
- ✅ Item list now supports a three-state shop/publication filter (`im Shop`, `nicht veröffentlicht`, `kein Shopartikel`) with persisted filter state + normalization logging for unexpected values. It also replaces the unplaced checkbox with a placement dropdown (`Alle`, `unplatziert`, `platziert`) including legacy filter migration logging. Follow-up: quality slider is now rendered as the final filter control for cleaner visual scan.
