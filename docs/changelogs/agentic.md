# Changelog: Agentic Enrichment Pipeline

Covers: AI enrichment pipeline, search, extraction, categorization, pricing, supervisor, review flow, run lifecycle, dispatch queue.

---

## 872. ✅ Harden categorizer/pricing against valid-JSON-wrong-shape model responses (silent null categories)
**Why:** A production transcript showed the categorizer model correctly categorizing an item (`{ "assigned_categories": { "primary": 1603, "secondary": 1602 } }`) but the run still completed with all four category codes `null`. Root cause: `CategorizerResponseSchema` uses `.passthrough()` with every field `nullish()`, so it validates *any* object shape — the model's non-canonical wrapper key passed schema validation, none of the expected `Hauptkategorien_A`/`Unterkategorien_A`/etc. keys were found, `runCategorizerStage` returned an empty `{}` patch, and `item-flow-extraction.ts` skips the merge entirely when the patch has zero keys (`if (categoryPatch && Object.keys(categoryPatch).length > 0)`) — so the run silently "succeeded" with null categories and no warning/error anywhere. Fixed in `item-flow-categorizer.ts`: added `hasCanonicalCategoryShape()` to detect when a response contains none of the recognized fields, `normalizeCategorizerAltShape()` to remap the observed `assigned_categories.primary/secondary` shape onto canonical fields (deriving the main code via the taxonomy's `floor(subcode / 10)` convention when only a subcode is given), and a hard `FlowError('CATEGORIZER_UNRECOGNIZED_SHAPE', ...)` throw when a response has zero recognizable fields — escalating to the existing categorizer failure path instead of silently completing. Applied the identical hardening to `item-flow-pricing.ts` (`hasRecognizedPricingShape()`), since it shares the same permissive-passthrough-schema architecture and was suspected of "never returning a price" for the same reason: an unrecognized-shape response now retries once through the existing `repairPricingJsonResponse()` repair path (previously only triggered on invalid JSON, not on valid-JSON-wrong-shape) before falling back to `null`, and is now logged distinctly from a genuine no-evidence case.
**Deferred:** The alt-shape remap only covers the one observed wrapper pattern (`assigned_categories`/`assignedCategories`/`categories` with `primary`/`secondary` or `main`/`sub`); other novel wrong-shape variants will now fail loudly (`CATEGORIZER_UNRECOGNIZED_SHAPE`) rather than being silently discarded, which is the safety net this change is meant to provide. No production telemetry exists yet confirming the pricing stage hits the same failure mode as often as suspected — added defensively and covered by new tests, but worth revisiting once pricing transcripts are reviewed.

