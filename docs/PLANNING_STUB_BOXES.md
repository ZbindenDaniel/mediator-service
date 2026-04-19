# Stub Boxes Planning

## Overview

The physical warehouse predates the system. Many shelves contain boxes and loose items that have no QR code and are not tracked digitally. This document covers a lightweight logistics tool — **box stubs** — that lets warehouse workers record the presence and rough content of uncatalogued goods without requiring full cataloguing on the spot.

This is intentionally a **logistics and prioritisation tool**, not an inventory check. It operates alongside the inventory process (workers may do both during the same warehouse visit) but is independent of it at a system level. The actual cataloguing of stub contents happens later through the normal item intake process.

**Not in scope for this document:**
- The transport request process (creating and managing transport orders for stubs)
- The cataloguing process for items arriving from stubs (existing ItemCreate / agentic flow)
- Resolving stubs at transport time (operator check, out of scope)

---

## Concept

When a worker encounters a shelf with uncatalogued content, they create one or more **box stubs** — each representing a physical box or cluster of loose items on that shelf. A stub captures:

- Which shelf it is on
- A short free-text description of the contents (e.g. *"ein paar alte Laptops und Modems"*)
- Rough counts of loose items and uncatalogued boxes
- When it was created and by whom

Stubs are then visible in a management view. Workers in the store can browse stub descriptions and shelf locations to identify high-priority items and arrange transport. Transporters can locate the physical goods using the shelf and description. At transport time the stub is set inactive (resolved) — this step is out of scope for now but should be kept in mind when designing the data model.

High-priority items that are immediately obvious (e.g. a clearly valuable piece of equipment) may skip the stub process entirely: the worker transports them directly and they enter the system through the normal cataloguing path.

---

## Use Cases

### UC-1: Creating Stubs During Warehouse Walk-through

A worker walks through unknown or rarely-visited shelves. For each shelf with uncatalogued content:

1. Open the stub creation form, linked from the shelf detail or a dedicated "warehouse walk" view
2. Select or scan the shelf ID
3. Enter a short description of what is there
4. Optionally enter counts: how many loose items, how many unboxed/unlabelled boxes
5. Save → stub is created and immediately visible in the management view

Multiple stubs can be created on a single shelf (e.g. one per distinct cluster of goods).

### UC-2: Browsing Stubs for Transport Prioritisation

A worker in the store (not physically in the warehouse) opens the stub list to plan incoming transport:

1. Browse stubs filtered/sorted by shelf location, creation date, or keyword in description
2. Read descriptions to assess priority
3. Identify target stubs and initiate transport request *(out of scope — link to future transport planning doc)*

### UC-3: Locating Stubs at Transport Time

A transporter in the warehouse needs to locate and collect specific stubbed goods:

1. Opens the stub list filtered by shelf location or stub ID
2. Reads description to identify the physical goods
3. Collects them; resolves the stub *(out of scope — stub resolution flow)*

---

## Domain Model

### New Table: `box_stubs`

| Column | Type | Description |
|--------|------|-------------|
| `Id` | TEXT PK | UUID |
| `ShelfId` | TEXT NOT NULL FK → boxes(BoxID) | The shelf the stub is located on (must be a shelf-format BoxID: `S-*`) |
| `Description` | TEXT NOT NULL | Free-text description of contents (e.g. *"alte Laptops und Modems"*) |
| `NumberLooseItems` | INTEGER NOT NULL DEFAULT 0 | Approximate count of loose items not in any box |
| `NumberLooseBoxes` | INTEGER NOT NULL DEFAULT 0 | Approximate count of unlabelled/uncatalogued boxes |
| `CreatedAt` | TEXT NOT NULL | ISO 8601 |
| `CreatedBy` | TEXT NOT NULL | Username |
| `PhotoPath` | TEXT \| null | Optional path to a photo of the shelf/goods (stored via existing `MEDIA_STORAGE_MODE` infrastructure) |
| `IsActive` | INTEGER NOT NULL DEFAULT 1 | `1` = open stub, `0` = resolved (inactive) |
| `ResolvedAt` | TEXT \| null | ISO 8601 timestamp when stub was resolved at transport time |
| `ResolvedBy` | TEXT \| null | Username of resolver |
| `Notes` | TEXT \| null | Optional additional notes |

