# Boxes

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/`, and frontend types/usages.

## In short
- Business goal: Keep physical storage mapping (box ↔ shelf ↔ location) deterministic so relocation, import/export, and printing act on the same identifiers.
- User value: Operators can move boxes/items, print labels, and import data without ambiguous placement semantics.

## Scope
- In scope:
  - Box/shelf/location hierarchy and identifier constraints currently enforced in code.
  - Shared contracts used by backend actions and frontend components.
  - Relocation state transitions for `move-box` and `move-item`.
  - Printing/import touchpoints that depend on `BoxID` and `LocationId`.
  - Current failure modes and logging signals.
- Out of scope:
  - Legacy shelf-category behaviors no longer used by current flows.
  - Future warehouse topology changes.

## Core concepts
- Terms:
  - **Box**: a movable container with `BoxID` typically `B-DDMMYY-####`.
  - **Shelf**: stored in the same box table, but `BoxID` uses `S-<location>-<floor>-<index>`.
  - **Location**: the shelf identifier stored on non-shelf boxes/items via `LocationId`/`Location`.
- Entities:
  - `Box` (`models/box.ts`) is the shared shape used in backend responses and frontend views.
  - Shelf location definitions are centralized in `models/shelf-locations.ts` and re-exported to frontend.
- Relationships:
  - Shelf rows are first-class `Box` records (distinguished by `BoxID` prefix `S-`).
  - A non-shelf box points to a shelf through `LocationId`.
  - Items point to boxes through `Item.BoxID`; item `Location` is derived/updated alongside box moves.

## Data contracts
- Canonical model links:
  - `models/box.ts`
  - `models/create-box.ts`
  - `models/box-detail.ts`
  - `models/shelf-locations.ts`
  - `frontend/src/data/shelfLocations.ts` (re-export only)
- Key fields:
  - `Box.BoxID`: primary identifier; shelf-vs-box semantics depend on prefix and format.
  - `Box.LocationId`: nullable shelf reference for placement-aware flows.
  - `Box.Label` / `Box.ShelfLabel`: display labels for location-aware UI and joins.
  - `Item.BoxID` + `Item.Location`: item-to-box relation + denormalized location.
- Enums:
  - No dedicated enum type for box type; current behavior uses identifier prefixes (`S-` vs non-`S-`).
- Sync requirements across layers:
  - Frontend print metadata auto-selects `labelType` from `BoxID.startsWith('S-')` and must match backend print validation.
  - Shelf display formatting in UI (`formatShelfLabel`) must remain aligned with `models/shelf-locations.ts` IDs.
  - Import validation (`backend/importer.ts`) enforces `BoxID` format; exports/imports must keep these exact identifiers.

### Field glossary (one-line purpose per field)
- `BoxID`: Distinguishes physical container identity and whether a row is a shelf (`S-...`) or box (`B-...`).
- `LocationId`: Points a non-shelf box to its parent shelf identifier.
- `Label`: User-visible custom label for boxes/shelves.
- `ShelfLabel`: Optional resolved/joined human-readable shelf label in API projections.
- `Item.BoxID`: Links item instances to a physical container.
- `Item.Location`: Denormalized shelf/location code maintained by relocation/import flows.

### Identifier & relation verification notes
- Verified shelf creation mints IDs with `S-${location}-${floor}-${index4}` and collision retries in `create-box` transaction.
- Verified importer accepts provided `BoxID` only if format passes explicit shelf/non-shelf regex validation.
- Verified relocation writes both box-level shelf relation (`boxes.LocationId`) and item-level location relation (`items.Location`) to keep UI queries consistent.
- Verified print routing depends on `labelType` + prefix checks (shelf label requests rejected for non-shelf IDs).

## API/actions
- Endpoint/action names:
  - `POST /api/boxes` (`create-box`): creates either box or shelf depending on payload `type`.
  - `GET /api/boxes` (`list-boxes`): optional type filtering (`box`/`shelf`) derived from ID prefix.
  - `GET /api/boxes/:id` (`box-detail`): box/shelf detail, items/events, and contained non-shelf boxes for shelf IDs.
  - `POST /api/boxes/:id/move` (`move-box`): moves box to a shelf/location and can update label/photo metadata.
  - `POST /api/items/:id/move` (`move-item`): moves item to another box and syncs item `Location` from destination box.
  - `POST /api/print/:labelType/:id` (`print-unified`): prints box/shelf/item labels with ID-type validation.
  - `POST /api/import/csv` (`csv-import`) + importer stages: box/item data ingestion from archive.
- Request shape:
  - Shelf create: `{ type: 'shelf', actor, location, floor, label?, notes? }`.
  - Box move: `{ actor, location|LocationId, label?, photoDataUrl?, removePhoto? }` (label/location normalization applied).
  - Item move: `{ actor, boxId }`.
- Response shape:
  - Standard `{ ok/error/... }` JSON with status-specific errors (`400/404/500`) across actions.
  - `box-detail` includes `{ box, items, groupedItems, events, containedBoxes? }`.
- Error cases:
  - Invalid/missing actor, invalid IDs, missing destination entities, helper/query failures, malformed request bodies.

