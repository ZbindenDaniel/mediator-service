# Project Overview
Dependency changes should refresh the lockfile via `npm install --package-lock-only` so CI lockfile checks remain green.

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
- **Printing & QR Labels** – Boxes and items receive QR codes and human-readable stickers. The printing stack generates label PDFs
  from the canonical `frontend/public/print/62x100.html` (boxes) and `frontend/public/print/29x90.html` (items) templates, stores
  previews, and dispatches jobs to CUPS-compatible printers. Shelf labels use the A4 template
  (`frontend/public/print/shelf-a4.html`) with QR payloads that include the shelf ID plus a category label resolved from the shelf
  ID segment (`S-<location>-<floor>-<category>-<index>`). Category segments are matched against canonical item category labels (see
  `models/item-categories.ts`), with numeric segments falling back to category code lookups.

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
- Shopware support currently covers read-only product search plus a queued sync pipeline awaiting a real dispatch client.
- The legacy ai-flow runtime has been ported into the mediator under `backend/agentic/`; follow-up work focuses on stabilising the
  in-process orchestrator and cleaning up the final integration tasks outlined in [SERVICE_FUSION](SERVICE_FUSION.md).

## Import/Export Archive Format
- `/api/export/items` now streams a ZIP archive containing `items.csv`, `boxes.csv`, and a `media/` folder mirroring the backend's
  `MEDIA_DIR`. The CSV payloads retain the partner column ordering and reuse existing metadata lookups (e.g., `collectMediaAssets`)
  so downstream clients receive the same image resolution hints as before.
- `/api/import` accepts ZIP uploads and stages `items.csv`, optional `boxes.csv`, and any `media/` assets. Missing components are
  tolerated; boxes-only or media-only uploads merge into existing records without clearing prior metadata, while `items.csv`
  updates continue to use duplicate detection and zero-stock flags.
- `/api/import/validate` validates the ZIP structure and reports item counts, referenced box IDs, and `boxes.csv` row counts to the
  frontend dialog. Validation surfaces server messages and any parser errors so operators can correct malformed archives before
  ingestion.

## ERP Sync Bridge
- `POST /api/sync/erp` accepts `{ actor, itemIds? }` and reuses the export serializer to assemble `items.csv` plus `boxes.csv`,
  producing a ZIP archive when media uploads are enabled. Item filters narrow the export set without changing column ordering
  or Langtext serialization.
- Environment variables:
  - `ERP_IMPORT_URL` (required): ERP endpoint used by the action's `curl` invocation.
  - `ERP_IMPORT_USERNAME` / `ERP_IMPORT_PASSWORD`: optional basic-auth credentials.
  - `ERP_IMPORT_CLIENT_ID`: optional ERP client identifier forwarded to the import endpoint.
  - `ERP_IMPORT_FORM_FIELD`: multipart field name for the staged file (defaults to `file`).
  - `ERP_IMPORT_INCLUDE_MEDIA`: toggles ZIP output with media/ folder linkage instead of a CSV-only upload.
  - `ERP_IMPORT_TIMEOUT_MS`: max execution time for the `curl` request in milliseconds.
