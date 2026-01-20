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
- In progress: grouping helpers for list and box detail item payloads to support summarized responses.

## Progress Updates

- Updated export generation to group item rows by Artikelnummer, quality, and box/location for more predictable CSV payloads, while keeping legacy identifiers minimal for reconciliation.
- Normalized grouped item summaries to prefer instance sequence `1` as the representative record while logging fallbacks when no canonical instance exists.
- Isolated item reference updates in the save-item edit flow so instance fields stay untouched during metadata edits.
- Implemented reference-only edit payloads to keep item edit flows scoped to `item_refs` while logging and guarding against instance-field updates.
- Added item detail instance summaries to surface per-reference inventory visibility in the detail view payload/UI.
- Grouped item list and box detail rows in the frontend to surface counts while keeping list filtering and sorting aligned with grouped summaries.
- Shifted ItemUUID minting to the Artikelnummer-based `I.<Artikelnummer>-####` format while keeping legacy date-based identifiers parseable for imports and reconciliation.
- Adjusted item creation auto-printing to respect instance vs. bulk label policies and log partial print failures for follow-up.
- Logged legacy CSV schema detection during validation, added category-aware bulk quantity normalization for legacy imports, and skipped empty/failed rows with explicit telemetry.
- Added structured logging around Produkt schema legacy column mappings to improve import observability without widening data model scope.
- Updated instance item grouping and print quantity logic to use grouped counts while keeping `Auf_Lager` numeric for bulk items, with warnings for anomalous instance stock values.
- Keyed agentic run bulk queueing and instance detail status summaries off ItemUUIDs, with aggregated agentic status now surfaced in grouped list views.
- Added instance-scoped search limits for add-item workflows to return more item rows while logging truncation for debugging.
- Enabled deep search defaults for Kurzbeschreibung/Langtext matching while keeping the flag available for API callers.
- Hid quantity details for non-bulk items in the detail view while logging invalid Einheit values to avoid confusion around instance counts.
- Swapped the recent activities card to a semantic table layout with reusable list styling for easier scanning.
- Split item detail metadata into reference/instance cards and surfaced additional instance metadata alongside a separate instances table card.
- Reworked search results to render as a compact list layout that aligns core item and box fields in a single row.
- Refined add-item dialog result rows with a compact layout to keep search actions visible while tightening spacing.
- Made item detail instance rows navigable to instance-specific detail pages while preserving reload behavior for the current instance.
- Added item detail API payloads to return explicit reference data alongside instance lists to keep item metadata separated.
- Shared shelf label formatting between box and item lists so shelf locations show location, floor, and shelf IDs consistently.

## Documentation Map

- **Architecture & data flow** → [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- **Current plans & next steps** → [`docs/PLANS.md`](PLANS.md)
- **Known issues & bugs** → [`docs/BUGS.md`](BUGS.md)
- **Recent changes** → [`docs/RECENT_HIGHLIGHTS.md`](RECENT_HIGHLIGHTS.md)
- **Setup & operations** → [`docs/setup.md`](setup.md)
- **Category taxonomy data** → [`docs/data_struct.md`](data_struct.md)
