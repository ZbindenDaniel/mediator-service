# Inventory Feature Planning

## Overview

This document covers the design for periodic physical inventory verification — checking that items are actually in the boxes they are recorded in, and flagging discrepancies. Two complementary modes are supported: a **passive cycle** (items are checked opportunistically as boxes are scanned) and an **active inventory day** (dedicated process where employees work through all boxes systematically).

Uncatalogued goods (physical items and boxes on shelves that have no QR code and are not yet in the system) are handled as a separate logistics process documented in [PLANNING_STUB_BOXES.md](./PLANNING_STUB_BOXES.md). The inventory feature only concerns itself with items that are already in the system.

---

## Use Cases

### UC-1: Inventory Day (Annual/Semi-annual)

Employees work through a warehouse section by section. They have a filtered box list sorted by oldest `LastInventoryDate`. For each box they:

1. Open the app's inventory list, sorted by `LastInventoryDate` ascending (nulls first)
2. Pick up the next box, scan its QR code → app opens box in inventory mode
3. See a checklist of items expected to be in the box
4. Tick off items visually **and/or** scan item QR codes to confirm presence
5. Scanning mode stays open after each successful item scan (no navigation interruption)
6. When done, items not confirmed are flagged as missing
7. Move to next box; continue

### UC-2: Passive Inventory Cycle (Continuous)

Normal operations: an employee scans a box to retrieve or add an item. If the box's `LastInventoryDate` is older than `InventoryCycleDays` (or null), the scan flow detects `InventoryPending` and prompts a lightweight inventory check before the normal action proceeds (or offers to defer).

### UC-3: Missing Item Discovery

During inventory, an item scanned or expected is not found. The system records it as missing and flags it in a missing-items view for follow-up.

### UC-4: Misplaced Item Discovery

During inventory of Box A, an item is scanned whose `BoxID` in the database points to Box B (or is null). The system signals a mismatch and initiates a relocation flow.

---

## Domain Model Changes

### Box

Add fields to the `boxes` table and `Box` model:

| Field | Type | Description |
|-------|------|-------------|
| `LastInventoryDate` | `TEXT \| null` | ISO 8601 timestamp of last completed inventory for this box. `null` = never inventoried. |
| `InventoryPending` | Derived (not stored) | `true` when `LastInventoryDate` is null **or** older than `now - InventoryCycleDays` days |

`InventoryPending` is computed at query/model time so it automatically reflects config changes.

### Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `INVENTORY_CYCLE_DAYS` | `180` | Days after which a box becomes `InventoryPending`. Set to `0` to disable passive triggering. |

### ItemInstance — Missing Flag

Add one field to the `items` table:

| Field | Type | Description |
|-------|------|-------------|
| `MissingAt` | `TEXT \| null` | ISO 8601 timestamp when item was last confirmed missing during inventory. `null` = not flagged. Cleared when item is subsequently scanned/found. |

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

Exposed as a boolean in `GET /api/boxes`, filterable in the box list, and shown as a badge on `BoxDetail` / `BoxList`.

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
        │     └── ItemUUID unknown in system → show warning, offer to assign to this box
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
    [Move here]        → update item.BoxID = Box A, log Moved event
    [Ignore / skip]    → item is neither confirmed nor missing in this session
    [Mark as misplaced] → log event, leave assignment unchanged for now
```

### Flow D: Missing Items After Inventory

When `CompleteInventory` is called with unconfirmed items:
- Set `ItemInstance.MissingAt = now` and `ItemInstance.BoxID = null` (item is not in this box)
- Log `InventoryMissing` event on the item
- Item appears in the **missing items view** for follow-up

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
- `InventoryPending` badge on each box row (warning amber, consistent with existing quality badges)

### BoxDetail

- Show `LastInventoryDate` (formatted) in box metadata section
- If `InventoryPending`: highlighted banner with [Start Inventory] button
- After completing inventory: banner disappears, date updates

### New Component: `InventoryCheckView`

The core inventory UI, displayed as a full page:

- **Item checklist** — all items in box, each row showing:
  - Thumbnail, Artikel_Nummer, description
  - Status icon: unchecked / confirmed (green check) / missing (red X)
- **Scan zone** — persistent camera/input; does not navigate away on a successful match
- **Acoustic feedback** — success tone on confirmed scan, distinct alert tone on mismatch
- **Bulk action** — "Mark remaining as missing" button
- **Complete / Cancel** buttons; Complete shows summary before confirming: X confirmed, X missing

### QrScannerPage (passive mode hook)

After a box scan is resolved, check `InventoryPending` in the API response and show an interstitial prompt before navigating to `BoxDetail`.

### Missing Items View (new page or filter in ItemList)

- Filter: `MissingAt IS NOT NULL`
- Columns: item, last known box, date flagged missing
- Action: "Mark as found" (clears flag, requires new box assignment)

---

## Event Log Integration

New event keys:

| Event | EntityType | Description |
|-------|-----------|-------------|
| `InventoryStarted` | Box | Session opened |
| `InventoryCompleted` | Box | Session completed, `LastInventoryDate` updated |
| `InventoryCancelled` | Box | Session abandoned |
| `InventoryConfirmed` | Item | Item confirmed present |
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
CREATE INDEX IF NOT EXISTS idx_items_missing ON items(MissingAt) WHERE MissingAt IS NOT NULL;
```

---

## Open Questions

1. **Partial completion** — if an employee starts a box and is interrupted, should the session persist for resumption? Sessions with `CompletedAt = null` could represent resumable state, but adds complexity. Alternative: cancel-and-restart is always acceptable.

2. **Menge items (bulk/non-serialized)** — items with `Einheit = 'Menge'` have no per-piece QR codes. Options: (a) manual count entry in checklist, (b) treat the ItemInstance QR as a single scannable unit, (c) skip Menge items in inventory check entirely.

3. **Correction process for misplaced items** — should the system suggest the "correct" box based on the DB record, or let the operator freely choose? If the recorded location is also wrong, the suggestion would be misleading.

4. **Missing item exclusion from stock** — should `MissingAt` exclude the item from active stock counts? Should items missing for >N days trigger a notification or export?

5. **Inventory scope** — should shelves (`S-*` BoxID format) participate in inventory the same way as boxes, or is the item-level check less meaningful for shelves?

6. **Acoustic signals** — browser audio requires a prior user interaction to unlock the audio context. A persistent "Start session" button at the top of `InventoryCheckView` that unlocks audio as a side effect would solve this cleanly.

7. **`InventoryCycleDays = 0`** — exact semantics: disable passive triggering entirely, or treat every box as always pending?

8. **Undo after completion** — once a session completes and items are marked missing, can the operator reopen it, or must they scan the item again to clear `MissingAt`?

9. **Reporting** — is a session summary needed? Could be a simple export: date, box, confirmed/missing/misplaced counts, actor.

10. **Multi-user concurrency** — a guard on `POST /api/inventory/start` should reject if an open session already exists for that BoxID.

---

## Implementation Phases (Suggested)

### Phase 1 — Foundation
- Add `LastInventoryDate` to `boxes`, `MissingAt` to `items`, create `inventory_sessions` table
- Add `INVENTORY_CYCLE_DAYS` config variable
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
