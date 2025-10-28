# Project Overview

The mediator service coordinates warehouse inventory workflows by pairing a TypeScript/Node.js backend with a React frontend for managing boxes, items, and print assets. This document provides a planning-oriented snapshot of priorities, risks, and recent progress.

## Mission & Scope
- Provide API endpoints and background workers to manage boxes, items, QR scans, and CSV imports.
- Deliver a responsive React UI that surfaces search, detail, and import tooling for logistics teams.
- Maintain printable label templates and legacy scripts required for production operations.

## Domain Concepts
- **Items & ItemRefs** – Catalog entries describing IT equipment (e.g., laptops, monitors). `ItemRef` captures canonical
  metadata while individual `itemInstances` track stock, storage status, and historical changes.
- **Boxes (Behälter)** – Physical containers that hold one or more items. Boxes are colour-coded by warehouse section so staff
  can quickly find them even in a chaotic layout.
- **Locations & Sections** – Warehouse zones identified by colour/label that group boxes for faster retrieval. Box records link
  to these locations.
- **Agentic Runs** – AI-assisted enrichment flows that start from partial item data, perform targeted web searches, and propose
  missing attributes for human review before acceptance.
- **Imports & ERP Bridge** – CSV uploads seeded from an external ERP initialize the catalogue. Future integrations (e.g.,
  Shopware) will build on the same ingestion path.
- **Printing & QR Labels** – Boxes and larger standalone items receive QR codes and human-readable stickers. The printing stack
  generates label PDFs, stores previews, and dispatches jobs to CUPS-compatible printers.

## Architectural Patterns in Practice
- **Action architecture** – The backend dynamically loads `backend/actions/*` modules that wrap database calls in
  transactions, emit audit events, and centralize logging. Each action focuses on a discrete workflow (inventory movement,
  imports, printing, agentic lifecycle updates).
- **Shared models** – TypeScript interfaces in `models/` are consumed by backend and frontend builds to keep API contracts
  aligned. Both tiers import these definitions directly.
- **React composition** – The frontend organises screens under `frontend/src/components/`, leaning on shared layout,
  asynchronous loading states, and `react-router-dom` routes to keep behaviours consistent.
- **Observability expectations** – Logging helpers in `backend/src/lib/logger.ts` and `frontend/src/utils/logger.ts` surface
  structured context during API calls, agentic runs, and UI events. Error paths capture stack traces or actionable messages.
- **Printing pipeline** – Frontend `public/print` templates pair with backend print actions so the same markup can be rendered
  locally or streamed to printers without duplicating layout logic.

## Current Status
- Backend and frontend share aligned TypeScript models and rely on dynamic action loading for API routes.
- CSV import/export, QR scanning, and print label flows are available but still receive incremental polish.
- Legacy JavaScript scripts remain for compatibility; modernization continues incrementally.

## Next Steps
- _Follow-up:_ Reconcile this list with `docs/BUGS.md` whenever major fixes land (Docs:owner@mediator, track for Q4 release).
- Audit remaining detail routes (e.g., BoxDetail, ItemDetail) to determine whether the shared `LoadingPage` pattern should be applied for initial fetches.
- Validate agentic fallback styling once design system secondary buttons are available.
- Move of items and boxes triggers reload.
- Monitor persisted image writes and `agenticSearchQuery` handling in `backend/actions/import-item.ts` for follow-up polish.
- Kurzbeschreibung needs better layout.
- 'entnehmen' has no confirmation. It should have.
- On double click on the username it should be possible to change the user name.
- Continue refining the asynchronous agentic run trigger in `frontend/src/components/ItemCreate.tsx` as UX feedback arrives.

## Risks & Dependencies
- Tests and builds require the `sass` CLI. Missing or partially installed `sass` causes `sh: 1: sass: not found`, and registry restrictions may prevent installing the dependency.
- Refer to [BUGS.md](BUGS.md) for additional tracked defects.

## Upcoming Opportunities
- Sanitize print preview URLs before injecting them into the DOM to avoid potential XSS issues.
- Capture dispatched CUPS job identifiers in logs so support staff can correlate queue issues with individual label requests.
- Enforce size limits and validate content for uploaded CSV files prior to writing them to disk.
- Integrate dependency vulnerability scanning (e.g., `npm audit`) once registry access is available.

## Recent Highlights
- Moved the detailed activities feed to `/activities` while limiting the landing page card to the latest three events with a shortcut link.
- Expanded the localized event label maps to cover newly tracked agentic lifecycle steps so UI timelines render translated copy for every restart, cancelation, and QR scan.
- Corrected the backend media directory resolution to keep item image persistence working after build outputs move into `dist/backend`.
- Enhanced the Node-based test harness with Jest-style utilities, enabling async-friendly matchers and richer diagnostics when running `node scripts/run-tests.js`.
- Added a manual fallback control to the agentic item creation form so users can exit to manual editing while preserving draft data.
- Introduced the shared `LoadingPage` experience on landing and item list routes so top-level pages display a consistent loading state while fetching data.
- Ensured item categories persist and round-trip correctly even without Artikelnummer assignments, with logging to surface missing metadata.
- Item and box label printing now share a single PDF per request, leave previews downloadable, and route jobs through the configured CUPS queue with structured error reporting.
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
- Restored agentic search-query storage using the streamlined `backend/db.ts` schema and the new `upsertAgenticRun` helper.
- Updated the item creation workflow to trigger agentic runs asynchronously via `frontend/src/components/ItemCreate.tsx` while `backend/actions/import-item.ts` handles persistence and image writes.

## Reference Links
- [Architecture Outline](ARCHITECTURE.md)
- [Component Responsibilities](../AGENTS.md)
- [Open Bugs](BUGS.md)
