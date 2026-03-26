
- multiselect agent states (default: everything except 'Freigegeben')
- filter and sort boxes (filter: boxes only / shelves only, location dropdown)
- fix AUTO_PRINT_ITEM_LABEL and actual print multiple different labels when multiple instances are created
- admin mode
- create boxes from scans (when a box is deleted but then physically scanned it should be created again)
- loading page emojis
- fix agentic runs for references
- improve event log
- Agentic assure category then start extraction with review info
- agentic runs when one field is bad don't ditch the rest of the gathered information, persist the search maybe?
- agentic run substatus (search, categorization, extraction)
- on application restart all waiting runs automatically restart 
- when accepting 'in den SHop stellen?' during review both 'shopartikel' and 'veröffentlicht_status' have to be set
- transform transcript from html to json and store in different location.
- add additional webDAV folder for temporary media storage, transcripts and additional data related to this service

- inconsisten locationTag display
- improve piechart (quite ugly at the moment)
- add fields price and image to itemList (what's the price and does the item have an image set?, field 'Artikel' can be mad smaller to allow for space)
- eventLog display on item and box detail seems broken (displays nothing)

# Prioritized Todo Backlog

Objective: turn the collected ideas into an execution-ready backlog with clear priority, explicit reason, and a higher-level goal. The focus is to make incremental changes with minimal additions, reuse existing structures, and avoid unclear assumptions.

## Confirmed Decisions (already clarified)

- **Batch run conflicts:** when an agentic run is already in progress, new start requests should be ignored (no parallel start via repeated triggers).
- **Qty=0 item visibility:** items with zero quantity should remain accessible only through explicit navigation (e.g., direct/scan/detail path), not broad default lists. However a clear distinction between removed and deleted items has yet to be made.
- **Shop export rule:** `shop=true` is part of review outcome and only valid for approved reviews.
- **Search-query tracking scope:** track/accumulate query count per run to answer: *"How many searches did it take to complete the run?"*
- **Transcript goal:** transcript should be complete, distinguishable by step/source, and collapsible for readability.


2. **Refine QR relocation flow.** Relocation still has edge-case issues in scan handoff/navigation. **Reason:** relocation errors directly impact physical inventory operations. **Higher-level goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points.


3. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. **Reason:** incorrect aggregates are a data contract quality issue and reduce trust in inventory views. **Higher-level goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers and verifying structure compatibility.

9. **Populate EAN number field in item references.** Enable EAN barcode capture and display in item forms and ensure EAN data flows through import/export pipelines. **Reason:** EAN field exists in export schema but lacks population logic. **Higher-level goal:** Support standard product identification workflows with minimal schema changes and clear EAN validation rules.

9. **Support text search fallback for relocate item/box (label search).** **Reason:** QR-only flows are brittle when labels/scans fail. **Higher-level goal:** reuse existing search endpoints/components and add low-overhead fallback logging without introducing a parallel relocation system.

12. **Enable item-list filtering by box and align with box-detail inventory presentation.** This should align with filtered activity/item discoverability goals and may allow reusing item-list views in box detail instead of maintaining separate inventory render logic. **Reason:** duplicated filtering/presentation logic increases maintenance and inconsistency risk. **Higher-level goal:** consolidate around reusable list components and reduce net UI surface complexity.

13. **Add neighboring box navigation (prev/next), mirroring item navigation patterns.** **Reason:** repeated return-to-list navigation slows review flow. **Higher-level goal:** add lightweight sequential navigation using existing sort order.

15. **Restructure agentic transcript UI for completeness + collapsibility.** Show what happened, what information was found, and what was injected into the flow in a clearly separated, collapsible structure. **Reason:** low transcript clarity makes debugging and review difficult. **Higher-level goal:** improve readability primarily in UI composition before changing persistence format. REFACTOR TO USE JSON!

17. **Add Transport/Temporary box alias for item relocation.** Create a special box type with 'TargetLocation' field to temporarily hold items during relocation workflows until the 'contract' is resolved. **Reason:** Current relocation flows lack temporary holding containers for multi-step moves. **Higher-level goal:** Streamline complex relocation scenarios with clear temporary state handling and automatic resolution.

18. **Fix multi-scan item relocation bug.** Resolve issues where scanning multiple items during relocation causes state conflicts or navigation problems. **Reason:** Multi-item scan workflows are critical for efficient inventory operations. **Higher-level goal:** Ensure reliable scan-based workflows with proper state management and error recovery.

19. **Add instance specification fields (RAM, SSD, OS).** Add structured fields for hardware specifications to support detailed inventory tracking of computer equipment and similar items. **Reason:** Manual specification tracking in Langtext is inconsistent and hard to query. **Higher-level goal:** Enable structured spec queries and reporting while maintaining compatibility with existing specification workflows.

20. **Enhance partial imports functionality.** Improve partial import error handling and recovery workflows to allow continuation of partially failed CSV/ZIP imports. **Reason:** Large imports currently fail completely on single item errors. **Higher-level goal:** Make bulk import workflows more resilient with granular error reporting and selective retry capabilities.

21. **Make search links available in item UI.** Surface agentic search result links in item detail views and enable manual link management for references. **Reason:** Search links are collected but not exposed to users for verification or follow-up. **Higher-level goal:** Improve agentic result transparency and allow manual curation of reference materials.

22. **Add WebLinks field to itemRef structure.** Extend ItemRef with structured WebLinks containing manual reference URLs (Manual, Heise, Dell, etc.) for documentation and vendor links. **Reason:** Important reference materials are currently stored informally in text fields. **Higher-level goal:** Standardize reference link storage with clear categorization and UI management.

23. **Normalize badly formatted search queries.** **Reason:** malformed queries reduce result quality and increase retries. **Higher-level goal:** enforce one canonical normalization boundary and emit concise telemetry.

24. **Track total search queries per run.** **Reason:** we need direct visibility into retrieval effort per completed run. **Higher-level goal:** persist or compute a per-run count with minimal schema impact and clear log fields.

25. **Declutter "Vorrat" area.** **Reason:** high information density increases user error and navigation time. **Higher-level goal:** simplify high-traffic screens incrementally by reusing existing components.

26. **Compact/collapsible flow cleanup for key views.** **Reason:** current flows are heavier than needed for frequent operations. **Higher-level goal:** target high-impact screens first with reversible UI refinements.

27. **In shelves, show combined box + loose items via one reusable list model (including Behälter context).** **Reason:** fragmented shelf views force context switching and duplicate logic. **Higher-level goal:** unify rendering through shared list components and explicit aggregation rules.

28. **Add filtered activities view.** **Reason:** unfiltered activity streams are hard to use for investigation. **Higher-level goal:** add focused filters using existing activity data paths.

## Priority 3 — Infrastructure and Platform Enhancements

23. **Automatic printer server handling after restart.** **Reason:** manual restart recovery causes avoidable downtime. **Higher-level goal:** add startup/reconnect checks with actionable logging.

24. **Declutter QR/relocation logging policy without losing critical traceability.** **Reason:** noisy logs reduce signal and can increase storage/privacy risk. **Higher-level goal:** define minimal logging policy and keep only operationally relevant fields.

25. **Standardize relocation logs with explicit `from -> to` semantics.** **Reason:** ambiguous move logs hinder audits and incident reconstruction. **Higher-level goal:** unify event payload fields with minimal schema changes.

26. **Admin page/card for operational controls (export, shelves, related tasks).** **Reason:** admin operations are currently distributed and harder to manage. **Higher-level goal:** introduce a small scoped admin surface with clear boundaries. 

27. **Periodic backup automation.** **Reason:** missing regular backups raises data-loss risk. **Higher-level goal:** implement a lightweight scheduled backup flow with success/failure reporting.

28. **Postgres migration evaluation/plan.** **Reason:** datastore migration is high impact and should be justified by concrete constraints. **Higher-level goal:** validate drivers first and phase rollout to reduce contract and runtime risk.

## Open Questions (remaining)

1. In **QR relocation**, which exact failure cases are most frequent (wrong target, lost state, wrong return navigation, duplicate moves)?
> moving item to a box should work the same from the perspective of a box and an item.
> in the future we will be adding multi-scan and scan-until
> 
    
2. For **shelf totals**, should weight/item count include nested boxes only, loose items only, or both?
4. For dual-format **langtext export**, what are the exact field names and importer precedence rules?
> '*_json' and '*_html'. i.e. 'langtext_json'
5. For **optional basic-form fields**, should contract changes be backend-first or can frontend collect them before backend persistence is ready?
6. For **text-search relocation fallback**, should label search be exact-first, fuzzy-first, or reuse current global search behavior as-is?
7. For **transcript restructuring**, should we keep persistence unchanged in phase 1 and only refactor presentation?
> let's change persistance first. so we save as JSON. we will also be changing the persistance location
8. For **search-query normalization**, where should canonical normalization live (frontend, backend, or both with backend final authority)?
9. For **logging declutter**, are there compliance/audit requirements that mandate retaining some QR/relocation events?
> it is more about usability. The logs are quite cluttered already and often there is no value in the logs. we could also demote those log to level 'debug' or lower
10. For **periodic backups**, what recovery targets (RPO/RTO) are required?
11. For **Postgres migration**, is migration already strategically decided or still under evaluation?
12. For **PWA**, is offline capability required now or is installability enough for first phase?
13. For **embeddings**, which primary use case should the spike optimize for (search relevance, deduplication, or review assistance)?
14. For the **price formula**, where should it apply first (UI preview, export pipeline, ERP sync, or all)?


## Research Completed

All items from the "not yet formulated" section have been researched and integrated into the prioritized backlog above. Key findings include:

- **EAN population**: Export field exists but lacks input/validation logic
- **QR/relocation**: Scan functionality exists with logging, but Transport/Temporary alias missing  
- **Instance specs**: Extensive instance vs reference architecture exists to build upon
- **Partial imports**: Stage-level failure handling present, needs enhancement for granular recovery
- **WebLinks**: Search links structure exists in agentic tools as foundation for manual link management
