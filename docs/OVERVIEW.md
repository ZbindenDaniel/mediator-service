# Project Overview

The mediator service coordinates warehouse inventory workflows by pairing a TypeScript/Node.js backend with a React frontend for managing boxes, items, and print assets. This overview gives a high-level snapshot of the system, plus references for architecture, planning, issues, and recent changes.

## Mission & Scope

- Provide API endpoints and background workers to manage boxes, items, QR scans, and CSV imports.
- Deliver a responsive React UI that surfaces search, detail, and import tooling for logistics teams.
- Maintain printable label templates and legacy scripts required for production operations.

## Project Parts

- **Backend services (`backend/`)** – API endpoints, background workflows, and integrations.
- **Frontend UI (`frontend/`)** – React screens for inventory operations, search, and printing.
- **Shared models (`models/`)** – TypeScript contracts shared across tiers.
- **Printing assets (`frontend/public/print/`)** – Label templates rendered by frontend and backend.
- **Data & media (`data/`, `media/`)** – CSV imports/exports, QR assets, and item imagery.
- **Agentic flows (`backend/agentic/`)** – AI-assisted enrichment pipeline with human review.

## Current Status (Broad)

- Backend and frontend share aligned TypeScript models and rely on dynamic action loading for API routes.
- CSV import/export, QR scanning, and print label flows are available and continue to receive incremental polish.
- Shopware support currently covers read-only product search plus a queued sync pipeline awaiting a real dispatch client.
- The legacy agentic runtime has been ported into the mediator under `backend/agentic/`; ongoing work focuses on stability and integration follow-through.

## Documentation Map