### Shelf — `HasActiveStubs` (derived)

Shelves (`BoxID` format `S-*`) gain a derived boolean in API responses:

```
HasActiveStubs = EXISTS (SELECT 1 FROM box_stubs WHERE ShelfId = BoxID AND IsActive = 1)
```

Not stored; computed at query time. Shown as an indicator badge on the shelf row and shelf detail page.

---

## Flows

### Flow A: Create Stub

```
Worker in warehouse, standing at a shelf with uncatalogued goods
        │
        ▼
Opens stub creation:
  - From ShelfDetail page: [+ Add stub]
  - From a dedicated "Warehouse walk" shortcut in the main nav (TBD)
        │
        ▼
Stub form:
  - Shelf: pre-filled if opened from ShelfDetail, or scannable
  - Description: free text (required)
  - Loose items count: number input (optional, default 0)
  - Loose boxes count: number input (optional, default 0)
  - Photo: optional camera capture (stored via MEDIA_STORAGE_MODE)
  - Notes: optional
        │
        ▼
POST /api/stubs  →  creates box_stub record, IsActive = 1
        │
        ▼
Confirmation: stub saved, option to [Add another stub on this shelf] or [Done]
```

### Flow B: Browse and Filter Stubs

```
Worker in store opens stub management view
        │
        ▼
GET /api/stubs?isActive=true
  - List of active stubs
  - Sortable by: CreatedAt, ShelfId
  - Searchable by: description keyword, ShelfId
        │
        ▼
Worker identifies high-priority stub → opens stub detail
        │
        ▼
Taps [Transport erstellen] → transport creation form pre-filled with SourceId = stub.ShelfId
  (treated identically to "Transport erstellen" from a shelf detail — no special stub-transport logic)
        │
        ▼
Transport completes → stub auto-resolves (complete-transport side-effect)
```

### Flow C: Resolve Stub (auto-resolved by transport completion)

Stubs on a source shelf are auto-resolved when a transport completes. No manual stub-resolve action is needed in v1.

```
complete-transport action (POST /api/transports/:id/complete)
        │
        ▼
After relocating items, resolve all active box_stubs for source shelf:
  UPDATE box_stubs SET IsActive = 0, ResolvedAt = now, ResolvedBy = actor
  WHERE ShelfId = <sourceShelfId> AND IsActive = 1
        │
        ▼
POST /api/stubs/:id/resolve  →  also available for manual resolution if needed
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/stubs` | Create a new box stub |
| `GET` | `/api/stubs` | List stubs; filterable by `isActive`, `shelfId`; searchable by `q` (description keyword) |
| `GET` | `/api/stubs/:id` | Get single stub detail |
| `PATCH` | `/api/stubs/:id` | Update description, counts, or notes on an open stub |
| `POST` | `/api/stubs/:id/resolve` | Mark stub resolved manually (auto-resolve is the normal path via transport completion) |

---

## Frontend Changes

### ShelfDetail

- **`HasActiveStubs` badge** — amber indicator if shelf has open stubs
- **Stub list section** — shows active stubs on this shelf: description, counts, creation date
- **[+ Add stub]** button

### New Page/View: Stub Management

A dedicated view (accessible from main nav or BoxList filter):

- List of all active stubs
- Columns: shelf, description, loose items, loose boxes, created by, created at
- Filter: active only (default) / all
- Search: keyword in description, shelf ID
- Row action: edit, view shelf
- Stub detail: **[Transport erstellen]** button — pre-fills transport creation with `SourceId = stub.ShelfId`; identical to creating a transport from a shelf detail

