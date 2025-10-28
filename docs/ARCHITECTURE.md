# Architecture Outline

This document details the structure and data flow of the mediator service across backend services, frontend UI, shared models, and legacy assets.

_Diagram follow-up:_ Import, agentic, and printing sequence diagrams remain outstanding. Track this under `docs/` with
Design:owner@mediator and target the Q4 documentation refresh.

## Mediator Architecture Principles
- **Action-first orchestration** – Every API route resolves to a module in `backend/actions/`. Actions own validation,
  transaction scope, audit logging, and error shaping so behaviour stays consistent across the service.
- **Shared contracts** – Models in `models/` define items, boxes, and agentic metadata. Both backend and frontend import these
  TypeScript types directly to prevent drift.
- **Structured observability** – Logging relies on `backend/src/lib/logger.ts` and `frontend/src/utils/logger.ts` helpers.
  Actions wrap risky operations in `try/catch` blocks that surface context and rethrow typed errors for the HTTP layer.
  Frontend components use the logger to annotate asynchronous effects, agentic polling, and printing triggers.
- **Separation of rendering** – Printing flows reuse HTML templates under `frontend/public/print/`. The backend renders these
  templates for both preview and printer jobs, avoiding duplication and keeping box/item labels in sync.
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
  - **Agentic flows**: `agentic-status`, `agentic-restart`, `agentic-cancel`, `agentic-result`, `agentic-trigger-failure` coordinate the AI-assisted draft workflow and fallbacks.
  - **Inventory operations**: `create-box`, `move-box`, `move-item`, `remove-item`, `delete-entity`, and `save-item` enforce transactional updates for boxes and items.
  - **Data services**: `overview`, `list-boxes`, `list-items`, `box-detail`, `recent-activities`, `search`, and `material-number` expose read models for the UI.
  - **Import/Export**: `import-item`, `csv-import`, `validate-csv`, and `export-items` handle CSV ingestion, validation with aggregate counts, and historical exports.
  - **Printing & status**: `print-box`, `print-item`, `print-label`, `printer-status`, `qr-scan`, and `health` power label rendering, printer diagnostics, and QR logging.
  - **Printing actor attribution** – Interactive print endpoints (`/api/print/box/:id`, `/api/print/item/:id`) now require a JSON body containing the triggering `actor` so audit logs capture the human operator. Legacy surfaces still POST without an actor:
    - The queued worker in `backend/server.ts` dispatches labels automatically when CSV imports enqueue jobs; no actor metadata is available for those background tasks.
    - The legacy admin card rendered via `backend/actions/print-label.ts` issues fetch requests without a JSON payload (and without sanitising the preview link per the existing TODO). Follow-up work should align that UI with the actor prompt used in the React frontend.
- `ops/` – reusable operation helpers and service abstractions for database and workflow tasks.
- `config.ts` – central configuration surface for environment and runtime toggles.
- `db.ts` – database connection bootstrap and helper exports.
- `utils/` – shared helpers (such as `image.ts`) used across actions to normalize persistence and formatting logic.
- `server.ts` – HTTP entry point wiring the dynamic action loader, static asset serving, and API error handling.

### Logging & Error Handling Expectations
- Actions log at `info` for state transitions (e.g., move, remove, import) and `warn`/`error` for failures. Logging helpers
  automatically attach correlation IDs when available.
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
- `public/` – static assets (`index.html`, bundled JS/CSS) plus standalone `print/` templates for box and item labels.
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

## Data & Media (`data/`, `media/`)
- CSV seeds, import/export payloads, and runtime-generated media assets (item images, QR codes).
- Naming conventions include `media/{ItemId}/{Artikelnummer}-{imgNumber}` for item imagery.

## Legacy Scripts & Root Utilities
- Legacy JavaScript implementation remains at the repository root for compatibility.
- `scripts/` and `vendor/` host operational helpers, build utilities, and third-party assets required by production printers and deployment processes. The Node-based test harness (`scripts/run-tests.js`) coordinates the custom runner with optional Jest execution.

## External Integrations
- CSV import/export interacts with file system and database storage.
- QR scanning leverages camera APIs within the browser and logs scans server-side.
- Printing flows generate HTML templates consumed by external label printers.
