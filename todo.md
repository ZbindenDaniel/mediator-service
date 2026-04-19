# Todo

## Confirmed Decisions

- **Batch run conflicts:** when an agentic run is already in progress, new start requests should be ignored (no parallel start via repeated triggers).
- **Qty=0 item visibility:** items with zero quantity should remain accessible only through explicit navigation (e.g., direct/scan/detail path), not broad default lists. A clear distinction between removed and deleted items has yet to be made.
- **Shop export rule:** `shop=true` is part of review outcome and only valid for approved reviews. When accepting 'in den Shop stellen?' during review, both `shopartikel` and `veröffentlicht_status` must be set.
- **Search-query tracking scope:** track/accumulate query count per run to answer: *"How many searches did it take to complete the run?"*
- **Transcript goal:** transcript should be complete, distinguishable by step/source, and collapsible for readability. Persistence should change to JSON first (saved to a new location); UI restructuring follows.
- **Dual-format field names:** `*_json` and `*_html`, e.g. `langtext_json`.

---

## Priority 1 — Bugs & Active Work

1. **Fix eventLog display on item and box detail.** Currently displays nothing. Likely a rendering or data-fetch regression.

1b. **Restore mobile bulk-action controls.** `BulkItemActionBar` was moved from `ItemListPage` to the shell action panel (Steps 8–9). The action panel is hidden below 900px, so bulk actions (KI, relocate, export) are not accessible on mobile. Add a fallback for small screens.

2. **Fix agentic runs for references.** Agentic runs are broken for reference items. Runs can be started and run but immediately fall back to not started

3. **Ensure waiting agentic runs restart on application restart.** All runs in a waiting state should automatically resume when the app restarts. Waiting runs should wait (max. parallel runs has to be respected)

4. ✅ **Fix AUTO_PRINT_ITEM_LABEL for multiple instances.** Success dialog now renders one PrintLabelButton per Stk instance using all `responseItems` UUIDs.

<!-- Not clarified:
 5. **Refine QR relocation flow.** Relocation still has edge-case issues in scan handoff/navigation. Moving an item to a box should behave consistently from both the box and item perspectives. Multi-scan and scan-until will be added in future iterations. **Goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points. 

6. **Fix multi-scan item relocation bug.** Scanning multiple items during relocation causes state conflicts or navigation problems. **Goal:** ensure reliable scan-based workflows with proper state management and error recovery.
 -->

7. **Transform transcript persistence from HTML to JSON.** Store transcripts in a new location. UI restructuring of the transcript viewer (collapsible, step-separated) follows after persistence is changed. **Goal:** improve debuggability and enable structured transcript rendering.

8. **Fix shelf location display in box item list.** Items shown in a box detail list should display the shelf as location when the item or its containing box is on a shelf. Current placement context is incomplete for operators during box workflows.

---

## Priority 2 — Feature Improvements

8. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. Aggregation should cover both nested boxes and loose items. **Goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers.

9. **Agentic run substatus tracking.** Show substatus within a run (search → categorization → extraction) so the user can see where a run currently is.

10. **Agentic run: don't discard partial data on field failure.** When one field fails, persist the remaining gathered information and the search state rather than ditching everything. **Goal:** reduce re-work on partial failures.

11. **Agentic: assure category then start extraction with review info.** Enforce category confirmation before starting extraction and pass review context into the flow.

12. **Multiselect agent states.** Allow filtering the agent queue by multiple states (default: everything except 'Freigegeben').

13. **Filter and sort boxes/shelves.** Add filter options (boxes only / shelves only, location dropdown) and sorting to the box/shelf list.

14. **Populate EAN number field in item references.** Enable EAN barcode capture and display in item forms; ensure EAN data flows through import/export pipelines. **Goal:** support standard product identification with minimal schema changes and clear validation rules.

15. **Support text search fallback for relocate item/box (label search).** QR-only flows are brittle when labels/scans fail. Reuse existing search endpoints and add a low-overhead fallback without building a parallel relocation system.

16. **Enable item-list filtering by box.** Align with box-detail inventory presentation; consider reusing item-list views in box detail instead of maintaining separate inventory render logic. **Goal:** consolidate around reusable list components and reduce UI surface complexity.

17. **Add neighboring box navigation (prev/next).** Mirror existing item navigation patterns using existing sort order. **Goal:** reduce repeated return-to-list navigation during review flows.

18. **Implement transport boxes (T-).** Planning document at `docs/PLANNING_transport_boxes.md`. Phase 1: DB schema (`transports` + `transport_items` tables), models, CRUD + complete/cancel actions, TransportListPage + TransportDetail. Phase 2: creation entry points in BoxDetail/ShelfDetail/StubDetail/BulkActionBar + "Transport ausstehend" badges; pending transport surfaced on item instance view (§8.6). Phase 3: ERP/shop API + reference search + audit export. Note: `complete-transport` must also auto-resolve active `box_stubs` for the source shelf.

19a. **Implement stub boxes.** Planning document at `docs/PLANNING_STUB_BOXES.md`. Phase 1: `box_stubs` DB table + migration (incl. `PhotoPath` column), create/list/patch API actions, ShelfDetail `HasActiveStubs` badge + stub list section. Phase 2: dedicated Stub Management nav page (grouped by shelf with color distinction, photo thumbnail); stub detail includes "Transport erstellen" button pre-filling `SourceId = stub.ShelfId` (identical to shelf detail flow). Stub auto-resolve is handled by transport completion (item #18), not a separate action.

19b. **Implement inventory feature (passive cycle).** Planning document at `docs/PLANNING_INVENTORY.md`. Phase 1: `LastInventoryDate` on boxes, `MissingAt` on items, `inventory_sessions` table, `INVENTORY_CYCLE_DAYS` config, `inventoryPending` filter on box list. Phase 2: `/api/inventory/start|scan|complete|cancel`, `InventoryCheckView` with checklist + scan zone + Menge count inputs + acoustic feedback. Phase 3: passive trigger hook in `qr-scan` + interstitial prompt. Phase 4: missing items view, `InventoryFound` flow, session export. Active Inventory Day (UC-1) is deferred — not part of current scope.

19. **Add instance specification fields (RAM, SSD, OS).** Structured hardware spec fields to replace inconsistent manual entries in Langtext. **Goal:** enable structured spec queries and reporting while maintaining compatibility with existing workflows.

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

33. **Admin mode / admin page for operational controls.** Consolidate admin operations (export, shelves, related tasks) into a single scoped surface with clear boundaries.

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
