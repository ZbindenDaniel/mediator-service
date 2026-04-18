# Inventory Feature Planning

## Overview

This document covers the design for periodic physical inventory verification — checking that items are actually in the boxes they are recorded in, and flagging discrepancies. Two complementary modes are supported: a **passive cycle** (items are checked opportunistically as boxes are scanned) and an **active inventory day** (dedicated process where employees work through all boxes systematically).

A key reality of the warehouse context: the physical warehouse is significantly older than the system. Many boxes and shelves contain physical items that have never been catalogued. The inventory feature must therefore distinguish between three states of knowledge for any given location:

- **Unknown** — box has never been inventoried; actual contents are completely untracked
- **Partial** — box has been inventoried; some physical items were found without QR codes and are not yet in the system
- **Controlled** — box has been inventoried and all physical items are represented in the system

This three-state model lets the team prioritise cataloguing work and gives a realistic picture of how much of the physical stock is actually under digital control.

---

## Use Cases

### UC-1: Inventory Day (Annual/Semi-annual)

Employees work through a warehouse section by section. They have a filtered box list sorted by oldest `lastInventoryDate`. For each box they:

1. Open the app's inventory list, sorted by `lastInventoryDate` ascending (nulls first)
2. Pick up the next box, scan its QR code → app opens box in inventory mode
3. See a checklist of items expected to be in the box
4. Tick off items visually **and/or** scan item QR codes to confirm presence
5. Scanning mode stays open after each successful item scan (no navigation interruption)
6. When done, items not confirmed are flagged as missing
7. Move to next box; continue

### UC-2: Passive Inventory Cycle (Continuous)

Normal operations: an employee scans a box to retrieve or add an item. If the box's `lastInventoryDate` is older than `InventoryCycleDays` (or null), the scan flow detects `InventoryPending` and prompts a lightweight inventory check before the normal action proceeds (or offers to defer).

### UC-3: Missing Item Discovery

During inventory, an item scanned or expected is not found. The system records it as missing (`LocationId = null`, flagged in a missing-items log) and triggers a correction sub-flow depending on whether a known location exists for the item elsewhere.

### UC-4: Misplaced Item Discovery

During inventory of Box A, an item is scanned whose `BoxID` in the database points to Box B (or is null). The system signals a mismatch and initiates a relocation flow to update the item's assignment.

### UC-5: Uncatalogued Item Discovery

During inventory an employee encounters a physical item with no QR code — it has never been entered into the system. They need to:

1. Record that an uncatalogued item exists in this location (at minimum a count increment, so the box is not falsely marked "controlled")
2. Optionally start an immediate lightweight cataloguing flow (photo + rough description), creating a stub record
3. Optionally defer cataloguing to a later dedicated session

The box remains in `partial` catalogue status until every uncatalogued item recorded in it has been turned into a proper catalogued item (ItemInstance with an ItemRef).

### UC-6: Warehouse Shelf Discovery (First-time Inventory)

Many shelves exist physically but are not yet tracked in the system at all. During an inventory day, an employee may walk past a shelf that has no QR code. They need to be able to:

1. Create the shelf/box record on the spot (existing create-box flow)
2. Immediately begin an inventory session for it
3. Record its contents — both catalogued items (scan existing QR) and uncatalogued counts/stubs

This bootstraps coverage for locations that were never part of the digital system.

---

## Domain Model Changes

### Box

Add fields to the `boxes` table and `Box` model:

| Field | Type | Description |
|-------|------|-------------|
| `LastInventoryDate` | `TEXT \| null` | ISO 8601 timestamp of last completed inventory for this box. `null` = never inventoried. |
| `UncataloguedItemCount` | `INTEGER` | Number of physical items in this box that were recorded as uncatalogued during the last inventory. Updated each time a session for this box completes. `0` by default. |
| `InventoryPending` | Derived (not stored) | `true` when `LastInventoryDate` is null **or** older than `now - InventoryCycleDays` days |
| `CatalogueStatus` | Derived (not stored) | `'unknown'` when never inventoried; `'partial'` when `UncataloguedItemCount > 0`; `'controlled'` when inventoried and `UncataloguedItemCount = 0` |

