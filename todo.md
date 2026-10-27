# Todo

## Confirmed Decisions
- **Shopware:** direct-to-Shopware via the Admin API, create-if-missing, absolute stock. Only refs with `Shopartikel=1` **and** an approved run are published. Ref → parent product; each instance (`itemUUID` axis, plus `Zustand`) → variant. Langtext → properties, `filterable` only for spec-contract keys. Categories are linked to existing shop categories, never created. Runbook: `docs/detailed/shopware.md`; open work: item 54.
- **ERP export approval gate:** Only approved items may be exported/synced to the ERP — exporting unreviewed items is too dangerous. Enforced as a single choke point in `stageItemsExport` for `erp` mode (covers `/api/sync/erp`, `/api/export/items?mode=erp`, `/api/export/data?mode=erp`) plus an early filter in `sync-erp`. Configurable via `ERP_SYNC_REQUIRE_APPROVAL` (default `true`); backup-mode exports are unaffected.
- **Nightly ERP sync scope:** Syncs only `item_refs` where any instance `UpdatedAt > LastSyncedAt` (or never synced). `LastSyncedAt` lives on `item_refs` (Artikel_Nummer level). Relocation-only instance changes will trigger a sync in v1 — accepted trade-off.
- **Item list conditional column:** A single date column slot appears only when sorting by `entryDate`, `lastSynced`, or `agenticLastRun`, showing the relevant date. Other sort keys show no date column.
- **Database:** PostgreSQL via `pg` (node-postgres). `DATABASE_URL` is required — no SQLite fallback. Local dev: Docker Compose Postgres service. Production: existing Postgres server, add a `mediator` database.
- **Multi-instance safety:** every queue is claimed with `FOR UPDATE SKIP LOCKED` (caveats in `docs/ARCHITECTURE.md`).
- **CO₂ recovery potential:** Label-based scoring (`irrelevant / low / medium / high`) replaces the old ADEME kg estimate. Formula: `score = E_new × (quality / 5)`; thresholds in `contracts/impact/co2.json` (v2). Quality assessment will be refined with longevity questions to sharpen the signal.
- **Batch run conflicts:** when an agentic run is already in progress, new start requests should be ignored (no parallel start via repeated triggers).
- **Qty=0 item visibility:** items with zero quantity should remain accessible only through explicit navigation (e.g., direct/scan/detail path), not broad default lists. A clear distinction between removed and deleted items has yet to be made.
- **Shop export rule:** `shop=true` is part of review outcome and only valid for approved reviews. When accepting 'in den Shop stellen?' during review, both `shopartikel` and `veröffentlicht_status` must be set.
- **Transcripts** are stored as JSON (`agentic-transcript.json`); the viewer should be complete, separated by step/source, and collapsible.

---

## Priority 1 — Bugs & Active Work

