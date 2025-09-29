# Open Bugs & Issues

This list tracks defects that require fixes. Cross-reference the planning context in [OVERVIEW.md](OVERVIEW.md) and the component guidance in [AGENTS.md](AGENTS.md). When fixing a Bug remove it from this list.

## items list

- 'Behälter' shows Color instead of Box-Id
- Behälter is often times 'nicht gesetzt' although the item is in a Box.

## item form

- the header label is 'TODO'. this has happend during a merge. it should be removed there is no need for a label there.
- when editing the existing images are not set in the Inputs. the file input should show the filename
- 'Hauptkategorie' and 'Unterkategorie' are dropdown selections. the value lookup is missing. the Unterkategorie selection depends on the Hauptkategorie. Implement the structure with one example (Computer - Thin Client)
- 'Anzahl' default should be 1

## item search

- often times 'nicht gesetzt' is displayed bt when navigating to the item a box is set.

## item detail

- images ar not rendered. the request returns 404
- activities are not translated
  
### agentic runs

- always visible button 'cancel' is missing.

## recent activities

- The list should be move to its own page and on the landing page there should be simply a link card. the card should contain the last 3 activities.
- translation issues
- often times no actor is registered

## box detail

## Printing

- the label printing does not work at all. there have been changes in the last few merges. some for better some or worse. This needs urgent fixing.
  - when printing the label first the QR code is not rendered (JSON only) and when reloding nothing is.

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
