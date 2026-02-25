# Architecture Outline

This document details the structure and data flow of the mediator service across backend services, frontend UI, shared models, and legacy assets.

_Diagram follow-up:_ Import, agentic, and printing sequence diagrams remain outstanding. Track this under `docs/` with
Design:owner@mediator and target the ongoing release documentation refresh.


## Mediator Architecture Principles
- **Action-first orchestration** – Every API route resolves to a module in `backend/actions/`. Actions own validation,
  transaction scope, audit logging, and error shaping so behaviour stays consistent across the service.
- **Shared contracts** – Models in `models/` define items, boxes, and agentic metadata. Both backend and frontend import these
  TypeScript types directly to prevent drift.
- **Structured observability** – Backend modules use structured `console`-compatible logging and consistent context payloads, while the frontend relies on `frontend/src/utils/logger.ts` wrappers. Actions wrap risky operations in `try/catch` blocks that surface context and rethrow typed errors for the HTTP layer; frontend components log async effects (agentic polling, print triggers, scanner flows).
- **Separation of rendering** – Printing flows reuse the canonical HTML template at `frontend/public/print/62x100.html`. The
  backend renders this template for both preview and printer jobs, avoiding duplication and keeping box/item labels in sync.
- **Progressive automation** – Agentic enrichment runs asynchronously, persisting state transitions so manual fallbacks remain
  available. Background workers build on the same event log to integrate with future services (e.g., Shopware).

## Backend (`backend/`)

### Runtime & Framework
- Node.js with TypeScript for API handlers, workers, and supporting utilities.
- Actions are dynamically loaded from the `actions/` directory and mapped to HTTP routes via the central loader in `server.ts`.
- Error handling centralises around the loader: actions throw typed `HttpError` variants while the loader logs structured
  metadata before formatting responses.

### Key Directories
- `actions/` – request handlers grouped by concern:
  - **Agentic flows**: `agentic-status`, `agentic-restart`, `agentic-cancel`, `agentic-bulk-queue`, `agentic-trigger`, and `agentic-trigger-failure` coordinate AI-assisted enrichment, queueing, and fallback handling.
  - **Inventory operations**: `create-box`, `move-box`, `move-item`, `remove-item`, `delete-entity`, and `save-item` enforce transactional updates for boxes and items.
  - **Data services**: `overview`, `list-boxes`, `list-items`, `box-detail`, `recent-activities`, `search`, and `material-number` expose read models for the UI.
  - **Import/Export**: `import-item`, `csv-import`, `validate-csv`, and `export-items` handle CSV ingestion, validation with aggregate counts, and export regimes used by manual and ERP sync flows.
  - **Printing & status**: `print-box`, `print-item`, `print-label`, `printer-status`, `qr-scan`, and `health` power label rendering, printer diagnostics, and QR logging.
  - **Printing actor attribution** – Interactive print endpoints (`/api/print/box/:id`, `/api/print/item/:id`) now require a JSON body containing the triggering `actor` so audit logs capture the human operator. Legacy surfaces still POST without an actor:
    - The queued worker in `backend/server.ts` dispatches labels automatically when CSV imports enqueue jobs; no actor metadata is available for those background tasks.
    - The legacy admin card rendered via `backend/actions/print-label.ts` issues fetch requests without a JSON payload (and without sanitising the preview link per the existing TODO). Follow-up work should align that UI with the actor prompt used in the React frontend.
- `agentic/` – extraction/categorization/pricing/review orchestration and prompt/flow utilities.
- `ops/` – reusable operation helpers and service abstractions for database and workflow tasks.
- `shopware/` + `workers/` – queued Shopware sync processing and background job execution.
- `config.ts` – central configuration surface for environment and runtime toggles.
- `db.ts` – database connection bootstrap and helper exports.
- `lib/` + `utils/` – shared helpers (langtext/media/item id/grouping/label utilities) used across actions to normalize persistence and formatting logic.
- `server.ts` – HTTP entry point wiring the dynamic action loader, static asset serving, and API error handling.

### Logging & Error Handling Expectations
- Actions log at `info` for state transitions (e.g., move, remove, import) and `warn`/`error` for failures, usually with scoped context payloads (route, identifiers, phase) to support operations and incident triage.
- Database mutations execute inside `try/catch` blocks. Failures trigger rollbacks, emit structured errors, and surface
  user-friendly messages to the frontend.
