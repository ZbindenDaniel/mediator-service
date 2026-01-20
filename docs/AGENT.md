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

## Planned Work Log

### Isolate item reference updates in save-item (completed)
**Goal & motivation:** Ensure edit requests for `/api/items/:id` only persist `ItemRef` data so instance fields (location, quantities, timestamps) are not accidentally overwritten, improving data integrity and auditability. This keeps edits scoped to reference metadata while preserving instance state.

**Implementation summary (minimal diff):**
1. Switched the PUT handler in `backend/actions/save-item.ts` to build a reference-only payload from `ItemRef` keys and persist to `item_refs` without touching instance fields.
2. Added logging for ignored instance-only fields and reference persistence failures, with try/catch protection around the transaction.
3. Verified `models/item.ts` did not require new fields and kept the reference builder limited to existing keys.
