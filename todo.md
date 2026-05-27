# Todo

## Confirmed Decisions
- **CO₂ savings calculation:** ADEME 2022 formula (E_new × R_reuse × L_factor − O_refurb); coefficients in `contracts/impact/co2.json`; computed at runtime (no DB column in Phase 1). Phase 2 path: add `co2_einsparung_kg REAL` to items table once volume warrants pre-computation.

- **Batch run conflicts:** when an agentic run is already in progress, new start requests should be ignored (no parallel start via repeated triggers).
- **Qty=0 item visibility:** items with zero quantity should remain accessible only through explicit navigation (e.g., direct/scan/detail path), not broad default lists. A clear distinction between removed and deleted items has yet to be made.
- **Shop export rule:** `shop=true` is part of review outcome and only valid for approved reviews. When accepting 'in den Shop stellen?' during review, both `shopartikel` and `veröffentlicht_status` must be set.
- **Search-query tracking scope:** track/accumulate query count per run to answer: *"How many searches did it take to complete the run?"*
- **Transcript goal:** transcript should be complete, distinguishable by step/source, and collapsible for readability. Persistence should change to JSON first (saved to a new location); UI restructuring follows.
- **Dual-format field names:** `*_json` and `*_html`, e.g. `langtext_json`.

---

## Priority 1 — Bugs & Active Work

0f. ✅ **Quality contracts missing in production build.** `scripts/build.js` now copies `contracts/` → `dist/contracts/` so the backend registry can find general and subcategory quality contracts at runtime.
0g. ✅ **Attachments binding modal shown without purpose.** Modal now only appears when at least one writable external dir (ALT_DOC_DIRS) is available; without external dirs, files upload directly with no modal.
0h. ✅ **Review flow only showed Ja/Abbrechen.** Extended dialog system with `confirmThreeWay`; `askFlag` now offers Ja/Nein/Abbrechen so reviewers can flag individual steps as wrong without aborting the review.
0i. ✅ **Mobile QR scan navigation missing.** Added `QrScanButton` (mobile-only) to Header nav for direct label-scan → item/box navigation on mobile.
0e. ✅ **Fix mobile navigation to lists and Einscannen visibility.** `mobileShowDetail` state in PanelContext drives `app-shell--mobile-detail` CSS class; slide transition replaces display-toggle; back button added; full-screen bypass for scan/placement routes.

0c. **Verify tab icons render correctly once build runs.** react-icons/go icons GoInfo, GoPencil, GoFileMedia, GoPaperclip, GoTools are newly imported in DetailTabBar — confirm they exist in v5.5.0 (Octicons v19) when bundling.

0d. ✅ **Move filter-clear button into ItemListPage list header (top-right).** Done — filter-reset button added to both ItemListPage and BoxListPage; removed from Header.


0. **Eliminate duplicate `/api/items` fetch on item selection.** When switching items via the list, ItemDetail's neighbor-resolution `useEffect` (`[itemId, neighborContext]`) fetches `/api/items` independently from the list fetch in `ItemListPage`. Fix: `handleItemSelect` in `ItemListPage` should encode `prev=<prevId>&next=<nextId>` as URL params when calling `setEntity` so ItemDetail reads them from `searchParams` and skips its own fetch (the `prev`/`next` params are already supported by ItemDetail's `neighborContext` memoization).

0b. ✅ **Filter state resets intermittently when switching items.** Fixed — filter-init useEffect now deps on `[boxParam, qParam]` instead of full `[searchParams]`, so PanelContext entity/tab URL writes no longer retrigger it.

1. **Fix eventLog display on item and box detail.** Empty state added (shows "Keine Aktivitäten." instead of blank). If events are still absent when they should exist, the data-fetch path needs investigation.

1b. ✅ **Restore bulk-action controls.** `BulkItemActionBar` restored inside `MultiItemDetailPanel` in Layout; reads `selectedIds` from PanelContext and `selectedItems/onClearSelection/onActionComplete` from `BulkSelectionContext`.

2. **Fix agentic runs for references.** Agentic runs are broken for reference items. Runs can be started and run but immediately fall back to not started

3. **Ensure waiting agentic runs restart on application restart.** All runs in a waiting state should automatically resume when the app restarts. Waiting runs should wait (max. parallel runs has to be respected)

4. ✅ **Fix AUTO_PRINT_ITEM_LABEL for multiple instances.** Success dialog now renders one PrintLabelButton per Stk instance using all `responseItems` UUIDs.

