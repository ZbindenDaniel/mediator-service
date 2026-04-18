# Inventory Feature Planning

## Overview

This document covers the design for periodic physical inventory verification — checking that items are actually in the boxes they are recorded in, and flagging discrepancies. Two complementary modes are supported: a **passive cycle** (items are checked opportunistically as boxes are scanned) and an **active inventory day** (dedicated process where employees work through all boxes systematically).

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

---

## Domain Model Changes

### Box

Add two fields to the `boxes` table and `Box` model:

| Field | Type | Description |
|-------|------|-------------|
| `LastInventoryDate` | `TEXT \| null` | ISO 8601 timestamp of last completed inventory for this box. `null` = never inventoried. |
| `InventoryPending` | Derived (not stored) | `true` when `LastInventoryDate` is null **or** older than `now - InventoryCycleDays` days |

`InventoryPending` is computed at query time (or in the model layer) — not persisted — so it automatically reflects config changes.

### Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `INVENTORY_CYCLE_DAYS` | `180` | Number of days after which a box becomes `InventoryPending`. Set to `0` to disable passive triggering. |

### ItemInstance — Missing Flag

Add an optional field to the `items` table:

| Field | Type | Description |
|-------|------|-------------|
| `MissingAt` | `TEXT \| null` | ISO 8601 timestamp when item was last confirmed missing during inventory. `null` = not flagged. Cleared when item is scanned/found. |

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
| `Notes` | TEXT \| null | Optional operator notes |

---

## Derived Status: `InventoryPending`

```
InventoryPending = (LastInventoryDate IS NULL)
                OR (LastInventoryDate < now - INVENTORY_CYCLE_DAYS days)
```

This is exposed:
- As a boolean field in `GET /api/boxes` list response
- As a sort/filter option in the box list (`?filter=inventoryPending`)
- Visually as a badge on the `BoxDetail` and `BoxList` components

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
  - Shows checklist of all ItemInstances assigned to box
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
        ├── User taps [Mark all remaining as missing] → bulk-flag unchecked items
        │
        └── User taps [Complete Inventory]
              │
              ▼
        POST /api/inventory/complete
          - Sets Box.LastInventoryDate = now
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
| `POST` | `/api/inventory/complete` | Finalize session: persist outcomes, update `LastInventoryDate`, flag missing items |
| `POST` | `/api/inventory/cancel` | Abandon session without updating `LastInventoryDate` |
| `GET` | `/api/inventory/missing` | List items currently flagged as missing (`MissingAt IS NOT NULL`) |
| `GET` | `/api/boxes?filter=inventoryPending` | Existing endpoint extended with `inventoryPending` filter and `lastInventoryDate` sort |

---

## Frontend Changes

### BoxList / BoxListPage

- New filter chip: **"Inventory pending"**
- New sort option: **"Last inventory date"** (ascending, nulls first — for inventory-day workflow)
- `InventoryPending` badge on each box row (warning color, similar to existing quality badges)

### BoxDetail

- Show `LastInventoryDate` (formatted) in box metadata section
- If `InventoryPending`: show highlighted banner with [Start Inventory] button
- After completing inventory: banner disappears, date updates

### New Component: `InventoryCheckView`

The core inventory UI, displayed either as a full page or modal:

- **Item checklist** — all items in box, each row showing:
  - Thumbnail, Artikel_Nummer, description
  - Status icon: unchecked / confirmed (green check) / missing (red X)
- **Scan zone** — persistent camera/input for scanning; does not navigate away on match
- **Acoustic feedback** — success tone on confirmed scan, alert tone on mismatch
- **Bulk action** — "Mark remaining as missing" button
- **Complete / Cancel** buttons

### QrScannerPage (passive mode hook)

After a box scan is resolved, check `InventoryPending` in the API response and show an interstitial prompt before navigating to `BoxDetail`.

### Missing Items View (new page or filter in ItemList)

- Filter: `MissingAt IS NOT NULL`
- Columns: item, last known box, date flagged missing
- Action: "Mark as found" (clears flag, requires new box assignment)

---

## Event Log Integration

New event keys to be added:

| Event | EntityType | Description |
|-------|-----------|-------------|
| `InventoryStarted` | Box | Session opened |
| `InventoryCompleted` | Box | Session completed, `LastInventoryDate` updated |
| `InventoryCancelled` | Box | Session abandoned |
| `InventoryConfirmed` | Item | Item confirmed present during inventory |
| `InventoryMissing` | Item | Item not found, flagged missing |
| `InventoryFound` | Item | Previously missing item located and reassigned |
| `InventoryMisplaced` | Item | Item found in wrong box, moved or noted |

All events carry `Actor` and `Meta` with session ID for traceability.

---

## Database Migration

In `backend/db.ts`, add migration block:

```sql
-- boxes table
ALTER TABLE boxes ADD COLUMN LastInventoryDate TEXT;

-- items table  
ALTER TABLE items ADD COLUMN MissingAt TEXT;

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
  Notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_box ON inventory_sessions(BoxID);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_started ON inventory_sessions(StartedAt);
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