Both derived fields are computed at query/model time — not persisted — so they automatically reflect config changes and current data.

### Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `INVENTORY_CYCLE_DAYS` | `180` | Number of days after which a box becomes `InventoryPending`. Set to `0` to disable passive triggering. |

### ItemInstance — Missing Flag

Add an optional field to the `items` table:

| Field | Type | Description |
|-------|------|-------------|
| `MissingAt` | `TEXT \| null` | ISO 8601 timestamp when item was last confirmed missing during inventory. `null` = not flagged. Cleared when item is scanned/found. |

### ItemInstance — Stub / Uncatalogued Placeholder

When an employee chooses to create a lightweight record for an uncatalogued physical item rather than just counting it, a **stub ItemInstance** is created:

- `Artikel_Nummer`: `null` (no ItemRef yet)
- `BoxID`: current box
- `StubNotes`: brief description or photo reference to help with later cataloguing
- `StubPhotoPath`: optional photo taken on the spot

Stub items appear in a dedicated "needs cataloguing" view and feed naturally into the existing ItemCreate / agentic enrichment pipeline when cataloguing work is scheduled.

> **Open model question:** whether stub state lives as a flag on `ItemInstance` (e.g. `IsStub INTEGER DEFAULT 0`) or is inferred from `Artikel_Nummer IS NULL`. An explicit flag is cleaner for queries.

### New Table: `inventory_sessions`

Tracks the lifecycle of a single box-level inventory check.

| Column | Type | Description |
|--------|------|-------------|
| `Id` | TEXT PK | UUID |
| `BoxID` | TEXT FK | Box being inventoried |
| `StartedAt` | TEXT | ISO 8601 |
| `CompletedAt` | TEXT \| null | Set when session is finished |
| `Actor` | TEXT | Username |
| `Mode` | TEXT | `'active'` (inventory day) or `'passive'` (triggered by scan) |
| `ConfirmedItemUUIDs` | TEXT | JSON array of confirmed ItemUUIDs |
| `MissingItemUUIDs` | TEXT | JSON array of items not confirmed |
| `MisplacedItemUUIDs` | TEXT | JSON array of items found here but assigned elsewhere |
| `UncataloguedCount` | INTEGER | Physical items seen but not in system (count-only, no stubs created) |
| `StubItemUUIDs` | TEXT | JSON array of stub ItemUUIDs created during this session |
| `Notes` | TEXT \| null | Optional operator notes |

---

## Derived Statuses

### `InventoryPending`

```
InventoryPending = (LastInventoryDate IS NULL)
                OR (LastInventoryDate < now - INVENTORY_CYCLE_DAYS days)
```

Exposed as a boolean in `GET /api/boxes`, filterable in the box list, and shown as a badge on `BoxDetail` / `BoxList`.

### `CatalogueStatus`

```
CatalogueStatus = 'unknown'     when LastInventoryDate IS NULL
               OR 'partial'     when LastInventoryDate IS NOT NULL AND UncataloguedItemCount > 0
               OR 'controlled'  when LastInventoryDate IS NOT NULL AND UncataloguedItemCount = 0
```

| Status | Meaning | Badge colour |
|--------|---------|-------------|
| `unknown` | Never inventoried; contents entirely untracked | Grey |
| `partial` | Inventoried; some items not yet in system | Amber |
| `controlled` | Inventoried; all physical items are catalogued | Green |

Exposed in `GET /api/boxes` response and filterable (`?catalogueStatus=partial`). The overview/dashboard can show aggregate counts of boxes in each state, giving a real-time picture of warehouse coverage progress.

---

## Flows

### Flow A: Passive Inventory Trigger (Scan → Check → Continue)