## UI components & routes
- Routes/pages:
  - Box listing and navigation: `frontend/src/components/BoxListPage.tsx`, `BoxList.tsx`.
  - Box detail: `frontend/src/components/BoxDetail.tsx`.
  - Relocation UI: `frontend/src/components/RelocateBoxCard.tsx`, `RelocateItemCard.tsx`.
  - Shelf creation UI: `frontend/src/components/ShelfCreateForm.tsx`.
- Key utilities:
  - `frontend/src/lib/shelfLabel.ts` parses `S-...` IDs into user-readable labels and logs format issues.
  - `frontend/src/utils/printLabelRequest.ts` derives print label type from `BoxID` prefix and blocks invalid print metadata.
  - `frontend/src/components/relocation/relocationHelpers.ts` centralizes actor checks and on-demand box creation.
- User flows:
  - Operator selects shelf in relocation card → POST move endpoint → refreshed detail/list shows new location.
  - Operator creates shelf from constrained location/floor options → receives minted `S-...` ID.
  - Operator prints from box/item context → frontend computes label type, backend confirms ID-label compatibility.

## State machine / workflow
1. **Create / import state**:
   - Box creation mints `B-...`; shelf creation mints `S-<location>-<floor>-<index4>`.
   - CSV import upserts boxes and preserves provided `BoxID` only when format-valid.
2. **Placement / relocation state**:
   - `move-box` updates `boxes.LocationId` and `boxes.Label` (plus optional photo fields), logs event.
   - `move-item` updates `items.BoxID` and synchronizes `items.Location` from destination box location.
3. **Read / print state**:
   - List/detail APIs project placement fields (`LocationId`, `ShelfLabel`, contained box relations for shelf details).
   - Print pipeline validates `labelType` against entity kind and renders/queues label artifact.

## Logging & error handling
- Log identifiers/events:
  - Structured action prefixes like `[move-box]`, `[importer]`, `[csv-import]`, `[print-unified]`, `[shelf-create]`.
  - Info logs for successful creation/import/print preparation and filtering steps.
- Warning conditions:
  - Conflicting location inputs (`location` vs `LocationId`), missing location label mappings, invalid shelf format, unknown shelf location labels, destination-box mismatch on print type.
- Error conditions:
  - JSON parse failures, missing required fields (`actor`, IDs), missing entities (404), DB/helper failures (500), import format violations.
- try/catch boundaries:
  - Action handlers wrap request parse + DB operations.
  - Frontend relocation/create/print utilities catch fetch + dialog failures and surface operator-facing status.
  - Import/print pipelines isolate stage-level failures and return typed error payloads.

## Config & environment flags
- Required flags:
  - No box-specific env var is required for core create/move/list/detail semantics.
- Optional flags:
  - Print queue/template behavior follows shared print configuration used by `print-unified`.
- Defaults/constraints:
  - Identifier formats are contract constraints and not feature-flagged.

## Dependencies & integrations
- Database:
  - Box/item/event tables accessed through action context helpers (`getBox`, `itemsByBox`, `runUpsertBox`, etc.).
- Device integrations:
  - Printing via unified label generation + queue dispatch.
- External services:
  - No external API required for core box relocation itself; some item move flows can enqueue downstream sync jobs.

## Failure modes & troubleshooting
- Invalid move target box/shelf:
  - Detection: `move-item` warns destination box not found; `move-box`/`print-unified` returns 400/404.
  - Recovery: verify target exists in `/api/boxes`, then retry with valid `BoxID`/`LocationId`.
- Missing entities (box/item):
  - Detection: action responses `404` + contextual logs.
  - Recovery: refresh list/detail and confirm ID before retry.
- Invalid identifier format during import:
  - Detection: importer warnings (`invalid-shelf-box-id-format` / `invalid-box-id-format`) and skipped rows.
  - Recovery: fix source CSV `BoxID` values, then re-import.
- Shelf label resolution mismatch in UI:
  - Detection: `shelfLabel` formatter warnings for unknown location or malformed `S-...` segments.
  - Recovery: align shelf ID with configured `models/shelf-locations.ts` entries.

## Test/validation checklist
- Static checks:
  - Confirm `models/box.ts` and frontend `Box` consumers still agree on `LocationId`, `Label`, `ShelfLabel` field names.
  - Confirm shelf location definitions are only sourced from `models/shelf-locations.ts` and frontend re-export.
- Runtime checks:
  - Create shelf from UI and verify minted `S-<location>-<floor>-<index4>` ID.
  - Move box to shelf and verify `box-detail` and list projections show updated location.
  - Move item between boxes and verify item `Location` follows destination box.
  - Trigger print for shelf and non-shelf IDs to verify type validation.
  - Import sample CSV containing valid/invalid `BoxID` rows and verify skip logs.
- Contract sync verification:
  - Check `printLabelRequest` label-type derivation matches backend `print-unified` constraints.
  - Check relocation payload uses `LocationId`/`location` semantics accepted by `move-box`.

## Open questions / TODO
- [ ] Confirm whether `Box.LocationId` should fully replace fallback legacy `Location` reads in all actions.
- [ ] Decide whether `ShelfLabel` should be always materialized by backend list/detail responses instead of optional joins.