<!-- Not clarified:
 5. **Refine QR relocation flow.** Relocation still has edge-case issues in scan handoff/navigation. Moving an item to a box should behave consistently from both the box and item perspectives. Multi-scan and scan-until will be added in future iterations. **Goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points. 

6. **Fix multi-scan item relocation bug.** Scanning multiple items during relocation causes state conflicts or navigation problems. **Goal:** ensure reliable scan-based workflows with proper state management and error recovery.
 -->

7. **Transform transcript persistence from HTML to JSON.** Store transcripts in a new location. UI restructuring of the transcript viewer (collapsible, step-separated) follows after persistence is changed. **Goal:** improve debuggability and enable structured transcript rendering.

8. ✅ **Fix shelf location display in box item list.** Standort column added to BoxDetail item list using `LocationTag`; backend was already returning Location/ShelfLabel per item.

---

## Priority 2 — Feature Improvements

22. ✅ **Apply tab-gating to BoxDetail.** Done — each box tab now shows only its content slice; DetailTabBar renders inside BoxDetail.

19. ~~**Wire `item × attachments` action panel slot.**~~ Superseded — ActionPanel deleted; inline button in AttachmentsCard already covers the use case.

20. ~~**Wire `item × accessories` action panel slot.**~~ Superseded — ActionPanel deleted; inline RefSearchInput fields cover the use case.

21. **Box images tab empty for shelves.** Shelf boxes (`S-*`) are not `isBoxRelocatable`, so the images tab renders nothing. Revisit when shelf photo support is defined.

8. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. Aggregation should cover both nested boxes and loose items. **Goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers.

9. **Agentic run substatus tracking.** Show substatus within a run (search → categorization → extraction) so the user can see where a run currently is.

10. **Agentic run: don't discard partial data on field failure.** When one field fails, persist the remaining gathered information and the search state rather than ditching everything. **Goal:** reduce re-work on partial failures.

11. **Agentic: assure category then start extraction with review info.** Enforce category confirmation before starting extraction and pass review context into the flow.

12. **Multiselect agent states.** Allow filtering the agent queue by multiple states (default: everything except 'Freigegeben').

13. **Filter and sort boxes/shelves.** Add filter options (boxes only / shelves only, location dropdown) and sorting to the box/shelf list.

14. ✅ **Populate EAN / surface instance identifiers.** EAN display now routes to the instance tab (alongside SN/MAC). SerialNumber and MacAddress are captured in the create form and persisted via import-item. Remaining gap: editing SN/MAC on existing instances requires a separate instance-update path (not yet built).

15. **Support text search fallback for relocate item/box (label search).** QR-only flows are brittle when labels/scans fail. Reuse existing search endpoints and add a low-overhead fallback without building a parallel relocation system.

16. **Enable item-list filtering by box.** Align with box-detail inventory presentation; consider reusing item-list views in box detail instead of maintaining separate inventory render logic. **Goal:** consolidate around reusable list components and reduce UI surface complexity.

17. **Add neighboring box navigation (prev/next).** Mirror existing item navigation patterns using existing sort order. **Goal:** reduce repeated return-to-list navigation during review flows.

18. **Implement transport boxes (T-).** Planning document at `docs/PLANNING_transport_boxes.md`. Phase 1: DB schema (`transports` + `transport_items` tables), models, CRUD + complete/cancel actions, TransportListPage + TransportDetail. Phase 2: creation entry points in BoxDetail/ShelfDetail/StubDetail/BulkActionBar + "Transport ausstehend" badges; pending transport surfaced on item instance view (§8.6). Phase 3: ERP/shop API + reference search + audit export. Note: `complete-transport` must also auto-resolve active `box_stubs` for the source shelf.

