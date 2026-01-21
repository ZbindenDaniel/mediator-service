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

- Auto-save box photo uploads through the existing note-save move flow so notes and photo updates persist together with consistent status feedback, while clearing photo upload flags on success.
- Documented all environment variables in a dedicated reference and expanded the example `.env` template to match runtime usage.
- Updated agentic prompt/echo messaging to reference Postgres-compatible SQL in preparation for the database migration.
- Added baseline tests for core backend actions (import, save, list, search, QR scan) with match/handle coverage and response assertions to reduce regression risk.
- Noted layout constraints: mobile stays flex single-column, grid only above the breakpoint, and the ItemDetail card swap keeps references left with Fotos right and stacked images.
- Added UI workflow tests for agentic trigger handling and match selection search error/cancel flows.
- Balanced wide-screen landing grids by letting item/box detail tables and activity lists span both columns for readability.
- Added grid span utilities and applied select layout spans on landing, item, and box detail cards for clearer wide/tall layouts.
- Clarified the recent highlights log by replacing an empty placeholder link with a concrete documentation note for easier tracking.
- Locked Einheit from edit flows in the UI and backend so existing item units remain immutable during reference updates.
- Added a post-import success dialog reload in the ZIP import UI to refresh visible data while logging failures to display the dialog or reload.
- Updated the recent activities list to label entity IDs more clearly and surface item Artikelbezeichnung details for faster scanning.
- Updated export generation to group item rows by Artikelnummer, quality, and box/location for more predictable CSV payloads, while keeping legacy identifiers minimal for reconciliation.
- Omitted ItemUUID columns from grouped CSV exports and blanked grouped ItemUUID values to avoid inconsistent instance references in backup/ERP feeds.
- Added media storage configuration toggles with validation and resolved media directory logging to keep development defaults predictable.
- Added explicit export modes so backup exports keep instance-level ItemUUIDs while ERP exports stay grouped and intentionally leave ItemUUIDs blank because grouped rows are not instance-specific.
TODO(export-docs): keep backup-vs-ERP export language aligned with grouped ItemUUID blanking and instanzscharf backup behavior.
- Normalized grouped item summaries to prefer instance sequence `1` (parsed from the trailing `-####` ItemUUID suffix, e.g. `-0001`) as the representative record while logging fallbacks when no canonical instance exists; this is a canonical display update, not an export/agentic/printing change.
- Isolated item reference updates in the save-item edit flow so instance fields stay untouched during metadata edits.
- Implemented reference-only edit payloads to keep item edit flows scoped to `item_refs` while logging and guarding against instance-field updates.
- Added item detail instance summaries to surface per-reference inventory visibility in the detail view payload/UI.
- Grouped item list and box detail rows in the frontend to surface counts while keeping list filtering and sorting aligned with grouped summaries.
- Shifted ItemUUID minting to the Artikelnummer-based `I-<Artikelnummer>-####` format.
- Adjusted item creation auto-printing to respect instance vs. bulk label policies and log partial print failures for follow-up.
- Logged legacy CSV schema detection during validation, added category-aware bulk quantity normalization for legacy imports, and skipped empty/failed rows with explicit telemetry.
- Added structured logging around Produkt schema legacy column mappings to improve import observability without widening data model scope.
- Updated instance item grouping and print quantity logic to use grouped counts while keeping `Auf_Lager` numeric for bulk items, with warnings for anomalous instance stock values.
- Isolated bulk Einheit=Menge items in grouped UI lists while surfacing Auf_Lager display quantities alongside instance counts for Stück items.
- Split bulk Einheit=Menge items into unique grouped rows keyed by ItemUUID and updated list displays to show `Auf_Lager`-based quantities alongside instance counts.
- Keyed agentic run bulk queueing and instance detail status summaries off ItemUUIDs, with aggregated agentic status now surfaced in grouped list views.
- Added instance-scoped search limits for add-item workflows to return more item rows while logging truncation for debugging.
- Enabled deep search defaults for Kurzbeschreibung/Langtext matching while keeping the flag available for API callers.
- Hid quantity details for non-bulk items in the detail view while logging invalid Einheit values to avoid confusion around instance counts.
- Swapped the recent activities card to a semantic table layout with reusable list styling for easier scanning.
- Split item detail metadata into reference/instance cards and surfaced additional instance metadata alongside a separate instances table card.
- Moved item detail actions so edit sits with reference data, instance withdrawal sits with instance data, and deletion is no longer exposed in the UI.
- Reworked search results to render as a compact list layout that aligns core item and box fields in a single row.
- Refined add-item dialog result rows with a compact layout to keep search actions visible while tightening spacing.
- Made item detail instance rows navigable to instance-specific detail pages while preserving reload behavior for the current instance.
- Added item detail API payloads to return explicit reference data alongside instance lists to keep item metadata separated.
- Added Einheit selection to the item creation basic info step so new items start with a default unit that flows into creation payloads.
- Shared shelf label formatting between box and item lists so shelf locations show location, floor, and shelf IDs consistently.
- Centralized shelf label formatting in the frontend to standardize Lagerort labels across box and item lists with safe parsing and logging.
- Normalized item creation quantity handling to keep Auf_Lager flowing through match selection and guard against missing payloads while clarifying bulk-vs-instance behavior in the UI.
- Aligned agentic close availability to allow closing in any non-running state while keeping running runs locked to prevent accidental termination.
- Aligned relocation create-and-move flow with auto-print item label behavior to match creation-time printing expectations.
- Made box detail item rows open the representative item on click/keyboard while removing the redundant details action.
- Adjusted grouped list and box detail quantity display to use bulk Auf_Lager values for Menge items while logging parse failures.
- Fixed ItemUUID parsing to handle Artikelnummer-based identifiers even when legacy prefixes overlap, preventing creation-by-reference collisions.
- Refined landing page grid styles to keep single-column defaults and expand to responsive multi-column layouts at larger breakpoints.
- Removed the duplicated reference card from the item detail view to keep reference data displayed once.
- Reordered item detail cards so reference data appears in the primary card while photos sit in a dedicated Fotos card.
- Moved the reference edit action to the bottom of the reference card and matched the Fotos card height to the reference layout span.
- Reaffirmed landing page grid columns with a mobile-first single-column default and stepped breakpoints for medium and large screens.
- Restored mobile flex stacking for shared grid layouts while keeping landing grids in multi-column mode only at larger breakpoints.
- Increased the desktop container max-width cap at larger breakpoints to better use wide screens.
- Updated mobile container sizing to prevent overflow by constraining widths to the viewport.
- Added a pre-submit confirmation prompt when creating multiple Stück instances to avoid accidental multi-instance creation.
- Normalized agentic run handling to resolve canonical ItemUUIDs per Artikelnummer and skip reference-scoped runs when one already exists, with added logging for fallbacks and resolution failures.
- Reinforced non-bulk import creation to log requested quantities, mint each instance safely, and report final instance counts for multi-quantity imports.
- Stacked the Fotos media gallery in item detail cards to keep image tiles consistently sized in a vertical layout.
- Ensured item creation responses surface multi-instance ItemUUID lists with safe UI parsing and navigation-target logging for bulk creates.
- Prevented multi-instance import creation from reusing the same ItemUUID in a single batch by reserving minted identifiers during import response assembly.
- Extended the test harness matchers to cover Jest-style throw checks, call counts, and subset equality for objectContaining expectations.
- Updated container media configuration defaults so Dockerfile directory creation and compose volume mappings support WebDAV storage mode paths.
- Refined the stacked Fotos gallery layout to keep photo cards vertically aligned with consistent sizing.
- Realigned box detail summary cards into left/right columns, embedded inline item creation on the overview, and compacted the overview stats placement for a tighter landing layout.
- Moved the overview statistics card beneath the Erfassen entry and matched its width to the primary column for a clearer landing layout balance.
- Enabled item detail agentic close to upsert when no prior run exists, keeping close available for loaded items.
- Added a navigable location link on box detail summaries so valid shelf locations can be opened directly while keeping missing-location logging intact.
- Removed the edit-form media gallery header and made Foto 1 optional in item creation flows, aligning UI validation and labels with optional photo uploads.
- Batched item grouping warnings to handle unplaced items as a single bucket and reduce per-item log noise.
- Adjusted item detail row grouping to treat Menge as instance data and refreshed the Vorrat table to show UUID text with quality badges for clarity.
- Enabled nullable quality handling across shared models, persistence defaults, and creation flows while updating UI badges to show a `?` indicator when no quality is set.
- Hardened the agentic trigger failure handler with bound status-update flags and contextual logging to prevent SQL parameter crashes.
- Added an explicit event-level mapping for Updated events so observability metrics no longer default to error severity.

## Documentation Map

- **Architecture & data flow** → [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- **Current plans & next steps** → [`docs/PLANS.md`](PLANS.md)
- **Known issues & bugs** → [`docs/BUGS.md`](BUGS.md)
- **Recent changes** → [`docs/RECENT_HIGHLIGHTS.md`](RECENT_HIGHLIGHTS.md)
- **Setup & operations** → [`docs/setup.md`](setup.md)
- **Category taxonomy data** → [`docs/data_struct.md`](data_struct.md)
