
# Prioritized Todo Backlog

Objective: turn the collected ideas into an execution-ready backlog with clear priority, explicit reason, and a higher-level goal. The focus is to make incremental changes with minimal additions, reuse existing structures, and avoid unclear assumptions.

## Confirmed Decisions (already clarified)

- **Batch run conflicts:** when an agentic run is already in progress, new start requests should be ignored (no parallel start via repeated triggers).
- **Qty=0 item visibility:** items with zero quantity should remain accessible only through explicit navigation (e.g., direct/scan/detail path), not broad default lists.
- **Shop export rule:** `shop=true` is part of review outcome and only valid for approved reviews.
- **Search-query tracking scope:** track/accumulate query count per run to answer: *"How many searches did it take to complete the run?"*
- **Transcript goal:** transcript should be complete, distinguishable by step/source, and collapsible for readability.

## Priority 0 — Stability and Data Correctness

1. **Harden batch agentic start concurrency handling.** New start requests must be ignored when a run is in progress, and parallel run behavior should be reviewed because multiple active runs were observed. **Reason:** concurrency races can corrupt run state and confuse operators. **Higher-level goal:** enforce deterministic run-state transitions with minimal scheduler changes, clear logging around ignored starts, and robust error handling for state conflicts.

2. **Resolve QR relocation flow inconsistencies.** Relocation still has edge-case issues in scan handoff/navigation. **Reason:** relocation errors directly impact physical inventory operations. **Higher-level goal:** stabilize intent and return-flow boundaries with targeted fixes, strong validation, and meaningful try/catch + logging at transition points.

3. **Ensure shelf weight and item count are calculated correctly.** Current totals are incomplete or inaccurate. **Reason:** incorrect aggregates are a data contract quality issue and reduce trust in inventory views. **Higher-level goal:** align aggregation logic across backend/frontend models while reusing existing summary helpers and verifying structure compatibility.

4. **Keep qty=0 items reachable only via explicit navigation.** Preserve record traceability without polluting default browse lists. **Reason:** users need detail access for audit and follow-up while keeping main lists focused. **Higher-level goal:** apply minimal query/filter adjustments so explicit lookups still resolve and list behavior stays predictable.

5. **Distinction between listprice and sell price.** When adding a new field 'Listenpreis' to the items we can make a distinction between the prices we find. The pricing agent should then put the prices found in the correct field (new price or current market price). When exporting we calculate 'Verkaufspreis based on the findings (either we take it as is are calculate `Verkaufspreis = Math.Floor((Listenpreis +30)/15)*5`). Alsow we might inject other prices of similar items intot the pricing agent chat


## Priority 1 — Workflow Integrity and Business Rules

5. **Analyze and integrate `erp-sync.sh` into a controlled sync job flow.** The new script exists but is not yet integrated into the regular system behavior. **Reason:** manual/isolated sync execution risks drift and operational inconsistency. **Higher-level goal:** define a narrow sync contract first, then add minimal orchestration with clear logs and recoverable error handling.

6. **Export both langtext formats (JSON + HTML) with clear import usage for Kivi and mediator.** **Reason:** format inconsistency causes integration fragility and hidden data loss risks. **Higher-level goal:** standardize export/import contract fields with the smallest schema extension and explicit precedence rules.

7. **Move "In den shop?" decision into review outcome and enforce approval dependency.** Treat this as the source-of-truth flag rather than a separate export gate. **Reason:** split business logic across review/export layers increases drift risk. **Higher-level goal:** keep one canonical decision path (`review -> approved -> shop allowed`) with aligned API/model types and audit logs.

8. **Add optional basic-form fields (dimensions, shop article metadata).** **Reason:** missing structured fields create manual workarounds and downstream ambiguity. **Higher-level goal:** introduce optional fields with minimal form/API impact and verify all shared model contracts stay in sync.

9. **Support text search fallback for relocate item/box (label search).** **Reason:** QR-only flows are brittle when labels/scans fail. **Higher-level goal:** reuse existing search endpoints/components and add low-overhead fallback logging without introducing a parallel relocation system.

## Priority 2 — UX Improvements with Moderate Product Impact

10. **Improve box list Standort filtering.** **Reason:** weak filtering slows daily location workflows. **Higher-level goal:** close filter parity gaps with small query + UI filter updates.

11. **Hide shelf-contained boxes from top-level box list (while preserving access via shelf/search/deep-link paths).** **Reason:** current list can show duplicates/noise across location contexts. **Higher-level goal:** clarify list semantics with minimal conditional filtering.

12. **Enable item-list filtering by box and align with box-detail inventory presentation.** This should align with filtered activity/item discoverability goals and may allow reusing item-list views in box detail instead of maintaining separate inventory render logic. **Reason:** duplicated filtering/presentation logic increases maintenance and inconsistency risk. **Higher-level goal:** consolidate around reusable list components and reduce net UI surface complexity.

13. **Add neighboring box navigation (prev/next), mirroring item navigation patterns.** **Reason:** repeated return-to-list navigation slows review flow. **Higher-level goal:** add lightweight sequential navigation using existing sort order.