- Printing and external integrations guard shell or HTTP calls with retries and detailed logging to ease on-call diagnosis.

### Responsibilities
- Maintain transactional data integrity when moving, importing, or deleting boxes and items.
- Persist agentic run metadata, image uploads, and QR scan events.
- Provide HTML payloads and JSON data for printable labels while delegating rendering to frontend templates.

## Frontend (`frontend/`)

### Runtime & Framework
- React with TypeScript bundled via `esbuild`.
- Routing handled by `react-router-dom` and centralised in `frontend/src/index.tsx`.
- Shared hooks and context providers (e.g., loading states, agentic polling) live alongside components to keep side effects
  encapsulated.

### Directory Structure
- `public/` – static assets (`index.html`, bundled JS/CSS) plus standalone `print/` templates for box/item/shelf labels.
- `src/` – React application source.
  - `components/` – UI modules such as `Layout`, `Header`, `App`, `LandingPage`, `BoxDetail`, `ItemDetail`, `ItemEdit`, `ImportCard`, `RecentActivitiesPage`, `BoxListPage`, `PrintLabelButton`, `QrScannerPage`, and dialogs supporting CSV import/export and agentic workflows.
  - `styles.css` – shared styling entry point.
  - `index.tsx` – application bootstrap and router wiring.

### Responsibilities
- Surface inventory overviews, search, and statistics for logistics operators.
- Provide item/box detail pages, editing experiences, and CSV import/export flows.
- Trigger agentic runs asynchronously while reflecting status and error handling in the UI. UI components wrap agentic calls in
  `try/catch` blocks to show inline toasts and persist draft edits on failure.
- Integrate printing controls (preview + send) by calling backend print actions and presenting the rendered templates.

## Shared Models (`models/`)
- TypeScript interfaces describing entities such as boxes, items, event logs, and agentic run metadata.
- Consumed by both backend and frontend to maintain consistent typing.

## Data & Media (`data/`)
- `data/` contains CSV seeds and archive import/export payloads used by test and operational flows.
- Runtime media storage is configurable (`MEDIA_STORAGE_MODE=local|webdav`) and is resolved through backend media helpers rather than a fixed repository `media/` folder.
- Item image naming conventions keep `Artikel_Nummer` + image index semantics so importer/exporter and print previews resolve assets consistently.

## Scripts & Root Utilities
- `scripts/` hosts operational helpers and test/build wrappers (including `scripts/run-tests.js`).
- Root-level TypeScript configuration and npm scripts orchestrate backend build/start, frontend bundling, and repository-level validation commands.

## External Integrations
- CSV import/export interacts with file system and database storage.
- QR scanning leverages camera APIs within the browser and logs scans server-side.
- Printing flows generate HTML templates consumed by external label printers.

## Import/Export Archive Format

- `/api/export/items` streams a ZIP archive containing `items.csv`, `boxes.csv`, and a `media/` folder mirroring resolved media storage. The CSV payloads retain partner column ordering and reuse metadata lookups (e.g., `collectMediaAssets`) so downstream clients receive stable image hints. Export mode supports `backup`/`erp` plus import-regime aliases (`manual_import`/`automatic_import`) mapped onto the same serializer paths.
- `/api/import` accepts ZIP uploads and stages `items.csv`, optional `boxes.csv`, and any `media/` assets. Missing components are tolerated; boxes-only or media-only uploads merge into existing records without clearing prior metadata, while `items.csv` updates continue to use duplicate detection and zero-stock flags.
- `/api/import/validate` validates the ZIP structure and reports item counts, referenced box IDs, and `boxes.csv` row counts to the frontend dialog. Validation surfaces server messages and any parser errors so operators can correct malformed archives before ingestion.

## Langtext Migration Notes

- `models/item.ts` still allows `Langtext` as either a legacy string or a structured payload (`Record<string, string | string[]>`), so callers must treat the field as mixed type until the legacy path is retired.
- Backend persistence, importer, and export flows route `Langtext` values through `backend/lib/langtext.ts`, which logs `[langtext]` warnings when JSON parsing fails or non-object data is encountered and falls back to string handling.
- Import actions warn when form-supplied Langtext values are rejected and fall back to reference defaults, keeping ingest resilient while migration telemetry is collected.