- Payload mapping (mirrors the ERP's example import script):
  ```bash
  curl \
    -X 'POST' \
    -H 'Content-Type:multipart/form-data' \
    --silent --insecure \
    -F 'action=CsvImport/import' \
    -F 'action_import=1' \
    -F 'escape_char=quote' \
    -F 'profile.type=parts' \
    -F 'quote_char=quote' \
    -F 'sep_char=semicolon' \
    -F 'settings.apply_buchungsgruppe=all' \
    -F 'settings.article_number_policy=update_prices' \
    -F 'settings.charset=CP850' \
    -F 'settings.default_buchungsgruppe=395' \
    -F 'settings.duplicates=no_check' \
    -F 'settings.numberformat=1.000,00' \
    -F 'settings.part_type=part' \
    -F 'settings.sellprice_adjustment=0' \
    -F 'settings.sellprice_adjustment_type=percent' \
    -F 'settings.sellprice_places=2' \
    -F 'settings.shoparticle_if_missing=0' \
    -F "${ERP_IMPORT_FORM_FIELD}=@<export path>;type=${ERP_IMPORT_INCLUDE_MEDIA ? 'application/zip' : 'text/csv'}" \
    -F "login=${ERP_IMPORT_USERNAME}" \
    -F "password=${ERP_IMPORT_PASSWORD}" \
    -F "client_id=${ERP_IMPORT_CLIENT_ID}" \
    -F "actor=<actor>" \
    "${ERP_IMPORT_URL}"
  ```
  When media is enabled the action uploads the staged ZIP (`items.csv`, `boxes.csv`, optional `media/`) under the same field while the CSV-only path keeps `text/csv` as the content type.

## Next Steps
- Finish wiring the new `AgenticModelInvoker` through backend services so queue workers and actions invoke models without the
  HTTP proxy fallback.
- Continue validating the migrated `backend/agentic/` modules (flows, tools, prompts) with focused tests and linting once the
  invoker is fully integrated.
- Continue the Langtext-as-JSON rollout by auditing `models/item.ts` and `backend/agentic/flow/item-flow-schemas.ts` so importer and schema workstreams stay synchronized with the new UI key/value editor, then deprecate the legacy string fallback once `[langtext]` logs show low fallback usage.
- Stand up the Compose-backed Postgres instance locally (`docker compose up`) during every integration cycle so migrations are exercised continuously and connection regressions surface early.

## Langtext Migration Notes
- `models/item.ts` still allows `Langtext` as either a string or a `{ [key: string]: string }` payload, so callers must treat
  the field as a mixed type until the legacy string path is retired.
- Backend persistence, importer, and export flows route `Langtext` values through `backend/lib/langtext.ts`, which logs
  `[langtext]` warnings when JSON parsing fails or non-object data is encountered and falls back to string handling.
- Import actions warn when form-supplied Langtext values are rejected and fall back to reference defaults, keeping ingest
  resilient while migration telemetry is collected.

## Risks & Dependencies
- Tests and builds require the `sass` CLI. Missing or partially installed `sass` causes `sh: 1: sass: not found`, and registry restrictions may prevent installing the dependency.
- Refer to [BUGS.md](BUGS.md) for additional tracked defects.

## Postgres rollout notes
- These notes reflect the current Compose-driven workflow; managed database guidance has not been documented yet.

- Compose defines the mediator/Postgres network so `DATABASE_URL` and the individual `PG*` variables can follow the `mediator`/`postgres` defaults without leaking secrets.
- After provisioning, run the migration and verification scripts to confirm every table matches the shared interfaces under `models/` and `backend/src/models/`; unresolved diffs risk runtime serialization errors.
- Startup logs surface `DATABASE_URL` warnings and connection retries—treat them as blockers and resolve before layering on new features.
- Healthcheck status from `docker compose ps` (or the container logs) is the quickest indicator of why local development cannot reach Postgres.

## Upcoming Opportunities
- Sanitize print preview URLs before injecting them into the DOM to avoid potential XSS issues.
- Capture dispatched CUPS job identifiers in logs so support staff can correlate queue issues with individual label requests.
- Enforce size limits and validate content for uploaded CSV files prior to writing them to disk.
- Integrate dependency vulnerability scanning (e.g., `npm audit`) once registry access is available.

## Recent Highlights
- Hardened box ID sequencing to filter B-prefixed IDs and retry on collisions with warning logs.
- Centralized item category lookup builders in shared models so backend and frontend reuse the same map logic.
- Enriched the item creation success dialog with Artikelnummer context and a direct label print action for faster follow-up.
- Added a UI action in item detail to close in-progress agentic runs and unblock queued approvals.
- Re-enabled the Unterkategorie filter on the item list, persisted subcategory selections, and added backend query support to avoid client-only filtering for large lists.
- Mapped Langtext Qualität labels back into the numeric Quality field during CSV/form imports while cleaning the Langtext payloads.
- Split item list box vs. shelf normalization so Behälter and Lagerort links only render with their respective IDs.
- Removed the default-location relocation button and API option so item moves always target an explicit box selection.
- Updated shelf creation to resolve category labels from taxonomy lookups with fallback logging, and removed legacy category seeding now that CSV imports will own this workflow.
- Added shelf box detail payloads that surface contained boxes and render them in the UI detail view alongside items.
- Switched ERP sync imports to a curl-based multipart upload that matches the ERP payload fields and timeout semantics.
- Added a minimal pricing stage in the agentic item flow with a dedicated pricing rules prompt to align Verkaufspreis handling across prompts and schemas.
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

## Reference Links
- [Architecture Outline](ARCHITECTURE.md)
- [Component Responsibilities](../AGENTS.md)
- [Open Bugs](BUGS.md)