```
User scans box QR
        │
        ▼
POST /api/qr-scan/log  →  backend checks InventoryPending
        │
   [InventoryPending?]
    NO  │  YES
        │   ├──► Frontend shows "Inventory needed" prompt
        │   │    Options: [Start check now] [Skip for now]
        │   │
        │   │  [Skip]──────────────────────────────┐
        │   │                                      ▼
        │   │  [Start]                    Navigate to BoxDetail normally
        │   │     ▼
        │   └──► Open InventoryCheckView for this box
        │
        ▼ (no pending)
Navigate to BoxDetail normally
```

### Flow B: Active Inventory Day (List → Scan → Check → Next)

```
Employee opens BoxList with filter: inventoryPending=true, sorted by LastInventoryDate ASC
        │
        ▼
Selects box (or scans box QR) → InventoryCheckView opens in 'active' mode
        │
        ▼
InventoryCheckView:
  - Shows checklist of all ItemInstances assigned to box (catalogued items)
  - Shows running count of uncatalogued items found so far
  - Items have checkbox state: [unchecked | confirmed | missing]
  - Scan input active (camera or hardware scanner)
        │
        ├── User taps item in list → marks confirmed
        │
        ├── User scans item QR:
        │     ├── ItemUUID matches item in this box → mark confirmed, acoustic success signal
        │     ├── ItemUUID belongs to different box → MISMATCH flow (see Flow C)
        │     └── ItemUUID unknown in system → show warning, offer to create/assign
        │
        ├── User taps [+ Uncatalogued item] → see Flow E
        │
        ├── User taps [Mark all remaining as missing] → bulk-flag unchecked items
        │
        └── User taps [Complete Inventory]
              │
              ▼
        POST /api/inventory/complete
          - Sets Box.LastInventoryDate = now
          - Sets Box.UncataloguedItemCount = session total (catalogued stubs + count-only)
          - Creates inventory_session record
          - Sets MissingAt on unconfirmed items
          - Clears MissingAt on confirmed items
          - Logs events for each outcome
          - Emits acoustic completion signal
              │
              ▼
        [In active mode] → return to BoxList, advance to next pending box
        [In passive mode] → return to BoxDetail for normal operation
```

### Flow C: Misplaced Item (Scanned Item Not Assigned to This Box)

```
Item scanned during inventory of Box A
Item's BoxID = Box B (or null)
        │
        ▼
Show mismatch alert:
  "This item is recorded in [Box B / no box]. What do you want to do?"
  Options:
    [Move here] → update item.BoxID = Box A, log Moved event
    [Ignore / skip]  → item is neither confirmed nor missing in this session
    [Mark as misplaced] → log event, leave assignment unchanged for now
```

### Flow E: Uncatalogued Item Encountered During Inventory

```
Employee finds physical item with no QR code in Box A
        │
        ▼
Taps [+ Uncatalogued item] in InventoryCheckView
        │
        ▼
Quick-action sheet:
  [Count only]   [Create stub record]
        │                  │
        ▼                  ▼
  Increment        Photo capture (optional)
  session          + brief description field
  UncataloguedCount        │
        │                  ▼
        │           POST /api/inventory/stub
        │             - Creates ItemInstance with Artikel_Nummer = null
        │             - BoxID = current box
        │             - StubNotes, StubPhotoPath stored
        │             - Logs InventoryStubCreated event
        │             - Returns stub to session's StubItemUUIDs list
        │
        └──────────────────┘
                   │
                   ▼
        Session UncataloguedCount or StubItemUUIDs updated
        Employee continues scanning remaining items
```

**After session completes:**
- `Box.UncataloguedItemCount` = `session.UncataloguedCount + len(session.StubItemUUIDs)`
- `Box.CatalogueStatus` → `'partial'`
- Stub items appear in the "Needs cataloguing" view, where a cataloguer can later open each stub, add details, and link to or create an `ItemRef` — transitioning it from stub to a proper record
- As stubs are catalogued (stub flag cleared), `UncataloguedItemCount` should be recalculated or decremented so `CatalogueStatus` can eventually reach `'controlled'`