19a. **Implement stub boxes.** Planning document at `docs/PLANNING_STUB_BOXES.md`. Phase 1: `box_stubs` DB table + migration (incl. `PhotoPath` column), create/list/patch API actions, ShelfDetail `HasActiveStubs` badge + stub list section. Phase 2: dedicated Stub Management nav page (grouped by shelf with color distinction, photo thumbnail); stub detail includes "Transport erstellen" button pre-filling `SourceId = stub.ShelfId` (identical to shelf detail flow). Stub auto-resolve is handled by transport completion (item #18), not a separate action.

19b. **Implement inventory feature (passive cycle).** Planning document at `docs/PLANNING_INVENTORY.md`. Phase 1: `LastInventoryDate` on boxes, `MissingAt` on items, `inventory_sessions` table, `INVENTORY_CYCLE_DAYS` config, `inventoryPending` filter on box list. Phase 2: `/api/inventory/start|scan|complete|cancel`, `InventoryCheckView` with checklist + scan zone + Menge count inputs + acoustic feedback. Phase 3: passive trigger hook in `qr-scan` + interstitial prompt. Phase 4: missing items view, `InventoryFound` flow, session export. Active Inventory Day (UC-1) is deferred — not part of current scope.

19. ✅ **Add instance specification fields (RAM, SSD, OS).** Now driven by quality contracts: `specField`/`specValue` in each question contributes to Langtext automatically after quality review. Subcategory contract 201 (Laptop) covers keyboard layout, RAM, storage, battery.

40. **Quality contract: add remaining subcategory contracts.** 201, 301, 401, 701, 102 now exist. Missing: 103 (Server), 204 (Tablet), 1802 (Smartphone), 302 (MFG), 105 (Mac) — add as JSON files, no code changes needed.
44. **Spec contracts: add remaining subcategory contracts.** Currently only 201 (Laptop) and 701 (Graphikkarte) have spec contracts in contracts/specs/. Add JSON files for other high-volume subcategories (301 Drucker, 401 Flachbildschirm, 601 Mainboard, etc.) — no code changes needed, restart picks them up.
45. **Spec contracts: targeted enrich button in ItemKiTab.** When an item has missing required spec fields (visible as empty Langtext rows), add a "Gezielt anreichern" button in the KI tab that starts an agentic run pre-seeded with the missing field names as missingSpecFields. Requires fetching the spec contract client-side and computing the gap against the current Langtext.
46. **Spec contracts: contract version stamping.** Add a specContractVersion nullable integer to agentic_runs to track which spec contract version was active when a run was completed. Enables detecting items that were enriched against an older contract version after the contract changes.

41. ✅ **Quality re-check from ItemDetail.** "Neu bewerten" button added to instance tab `tab-actions`; opens `QualityReviewModal` wrapping `QualityReviewStep`. Results stored in `items.InstanceSpecs` (per-instance) and `quality_assessments`.

41b. ✅ **Quality assessment visibility & flow.** Quality questions are now all optional (submit without answering all). Multiple Stk creation skips quality (each item gets an amber missing-quality prompt). Success dialog shows quality badge or note. Item list has Alle/Mit Bewertung/Ohne Bewertung filter dropdown.

42. **Quality search: `includeQuality` API param.** When set, search also matches against `derived_specs` in `quality_assessments` (SQLite `json_extract`). Enables searching "16GB" to find matching Laptops.

42b. ✅ **Search covers instance identifiers (SerialNumber, MacAddress, EAN).** Header search now finds items by serial number, MAC address, or EAN barcode. Both token-presence (LIKE) and exact-match (=) checks added to SQL; JS scoring updated. Reference (dedupe) search also includes EAN.

43. ✅ **Quality contracts: `text` question type (datalist combobox) implemented.** `select` / `boolean` / `text` now supported. `range` (numeric slider) still deferred.

44. **Quality assessment: link accessories (charger etc.) during assessment.** Feasibility confirmed — `item_relations` table (RelationType='Zubehör') and full CRUD API already exist. Chargers are separate items (cat 804/805). The assessment step could show an "Zubehör hinzufügen?" picker that creates `item_relations` records on save. No new table needed; add an optional `linked_accessories TEXT` JSON column to `quality_assessments` or just rely on `item_relations`. Effort: medium (new UI step + wiring to existing API).

20. **Enhance partial imports functionality.** Large imports currently fail completely on a single item error. Add granular error reporting and selective retry. **Goal:** make bulk import workflows resilient with clear per-item failure reporting.

21. **Make search links available in item UI.** Surface agentic search result links in item detail views and enable manual link management for references. **Goal:** improve agentic result transparency and allow manual curation.

22. **Add WebLinks field to ItemRef structure.** Extend ItemRef with structured WebLinks (Manual, Heise, Dell, etc.). **Goal:** standardize reference link storage with clear categorization and UI management.

23. **Normalize badly formatted search queries.** Enforce one canonical normalization boundary; emit concise telemetry. **Goal:** reduce result degradation and retries from malformed queries.

24. **Track total search queries per run.** Persist or compute a per-run count with minimal schema impact and clear log fields.

25. **Improve event log.** Make event log more useful and easier to navigate.

26. **Inconsistent locationTag display.** Audit and fix locationTag rendering across views so it is displayed consistently. Note: box links in ItemDetail now navigate via the panel shell (Steps 8–9) rather than hard-navigating; other views may still use plain `<Link>` to `/boxes/:id`.

27. **Improve pie chart.** The current chart is visually poor; redesign for clarity.

28. **Add price and image fields to itemList.** Show whether an item has a price and an image set; shrink the 'Artikel' column to create space.

29. **Declutter "Vorrat" area.** High information density increases user error and navigation time. **Goal:** simplify high-traffic screens incrementally by reusing existing components.

30. **Compact/collapsible flow cleanup for key views.** Target high-impact screens with reversible UI refinements to reduce visual weight on frequent operations.

31. **Unified shelf view: combined box + loose items via one reusable list model (including Behälter context).** Fragmented shelf views force context switching and duplicate logic. **Goal:** unify rendering through shared list components with explicit aggregation rules.

32. **Add filtered activities view.** Unfiltered activity streams are hard to use for investigation. **Goal:** add focused filters using existing activity data paths.

---

## Priority 3 — Infrastructure & Platform

33. ✅ **Admin mode / admin page for operational controls.** `/admin` page with import, export, shelf creation, print queue, KI queue, and system status. Gear icon in header nav. Old `/admin/shelves/new` redirects to `/admin`.

33b. **Admin page: add password protection via ADMIN_SECRET.** If `ADMIN_SECRET` env var is set, backend rejects all `/api/admin/*` requests without a matching `Authorization: Bearer <secret>` header. Frontend shows a password gate on `/admin` that stores the entered value in `sessionStorage` and threads it through admin API calls (`/api/admin/label-queue`, `/api/admin/config`). Existing non-admin endpoints (`/api/overview`, `/api/export/items`, etc.) stay unprotected as they were before the admin page existed.

34. **Add WebDAV folder for temporary media, transcripts, and service-related data.** Support the new transcript persistence location and other temporary media storage needs.

35. **Create boxes from scans.** When a box is deleted but is later physically scanned, it should be recreated.

36. **Automatic printer server handling after restart.** Manual restart recovery causes avoidable downtime. **Goal:** add startup/reconnect checks with actionable logging.

37. **Declutter QR/relocation logging.** Logs are cluttered with low-value entries. Demote noisy events to `debug` level or remove them; keep only operationally relevant fields. No compliance requirements mandate retaining these.

38. **Standardize relocation logs with explicit `from → to` semantics.** Ambiguous move logs hinder audits and incident reconstruction. **Goal:** unify event payload fields with minimal schema changes.

39. **Periodic backup automation.** Missing regular backups raises data-loss risk. **Goal:** implement a lightweight scheduled backup flow with success/failure reporting.

40. **Postgres migration evaluation/plan.** High-impact datastore migration; validate concrete drivers first and plan a phased rollout to reduce contract and runtime risk.

---

## Open Questions

### Still Open

- For **shelf totals**, should weight/item count include nested boxes only, loose items only, or both?
> Actually, the weight of a shelf is not interesting. 
- For **optional basic-form fields**, should contract changes be backend-first or can the frontend collect them before backend persistence is ready?
- For **text-search relocation fallback**, should label search be exact-first, fuzzy-first, or reuse current global search behavior as-is?
- For **search-query normalization**, where should canonical normalization live — frontend, backend, or both with backend as final authority?
- For **periodic backups**, what recovery targets (RPO/RTO) are required?
- For **Postgres migration**, is migration already strategically decided or still under evaluation?
- For **PWA**, is offline capability required now or is installability enough for the first phase?
- For **embeddings**, which primary use case should the spike optimize for — search relevance, deduplication, or review assistance?
- For **the price formula**, where should it apply first — UI preview, export pipeline, ERP sync, or all?
- For **loading page emojis**, which emojis / what style?

### Answered

- **QR relocation failure cases:** moving an item to a box should work the same from the perspective of a box and an item. Multi-scan and scan-until will be added in future iterations.
- **Dual-format field names:** `*_json` and `*_html`, e.g. `langtext_json`.
- **Transcript persistence:** change persistence first (save as JSON to a new location); UI restructuring follows.
- **Relocation/QR logging:** it is about usability, not compliance. Noisy logs can be demoted to `debug` level or removed.
