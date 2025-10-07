# Architecture Outline

<!-- TODO: Add sequence diagrams for import, agentic, and printing flows. -->

This document details the structure and data flow of the mediator service across backend services, frontend UI, shared models, and legacy assets.

## Backend (`backend/`)

### Runtime & Framework
- Node.js with TypeScript for API handlers, workers, and supporting utilities.
- Actions are dynamically loaded from the `actions/` directory and mapped to HTTP routes.

### Key Directories
- `actions/` – request handlers grouped by concern:
  - **Agentic flows**: `agentic-status`, `agentic-restart`, `agentic-cancel`, `agentic-result`, `agentic-trigger-failure` coordinate the AI-assisted draft workflow and fallbacks.
  - **Inventory operations**: `create-box`, `move-box`, `move-item`, `remove-item`, `delete-entity`, and `save-item` enforce transactional updates for boxes and items.
  - **Data services**: `overview`, `list-boxes`, `list-items`, `box-detail`, `recent-activities`, `search`, and `material-number` expose read models for the UI.
  - **Import/Export**: `import-item`, `csv-import`, `validate-csv`, and `export-items` handle CSV ingestion, validation with aggregate counts, and historical exports.
  - **Printing & status**: `print-box`, `print-item`, `print-label`, `printer-status`, `qr-scan`, and `health` power label rendering, printer diagnostics, and QR logging.
- `ops/` – reusable operation helpers and service abstractions for database and workflow tasks.
- `config.ts` – central configuration surface for environment and runtime toggles.
- `db.ts` – database connection bootstrap and helper exports.
- `utils/` – shared helpers (such as `image.ts`) used across actions to normalize persistence and formatting logic.
- `server.ts` – HTTP entry point wiring the dynamic action loader, static asset serving, and API error handling.

### Responsibilities
- Maintain transactional data integrity when moving, importing, or deleting boxes and items.
- Persist agentic run metadata, image uploads, and QR scan events.
- Provide HTML payloads and JSON data for printable labels while delegating rendering to frontend templates.

## Frontend (`frontend/`)

### Runtime & Framework
- React with TypeScript bundled via `esbuild`.
- Routing handled by `react-router-dom`.

### Directory Structure
- `public/` – static assets (`index.html`, bundled JS/CSS) plus standalone `print/` templates for box and item labels.
- `src/` – React application source.
  - `components/` – UI modules such as `Layout`, `Header`, `App`, `LandingPage`, `BoxDetail`, `ItemDetail`, `ItemEdit`, `ImportCard`, `RecentActivitiesPage`, `BoxListPage`, `PrintLabelButton`, `QrScannerPage`, and dialogs supporting CSV import/export and agentic workflows.
  - `styles.css` – shared styling entry point.
  - `index.tsx` – application bootstrap and router wiring.

### Responsibilities
- Surface inventory overviews, search, and statistics for logistics operators.
- Provide item/box detail pages, editing experiences, and CSV import/export flows.
- Trigger agentic runs asynchronously while reflecting status and error handling in the UI.

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