### Flow D: Missing Items After Inventory

When `CompleteInventory` is called with unconfirmed items:
- Set `ItemInstance.MissingAt = now` and `ItemInstance.BoxID = null` (item is lost, not in this box)
- Log `InventoryMissing` event on the item
- Item appears in a **missing items view** (filter: `MissingAt IS NOT NULL`) for follow-up

When a missing item is subsequently found and scanned:
- Clear `MissingAt`
- Update `BoxID` to the box it was found in
- Log `InventoryFound` event

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/inventory/start` | Create an inventory session for a box; returns session ID and expected item list |
| `POST` | `/api/inventory/scan` | Submit a scanned item within an open session; returns match result (confirmed / mismatch / unknown) |
| `POST` | `/api/inventory/stub` | Create a stub ItemInstance for an uncatalogued physical item; links it to the open session |
| `POST` | `/api/inventory/uncatalogued` | Increment count-only uncatalogued tally for the open session (no record created) |
| `POST` | `/api/inventory/complete` | Finalize session: persist outcomes, update `LastInventoryDate` and `UncataloguedItemCount`, flag missing items |
| `POST` | `/api/inventory/cancel` | Abandon session without updating `LastInventoryDate` |
| `GET` | `/api/inventory/missing` | List items currently flagged as missing (`MissingAt IS NOT NULL`) |
| `GET` | `/api/inventory/stubs` | List stub ItemInstances not yet fully catalogued |
| `GET` | `/api/boxes?filter=inventoryPending` | Existing endpoint extended with `inventoryPending` filter and `lastInventoryDate` sort |
| `GET` | `/api/boxes?catalogueStatus=partial` | Filter by catalogue status: `unknown`, `partial`, `controlled` |

---

## Frontend Changes

### BoxList / BoxListPage

- New filter chips: **"Inventory pending"**, **"Has uncatalogued items"**, **"Never inventoried"**
- New filter: **Catalogue status** (unknown / partial / controlled)
- New sort option: **"Last inventory date"** (ascending, nulls first — for inventory-day workflow)
- Per-row badges:
  - `InventoryPending` (warning amber)
  - `CatalogueStatus` badge: grey (unknown), amber (partial), green (controlled)
  - If partial: show `UncataloguedItemCount` next to badge (e.g. "Partial – 4 uncatalogued")

### BoxDetail

- Show `LastInventoryDate` (formatted) in box metadata section
- Show `CatalogueStatus` badge with uncatalogued count if > 0
- If `InventoryPending`: highlighted banner with [Start Inventory] button
- If `partial`: secondary banner "X items not yet catalogued" with link to stub view for this box
- After completing inventory: banners reflect updated state

### New Component: `InventoryCheckView`

The core inventory UI, displayed either as a full page or modal:

- **Item checklist** — all catalogued items in box, each row showing:
  - Thumbnail, Artikel_Nummer, description
  - Status icon: unchecked / confirmed (green check) / missing (red X)
- **Uncatalogued counter** — prominent tally of physical items found without QR codes this session
- **[+ Uncatalogued item]** button — opens quick-action sheet (count-only or create stub)
- **Scan zone** — persistent camera/input; does not navigate away on match
- **Acoustic feedback** — success tone on confirmed scan, distinct alert tone on mismatch
- **Bulk action** — "Mark remaining as missing" button
- **Complete / Cancel** buttons; Complete shows summary: X confirmed, X missing, X uncatalogued

### QrScannerPage (passive mode hook)

After a box scan is resolved, check `InventoryPending` in the API response and show an interstitial prompt before navigating to `BoxDetail`.

### Missing Items View (new page or filter in ItemList)

- Filter: `MissingAt IS NOT NULL`
- Columns: item, last known box, date flagged missing
- Action: "Mark as found" (clears flag, requires new box assignment)

### Needs Cataloguing View (new page or filter in ItemList)

- Filter: stub items (`IsStub = 1` or `Artikel_Nummer IS NULL`) not yet catalogued
- Columns: stub description/photo thumbnail, box, date created, session it was found in
- Action: "Catalogue now" → opens ItemCreate/edit flow pre-filled with stub photo and notes
- When cataloguing is complete: stub flag cleared, `Box.UncataloguedItemCount` decremented

### Overview / Dashboard

Add a **catalogue coverage** widget:
- Total boxes: N
- Controlled: N (green)
- Partial (needs cataloguing): N (amber) — with link to partial box list
- Unknown (never inventoried): N (grey) — with link to never-inventoried box list
- Total uncatalogued items across all boxes

---

## Event Log Integration

New event keys to be added:

| Event | EntityType | Description |
|-------|-----------|-------------|
| `InventoryStarted` | Box | Session opened |
| `InventoryCompleted` | Box | Session completed; `LastInventoryDate` and `UncataloguedItemCount` updated |
| `InventoryCancelled` | Box | Session abandoned |
| `InventoryConfirmed` | Item | Item confirmed present during inventory |
| `InventoryMissing` | Item | Item not found, flagged missing |
| `InventoryFound` | Item | Previously missing item located and reassigned |
| `InventoryMisplaced` | Item | Item found in wrong box, moved or noted |
| `InventoryStubCreated` | Item | Stub record created for uncatalogued physical item |
| `InventoryStubCatalogued` | Item | Stub promoted to full catalogued item (Artikel_Nummer assigned) |

All events carry `Actor` and `Meta` with session ID for traceability.

---

## Database Migration

In `backend/db.ts`, add migration block:

```sql
-- boxes table
ALTER TABLE boxes ADD COLUMN LastInventoryDate TEXT;
ALTER TABLE boxes ADD COLUMN UncataloguedItemCount INTEGER NOT NULL DEFAULT 0;

