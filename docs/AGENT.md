<!-- TODO(agent): Revisit Langtext metaDataKeys documentation when the curated key list changes upstream. -->
# Agent Guidelines

Get an overview of the project in `OVERVIEW.md`. There you will see what tasks are up next. You will also track your progress in this file. If you find parts of the application missing in `OVERVIEW.md` add them.

When implementing always assure logging and error handling is present.

Before starting a task find relevant files and add TODOs to them.

Take one "next step" at a time and wait for user feedback before starting a new one.

## Planning Mode Expectations
When the user requests help with planning (without writing code):

1. **Clarify the goal and motivation** – begin by restating the objective, why the change is needed, and the value it brings to the application.
2. **Document the plan** – record the proposed approach in the repository documentation (e.g., update this document or related planning notes) so future contributors can follow the reasoning.
3. **Target current behaviour only** – ignore legacy checks and backwards compatibility concerns unless the user explicitly requires them.
4. **Favour minimal, elegant solutions** – recommend the smallest viable change that satisfies the goal instead of broad or invasive rewrites.
5. **Provide actionable steps with references** – list detailed instructions that point directly to the files, modules, or components involved (use fully qualified paths or distinctive identifiers).
6. **Plan for parallel execution** – structure the work so that different contributors can implement separate steps without merge conflicts (e.g., isolate file ownership or stagger shared edits).

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

## Planning Log

- **Langtext metadata normalization (Langtext-as-JSON decision)** – Converge on representing the `Langtext` field as structured JSON metadata across importer, agentic flows, and shared models so downstream tooling can parse localisation-ready key/value pairs. Before implementation we must double-check `models/item.ts` alongside `backend/agentic/flow/item-flow-schemas.ts` to confirm the shared contracts stay aligned and document any schema deltas for reviewers. The workflow is now JSON-first: the UI editor consumes the centrally curated `metaDataKeys` list (see the JSON editor hint in `frontend/src/components/forms/itemFormShared.tsx`) and prompts must emit objects whose keys align with that set so reviewers see stable slots.

### Parallel Workstreams

- **UI editor** – Introduce a guarded JSON-backed editor for `Langtext` in `frontend/src/components/forms/itemFormShared.tsx` and the related render helpers in `frontend/src/components/ItemDetail.tsx`, ensuring logging captures parse failures and sensible fallbacks keep existing displays stable.
- **Importer fallback** – Extend `backend/importer.ts` to parse Langtext JSON with try/catch-protected logging, preserving the current string fallback until all downstream consumers accept structured content.
- **Agentic schema update** – Teach `backend/agentic/flow/item-flow-schemas.ts` to validate structured Langtext payloads, coordinating changes with `models/item.ts` so the runtime schema and shared types remain in sync.

## Search Planner Stage Overview

- `runItemFlow` invokes the planner prior to `collectSearchContexts`, combining reviewer-provided `skipSearch` flags with the planner's `shouldSearch` directive to determine whether Tavily requests should execute for the item.
- When the planner indicates that search is required, its queries are passed through to `collectSearchContexts` ahead of the heuristic fallbacks so planner guidance runs first while legacy diversification still fills any remaining slots.
- Planner evaluations, reviewer intents, and the final gating decision are logged from `backend/agentic/flow/item-flow.ts` while the downstream search collector short-circuits immediately when `shouldSearch` resolves to `false`.
- Planner results are still validated in `backend/agentic/flow/item-flow-search.ts`; invalid payloads degrade gracefully to heuristic search plans.