14. **Disable "KI-Suche abschließen" in invalid states.** **Reason:** action-state mismatch can trigger avoidable failures. **Higher-level goal:** derive button availability from current state flags without introducing new state machines.

15. **Restructure agentic transcript UI for completeness + collapsibility.** Show what happened, what information was found, and what was injected into the flow in a clearly separated, collapsible structure. **Reason:** low transcript clarity makes debugging and review difficult. **Higher-level goal:** improve readability primarily in UI composition before changing persistence format.

16. **Normalize badly formatted search queries.** **Reason:** malformed queries reduce result quality and increase retries. **Higher-level goal:** enforce one canonical normalization boundary and emit concise telemetry.

17. **Track total search queries per run.** **Reason:** we need direct visibility into retrieval effort per completed run. **Higher-level goal:** persist or compute a per-run count with minimal schema impact and clear log fields.

18. **Declutter "Vorrat" area.** **Reason:** high information density increases user error and navigation time. **Higher-level goal:** simplify high-traffic screens incrementally by reusing existing components.

19. **Compact/collapsible flow cleanup for key views.** **Reason:** current flows are heavier than needed for frequent operations. **Higher-level goal:** target high-impact screens first with reversible UI refinements.

20. **In shelves, show combined box + loose items via one reusable list model (including Behälter context).** **Reason:** fragmented shelf views force context switching and duplicate logic. **Higher-level goal:** unify rendering through shared list components and explicit aggregation rules.

21. **Add filtered activities view.** **Reason:** unfiltered activity streams are hard to use for investigation. **Higher-level goal:** add focused filters using existing activity data paths.

22. **Add a statistics pie chart for agentic run states.** **Reason:** run-state distribution is easier to evaluate visually than in raw counts. **Higher-level goal:** deliver one small, decision-useful visualization fed from existing aggregates.

## Priority 3 — Infrastructure and Platform Enhancements

23. **Automatic printer server handling after restart.** **Reason:** manual restart recovery causes avoidable downtime. **Higher-level goal:** add startup/reconnect checks with actionable logging.

24. **Declutter QR/relocation logging policy without losing critical traceability.** **Reason:** noisy logs reduce signal and can increase storage/privacy risk. **Higher-level goal:** define minimal logging policy and keep only operationally relevant fields.

25. **Standardize relocation logs with explicit `from -> to` semantics.** **Reason:** ambiguous move logs hinder audits and incident reconstruction. **Higher-level goal:** unify event payload fields with minimal schema changes.

26. **Admin page for operational controls (export, shelves, related tasks).** **Reason:** admin operations are currently distributed and harder to manage. **Higher-level goal:** introduce a small scoped admin surface with clear boundaries.

27. **Periodic backup automation.** **Reason:** missing regular backups raises data-loss risk. **Higher-level goal:** implement a lightweight scheduled backup flow with success/failure reporting.

28. **Postgres migration evaluation/plan.** **Reason:** datastore migration is high impact and should be justified by concrete constraints. **Higher-level goal:** validate drivers first and phase rollout to reduce contract and runtime risk.

29. **PWA support.** **Reason:** installability/mobile UX may improve field workflows. **Higher-level goal:** confirm minimal viable PWA scope before broad offline complexity.

30. **Embeddings exploration (linked spike).** **Reason:** potential retrieval quality gains are uncertain without constrained validation. **Higher-level goal:** run a bounded spike with explicit success criteria.

31. **Price calculation rule (`if not 0 then =FLOOR((N5+30)/3)`) in a canonical application layer.** **Reason:** pricing logic should not live as ad-hoc spreadsheet behavior. **Higher-level goal:** confirm business context and apply once in a testable, logged pathway.

## Open Questions (remaining)

1. In **QR relocation**, which exact failure cases are most frequent (wrong target, lost state, wrong return navigation, duplicate moves)?
2. For **shelf totals**, should weight/item count include nested boxes only, loose items only, or both?
3. For **ERP sync integration**, which entities/fields are mandatory in the first automated iteration?
4. For dual-format **langtext export**, what are the exact field names and importer precedence rules?
5. For **optional basic-form fields**, should contract changes be backend-first or can frontend collect them before backend persistence is ready?
6. For **text-search relocation fallback**, should label search be exact-first, fuzzy-first, or reuse current global search behavior as-is?
7. For **transcript restructuring**, should we keep persistence unchanged in phase 1 and only refactor presentation?
8. For **search-query normalization**, where should canonical normalization live (frontend, backend, or both with backend final authority)?
9. For **logging declutter**, are there compliance/audit requirements that mandate retaining some QR/relocation events?
10. For **periodic backups**, what recovery targets (RPO/RTO) are required?
11. For **Postgres migration**, is migration already strategically decided or still under evaluation?
12. For **PWA**, is offline capability required now or is installability enough for first phase?
13. For **embeddings**, which primary use case should the spike optimize for (search relevance, deduplication, or review assistance)?
14. For the **price formula**, where should it apply first (UI preview, export pipeline, ERP sync, or all)?


## not yet expressed

- Allow in box view to relocate a selection of items. (Basically another ned to use the itemlist in the boxdetail)
- update this so the itemFLow actually produces a listPrice and then calculate the sellprice  (which we askto be confirmed in the review)
