# Project Overview

The mediator service coordinates warehouse inventory workflows by pairing a TypeScript/Node.js backend with a React frontend for managing boxes, items, and print assets. This document provides a planning-oriented snapshot of priorities, risks, and recent progress.

## Mission & Scope
- Provide API endpoints and background workers to manage boxes, items, QR scans, and CSV imports.
- Deliver a responsive React UI that surfaces search, detail, and import tooling for logistics teams.
- Maintain printable label templates and supporting scripts for production operations (legacy fallbacks have been retired).

## Current Status
- Backend and frontend share aligned TypeScript models and rely on dynamic action loading for API routes.
- CSV import/export, QR scanning, and print label flows are available but still receive incremental polish.
- The codebase now targets the modern TypeScript services exclusively; legacy JavaScript fallbacks have been removed.

## Next Steps
- Audit remaining detail routes (e.g., BoxDetail, ItemDetail) to determine whether the shared `LoadingPage` pattern should be applied for initial fetches.
- Enable switch from agentic to manual edit via button. Very simple link button from ItemForm_Agentic to ItemForm.
- Move of items and boxes triggers reload.
- Verify the refactored `backend/ops/import-item/*` helpers under production load and expand structured logging if additional insights are required.
- Kurzbeschreibung needs better layout.
- 'entnehmen' has no confirmation. It should have.
- On double click on the username it should be possible to change the user name.
- Continue refining the asynchronous agentic run trigger in `frontend/src/components/ItemCreate.tsx` as UX feedback arrives.

## Risks & Dependencies
- Tests and builds require the `sass` CLI. Missing or partially installed `sass` causes `sh: 1: sass: not found`, and registry restrictions may prevent installing the dependency.
- Refer to [BUGS.md](BUGS.md) for additional tracked defects.

## Upcoming Opportunities
- Sanitize print preview URLs before injecting them into the DOM to avoid potential XSS issues.
- Replace shell `exec` in the printing helper with a safer spawn approach and validate printer commands.
- Enforce size limits and validate content for uploaded CSV files prior to writing them to disk.
- Integrate dependency vulnerability scanning (e.g., `npm audit`) once registry access is available.

## Recent Highlights
- Introduced the shared `LoadingPage` experience on landing and item list routes so top-level pages display a consistent loading state while fetching data.
- Added backend support to remove items from boxes and delete items or boxes via new API endpoints.
- Exposed removal and deletion controls in the React UI and made stock counts read-only when editing items.
- Wrapped removal and deletion in database transactions and added unit tests to verify item stock and box deletion logic.
- Extended existing move and save/import actions to use database transactions for atomic updates and event logging.
- Introduced a CSV export endpoint with date filters for item data.
- Box and item IDs now follow the `B-ddMMyy-####` / `I-ddMMyy-####` pattern.
- Added an API and React page to list all items, linked from the search card.
- Confirmed inventory adjustments, styled item lists for mobile, added filter for unplaced items, and disabled UI during CSV uploads with automatic reload.
- CSV validation now reports the number of parsed items and boxes.
- Styled the AddItemToBoxDialog modal using shared card classes for a consistent look.
- Reintroduced Box IDs on overview and box detail cards, aligned CSV export columns with import format, restyled the add-item dialog text color, and switched list views to short `dd.MM.yyyy` dates.
- Persisted up to three item images to `media/{ItemId}` and stored the first image path in `Grafikname`.
- Warn users when deleting a non-empty Behälter and translate UI text from "Box" to "Behälter" throughout.
- Statistics now show "Artikel ohne Behälter" and list pages use `dd.MM.yyyy` dates.
- Item details now show the creator and current stock, remove the Standort field, and events list include article numbers and descriptions.
- Images persist across item edits with `{Artikelnummer}-{imgNumber}` naming, and item models no longer carry picture fields.
- Restored agentic search-query storage using the simplified `backend/db.ts` schema and the `upsertAgenticRun` helper.
- Updated the item creation workflow to trigger agentic runs asynchronously via `frontend/src/components/ItemCreate.tsx` while `backend/actions/import-item.ts` handles persistence and image writes.

## Reference Links
- [Architecture Outline](ARCHITECTURE.md)
- [Component Responsibilities](AGENTS.md)
- [Open Bugs](BUGS.md)
