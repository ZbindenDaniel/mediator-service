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
- Create an 'item-list' component which displays items in a table format with the following properties:
  ItemUUID( hidden), BoxID, Location, UpdatedAt, Artikel_Nummer
- Add the ability to create a new Box in 'RelocateItemCard' update the action 'move-items' accordingly. for this also check 'ItemCreate.tsx'
- The ItemEdit component needs a change: The Property 'Anzahl' shall be extended with two buttons '+' & '-'. The functionality for '-' already exists, 'remove-item' & 'decrementItemStock'. for the '+' we need similar functionality. The goal is to have controlled movements of stock.
- The class 'Item.ts' needs better types:
  - UpdatedAt:Date
  - Datum_erfasst:Date
  - Hauptkategorie_A/Hauptkategorie_B: number (will be mapped to a lookup table 'mainCategories)
  - Unterkategorie_A/Unterkategorie_B: number (will be mapped to a lookup table 'subCategories)
  Veröffentlicht_Status: bool (mapped from yes/no)



## Recent changes
- Added backend support to remove items from boxes and delete items or boxes via new API endpoints.
- Exposed removal and deletion controls in the React UI and made stock counts read-only when editing items.
- Wrapped removal and deletion in database transactions and added unit tests to verify item stock and box deletion logic.
- Extended existing move and save/import actions to use database transactions for atomic updates and event logging.
- Introduced a CSV export endpoint with date filters for item data.
