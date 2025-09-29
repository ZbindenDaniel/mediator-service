# Open Bugs & Issues

This list tracks defects that require fixes. Cross-reference the planning context in [OVERVIEW.md](OVERVIEW.md) and the component guidance in [AGENTS.md](AGENTS.md).

## Build & Tooling
- `sass` CLI is required for tests and builds. When unavailable the build fails with `sh: 1: sass: not found`. Registry restrictions can block installation.

## UX & Workflow
- Confirming "Entnehmen" is not yet implemented; users can remove items without a confirmation step.
- Double-clicking the username should allow editing, but the behavior is currently missing.

## Data Handling
- Moving boxes or items does not trigger a full reload, causing stale views after mutations.
- Monitoring persisted image writes and `agenticSearchQuery` handling in `backend/actions/import-item.ts` is needed to ensure data consistency.

## Layout & Presentation
- Item short description (Kurzbeschreibung) layout needs improvement for readability.

## Agentic Flow
- Switching from the agentic edit form to manual editing is missing a direct link button in `ItemForm_Agentic`.
- The asynchronous agentic run trigger in `frontend/src/components/ItemCreate.tsx` still needs refinement based on UX feedback.
