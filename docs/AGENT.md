# Agent Guidelines

Get an overview of the project in `OVERVIEW.md`. There you will see what changes are up next. You will also track your progress in this file. If you find parts of the application undocumented add them in `OVERVIEW.md` or a linked file.

When implementing always assure logging and error handling is present.

Before starting a task find relevant files and add TODOs to them.

## Planning Mode Expectations

When the user requests help with planning (without writing code):

1. **Clarify the goal and motivation** – begin by restating the objective, why the change is needed, and the value it brings to the application.
2. **Document the plan** – record the proposed approach in the repository documentation (e.g., update this document or related planning notes) so future contributors can follow the reasoning.
3. **Target current behaviour only** – ignore legacy checks and backwards compatibility concerns unless the user explicitly requires them.
4. **Favour minimal, elegant solutions** – recommend the smallest viable change that satisfies the goal instead of broad or invasive rewrites.
5. **Provide actionable steps with references** – list detailed instructions that point directly to the files, modules, or components involved (use fully qualified paths or distinctive identifiers).
6. **Plan for parallel execution** – structure the work so that different contributors can implement separate steps without merge conflicts (e.g., isolate file ownership or stagger shared edits).
7. **Be critique and far sighted** - check if the planed change is meaningfull and doe not add technical dept.

These planning responses should be explicit enough that another developer can implement them without additional clarification.

## Coding Mode Guardrails

When implementing a plan:

1. **Follow the documented architectural patterns** – prefer existing mediator patterns in `backend/` services and reuse shared utilities from `frontend/src/common/` before introducing new abstractions.
2. **Respect data contracts** – double check changes to models under `models/` and `backend/src/models/` so API schemas and TypeScript types stay in sync.
3. **Maintain observability** – extend the established logging helpers in `backend/src/lib/logger.ts` and `frontend/src/utils/logger.ts`; include try/catch blocks where they provide meaningful recovery paths.
4. **Keep changes scoped** – update only the components, routes, or scripts necessary for the task, favouring incremental diffs that are easy to review.
5. **Update TODOs and documentation** – resolve or refresh adjacent TODO comments and mirror substantive changes in this documentation so future planning stays accurate.

These planning responses should be explicit enough that another developer can implement them without additional clarification.

## Agentic Prompt Best Practices
- Keep prompt sections aligned with `backend/agentic/flow/item-flow-schemas.ts::TargetSchema`; update both together when fields change.
- Emphasise JSON-only output, locked field preservation, and the limited `__searchQueries` allowance when revising extraction instructions.
- Tie device guidance directly to schema keys (`Langtext`, `Kurzbeschreibung`, `Artikelbeschreibung`) so downstream validators stay consistent and the prompt remains concise.
- Do not expose system-only identifiers like `itemUUid` in prompts; the item flow injects them automatically.


## Export mode usage (operator-facing)
- Use `mode=manual_import` for human-reviewed/manual CSV workflows; this emits the legacy labeled header set used by manual operators.
- Use `mode=automatic_import` for ERP automation only; this is pinned to the ERP import baseline header contract (`data/archive/test_import.csv`) to keep sync payloads deterministic.

## Planned Work Log

### Stabilize test harness + align log expectations (planned)
**Goal & motivation:** Restore a reliable test baseline by eliminating cascading native-module failures and aligning log assertions with current Artikel_Nummer messaging so we can focus on real regressions and improve coverage.

**Implementation plan (minimal diff):**
1. Add TODO notes before changes in `test/harness.js`, `scripts/run-tests.js`, and `backend/db.ts` to highlight the specific native-module resolution paths and DB lifecycle hooks we need to touch, then ensure missing `better-sqlite3` either triggers a clear early exit or an explicit mock path (no new runtime dependencies).
2. Update `test/item-create-trigger-handler.test.ts` to expect the new “Artikel_Nummer” log copy, keeping assertions scoped and aligned with existing logging utilities.
3. Audit `test/item-persistence-reference-behavior.test.ts` and `test/langtext-contract.test.ts` to confirm database connections are opened before `clearDatabase` and closed once per suite, with added logging/try-catch in cleanup helpers to avoid silent failures.
4. Re-run `npm test` to confirm the harness no longer collapses into MODULE_NOT_FOUND errors and that updated expectations reflect current behaviour.

### Handle agentic trigger already-exists skip (in progress)
**Goal & motivation:** Avoid surfacing redundant failure alerts when a run is already queued, while keeping the frontend change minimal and aligned with the existing error contract.

**Implementation summary (minimal diff):**
1. Add frontend handling to treat `already-exists` trigger responses as skips with lightweight logging.
2. Keep reporting/alerts for true failures only, preserving current error handling behavior.
### Add Behälter column to item instance table (in progress)
**Goal & motivation:** Make the Vorrat table show per-instance container IDs (Behälter) instead of instance-level Ki status so staff can navigate directly to the correct box, aligning the UI with the shared agentic status and improving warehouse lookup accuracy.

**Implementation plan (minimal diff):**
1. Add a TODO note and update `frontend/src/components/ItemDetail.tsx` to swap the Vorrat table column from Ki to Behälter, render `BoxID` with a link to `/boxes/:id`, and log when `BoxID` is unexpectedly missing.
2. Confirm `models/item-detail.ts::ItemInstanceSummary` contains `BoxID` and that `backend/actions/save-item.ts` includes it when normalizing instance payloads, avoiding new model changes.
3. TODO(agent): Reconfirm the Behälter column label and link behavior after UI review before expanding any related UI changes.

### Isolate item reference updates in save-item (completed)
**Goal & motivation:** Ensure edit requests for `/api/items/:id` only persist `ItemRef` data so instance fields (location, quantities, timestamps) are not accidentally overwritten, improving data integrity and auditability. This keeps edits scoped to reference metadata while preserving instance state.

**Implementation summary (minimal diff):**
1. Switched the PUT handler in `backend/actions/save-item.ts` to build a reference-only payload from `ItemRef` keys and persist to `item_refs` without touching instance fields.
2. Added logging for ignored instance-only fields and reference persistence failures, with try/catch protection around the transaction.
3. Verified `models/item.ts` did not require new fields and kept the reference builder limited to existing keys.