### BoxList / BoxListPage (Shelves)

- Filter chip: **"Has open stubs"** (shows only shelves with `HasActiveStubs = true`)
- Badge on shelf rows with active stubs

---

## Event Log Integration

| Event | EntityType | Description |
|-------|-----------|-------------|
| `StubCreated` | Box (shelf) | New stub added for a shelf |
| `StubUpdated` | Box (shelf) | Stub description or counts changed |
| `StubResolved` | Box (shelf) | Stub resolved — either auto-resolved by transport completion or manually |

---

## Database Migration

```sql
CREATE TABLE IF NOT EXISTS box_stubs (
  Id TEXT PRIMARY KEY,
  -- ShelfId must be a shelf-format ID (S-*); enforced at application layer
  ShelfId TEXT NOT NULL REFERENCES boxes(BoxID),
  Description TEXT NOT NULL,
  NumberLooseItems INTEGER NOT NULL DEFAULT 0,
  NumberLooseBoxes INTEGER NOT NULL DEFAULT 0,
  PhotoPath TEXT,
  CreatedAt TEXT NOT NULL,
  CreatedBy TEXT NOT NULL,
  IsActive INTEGER NOT NULL DEFAULT 1,
  ResolvedAt TEXT,
  ResolvedBy TEXT,
  Notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_box_stubs_shelf ON box_stubs(ShelfId);
CREATE INDEX IF NOT EXISTS idx_box_stubs_active ON box_stubs(IsActive) WHERE IsActive = 1;
```

---

## Resolved Decisions

All open questions are now decided.

1. **Shelf-only constraint** — **✅ Shelves only (`S-*` format).** Stubs are never attached to regular boxes. The `ShelfId` column is validated at the application layer to ensure it starts with `S-`.

2. **Multiple stubs per shelf** — **✅ Allowed.** Per-cluster granularity is important for transport prioritisation; workers may add one stub per distinct cluster of goods on a shelf.

3. **Photo attachment** — **✅ Yes — optional photo** using existing `MEDIA_STORAGE_MODE`. The `PhotoPath` column stores the path. The creation form includes a camera-capture input.

4. **Stub resolution flow detail** — **✅ Auto-resolve on `complete-transport`.** When a transport completes, the backend auto-resolves all active stubs for the source shelf. No separate operator confirmation step is needed in v1.

5. **Stub visibility during inventory** — **✅ No cross-feature display.** Stub information is not shown inside `InventoryCheckView`. Features remain independent at the system level.

6. **Prioritisation signal** — **✅ No priority field in v1.** Free-text description only. A structured `Priority` field may be added later if sorting needs arise.

---

## Nav Page: Stub Management (Warehouse Walk View)

Accessible from the main nav (a dedicated entry with a "discovery" icon, e.g. compass or binoculars).

**Layout:**
- Rows are active stubs, one per row.
- Rows are visually grouped by shelf using a distinct background color per shelf (one color per shelf, consistent across a session).
- Each row shows: shelf label, stub description excerpt, loose-item count, loose-box count, created-by, creation date.
- Optional photo thumbnail if `PhotoPath` is set.
- Filter: active only (default) / all. Search: keyword in description, shelf ID.

---

## Relationship to Other Planning Documents

| Document | Relationship |
|----------|-------------|
| [PLANNING_INVENTORY.md](./PLANNING_INVENTORY.md) | Independent; both may happen during the same warehouse visit but are separate system flows. Open stubs are not displayed inside `InventoryCheckView`; an open stub does not block or affect an inventory session. |
| [PLANNING_transport_boxes.md](./PLANNING_transport_boxes.md) | `complete-transport` auto-resolves all active stubs for the source shelf as part of the completion transaction. Stubs do not need to be manually resolved; the transport completion is the resolution trigger. |