0z5. **Intake asks RAM / storage despite the scan — ROOT-CAUSED; backend done, image fix handed off.**
  Root cause (intake #915): the netboot image's `build_scan_payload` (in `common.sh`, separate repo) reads
  disk `sizeGb` from `smartctl` `.user_capacity.bytes` — an **ATA/SATA-only** field, **empty for NVMe** and
  on smartctl open-fail — so `sizeGb:0` on modern NVMe laptops → `storageSize` signal null → `storage_gb`
  asked. The backend resolver and `phase1.sh` are both correct for a well-formed scan (verified). RAM
  (`/proc/meminfo`) already resolved; storage was the visible offender.
  - ⏳ **Image repo (handed off):** patch `build_scan_payload` to source `sizeGb` from `lsblk -bdno SIZE`
    (bytes → GB); keep smartctl for identity only. This is the change that actually stops the storage prompt.
  - ⏳ **Optional image-side:** render the response's `detectedSpecs` as a read-only banner in `phase1.sh`.
  - **Follow-ups:** broaden `driveTypeLabel` tolerance for exotic `type` strings (`sata`/`""`); a per-run
    scan-quality metric off `unresolvedAutoFill`.

0z6. **Intake enrichment should key on `sku`, not the DMI product name.** `dmidecode -s system-product-name`
  returns generic junk on many HP/Lenovo laptops ("HP Notebook", "20XW"); the scan also captures `sku`
  (system-sku-number), which HP/Dell use as a full commercial identifier. When the agentic model-name
  enrichment runs, prefer `sku` as the lookup key over the product name. Separate from 0z5.

0z9. **Search: surface `relaxed: true` in the UI.** Since ui #958 `/api/search` returns weaker matches
  (below the 50 % token rule) instead of nothing and flags them `relaxed`. The ~8 frontend consumers
  (`Header`, `RefSearchInput`, `ItemMatchSelection`, `useSimilarItems`, `ArtikelNummerLookupStep`, …) ignore
  the flag; a small "keine genauen Treffer — ähnliche Ergebnisse" hint would tell the operator why the list
  looks loose.

0z8. **Intake: verify Phase-2 attachments reach the server.** Operator report (with intake #957): "attachments
  don't land on the server" for an Intel NUC. Not reproduced backend-side — the upload handler emits a
  `[media-audit]` line (start/success/error) for every `POST /api/items/SN:…/external-docs/<dir>`, and the
  device's server log showed none, so the request most likely never arrived (flow stalled at `select_ref`
  with 0 candidates — fixed in #957 — or a station-side upload failure). Next: re-run an intake on that
  device and grep the server log for `[media-audit]` + the serial; if absent, debug `phase2.sh` on the image.

0z7. **Add a CI JSON-lint over `contracts/`.** The invalid-JSON bug in `quality/201.json` (intake #914) was
  invisible because both contract loaders swallow parse errors and return `null`. A cheap `node -e JSON.parse`
  (or `jq empty`) sweep over `contracts/**/*.json` in CI would catch the next one at commit time.

0z4. **AI runs: failure-aware queue** (last open phase of the AI-runs optimization; phases 1a/1b/3/4 shipped as agentic #915–918).
  Goal: when runs start failing, the queue slows down and re-queues instead of failing terminally; unchanged while healthy.
  Draft mechanism: classify failures (`infra`/`transient`/`permanent`), a DB-computed health window, a CLOSED/HALF-OPEN/OPEN
  throttle, bounded re-queue (RetryCount ceiling + `NextRetryAt` backoff, already honoured by the claim query) and a global
  re-queue rate cap (what the #913 incident lacked). Today three queue paths fail runs with only a `LastError` code and no item
  event: `missing-search-query`, `stale-run-auto-cancelled`, `over-cap-cancelled` — infra decisions that look like real failures.
  **Decide first:** full breaker vs bounded-requeue-only vs keep-terminal with infra re-queue only; should over-cap runs re-queue
  instead of failing; where to keep a transition trail (events vs table vs transcript).
  Full design history: `docs/PLANNING_ai_runs_optimization.md` in git history (removed 2026-10-27).

0z3. **Intake netboot image / station TUI emits a duplicated brand in `model`.** The scan reports `vendor="HP"` with the brand also embedded (sometimes doubled) inside `model` (e.g. `model="HP HP ProBook 470 G4"`), and the external station TUI further combines the echoed `vendor`+`model` when pre-filling the new-ref form. The backend deliberately no longer masks this (see 0z2) — fix it at the source: the netboot intake image should emit a clean `model` (brand once, or brand-free with `vendor` separate), and the TUI should stop concatenating `vendor` into the pre-filled `Kurzbeschreibung`. Contract: [`intake-image.http`](docs/detailed/intake-image.http).

0r. **Ersatzteile: "Hinzufügen" popup needs a close-on-backdrop-click escape for accessibility** — the new portal dialog closes on backdrop click already; verify with screen reader that `aria-modal` and focus-trap work correctly.

0u. **Assembly contract: multipleAllowed full UI.** The `multipleAllowed` flag on assembly parts (RAM, storage) is supported in the data model and ZubehoerCard shows a "+ weiteres" button when one is cataloged, but the multi-instance slot list (showing each linked instance separately) is not yet implemented.
0v2. **Run `scripts/normalize-category-values.js` against production once (op step).** The read-side casts (agentic #906) now tolerate float-formatted category strings like `"201.0"`, but the legacy TEXT values are still non-canonical in the DB. Run the one-time cleanup on prod (`DATABASE_URL=… node scripts/normalize-category-values.js`) to canonicalize them; idempotent and safe to re-run.
0v. **Specs/201.json: remove duplicate component fields.** `RAM`, `Speicher`, and `Akku` remain in `contracts/specs/201.json` even though assembly answers now drive these. Safe for now but should be cleaned up to avoid confusion in agentic extraction.
0v3. **Seed category `guidance[]` for remaining subcategories.** The spec-contract `guidance[]` field (agentic #908) injects per-category prompt snippets into extraction + supervisor; only `201.json` (laptops) is seeded so far. Collect the recurring LLM mistakes per subcategory (e.g. HDD/monitor dimensions, server form factors) from operators/review history and add snippets to the other `contracts/specs/*.json`. No `version` bump needed (guidance is advisory). Consider promoting "do not mention X"-style suppression to a hard supervisor gate if prompt guidance proves leaky.
0w. **keyboard_layout specQuestion in keyboard slot.** Architecture supports `specQuestion` wiring for inline answers (e.g., keyboard layout in the keyboard slot), but the frontend ZubehoerCard does not yet render `specQuestion` inline — only the primary `question` is shown.

0m. **Ersatzteile Entnehmen: add "direkt verkaufen" path.** Currently Entnehmen always requires a Behälter-ID (storage location). When a spare part is sold immediately, no storage location is needed — instead the quantity should go to 0. UI change: show "Wird der Artikel eingelagert?" prompt in the Entnehmen flow; "Ja" → existing relocate flow; "Nein" → set Qty=0, no location required.
0n. **Ersatzteile: instance reference re-linking.** When a spare part instance is created via Hinzufügen but linked to the wrong item reference (wrong Artikelnummer), there's no way to re-link the instance to the correct reference without deleting it. Implement a "Referenz ändern" option in the Zerlegen slot (visible post-cataloging, before/after removal).

0p. **Known test coverage gaps (from doc/test comparison):**
  - `restart-review-metadata.test.ts` covers 3 of 4 restart truth-table cases from `review-flow.md`; case 3 (`review` provided + `replaceReviewMetadata=true`) is not tested.
  - `item-flow-pricing.test.ts` threshold test uses values below both gates simultaneously — cannot verify the documented `confidence >= 0.6 AND evidenceCount >= 2` thresholds independently from the test alone.
  - Categorizer `__locked` field behavior (`item-flow.md`: "Locked fields are preserved and not overwritten") is asserted nowhere in the test suite; only appears as fixture setup data.
  - `backend/actions/agentic-delete.ts` HTTP handler still has no direct test; the underlying `deleteAgenticRun` service is now covered by `test/agentic-delete-reset.test.ts` (reset clears SearchQuery; not-started decline).
  - No production telemetry yet confirms the pricing stage actually hits the same unrecognized-shape failure mode as the categorizer did — the hardening in #872/0y is defensive; revisit once pricing transcripts are reviewed to see how often it triggers.

0j. **Set PRINTER_QUEUE_MARKETING env var for A4 marketing sheets.** Without it, marketing sheet print jobs fall back to `PRINTER_QUEUE`. Operators should configure this to target the A4 printer.

0. **Eliminate duplicate `/api/items` fetch on item selection.** When switching items via the list, ItemDetail's neighbor-resolution `useEffect` (`[itemId, neighborContext]`) fetches `/api/items` independently from the list fetch in `ItemListPage`. Fix: `handleItemSelect` in `ItemListPage` should encode `prev=<prevId>&next=<nextId>` as URL params when calling `setEntity` so ItemDetail reads them from `searchParams` and skips its own fetch (the `prev`/`next` params are already supported by ItemDetail's `neighborContext` memoization).

1c. **Investigate remaining tester-reported bugs (need runtime testing):**
   - "ki erfassung indefinite" — agentic capture stuck; stale-run recovery now reliably clears stuck RUNNING runs (fire-and-forget race fixed); auto-retry re-queues after backoff. If still stuck, check model service callback.
   - "bearbeiten fehler, KI-Status nicht angezeigt" — `save-item.ts` silently sets `agentic = null` on fetch error; check if `getAgenticRun` errors after migration
   - "list button broken" — unclear; may self-resolve now that box-detail is fixed
   - "artikel dupliziert nach umlagern" — likely stale frontend state; may self-resolve with box-detail fix (box item list can now reload after move)

2. **Fix agentic runs for references.** Agentic runs are broken for reference items. Runs can be started and run but immediately fall back to not started
   - **Investigation (needs runtime repro):** Traced start (`startAgenticRun` → `hasAgenticReference`), dispatch (`claimQueuedAgenticRuns` — no `items` JOIN, so reference-only rows *are* claimable), status read (`getAgenticStatus` → `getAgenticRun` by `Artikel_Nummer`), and list display (`listItemReferencesWithFilters`, `LEFT JOIN agentic_runs ... COALESCE(i."Artikel_Nummer", r."Artikel_Nummer")`). All handle a **numeric** `Artikel_Nummer` reference correctly on static reading — the "fall back to notStarted" is a display artifact of `COALESCE(ar."Status",'notStarted')` when the run-row JOIN misses. Suspected residual cases: (a) references with a **non-numeric / specially-formatted** `Artikel_Nummer` (e.g. created via `catalog-spare-part`/`remove-from-device`), or (b) already largely resolved by the #876 SearchQuery-reset / numeric-guard fixes and this entry is stale. Next step: reproduce against a real reference item and capture the exact id passed by the frontend + the `agentic_runs."Artikel_Nummer"` actually written.

<!-- Not clarified:
 5. **Refine QR relocation flow.** Relocation still has edge-case issues in scan handoff/navigation. Moving an item to a box should behave consistently from both the box and item perspectives. Multi-scan and scan-until will be added in future iterations. **Goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points. 

6. **Fix multi-scan item relocation bug.** Scanning multiple items during relocation causes state conflicts or navigation problems. **Goal:** ensure reliable scan-based workflows with proper state management and error recovery.
 -->

7. **Transcript viewer UI.** Persistence is JSON now (`backend/agentic/flow/transcript.ts`); restructure the viewer to be collapsible and separated by step/source.

---

## Priority 2 — Intake station (deferred v2 items)

- **Components: manual "add unidentified" UI.** Backend deletion/graduation paths exist and
  intake auto-creates in-device components, but there is no explicit operator entry point in
  Zerlegen to add an unidentified (reference-less) component by hand. See
  [`docs/detailed/component-lifecycle.md`](docs/detailed/component-lifecycle.md).
- **Components: contract signal for parent→Ersatzteil.** `remove-from-device` honors
  `markParentAsSpare` but nothing yet supplies it from a contract/Auftrag — decide whether it is
  a parent field or an operator toggle at Zerlegung and wire it. The API never auto-marks without
  the flag.
- **Components: sever `Zerlegt_aus` link on sale/stock-removal.** The provenance link is kept
  after graduation; severing it when the extracted item is sold + stock-removed is deferred.
- **Components: verify intake image can read per-drive serials.** The serial (with `wwn`/`model`
  fallback) is the identity/report key; confirm the netboot image reads it for every drive type
  on the bench (some USB bridges hide it). Contract: [`intake-image.http`](docs/detailed/intake-image.http).
  Note: MAC-keyed uploads work as the serial-less fallback and now surface in the UI/serve too
  (media #915 upload, #916 fallback-chain listing) — a drive with no readable serial and
  machine-level/orphan wipe reports upload under `MAC:<mac>` and appear on the machine item.
- **Intake: scan.txt augmentation of agentic extraction.** When `/complete` fires, if `items.SerialNumber` is set, look for Phase 2 test result files in `{intake-scans mountPath}/{serial}/` and prepend a summarized block (≤2000 chars) to the extraction prompt. Requires modifying `backend/agentic/flow/item-flow-extraction.ts`.
- **Intake: operator notification on completion.** Notify the operator (push notification or TUI display) when a device finishes the full pipeline (quality done + agentic run queued).
- **Intake: InstanceSpecs sync.** When a quality answer drives a spec change on a ref-sharing instance, propagate to all instances sharing the same Artikelnummer (pre-existing open question for the quality review flow too). Note: operators can now manually correct/add/delete a single instance's specs via the "Instanz bearbeiten" card (`PATCH /api/items/:id/instance` `InstanceSpecs`, full-replace — item-lifecycle #911); this edit is per-instance only and does not propagate.

---

## Priority 2 — Feature Improvements

**Per-user item marking (step 779) — deferred items:**
- CSS polish for `.mark-btn` added; amber accent color is hardcoded (`#f59e0b`) — wire to a CSS variable once a warning/accent token is established.
- Bulk mark action in `BulkItemActionBar` not yet added.
- Note text not shown as tooltip on the star icon in the list — keep as tab-only for now.

21. **Box images tab empty for shelves.** Shelf boxes (`S-*`) are not `isBoxRelocatable`, so the images tab renders nothing. Revisit when shelf photo support is defined.

8. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. Aggregation should cover both nested boxes and loose items. **Goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers.

9. **Agentic run substatus tracking.** Show substatus within a run (search → categorization → extraction) so the user can see where a run currently is.

10. **Agentic run: don't discard partial data on field failure.** When one field fails, persist the remaining gathered information and the search state rather than ditching everything. **Goal:** reduce re-work on partial failures.

11. **Agentic: assure category then start extraction with review info.** Enforce category confirmation before starting extraction and pass review context into the flow.

13. **Filter and sort boxes/shelves.** Add filter options (boxes only / shelves only, location dropdown) and sorting to the box/shelf list.

15. **Support text search fallback for relocate item/box (label search).** QR-only flows are brittle when labels/scans fail. Reuse existing search endpoints and add a low-overhead fallback without building a parallel relocation system.

16. **Enable item-list filtering by box.** Align with box-detail inventory presentation; consider reusing item-list views in box detail instead of maintaining separate inventory render logic. **Goal:** consolidate around reusable list components and reduce UI surface complexity.

17. **Add neighboring box navigation (prev/next).** Mirror existing item navigation patterns using existing sort order. **Goal:** reduce repeated return-to-list navigation during review flows.

18. **Implement transport boxes (T-).** Planning document at `docs/plans/transport-boxes.md`. Phase 1: DB schema (`transports` + `transport_items` tables), models, CRUD + complete/cancel actions, TransportListPage + TransportDetail. Phase 2: creation entry points in BoxDetail/ShelfDetail/StubDetail/BulkActionBar + "Transport ausstehend" badges; pending transport surfaced on item instance view (§8.6). Phase 3: ERP/shop API + reference search + audit export. Note: `complete-transport` must also auto-resolve active `box_stubs` for the source shelf.

19b. **Implement inventory feature (passive cycle).** Planning document at `docs/plans/inventory.md`. Phase 1: `LastInventoryDate` on boxes, `MissingAt` on items, `inventory_sessions` table, `INVENTORY_CYCLE_DAYS` config, `inventoryPending` filter on box list. Phase 2: `/api/inventory/start|scan|complete|cancel`, `InventoryCheckView` with checklist + scan zone + Menge count inputs + acoustic feedback. Phase 3: passive trigger hook in `qr-scan` + interstitial prompt. Phase 4: missing items view, `InventoryFound` flow, session export. Active Inventory Day (UC-1) is deferred — not part of current scope.
   - **Note (storage #885):** A lightweight reconciliation *exit route* now exists on the placement scan flow (`PlacementScanView`): finishing a box scan surfaces unscanned recorded items and lets the operator remove their stock or clear their location. This is distinct from the full passive-cycle verification feature above (no sessions/`MissingAt`/passive triggers) but covers the "remove items that no longer exist" need for the scan-into-box workflow.

45. **Spec contracts: targeted enrich button in ItemKiTab.** When an item has missing required spec fields (visible as empty Langtext rows), add a "Gezielt anreichern" button in the KI tab that starts an agentic run pre-seeded with the missing field names as missingSpecFields. Requires fetching the spec contract client-side and computing the gap against the current Langtext.
47. **Spec pipeline: cpu persistence.** Intake `cpu` field is currently used only to pre-fill quality questions. Persisting it (e.g. to `items.InstanceSpecs`) would enable `Prozessor` coalescing from intake in `buildSpecContext`. Deferred from the contract-informed pipeline implementation. (Note: variant-key canonicalization now folds `CPU`→`Prozessor` in extraction/Langtext — agentic changelog #889 — but intake-value coalescing still needs the persisted field.)
48. **Review Step 3: ambiguous fields display.** The backend now computes `ambiguousFields` in `buildSpecContext` and threads them to the pipeline, but the review modal currently shows only the item's Langtext value as `currentValue` with `intakeValue` from `InstanceSpecs`. The conflict detection in the modal is client-side — verify it surfaces correctly once real intake conflict data is available.

49. **Persist skipSearch (and future rework mode) on `agentic_runs`.** The flag currently rides an in-memory `pendingSkipSearch` Set (`backend/agentic/index.ts`), lost on server restart and not restored by stale-resume/idle-fill. Add a `SkipSearch` column written at enqueue and read at dispatch so it survives restart; this column also becomes the backbone for the rework mechanism (#50). Deferred from agentic changelog #890 to keep that change reviewable.

50. **Rework mechanism.**
  - **Phase 2b — LLM standards auditor (planned, not built).** Add the language/style/wording audit as a one-shot LLM call guided by a runtime-editable `contracts/guidelines/standards.json` (read fresh, no redeploy); add a `LastAuditedAt` cursor for periodic re-checks (oldest-first, stamp every audit), a per-window budget cap, and an anti-thrash cap on consecutive auto-reworks per item.
  - **Deferred behavior:** on a rework **failure**, discard the changes and keep the prior `approved` state (today a failed rework lands in `failed` like any run). Resolved policy: reworked items otherwise follow the normal review/auto_approve path, no special-casing.
  - Row-level click-select + right-click on spec rows (nicer selection than the modal checkboxes) remain a follow-up.

51. **Auto-approve follow-ups.** `AUTO_APPROVE` (default off) + `AUTO_APPROVE_MIN_CONFIDENCE` (default 0.8) added (agentic changelog #892). Follow-ups: per-subcategory confidence threshold instead of one global value; optional auto-reject counterpart; a bulk "promote auto_approved → approved" action (currently uses per-item Abschliessen); and extend the KI-queue state filter to select `auto_approved` (aligns with #12 multiselect agent states).

53. **Instance agentic flow (design in progress — `docs/plans/instance-flow.md`).** A per-`ItemUUID`
  flow that consumes intake evidence + `InstanceSpecs` and reconciles the device against its reference,
  emitting an operator-gated **reconciliation object** (never writes `item_refs`; ref changes only via
  operator-approved `rework`). **Re-validated after the "new pipeline" contract work (plan §17):** the
  `scope`-field idea is superseded — reference contracts were redefined around **capabilities**, so the
  revised plan uses a **separate instance-spec contract**; reconcile compares installed-value ↔
  capability; `INTAKE_TO_SPEC` is orphaned. Builds on shipped snapshots (#918)/search-sources (#916)/
  grounding (#917). Revised phasing: (0) stabilize/normalize the capability-oriented reference spec
  contracts; (1′) instance-spec contract + measured-signal binding; (2) instance-scope run history by
  extending `agentic_run_snapshots`; (3) reconcile step; (4) operator actions; (5) KI-Runs list; (6)
  automation. Open questions in the planning doc §13/§17.

53b. **Doc-debt: the spec-contract restructure shipped undocumented.** The reference spec contracts were
  redefined around model capabilities (`102.json` gained `RAM-Slots`/`RAM-Kapazität`/`RAM-Typ`;
  `201.json` stripped to Prozessor/Display/Anschlüsse) with no changelog Why (commits "new pipeline" /
  "cleanup and minor contract updates"). They are also **inconsistent** across compute subcategories
  (201 lacks storage/RAM-capability fields 102 has). Document the intent + normalize the shape; note
  that `INTAKE_TO_SPEC` (`ram_gb→RAM`/`storage_gb→Speicher`) is now orphaned for subcats whose contract
  dropped those keys (silent no-op in `buildSpecContext`).

52. **Tests failing in the local harness.** `test/agentic-direct-dispatch.test.ts` and `test/agentic-startup-resume.test.ts` fail in the local esbuild harness because the scheduled `invokeModel` isn't observed (`toHaveBeenCalledTimes(1)` → 0); verify against CI's Postgres/jest setup. Both fail identically on a clean tree.
   - **Still failing locally (9):** esbuild harness can't resolve named exports from bundled `../../agentic` (`deleteAgenticRun`/`checkAgenticHealth is not a function`), plus mock/env gaps (`window is not defined`, missing `.env`/media fixtures, `ts-jest` preset not found). Suspected CI-green (jest+Postgres); needs verification against CI rather than product-code changes.
   - **`intake-specs-assembly.test.ts` — "human-judgment condition questions" fails on a clean tree** (found during intake #912). `loadSubCategoryContract(201)` (the `lib/quality-contracts` loader) returns `null` under jest so `sub!.questions` throws, while the `contracts/registry` loader used by the same suite resolves fine — a path-resolution mismatch between the two contract loaders in the test env, not a product bug. Reconcile the loaders' base-dir resolution (or the test's expectation) so the subcategory contract loads under jest.

42. **Quality search: `includeQuality` API param.** When set, search also matches against `derived_specs` in `quality_assessments` (Postgres JSON operators). Enables searching "16GB" to find matching Laptops.

44. **Quality assessment: link accessories (charger etc.) during assessment.** Feasibility confirmed — `item_relations` table (RelationType='Zubehör') and full CRUD API already exist. Chargers are separate items (cat 804/805). The assessment step could show an "Zubehör hinzufügen?" picker that creates `item_relations` records on save. No new table needed; add an optional `linked_accessories TEXT` JSON column to `quality_assessments` or just rely on `item_relations`. Effort: medium (new UI step + wiring to existing API).

20. **Enhance partial imports functionality.** Large imports currently fail completely on a single item error. Add granular error reporting and selective retry. **Goal:** make bulk import workflows resilient with clear per-item failure reporting.

22. **Add WebLinks field to ItemRef structure.** Extend ItemRef with structured WebLinks (Manual, Heise, Dell, etc.). **Goal:** standardize reference link storage with clear categorization and UI management.

23. **Normalize badly formatted search queries.** Enforce one canonical normalization boundary; emit concise telemetry. **Goal:** reduce result degradation and retries from malformed queries.

24. **Track total search queries per run.** Persist or compute a per-run count with minimal schema impact and clear log fields.

25. **Improve event log.** Make event log more useful and easier to navigate.
   - **Still unlogged (deferred):** successful prints (only `PrintFailed` logs), ERP sync, stub close, a distinct reference-created event. No history backfill for pre-existing items/boxes.

26. **Inconsistent locationTag display.** Audit and fix locationTag rendering across views so it is displayed consistently. Note: box links in ItemDetail now navigate via the panel shell (Steps 8–9) rather than hard-navigating; other views may still use plain `<Link>` to `/boxes/:id`.

27. **Improve pie chart.** The current chart is visually poor; redesign for clarity.

29. **Declutter "Vorrat" area.** High information density increases user error and navigation time. **Goal:** simplify high-traffic screens incrementally by reusing existing components.

30. **Compact/collapsible flow cleanup for key views.** Target high-impact screens with reversible UI refinements to reduce visual weight on frequent operations.

30b. **Simple mode: make the kept set configurable / server-persisted.** A first cut shipped (ui #897): an "einfacher Modus" toggle in the user-settings dialog strips the UI to a curated essential set via a body CSS class stored in `localStorage`. It uses an opt-out model — new nav items/tabs are hidden by default unless marked `simple-keep`/`keepInSimple`. Follow-ups: let operators choose which surfaces to keep, and/or persist the preference server-side per username so it follows them across devices. Also optional: skip hidden tabs in `DetailTabBar` arrow-key navigation.

31. **Unified shelf view: combined box + loose items via one reusable list model (including Behälter context).** Fragmented shelf views force context switching and duplicate logic. **Goal:** unify rendering through shared list components with explicit aggregation rules.

32. **Add filtered activities view.** Unfiltered activity streams are hard to use for investigation. **Goal:** add focused filters using existing activity data paths.

34. **Round-trip shelf `Color` through box backup export/import.** Shelf colours (storage #960) live in `boxes."Color"` but aren't in `export-items.ts` `boxColumns` / `importer.ts` box field handling / `UPSERT_BOX_SQL`, so a restore into a fresh DB loses them (same-DB re-import keeps them via `COALESCE`).

35. **Revive commented-out item list tests.** `test/item-list-quality.test.ts` and `test/item-list-columns.test.ts` were disabled because jest couldn't resolve the bare `models` alias; the mapper now exists (ui #961), so they only need updating to the current `ItemListComputationOptions` shape.

54. **Shopware follow-ups.** (a) Reverse sync: orders must book out mediator stock (`checkout.order.placed` webhook → decrement a matching instance; which instance when a variant has several?). Design in the runbook. (b) Items without agentic approval never sync — decide whether manual shop items need a path. (c) Bulk re-sync to backfill pre-existing skeleton products. (d) Queue retention/trim and a max-retry ceiling. (e) Documents: product downloads vs. link list vs. none — undecided. (f) Accessory cross-selling. (g) Live-validate variant configurator, image `media`/`coverId` and thumbnail writes; prune stale itemUUID property options; stale category-link reconciliation. (h) Dedup the product normaliser in `shopware/client.ts`, `shopware/adminClient.ts`, `agentic/tools/shopware.ts`.

55. **Unverified UI notes (from a 2026-04-28 tester pass; check each, fix or drop).** Exclude the current instance from the Vorrat list; remove the Detail-Liste link and the Behälter column in the box item list; show "erfasst von"; print modal transparent (overridden by `.app-shell__right .card`) and "Label drucken" closes without showing the PDF; KI status above the button group in the AI tab; box info tab summary (count + weight); browser back doesn't restore the detail tab; first/last button in a group need border-radius; header search vs. the old search card; landing page should be `/items?entity=item&tab=create`.

---

## Priority 3 — Infrastructure & Platform

56. **Remove dead config.** `backend/config.ts` parses but nothing reads `ERP_IMPORT_FORM_*` (separator, charset, booking group, unit, part classification, date format, full preview), `ERP_IMPORT_PROFILE_ID`, `ERP_IMPORT_TMP_PROFILE_ID`, `ERP_IMPORT_REQUEST_CONTRACT`, `ERP_IMPORT_BROWSER_PARITY_MAPPINGS`, `ERP_IMPORT_AUTH_FIELD_PREFIX`, `ERP_IMPORT_POLL*`, `SHOPWARE_DEFAULT_TAX_ID`, `SHOPWARE_DEFAULT_CURRENCY_ID`. Delete them (already dropped from `.env.example` and `docs/ENVIRONMENT.md`).

57. **Production compose follow-ups (`docker-compose.prod.yaml`).** (a) Postgres is published on all interfaces (`5432:5432`) with the default `mediator`/`mediator` credentials — bind to `127.0.0.1` or drop the port unless something external needs it. (b) Without `MEDIATOR_IMAGE` it still falls back to `ghcr.io/…:3.0`; point the default at the Gitea registry or make the variable required. (c) Unlike the dev stack it has no `alt-doc-dirs.json` / `mediator-scans` mounts, so external documents (wipe reports, intake scans) aren't available in prod — intended?

33c. **Wire Authentik forward-auth enforcement (follow-up to stack add, OVERVIEW 898).** Authentik now runs in the `docker-compose.yml` stack but nothing consumes it yet. Next: (1) proxy forward-auth — nginx `auth_request` against the Authentik outpost in `config/nginx/mediator.conf` (dev), Traefik `forwardAuth` middleware label in `docker-compose.prod.yaml` (prod), plus adding the Authentik services to the prod compose; drop nginx Basic Auth once it works. (2) Backend: a helper generalizing `backend/utils/admin-auth.ts` that resolves `{username, groups, role}` from `X-authentik-username`/`X-authentik-groups` into `ActionContext`; replace the `/api/admin/*` check with a `mediator-admin` group check (keep `ADMIN_SECRET` as break-glass fallback). Design the role check as a **config-driven group→capability map**, not a hardcoded binary, so extra roles (`intake`, `erp`, `readonly`, …) are a config line + an Authentik group. (3) Populate the free-text `Actor`/`Username` fields from the authenticated user. (4) In Authentik itself: create the Proxy Provider, the `mediator-admin` group (everyone-else authenticated = user), and the embedded outpost. Note the deploy workflow only rolls `mediator`, so bringing the Authentik services up on the host needs a manual `docker compose up -d` or a workflow change.

34. **Add WebDAV folder for temporary media, transcripts, and service-related data.** Support the new transcript persistence location and other temporary media storage needs.
34b. **Media health: periodic background check.** `/api/media/health` is currently on-demand (polled when admin page loads). A recurring server-side probe (e.g. every 5 min) that logs a warning when reachability drops would surface WebDAV failures without requiring an operator to open the admin page.

35. **Create boxes from scans.** When a box is deleted but is later physically scanned, it should be recreated.

36. **Automatic printer server handling after restart.** Manual restart recovery causes avoidable downtime. **Goal:** add startup/reconnect checks with actionable logging.

37. **Declutter QR/relocation logging.** Logs are cluttered with low-value entries. Demote noisy events to `debug` level or remove them; keep only operationally relevant fields. No compliance requirements mandate retaining these.

38. **Standardize relocation logs with explicit `from → to` semantics.** Ambiguous move logs hinder audits and incident reconstruction. **Goal:** unify event payload fields with minimal schema changes.

39. **Periodic backup automation.** Missing regular backups raises data-loss risk. **Goal:** implement a lightweight scheduled backup flow with success/failure reporting.

---

## Open Questions

### Still Open

- **Revive flag-based review metrics (deferred).** The review wizard makes one explicit approve/reject decision and, on reject, feeds a concrete before→after correction diff + notes into the next run (chosen over deriving flags — a diff is richer and unambiguous). Consequence: `bad_format` / `wrong_physical_dimensions` / `information_present` are sent at non-blocking defaults, so `AgenticReviewMetricsRows` (`% Schlecht formatiert / Falsche Dimensionen / Info unvollständig`) now reads all-positive. If those dashboards are still wanted, derive the flags **purely for metrics** (e.g. text edited ⇒ bad_format, dimension edited ⇒ wrong_physical_dimensions, required spec blanked ⇒ information_present=false), decoupled from the re-run path. Not needed for extraction quality.
- For **spare parts `drive_type`**, should this question move to the disassembly contract storage slot (needs `qualityQuestion[]` array support on parts) or stay in quality/201.json as a follow-up spec question? Currently stays in quality/201.json (TBD).
- For **spare parts bidirectional suggestions**, when a device's quality check says "PS missing", should the system surface matching PS units in inventory for the operator? Deferred to phase 2 — needs structured spec matching.
- For **optional basic-form fields**, should contract changes be backend-first or can the frontend collect them before backend persistence is ready?
- For **text-search relocation fallback**, should label search be exact-first, fuzzy-first, or reuse current global search behavior as-is?
- For **search-query normalization**, where should canonical normalization live — frontend, backend, or both with backend as final authority?
- For **periodic backups**, what recovery targets (RPO/RTO) are required?
- For **PWA**, is offline capability required now or is installability enough for the first phase?
- For **embeddings**, which primary use case should the spike optimize for — search relevance, deduplication, or review assistance?
- For **the price formula**, where should it apply first — UI preview, export pipeline, ERP sync, or all?
- For **loading page emojis**, which emojis / what style?

### Answered

- **Shelf totals:** shelf weight is not interesting; item count is what matters.
- **QR relocation failure cases:** moving an item to a box should work the same from the perspective of a box and an item. Multi-scan and scan-until will be added in future iterations.
- **Dual-format field names:** `*_json` and `*_html`, e.g. `langtext_json`.
- **Relocation/QR logging:** it is about usability, not compliance. Noisy logs can be demoted to `debug` level or removed.
