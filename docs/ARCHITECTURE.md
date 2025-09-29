# Architecture Outline

This document details the structure and data flow of the mediator service across backend services, frontend UI, shared models, and legacy assets.

## Backend (`backend/`)

### Runtime & Framework
- Node.js with TypeScript for API handlers, workers, and supporting utilities.
- Actions are dynamically loaded from the `actions/` directory and mapped to HTTP routes.

### Key Directories
- `actions/` – request handlers encapsulating business logic such as `move-box`, `move-item`, `save-item`, `overview`, `health`, `box-detail`, `search`, `import-item`, `csv-import`, `material-number`, and `qr-scan`.
- `ops/` – reusable operation helpers and service abstractions for database and workflow tasks.
- `config.ts` – central configuration surface for environment and runtime toggles.
- `db.ts` – database connection bootstrap, migrations, and helper exports.

### Responsibilities
- Maintain transactional data integrity when moving, importing, or deleting boxes and items.
- Persist agentic run metadata, image uploads, and QR scan events.
- Provide JSON payloads for printable labels; the frontend renders inline preview pages without dedicated templates.

## Frontend (`frontend/`)

### Runtime & Framework
- React with TypeScript bundled via `esbuild`.
- Routing handled by `react-router-dom`.

### Directory Structure
- `public/` – static assets (`index.html`, bundled JS/CSS) served directly without separate print templates.
- `src/` – React application source.
  - `components/` – UI modules such as `Layout`, `Header`, `App`, `LandingPage`, `BoxDetail`, `ItemDetail`, `ItemEdit`, `ImportCard`, `PrintLabelButton`, `QrScannerPage`, and dialogs supporting CSV import/export and agentic workflows.
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
- `scripts/` and `vendor/` host operational helpers, build utilities, and third-party assets required by production printers and deployment processes.

## External Integrations
- CSV import/export interacts with file system and database storage.
- QR scanning leverages camera APIs within the browser and logs scans server-side.
- Printing flows open a dynamically generated inline preview where the browser print dialog is used.
