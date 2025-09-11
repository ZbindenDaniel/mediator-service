# Architecture Overview

This document outlines the structure for the mediator service. The goal is to clearly separate data models, application logic, and presentation.

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

## Next steps
- Enable switch from agentic to manual edit via button. Very simple link button from ItemForm_Agentic to ItemForm.
- Move of items and boxes triggers reload
- images need to be persisted
- Kurzbeschreibung needs better layout.
- 'entnehmen' has no confimration. It should have
- On double click on the usernam it should be possible to change the user name.

## Known issues
- Tests and builds require the `sass` CLI; missing or partially installed `sass` leads to `sh: 1: sass: not found`. Registry restrictions may prevent installing the dependency.

## Possible features
- Sanitize print preview URLs before injecting them into the DOM to avoid potential XSS issues.
- Replace shell `exec` in the printing helper with a safer spawn approach and validate printer commands.
- Enforce size limits and validate content for uploaded CSV files prior to writing them to disk.
- Integrate dependency vulnerability scanning (e.g., `npm audit`) once registry access is available.

## Recent changes
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