-- items table
ALTER TABLE items ADD COLUMN MissingAt TEXT;
ALTER TABLE items ADD COLUMN IsStub INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN StubNotes TEXT;
ALTER TABLE items ADD COLUMN StubPhotoPath TEXT;

-- new table
CREATE TABLE IF NOT EXISTS inventory_sessions (
  Id TEXT PRIMARY KEY,
  BoxID TEXT NOT NULL REFERENCES boxes(BoxID),
  StartedAt TEXT NOT NULL,
  CompletedAt TEXT,
  Actor TEXT NOT NULL,
  Mode TEXT NOT NULL CHECK(Mode IN ('active', 'passive')),
  ConfirmedItemUUIDs TEXT NOT NULL DEFAULT '[]',
  MissingItemUUIDs TEXT NOT NULL DEFAULT '[]',
  MisplacedItemUUIDs TEXT NOT NULL DEFAULT '[]',
  UncataloguedCount INTEGER NOT NULL DEFAULT 0,
  StubItemUUIDs TEXT NOT NULL DEFAULT '[]',
  Notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_box ON inventory_sessions(BoxID);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_started ON inventory_sessions(StartedAt);
CREATE INDEX IF NOT EXISTS idx_items_stub ON items(IsStub) WHERE IsStub = 1;
CREATE INDEX IF NOT EXISTS idx_items_missing ON items(MissingAt) WHERE MissingAt IS NOT NULL;
```

---

## Open Questions

1. **Partial completion** — if an employee starts a box and is interrupted, should the session persist so it can be resumed later? Or is cancel-and-restart acceptable? Sessions in the `inventory_sessions` table with `CompletedAt = null` could represent resumable state.

2. **Menge items (bulk/non-serialized)** — items with `Einheit = 'Menge'` don't have individual QR codes per piece. During inventory, how is quantity verified? Options: (a) manual count entry in the checklist, (b) treat the ItemInstance as a single scannable unit whose QR represents the instance, (c) skip Menge items in inventory check.

3. **Correction process for misplaced items** — when an item is found in the wrong box, should the system automatically suggest the "correct" box (based on DB record) and prompt confirmation, or should the operator freely choose? If the recorded location is also wrong (box is somewhere unexpected), the suggestion may be unhelpful.

4. **Missing item list** — should `MissingAt` cause the item to be excluded from the active stock count? Should items flagged missing for >N days automatically trigger some notification or export?

5. **Inventory scope** — should shelves (BoxID format `S-*`) also participate in inventory? Or is inventory scoped to boxes only?

6. **Acoustic signals** — browser-based audio requires user interaction to unlock the audio context. How should this be handled for a scanning workflow that may be hands-free? Consider a persistent "Start session" button that unlocks audio as a side effect.

7. **`InventoryCycleDays = 0`** — define the exact semantics: disable passive triggering entirely, or treat every box as immediately pending?

8. **Undo / corrections after completion** — once a session is completed and items are marked missing, can the operator reopen it? Or must they scan the item again to clear `MissingAt`?

9. **Reporting** — is a summary report (per inventory session, per inventory day) needed? Could be a simple export: session date, box, counts of confirmed/missing/misplaced.

10. **Multi-user inventory day** — if two employees inventory different boxes simultaneously, sessions are independent and this should work fine. But if two sessions for the same box are started concurrently, a guard (check for open session on same BoxID) should prevent conflicts.

11. **UncataloguedItemCount recalculation** — when a stub is promoted to a full catalogued item, how is `Box.UncataloguedItemCount` decremented? Options: (a) decrement on `InventoryStubCatalogued` event, (b) recompute as `COUNT(IsStub=1 WHERE BoxID=?)` at query time. Query-time is always accurate; persisted count is a snapshot of the last inventory.

12. **Stub identity and QR codes** — should stub ItemInstances get QR labels printed so the physical item can be scanned in future? Or are they ephemeral until a proper Artikel_Nummer is assigned?

13. **Uncatalogued count drift** — between inventories, items may be moved in/out of a box. `UncataloguedItemCount` reflects the last inventory snapshot, not the current reality. Is this acceptable, or should partial-status boxes trigger more frequent re-inventory?

14. **First-time shelf creation during inventory day** — for UC-6, the employee needs to create a box record mid-session. Should the inventory day flow include an inline "create new shelf" action, or should they exit to BoxCreate, then return? Inline is smoother but more complex.

---

## Implementation Phases (Suggested)

### Phase 1 — Foundation
- Add `LastInventoryDate` to `boxes`, `MissingAt` to `items`, create `inventory_sessions` table
- Add `InventoryCycleDays` config variable
- Expose `inventoryPending` boolean on `GET /api/boxes` response
- Add `inventoryPending` filter + `lastInventoryDate` sort to box list endpoint

### Phase 2 — Core Inventory Flow
- Implement `/api/inventory/start`, `/api/inventory/scan`, `/api/inventory/complete`, `/api/inventory/cancel`
- `InventoryCheckView` frontend component with checklist + scan zone
- Acoustic feedback integration
- Event logging for all inventory events

### Phase 3 — Passive Trigger
- Hook into `qr-scan` action: check `InventoryPending` and return flag in response
- `QrScannerPage` interstitial prompt when flag is set

### Phase 4 — Missing Items & Reporting
- Missing items view / filter in `ItemList`
- `InventoryFound` flow (scan to clear `MissingAt`)
- Optional: session summary export

### Phase 5 — Uncatalogued Items & Coverage Tracking
- `UncataloguedItemCount` on boxes; `CatalogueStatus` derived field
- [+ Uncatalogued item] action in `InventoryCheckView` (count-only and stub creation)
- `IsStub` / `StubNotes` / `StubPhotoPath` on ItemInstance
- `POST /api/inventory/stub` and `POST /api/inventory/uncatalogued` endpoints
- "Needs cataloguing" view in `ItemList`
- `InventoryStubCatalogued` event on stub promotion
- Coverage widget on Overview/Dashboard
