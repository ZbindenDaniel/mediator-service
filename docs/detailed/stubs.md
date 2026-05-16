# Box Stubs

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - See `docs/PLANNING_STUB_BOXES.md` for the original phase plan and roadmap context.

## In short
- Business goal: Let warehouse workers record the existence of uncatalogued goods (boxes, loose items) on a shelf without requiring full cataloguing on the spot.
- User value: Operators get a lightweight triage list — stub descriptions and shelf locations — to plan transport and prioritise intake.

## Scope
- In scope (Phase 1, shipped):
  - `box_stubs` DB table and model.
  - List (`GET /api/boxes/stubs`) and create (`POST /api/boxes/stubs`) API endpoints.
  - Shelf detail "Stubs" tab: lists existing stubs + inline creation form.
- Out of scope / deferred:
  - Stub resolution (marking a stub inactive at transport time) — tracked in planning doc.
  - Dedicated stub management page grouped by shelf.
  - Transport creation pre-filled from stub (`SourceId = stub.ShelfId`) — see transport planning doc.
  - Photo thumbnails on stubs (`PhotoPath` column reserved in schema).

## Core concepts
- **Stub**: a lightweight record that a physical shelf has uncatalogued content. Not an item, not a box — a marker to be acted on later.
- **ShelfId**: the shelf (`S-`) the stub belongs to; determines where workers look physically.
- **Description**: free-text content summary (e.g. *"ein paar alte Laptops und Modems"*).
- **LooseItemCount / BoxCount**: optional rough counts to help transport planning.

## Data contracts
- Canonical model: `models/stub.ts` (or inlined in `backend/db.ts` stub helpers).
- DB table: `box_stubs` — columns include `Id`, `ShelfId`, `Description`, `LooseItemCount`, `BoxCount`, `CreatedAt`, `CreatedBy`, `PhotoPath` (reserved, nullable), `IsActive`.
- Key fields:
  - `ShelfId`: FK reference to `boxes.BoxID` where the shelf `S-` prefix is enforced.
  - `IsActive`: `1` = open stub, `0` = resolved (resolution flow deferred).
  - `PhotoPath`: reserved for a future shelf-photo attachment; always null for now.
- Sync requirements:
  - `ShelfId` must match a valid shelf row in the `boxes` table; no orphan stubs.

## API / actions
- `GET /api/boxes/stubs?shelfId=<id>` — list stubs, optionally filtered by shelf.
- `POST /api/boxes/stubs` — create a stub; body: `{ shelfId, description, looseItemCount?, boxCount?, actor }`.
- Response: standard `{ ok, stub? }` JSON.
- Error cases: missing `shelfId`, missing `description`, unknown shelf ID (404), DB failure (500).

## UI components & routes
- `frontend/src/components/BoxDetail.tsx`: "Stubs" tab renders when `effectiveTab === 'stubs' && isShelf`.
  - Lists existing stubs via `GET /api/boxes/stubs?shelfId=<id>` on tab mount.
  - Inline create form posts to `POST /api/boxes/stubs` and refreshes the list on success.
- Entry point: BoxDetail / ShelfDetail `DetailTabBar` — "Stubs" tab only visible for `S-` IDs.
- No dedicated route; stubs surface inside the shelf detail panel.

## Logging & failure modes
- Creation: structured log on success and on validation/DB failure.
- List: returns empty array (not 404) when no stubs exist for a shelf.
- Missing or invalid `shelfId` returns 400 before touching the DB.

## Test / validation checklist
- Static: `box_stubs` DDL in `backend/db.ts` must stay in sync with stub model fields.
- Runtime:
  - Open a shelf detail (`S-` ID) → Stubs tab → create a stub → verify it appears in the list.
  - Attempt creation without `description` → expect 400.
  - Confirm `ShelfId` validation rejects non-shelf IDs.

## Open questions / TODO
- [ ] Stub resolution flow (mark `IsActive = 0` at transport completion — see transport planning doc).
- [ ] `PhotoPath` attachment — deferred until shelf-photo requirements are clearer.
- [ ] Dedicated stub management page grouped by shelf with color distinction.