## 868. ✅ Fix categorizer markdown response; repair to JSON + strengthen prompt
**Why:** The model occasionally returns markdown bullet-point formatting (`* **Kategorie:** 160 ...`) instead of the required JSON object. `parseJsonWithSanitizer` has no brace to find in such a response and throws `CATEGORIZER_INVALID_JSON`, failing all three retry attempts. Added `repairCategorizerMarkdown()` in `item-flow-categorizer.ts` that pattern-matches bullet lines with German category labels and numeric codes, reconstructing the expected `{Hauptkategorien_A, Unterkategorien_A, Hauptkategorien_B, Unterkategorien_B}` object. Strengthened the categorizer prompt to explicitly forbid markdown/bullets. The repair is applied before `parseJsonWithSanitizer` so existing sanitization still runs on valid-looking output.
**Deferred:** A broader categorizer JSON repair (like the pricing stage's `repairPricingJsonResponse`) was not added; the markdown bullet pattern covers the observed failure mode.

## 863. ✅ Fix 3 skipSearch bugs; replace notes-regex with explicit UI confirm; wire skipSearch through API + restart
**Why:** Three bugs in the #862 implementation made the no-planner correction flow silently broken: (1) `continue` inside `dispatchIterationOutcome` (async arrow fn) caused TS1107 — replaced with `return 'continue'`; (2) stored source text read `s.content` which is never stored by `normalizeSearchLinks` — changed to prefer `s.description`; (3) `agentic-restart.ts` never extracted `payload.skipSearch` from the request body — added `const skipSearch = payload.skipSearch === true` and forwarded it. The notes-regex approach (`/skip\s+search|keine\s+suche/`) was fragile and untestable — removed entirely from `invoker.ts`. `skipSearch` is now explicit-only: from the API or from the UI. Added `skipSearch?: boolean` to `AgenticRestartRequestInput` and `AgenticReviewInput`; wired through `buildAgenticRestartRequestPayload` and `buildAgenticReviewSubmissionPayload`. Frontend `handleAgenticRestart` now prompts with a confirm dialog ("Suche überspringen?"); the notes step in the review rejection flow also prompts.
**Deferred:** The review endpoint does not act on `skipSearch` itself — the flag only affects the restart endpoint. A reviewer who wants skip-search must use the restart button, not the review submission path.

## 862. ✅ No-planner correction flow: skipSearch feeds stored LastSearchLinksJson into extraction
**Why:** After prompt/contract updates users need to re-run extraction on already-searched items without paying for new planner LLM calls or Tavily queries. Added `skipSearch?: boolean` to `AgenticRunStartInput` / `AgenticRunRestartInput` / `AgenticModelInvocationInput`. When set, the invoker loads `LastSearchLinksJson` from the existing run record, passes it as `storedSources` to `runItemFlow`, and `collectSearchContexts` pre-populates its `searchContexts` array before the early return — so `buildAggregatedSearchText`'s existing sanitization (paragraph splitting, URL filtering, 3-para cap) runs on the stored content identically to live results. A guard in `runExtractionAttempts`' `needs_more_search` branch converts follow-up search requests to retries when `searchSkipped=true`, making skip enforcement end-to-end. Wired through `index.ts` via `pendingSkipSearch` Set (mirrors `pendingOcrImageData` pattern).
**Deferred:** No UI button yet for "re-run without search" — must be triggered programmatically via `restartAgenticRun({ skipSearch: true })`. If the server restarts between queueing and dispatch, the flag is lost and the run fires with live search (same caveat as OCR image data).

## 861. ✅ Surface extraction confidence in UI; events.Meta → JSONB + box filter; stub close action
**Why:** Three untapped data signals promoted to usable form. (1) Extraction confidence (0–1) was computed per run and dropped into `PayloadJson` but never persisted or shown — added `Confidence FLOAT` to `agentic_runs`, wired write path in `result-handler.ts`, displayed as "Konfidenz: N %" in the agentic status card in `ItemDetail.tsx`. (2) `events.Meta` was stored as opaque TEXT, making the full operational history unqueryable — migrated to JSONB with a GIN index; added `listRecentActivitiesByBoxId()` using `@>` JSONB operators; added a Box/Regal filter input to `RecentActivitiesPage`; updated `safeParseMeta` and `ItemDetail` Meta parsing to handle objects (pg returns JSONB as objects). (3) `box_stubs.IsActive` was never set to 0 — added `ClosedAt`/`ClosedBy` columns, `closeStub()` DB function, `DELETE /api/stubs/:id` action, and a trash icon button in `StubListPage`; also fixed SQL filter (was client-side JS, now `WHERE "IsActive" = 1`).
**Deferred:** Review signal feedback loop (aggregated `ReviewMetadata` signals not yet injected into extraction prompts). Pricing confidence/evidenceCount not yet persisted (separate signal from extraction confidence).

## 860. ✅ Contract-informed pipeline: SpecContext coalesces contract + Langtext + InstanceSpecs; structured review Step 3
**Why:** The pipeline previously had no shared view of what spec fields were missing or ambiguous — the search planner used a generic null-field scan, extraction only received missing-required fields, and the supervisor counted fields in natural language unreliably. Step 3 of the review modal was a free-text box where operators had to guess what was wrong. With spec contracts fully defined per subcategory, we now build a `SpecContext` object before the pipeline starts: it coalesces the spec contract + current item Langtext + intake-derived reference data (RAM, drive from `InstanceSpecs`) into a three-way merge. Consistent values are injected into the target immediately so all stages see them. Missing fields (required + desired) replace the generic null-field scan passed to the search planner. Ambiguous fields (item vs intake disagree) are passed to the search planner and extraction as context to find independent evidence. The supervisor's prompt is narrowed to description quality/coherence only — completeness is now checked programmatically. The review endpoint gains `specValues: Record<string, string>` which is written to item Langtext on approve. Step 3 of the review modal is replaced with a full contract field list: all fields shown with current values (pre-filled from Langtext and intake), conflicts shown side-by-side, all fields editable or removable.
**Deferred:** `cpu` from intake is not persisted anywhere, so `Prozessor` coalescing from intake is skipped. Gap/ambiguity data is not persisted — computed fresh from item Langtext + InstanceSpecs at review time. Conflict normalization (e.g. MB→GB) is skipped; any value difference is treated as a conflict. No new AI step or auto-approval path added — human review stays mandatory.

## 858. ✅ Atomic SELECT FOR UPDATE SKIP LOCKED claim query for multi-instance agentic safety
**Why:** `fetchQueuedAgenticRuns` issued an unlocked SELECT, so a second instance could pick up the same rows before the first updated their status to `running` — a double-claim race. Replaced with `claimQueuedAgenticRuns` in `backend/db.ts`: a single CTE that locks candidate rows with `FOR UPDATE SKIP LOCKED`, then immediately UPDATEs their `Status` to `running` in the same statement (`RETURNING agentic_runs.*`). Runs inside `withTransaction`. Updated the call site in `backend/agentic/index.ts` to use the new function; removed the now-redundant QUEUED→RUNNING promotion check that the caller previously did after the SELECT. Also removed the stale `DB_PATH` env var row from `docs/ENVIRONMENT.md` (no SQLite fallback). Supersedes the deferred item from entry 797.
**Deferred:** Unit test for concurrent claim (two async calls against a Postgres test DB asserting each run is claimed exactly once) — requires a live Postgres instance in CI.

## 857. ✅ Add 2 more missing agentic event translations (AgenticRunQueued, AgenticRunRequeued)
   - **Why:** A follow-up scan found these two keys actively logged in `backend/agentic/index.ts` but absent from `models/event-resources.json`, so operators saw raw camelCase strings. Added: `AgenticRunQueued` → "KI-Lauf eingereiht" and `AgenticRunRequeued` → "KI-Lauf erneut eingereiht", both `info`/`agentic`.
   - **Deferred:** Nothing.

## 856. ✅ Add German translations for 12 missing event types + rich descriptions for 4
   - **Why:** 12 event types logged by the backend had no entry in `models/event-resources.json` (AccessoryLinked, AccessoryRelationUpdated, AccessoryUnlinked, AgenticRunReset, AttachmentAdded, AttachmentRemoved, InstanceUpdated, RemovedFromDevice, ShopStatusUpdated, SparePartCataloged, SparePartRemoved, SparepartsRemovedWithDevice). Added labels + level/topic for all 12. Also added rich `formatEventDescription()` cases for 4 events with useful Meta payloads: RemovedFromDevice shows parentUuid + toBoxId, SparePartRemoved shows toBoxId, SparepartsRemovedWithDevice shows removedCount, SparePartCataloged shows artikelNummer.
   - **Deferred:** Nothing.

## 855. ✅ Fix dimension decimal truncation in asNullableInteger; guide model toward integer mm output
   - **Why:** `asNullableInteger` in `backend/db.ts` returned floats unchanged for numeric inputs (e.g. `362.2`), which PostgreSQL silently truncated to `362` in INTEGER columns — the decimal effectively disappeared. Changed to `Math.round(parseFloat(...))` so decimals are rounded explicitly regardless of input type. Prompt notes in `backend/agentic/flow/prompts.ts` updated to tell the model to output integers for Länge_mm/Breite_mm/Höhe_mm (e.g. "362 not 362.0").
   - **Deferred:** Nothing.

## 848. ✅ Fix agentic run delete (silent failure) and remove wrong desktop button hide
   - **Why:** (1) Agentic runs for items without an ERP Artikel_Nummer are keyed by ItemUUID in `agentic_runs`. Three guards (`resolveAgenticArtikelNummer`, `agentic-delete.ts` action handler, `persistAgenticRunDeletion` frontend) all rejected `I-` prefixed IDs, causing the delete to fail. Fixed by removing the I- prefix guards. (2) The `← Liste` button was wrongly hidden on desktop — see entry 849.
   - **Deferred:** Nothing.

## 840. ✅ Fix inverted ai-prio mapping; add quality model tests; document test coverage gaps
   - **Why:** `deriveAiPriorityFromAssessment` mapped high quality (4–5) to `'low'` priority and low quality (1–2) to `'high'` — inverted from intent. High quality items are more shop-ready and should get higher agentic enrichment priority. Fix: reversed thresholds (`>= 4 → high`, `3 → normal`, `< 3 → low`). Added 12 tests for `deriveQualityTagFromCondition` (truth table) and `deriveAiPriorityFromAssessment` (each quality level). Updated `review-flow.md` ai-prio table. Documented remaining test coverage gaps in `todo.md` (restart case 3, pricing threshold boundary tests, categorizer `__locked`, `agentic-delete`, skipSearch follow-up gap).
   - **Deferred:** Nothing.

## 797. ✅ Fix agentic queue permanently stuck at concurrency cap + stats showing 0
   - **Why:** Two bugs caused the queue to deadlock: (1) `applyQueueUpdate` in stale-run recovery was fire-and-forget (async DB call never awaited), so `fetchRunningCount` ran before the FAILED updates committed — the cap still read 3 and every scheduled callback hit "Concurrency cap reached at promotion". Fixed by awaiting recovery updates via `Promise.allSettled` before counting. (2) Stale SQL missed runs with NULL `LastAttemptAt` (NULL < anything = NULL in SQL). Fixed with `OR "LastAttemptAt" IS NULL`. Additionally: `overview.ts` used SQLite `.all()` / `.get()` patterns on async Postgres functions — all five calls returned undefined silently, producing Ki-Läufe=0 and Enriched=0 in the stats pie chart.
   - **Deferred:** Random spot-check re-runs of already-approved items (product decision on scope/frequency). Multi-instance safety (`SELECT FOR UPDATE SKIP LOCKED`) deferred per confirmed decision.

## 796. ✅ Stabilize agentic queue: auto-retry, keep-busy, reduced stale timeout
   - **Why:** Runs that fail (crash, hang, invocation error) were permanently marked CANCELLED and never re-tried. Changed to re-queue with exponential backoff (2/5/10/20/30 min) up to MAX_AUTO_RETRIES=5 — only truly exhausted runs reach CANCELLED. Reduced stale timeout 30→10 min so hung runs unblock slots faster. Added keep-busy dispatch: when queued runs are exhausted and slots remain, `notStarted` runs with a SearchQuery are promoted automatically (no explicit enqueue needed). New `fetchIdleFillAgenticRuns` query in `db.ts`.
   - **Deferred:** Nothing.

## 796. ✅ Fix agentic restart/cancel: updateAgenticRunStatus now returns row count; remove SQLite .changes check
   - **Why:** `updateAgenticRunStatus` returned `Promise<void>`, discarding the `execute()` row count. All four call sites checked `updateResult?.changes` (SQLite idiom) — `void` is `undefined`, so `undefined?.changes` is always falsy → always threw "Failed to reset/cancel agentic run". Fixed by returning `Promise<number>` from the function and replacing `?.changes` guards with `!updateResult` (truthy count check).
   - **Deferred:** Nothing.

## 794. ✅ Fix agentic service SQL: quote column names and cast TEXT timestamp for Postgres comparison
   - **Why:** `SELECT_STALE_AGENTIC_RUNS_SQL` used unquoted column names (folded to lowercase by Postgres) and a SQLite-only `datetime()` function in ORDER BY. Two `fetchRunningCount` queries used bare `Status` (same case-folding bug). The stale-run recovery query compared `"LastAttemptAt"` (stored as TEXT) to `NOW() - INTERVAL` (TIMESTAMPTZ), which Postgres rejects — added `::timestamptz` cast.
   - **Deferred:** Nothing.

## 784. ✅ Fix agentic/index.ts: all deps.db/sync statement calls replaced with async Postgres helpers
   - **Why:** The agentic orchestrator was the last file still using SQLite deps.db.prepare/transaction and .get/.run/.all patterns — all agentic run operations would throw at runtime. Converted AgenticServiceDependencies interface to async function types; replaced all call sites.
   - **Deferred:** Nothing.

## 782. ✅ Migrate agentic action files and search.ts from old synchronous SQLite API to async pg helpers
   - **Why:** 12 files in `backend/actions/` still called `ctx.getAgenticRun.get()`, `ctx.upsertAgenticRun.run()`, `ctx.updateAgenticRunStatus.run()`, `ctx.db.prepare().all/get`, and `ctx.db.transaction()` — patterns that were removed when the DB layer was rewritten for PostgreSQL. These would crash at runtime. Fixed by converting all `.get/.run/.all` method calls on ctx helpers to direct `await ctx.helper(args)` async calls; replaced `ctx.db.prepare()` with `query`/`queryOne` from `../db-client`; replaced `ctx.db.transaction()` with `withTransaction`; removed `db: ctx.db` from AgenticServiceDependencies objects passed to agentic service functions.
   - **Deferred:** `agentic/index.ts` still types `AgenticServiceDependencies` with SQLite `Database.Statement` — the agentic service internals use `.get/.run/.all` on those statements. That layer requires a separate migration pass.

## 772. ✅ Multiselect: waiting (queued) runs can now be stopped alongside running runs
   - **Why:** `stoppableCount` in `KiActionForm` and the stop handler in `handleBulkKi` both filtered only for `AGENTIC_RUN_STATUS_RUNNING`, silently excluding `AGENTIC_RUN_STATUS_QUEUED` items. The backend `cancelAgenticRun` already handles any status; the gate was purely frontend-side. Extended both filters to include `AGENTIC_RUN_STATUS_QUEUED`. Updated the UI count label to "laufende/wartende Artikel stoppen" and the empty-state message accordingly.
   - **Deferred:** Nothing deferred.

## 765. ✅ Four v3.0 release bugs fixed: quality contracts missing in dist, attachments binding modal shown needlessly, review Ja/Nein/Abbrechen restored, mobile QR scan button added to header
   - **Why (review):** `askFlag` was changed to "Abbrechen" in step 739, removing the ability to say "Nein" (doesn't match) without aborting the whole review. Extended the dialog system with a `confirmThreeWay` method (Ja / Nein / Abbrechen → true / false / null); `askFlag` now returns `boolean | null` so reviewers can reject individual steps without killing the flow.
   - **Deferred:** `confirmThreeWay` button order is Abbrechen/Nein/Ja — visual ordering could be revisited.

## 57. ✅ Agentic extraction prompts now inject up to two latest approved reviewed same-subcategory example items (instead of one), renamed extract prompt `<example>` section to `<examples>`, and preserved static fallback behavior with selector telemetry for learning-loop reliability.

## 54. ✅ Gate queued agentic dispatch to a single concurrent running slot so scheduled runs remain `queued`/waiting until capacity frees up, with focused dispatch concurrency tests and structured slot-occupancy logging.

## 55. ✅ Treat manual-review-only `review_price` updates as non-blocking for checklist decision derivation in `backend/actions/agentic-status.ts`, so price corrections can still finish as approved unless blocking review signals exist.

## 54. ✅ Treat manual-review-only `unneeded_spec` selections as non-blocking for checklist decision derivation in `backend/actions/agentic-status.ts` (still persisted for context), so removing unnecessary specs alone no longer forces rejection.

## 50. ✅ Simplify restart review lifecycle semantics: preserve prior review only when restart omits `review`, apply provided review payload without field-level merge fallbacks, and clear prior decision/notes/reviewer when a rerun returns to pending review (`needs_review`) so each completed review cycle starts fresh.

## 49. ✅ Preserve agentic restart review context by default with explicit `replaceReviewMetadata` clear semantics, partial review merges, structured restart transition logging, action-level full review payload forwarding, and focused restart service/action tests for preservation/merge/clear + structured field pass-through.

## 38. ✅ Inject aggregated review-automation trigger fragments into extraction/supervisor prompt placeholders with guarded fallback logging in `backend/agentic/flow/item-flow-extraction.ts`.

## (pre-numbered) ✅ Bulk item-list agentic start now retries via restart when canonical runs already exist (`already-exists`), preserving minimal trigger flow and reducing failed bulk re-run attempts.

## (pre-numbered) ✅ Review mapping now supports an explicit `wrong_information` override (for future dedicated UI input) while defaulting to `false` when absent, with submission logging that records explicit-vs-default source and final value.

## (pre-numbered) ✅ Review payload mapping now keeps `wrong_information` independent from unnecessary-spec cleanup in frontend checklist mapping/tests, while preserving `unneeded_spec` intent and adding submission-stage mapping-source logging.

## (pre-numbered) ✅ Review checklist prompt isolation: dialog prompt inputs now remount per request so the optional review note starts empty instead of carrying over the previously entered price value.

## (pre-numbered) ✅ Documentation clarity: moved review-loop trigger rollout status from `docs/AGENT.md` into dedicated `docs/detailed/Review_loop.md` to keep agent instructions focused and roadmap details separate.

## (pre-numbered) ✅ Extraction iteration dispatcher: parse/correction/validation/evaluation now emit explicit outcomes with centralized transition handling and decision-path logging.

## (pre-numbered) ✅ Pricing stage now retries malformed responses through a constrained JSON-repair pass before dropping the pricing update.

## (pre-numbered) ✅ Pricing prompt now explicitly forbids prose/markdown and requires a single contract JSON object to reduce parser failures before repair fallback.

## (pre-numbered) ✅ Extraction follow-up query contract now enforces a single `__searchQueries` entry per iteration while preserving truncation telemetry (`requestedCount`, `usedCount=1`) and supervisor-driven attempt progression.

## (pre-numbered) ✅ Manual review now prunes reviewer-marked `unneeded_spec` keys from `ItemRef.Langtext`, and agentic invocation prunes those same keys from the next-run target snapshot before prompting extraction.

## - 54. ✅ Apply the minimal restart review-handoff safeguard: when a run transitions into `Status=review` (`needs_review`), explicitly clear previous review decision/notes/reviewer metadata in the result-update path with structured transition logging and guarded try/catch around normalization to keep reruns deterministic and easy to audit.

## - 55. ✅ Align review-spec normalization caps/dedupe across frontend mapping, restart action normalization, and service/invoker composition to prevent prompt bloat and silent contract drift while minimizing structural changes.

## 17. ✅ Streamline manual review checklist flow by replacing spec pre-check yes/no prompts with direct selection modals, adding explicit price confirmation input, and adding conditional shop/notiz steps based on overall review outcome.

## 18. ✅ Consolidate manual specification review into a single modal containing both unnecessary and missing field sections to reduce reviewer clicks while preserving existing payload mapping.

## 19. ✅ Simplify spec review capture to one section: select unnecessary spec keys and provide missing spec keys via a single free-text input (no duplicated field lists).

## 8. ✅ Enforce reviewer-marked unnecessary Langtext spec pruning after review and at next agentic run start so removed fields are not re-delivered.

## 4. ✅ Refine extraction iteration logging/outcome handling for additional context requests (single-query append).

## 6. ✅ Add pricing-stage JSON repair fallback when the pricing model emits narrative text instead of contract JSON.
