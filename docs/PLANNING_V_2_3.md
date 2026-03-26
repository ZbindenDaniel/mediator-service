# Planning v2.3

This document tracks planning inputs for **version 2.3**. Details are also tracked in [todo](/todo.md).

## Current status

No v2.3 implementation work has started yet.

Reason: separate upcoming planning work from shipped v2.2 history to keep release coordination auditable and reduce stale-plan noise in active documentation.

Higher-level goal: keep v2.3 planning minimal, explicit, and easy to execute in small reviewable steps.

## Planning intake template (use when v2.3 work starts)

- Goal: what outcome is needed.
- Reason: why this change is needed now.
- Scope: minimal files/modules to touch.
- Data contracts: confirm whether `models/` or API payloads are affected.
- Logging/error handling expectations: where existing logs/try-catch paths should be extended.

## Sprint Planning - v2.3 Priority Order

### Phase 1: Critical Bugs (Priority 0 - Stability)

## Intake: Harden batch agentic start concurrency handling

- Goal: prevent multiple agentic runs from starting concurrently for the same Artikel_Nummer, causing state corruption and operator confusion.
- Reason: concurrency races can corrupt run state and confuse operators; multiple active runs were observed in production.
- Scope: `backend/actions/agentic-trigger.ts`, `backend/agentic/index.ts` - add run state checks before starting new runs.
- Data contracts: no changes to `models/agentic-run.ts` or API payloads; only internal state validation logic.
- Logging/error handling: add structured logging around ignored start requests and state conflict detection with clear error messages for operators.

### issues

- items land directly in the state running when created which is not wanted. the first state should always be pending
- Also items which are started manually directly are 'running'. Also when using badge selection from itemList
- when more then 3 items are running (through the bugs above ) the entire flow stops and hangs until the runs are stopped
- transcripts are saved as html in 'shopbilder'. We want to instead use JSON and use another location 'items-meta-data'

### improvements & checks
- review stats should be fetched again after the categorizer stage so we actually have stat data for the extraction step
- When fields are present in the initial item (i.e. dimensions from the basic form) it should either be improved or left as is. Now the extractor overrides it with null.

## Intake: Resolve QR relocation flow inconsistencies  

- Goal: stabilize QR scan handoff and navigation during item/box relocation workflows to eliminate edge-case failures.
- Reason: relocation errors directly impact physical inventory operations and workflow efficiency.
- Scope: `backend/actions/qr-scan.ts`, relocation action handlers, frontend QR scan components - focused fixes for transition points.
- Data contracts: preserve existing QR payload structure and scan log formats.
- Logging/error handling: add meaningful try/catch + structured logging at scan handoff transition points with actionable error recovery guidance.

### issues

- items can not be relocated via QR scan through the item view. 'Artikel umlagern' allows a QR scan but it stay without effect. So scanning an item from the box-detail works but scanning a box from the item-detail doesn't.
- relocating a box to a shelf in the same way also doesn't work. One can scan a shelf label but with no effect.
- Same for adding a box to a shelf via 'hinzufügen'. This only expects an item scan.
- after relocating through scan the page is reloaded so we 'jump' to the top which is bad for the UX. we should land at the relocation card.
- A box may be deleted from the system but physically still exist. It would be nice to create a box from a scan. So if the id does not exisit we prompt the user to create it.

### improvements & checks
- In the future we would like to implement multi-scan for a smoother flow and additional functionallity (i.e. inventory). This shall be researched.

## Intake: Fix shelf weight and item count aggregation

- Goal: ensure shelf totals display accurate weight and item counts across nested boxes and loose items.
- Reason: incorrect aggregates are a data contract quality issue and reduce trust in inventory views.
- Scope: aggregation helpers in `backend/actions/list-items.ts`, `backend/actions/box-detail.ts` - align calculation logic.
- Data contracts: verify shelf summary payload fields remain consistent in API responses.
- Logging/error handling: add validation logging for unexpected aggregation results and null/undefined weight handling.

### issues

- When navigating to the detail-Liste of a shelf we don't see the items which are in boxes. This is clear because we filter the items based on the shelf ID. We need to consider the fields 'Behälter' AND 'Lagerort'.
- the locationTag is broken. Some tags are links and some are just text. The links also don't work (they try to navigate to the label not the id, i.e. '/boxes/Regal B1')
- the box filter in the itemList filters onKeyEnter so every keystroke the list is updated. This should be done like the filter input 'Artikelname' already does.
- boxList does has very rudimentary filters. We want extend filters.
- the itemList inside the boxDetail alwys shows 'Nicht gestarted' for the AI runs. this is wrong and also is the information not needed there. remove the column 'Ki'.

### improvements & checks
- shelfs and boxes should be visually seperated in the boxList. add a CSS class which adds a slightly different background.

### Phase 2: Testing and Reliability Improvements

## Intake: Add qty=0 item visibility controls

- Goal: preserve record traceability for zero-stock items while keeping them out of default browse lists.
- Reason: users need detail access for audit and follow-up while keeping main lists focused on active inventory.
- Scope: `backend/actions/list-items.ts` query filters, frontend list components - minimal query/filter adjustments.
- Data contracts: no changes to item model; only query behavior and list filtering logic.
- Logging/error handling: add logging for zero-stock item access patterns and explicit navigation tracking.

### issues
- this is implemented but it should be better visualized if an item is not in stock. (through color)
- Items can be taken ('entnehmen') which sets the qty to zero (resp. decrements). A inverse functionallity should exisit. WHich means we also have a 'Hinzufügen' button for single-instance-items. This button allows to re-add an item (setting qty to 1)
- 'Hinzufügen' button for 'Menge'&'Stück' items should prompt confirmation too.

### Phase 3: Workflow and UX Enhancements (Selected Priority 1-2 Items)

## Intake: Add EAN number population workflow

- Goal: enable EAN barcode capture and display in item forms with import/export pipeline integration.
- Reason: EAN field exists in export schema but lacks population logic for standard product identification.
- Scope: item form components, `backend/actions/import-item.ts`, EAN validation helpers.
- Data contracts: EAN field already exists in export; add input validation and form field binding.
- Logging/error handling: add EAN validation logging and duplicate EAN detection during imports.

## Intake: Add unplaced items warning system

- Goal: display warning when too many items are unplaced during item creation to alert operators about inventory placement issues.
- Reason: high unplaced item counts indicate workflow problems that need operator attention.
- Scope: `backend/actions/add-item.ts`, item creation components - add threshold checks and warning display.
- Data contracts: no model changes; add unplaced item count queries and warning thresholds.
- Logging/error handling: add structured logging for placement workflow patterns and threshold breach notifications.


## Intake: media handling simplification (pending)

- Goal: simplify media handling so item source media remains predictable and operational cleanup is explicit.
- Reason: recent incidents showed brittle cleanup behavior can target mounted shares unexpectedly when runtime/test configuration drifts.
- Higher-level goal: reduce accidental data loss risk by preferring explicit operator workflows over implicit recursive cleanup.
- Scope (minimal): document and enforce a single storage contract (`shopbilder` source by `Artikel_Nummer`, `shopbilder-import` flat sync mirror) without broad model rewrites.
- Data contracts: keep existing item/export contracts unchanged (`Grafikname`, `ImageNames`, CSV headers); only path-handling and operational policy should tighten.
- Logging/error handling: require structured logs for all destructive file operations and `try/catch` around filesystem mutations where recovery diagnostics are needed.
- Cleanup policy direction: runtime should avoid bulk recursive cleanup; when cleanup is needed, execute dedicated shell scripts manually or via explicit maintenance jobs.