- **Architecture & data flow** → [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- **Current plans & next steps** → [`docs/PLANS.md`](PLANS.md)
- **Known issues & bugs** → [`docs/BUGS.md`](BUGS.md)
- **Recent changes** → [`docs/RECENT_HIGHLIGHTS.md`](RECENT_HIGHLIGHTS.md)
- **Setup & operations** → [`docs/setup.md`](setup.md)
- **Category taxonomy data** → [`docs/data_struct.md`](data_struct.md)

## Recent Highlights
- Added legacy CSV schema detection, normalized Stück quantities into per-item instances, and renamed the Mix unit to Menge for grouped inventory tracking.
- Replaced the print label action with a non-navigating control and added modal logging around item label printing.
- Added compact header icon navigation for create/items/boxes/activities and removed redundant card-level links now covered by the header.
- Hardened box ID sequencing to filter B-prefixed IDs and retry on collisions with warning logs.
- Added Artikel_Nummer to the import-item success payload and aligned the item creation dialog with response-backed metadata while logging missing response fields.
- Centralized item category lookup builders in shared models so backend and frontend reuse the same map logic.
- Updated unified print label actions to use shared category lookups with backend-safe imports and contextual error logging.
- Enriched the item creation success dialog with Artikelnummer context and a direct label print action for faster follow-up.
- Added a UI action in item detail to close in-progress agentic runs and unblock queued approvals.
- Updated item detail neighbor navigation to respect saved list filters when resolving adjacent items.
- Re-enabled the Unterkategorie filter on the item list, persisted subcategory selections, and added backend query support to avoid client-only filtering for large lists.
- Swapped the Unterkategorie filter input for taxonomy-backed select options and logged missing subcategory selections to keep filters resilient.
- Mapped Langtext Qualität labels back into the numeric Quality field during CSV/form imports while cleaning the Langtext payloads.
- Split item list box vs. shelf normalization so Behälter and Lagerort links only render with their respective IDs.
- Removed the default-location relocation button and API option so item moves always target an explicit box selection.
- Updated shelf creation to resolve category labels from taxonomy lookups with fallback logging, and removed legacy category seeding now that CSV imports will own this workflow.
- Added shelf box detail payloads that surface contained boxes and render them in the UI detail view alongside items.
- Switched ERP sync imports to a curl-based multipart upload that matches the ERP payload fields and timeout semantics.
- Added a minimal pricing stage in the agentic item flow with a dedicated pricing rules prompt to align Verkaufspreis handling across prompts and schemas.
- Reordered the agentic item flow so the pricing stage runs before supervisor review feedback is generated.
- Guarded the pricing stage with a timeout so supervisor review continues when pricing stalls.
- Added a shelf creation form in the box list UI backed by shared shelf location metadata for consistent ID generation.
- Added a hidden admin shelf creation route with stronger validation and logging around shelf location selections.
- Updated shelf creation to require subcategory selection so shelf IDs carry numeric category codes.
- Filtered relocation shelf dropdowns by category-aware shelf IDs so box relocations surface relevant shelves faster.
- Removed box detail label editing from the note workflow so note-only updates preserve stored labels.
- Added shelf creation payload handling with prefix-based sequencing for shelf IDs.
- Added an A4 shelf label print template to prepare for shelf-specific print endpoints.
- Expanded activities search matching to include box/shelf identifiers and clarified the search hint copy.
- Wired the A4 shelf label print template into the box print action with shelf category resolution for QR payloads.
- Made agentic search plan and per-request query limits configurable via env settings for the item flow pipeline.
- Added CSV import alias coverage for ItemUUID/Auf Lager headers and hardened boxes-only ingestion logging.
- Added a bulk “Sync to ERP” action button on the item list to trigger `/api/sync/erp` with selected IDs.
- Added camera capture support in item forms so photos can be captured directly into data URLs.
- Persisted item list filter preferences with a header reset indicator to keep search context between visits.
- Added a review-time fallback that assigns `Verkaufspreis` from the category/type lookup table when approvals finish without a price.
- Normalized CSV exports to emit canonical category labels when serializing category codes for partner payloads.
- Padded exported `Artikel-Nummer` values to a six-digit format for downstream CSV consumers.
- Introduced activities search entry points on the recent events card and activities page for quicker refinement.
- Added optional search-term filtering for the recent activities feed based on entity or article identifiers.
- Wired the activities search term into the activities page API request so filtering updates with the URL state.
- Update the closing of larger tasks in [RECENT_HIGHLIGHTS]()
- Introduced topic-based event log allowlists across backend and frontend feeds, defaulting to full visibility unless configured.
- Introduced default shelf location mapping configuration for subcategory-backed location IDs, logging missing mappings to protect data quality.
- Added shelf BoxID format validation for boxes.csv ingestion to warn and skip malformed shelf IDs.
- Simplified box location tags in the UI to show normalized locations and optional labels without color mapping.
- Added a dedicated 29x90 item label template and routed item print jobs to it for the new item label format.
- Filtered the Behälter list view to exclude shelf records so shelves no longer appear as boxes.
- Filtered shelf box detail payloads to hide shelf records from the Behälter card while logging filtered counts.
- Clarified relocate-box shelf dropdown labels by splitting shelf IDs into location, floor, and shelf number segments.
- Wired the recent activities term filter helper into the action context with fallback logging.
- Normalized printer status responses with ok/reason data and surfaced printer misconfiguration hints in the overview UI.
- Derived shelf display labels in the box list using shelf location metadata for clearer shelf rows.
- Added a manual agentic review close endpoint to approve items without existing agentic runs and log the closure reason.
- Updated the 62x100 box label template to render a bold box ID with a large QR code for box-specific printing.
- Unified label printing behind `/api/print/:labelType/:id` while keeping thin box/item wrappers for migration.
- Added a frontend auto-print toggle for item creation flows, with shared label request handling and configuration logging.
- Refined the item list filter bar layout to render side-by-side controls with better alignment across responsive breakpoints.
- Wrapped the item list filter controls into primary and secondary panels with consistent grid wrappers for cleaner alignment.
- Added grid-based filter panel styling to keep filter controls aligned within responsive boxes.
- Enabled manual agentic run closes even when runs are marked as not started after import/export cycles.
- Blocked item editing while agentic runs are active in the item detail and edit flows.

See [`docs/RECENT_HIGHLIGHTS.md`](RECENT_HIGHLIGHTS.md) for the latest changes and release notes.
