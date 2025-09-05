# Architecture Overview

This document outlines the planned structure for the refactored mediator service. The goal is to clearly separate data models, application logic, and presentation.

## Backend
- **models/** – shared TypeScript interfaces for core entities (Box, Item, EventLog, ...)
- **backend/** – Node.js/TypeScript API and workers
  - **actions/** – request handlers and business logic loaded dynamically
    - `edit` – renders edit forms for boxes and items
    - `print-label` – enqueue label jobs
    - `move-box` / `move-item` – move boxes to new locations or items between boxes
    - `kivi` – links to external Kivi app
    - `shop` – links items to the online shop
    - `save-item` – GET/PUT handler for fetching and updating items
    - `overview`, `printer-status`, `health`, `box-detail`, `search`, `import-item`, `csv-import`, `material-number`
  - **ops/** – reusable operation helpers written in TypeScript
  - **config.ts** – centralized configuration
  - **db.ts** – database initialization and access
  - **labelpdf.ts** – generates box and item label PDFs with QR codes

## Frontend
- **frontend/** – React application
  - **public/** – static assets served by the backend (`index.html`, `bundle.js`, `bundle.css`)
  - **src/** – React source code bundled with `esbuild`
    - **components/** – UI components (`Layout`, `Header`, `App`)
      - `LandingPage` – overview with search, stats, and recent activity
      - `BoxDetail` – shows box items and history via `GET /api/boxes/:id`
      - `ItemDetail` – item view using `GET /api/items/:uuid`
      - `ItemEdit` – edit item data via `PUT /api/items/:uuid`
      - `ImportCard` – CSV upload card using `/api/import`
      - `PrintLabelButton` – triggers `/api/print/box/:id` or `/api/print/item/:id`
    - **styles.css** – centralised styling for components
    - **index.tsx** – application entrypoint
    - Routes handled with `react-router-dom`
      - `/` → `LandingPage`
      - `/boxes/:boxId` → `BoxDetail`
      - `/items/:itemId` → `ItemDetail`
      - `/items/:itemId/edit` → `ItemEdit`

The legacy JavaScript implementation remains at the project root. New code in `/` uses TypeScript and a component-based approach so data structures, logic, and presentation remain decoupled.

## Legacy comparison
- The old project provided search and placement pages as standalone HTML; these are not yet recreated in the React frontend.
- Existing CSV import and label workflows have been ported, but comprehensive box validation and authentication remain pending.

## Next steps
- Extend edit flows to boxes and add validation
- Install real `@types` and React packages to replace local shims and enable successful bundling
- Reintroduce search and placement flows from the legacy UI
- Expand the automated test suite beyond the initial unit test
