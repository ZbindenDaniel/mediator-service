# Transport Boxes (T-) — Planning Document

_Status: Draft · Date: 2026-04-18 · Updated: 2026-04-18_

---

## 1. Summary

A **transport** is a workflow contract that models the intent to move a set of items or boxes from one location to another. Transports are created by users or external services (ERP/shop) and completed by warehouse employees who physically execute the move and confirm the target location.

Transport boxes use the ID prefix **`T-`** (e.g. `T-180426-0001`), consistent with the existing `B-` (box) and `S-` (shelf) conventions.

---

## 2. Core Concept

| Dimension | Box | Shelf | Transport (T-) |
|---|---|---|---|
| Physical object | Yes | Yes | No — logical contract |
| Has source location | Implied (LocationId) | Self-reference | Explicit `SourceId` |
| Has target location | No | No | Explicit `TargetId` |
| Has state | No | No | `pending / done / cancelled` |
| Holds items | Yes | Via boxes | References items/boxes |
| Has reference | No | No | Yes (order no., commission ref) |

Transports do **not** move items at creation time. Items remain at their current location. When an employee completes a transport, the backend relocates all referenced items/boxes to the target location in a single transaction.

---

## 3. Data Model

### 3.1 Option A — New `transports` table (recommended)

```sql
CREATE TABLE transports (
  TransportID     TEXT PRIMARY KEY,   -- T-DDMMYY-####
  SourceId        TEXT,               -- shelf or box ID (nullable if items specified directly)
  TargetId        TEXT NOT NULL,      -- planned destination shelf ID
  ActualTargetId  TEXT,               -- actual destination if overridden at completion
  State           TEXT NOT NULL DEFAULT 'pending',  -- pending | done | cancelled
  Reference       TEXT,               -- order no., commission ref, free text
  Note            TEXT,
  ItemCount       INTEGER,            -- denormalized summary
  TotalWeightKg   REAL,               -- denormalized summary
  CreatedAt       TEXT NOT NULL,
  CreatedBy       TEXT,
  CompletedAt     TEXT,
  CompletedBy     TEXT,
  UpdatedAt       TEXT NOT NULL
);

CREATE TABLE transport_items (
  TransportID   TEXT NOT NULL REFERENCES transports(TransportID),
  RefType       TEXT NOT NULL,      -- 'item' | 'box'
  RefID         TEXT NOT NULL,      -- ItemUUID or BoxID
  PRIMARY KEY (TransportID, RefType, RefID)
);
```

**Why a separate table (not extending `boxes`):**
- Transports have a state machine, dual locations (source + target), and a reference field — semantically distinct from physical containers.
- Extending `boxes` with nullable columns (TargetId, State, Reference) couples unrelated logic and complicates list/filter queries.
- The existing Box interface is used by print/relocation flows that should not receive transport records.

**Why not transport_items only (no SourceId):**
- Use case 1 (shelf → warehouse) is naturally expressed as "transport this shelf's current contents" — no explicit item selection needed.
- Use case 3 (inter-warehouse bulk) originates from a filtered box/item list — specific items must be referenced.
- Both modes should be supported: `SourceId` is the "transport whole source" shortcut; `transport_items` is explicit per-item selection. A transport may have one or both.

### 3.2 Option B — Extend `boxes` table

Add nullable columns `TargetLocationId`, `TransportState`, `TransportReference` to `boxes`. Items are placed **inside** the transport box (BoxID = T-...) and travel with it.

**Rejects** because: items must be physically loaded into the transport box before departure, which adds an extra step. Shelves cannot be "put inside" a transport box. And it conflates physical containment with logical scheduling.

### 3.3 TypeScript Interface

```typescript
// models/transport.ts
export type TransportState = 'pending' | 'done' | 'cancelled';

export interface Transport {
  TransportID: string;            // T-DDMMYY-####
  SourceId?: string | null;       // shelf or box being transported
  TargetId: string;               // planned destination shelf ID
  ActualTargetId?: string | null; // actual destination when overridden at completion
  State: TransportState;
  Reference?: string | null;      // order/commission reference
  Note?: string | null;
  ItemCount?: number | null;
  TotalWeightKg?: number | null;
  CreatedAt: string;
  CreatedBy?: string | null;
  CompletedAt?: string | null;
  CompletedBy?: string | null;
  UpdatedAt: string;
}

export interface TransportItem {
  TransportID: string;
  RefType: 'item' | 'box';
  RefID: string;
}
```

### 3.4 ID Minting

Format: `T-DDMMYY-####` (e.g. `T-180426-0001`).  
Same collision-retry logic as `create-box.ts` (up to 25 attempts, 4-digit index starting at 0001).

---

## 4. State Machine

```
          create
            │
        [pending]
           / \
    complete   cancel
         /       \
      [done]  [cancelled]
```

- **pending → done**: employee scans/confirms target; backend relocates all referenced items/boxes.
- **pending → cancelled**: user or API cancels; no relocation occurs; items untouched.
- No re-opening of done/cancelled transports in v1.

---

## 5. Use Cases & Flows

### UC1 — Store → Warehouse (outbound)

**Context:** Items are received/processed in the store and shelved there. They need to go to the main warehouse.

**Creation flow (store staff / manager):**
1. Open a shelf or box detail in the store location.
2. Tap **"Transport erstellen"** action (new button in detail view, similar to "Verschieben").
3. Specify target location (warehouse shelf, free-text or dropdown from configured locations).
4. Optionally add a note. Submit → transport created with `SourceId = shelf/box ID`.
5. No items are moved yet; the shelf/box shows a "Transport ausstehend" indicator.

**Completion flow (warehouse employee):**
1. Open **Transporte** page (new nav item), filter by `pending`.
2. Select transport → see source, planned target, item count summary.
3. Tap **"Abschliessen"** → completion dialog (see §5.4) with planned target pre-filled.
4. Employee scans or selects target shelf (can differ from planned — see §5.4).
5. Backend relocates all items in source box/shelf to confirmed target, marks transport `done`.

### UC2 — Warehouse → Store (commissioning / inbound)

**Context:** A store orders items from the warehouse. An order reference exists (e.g. shop order ID or ERP reference).

**Creation flow (API or staff):**
1. API call `POST /api/transports` with `targetId`, `reference`, optional `sourceId` or list of item IDs.
   - Staff equivalent: filter item list by article number / location → bulk select → "Transport erstellen" with reference field.
2. Transport created in `pending` state with `Reference = order-number`.

**Completion flow (warehouse employee):**
1. Transport list → filter or search by reference.
2. Select transport → see which items/boxes are included.
3. Completion dialog (§5.4) → scan or confirm target shelf.
4. Backend moves items, marks done; reference preserved for audit.

### UC3 — Warehouse → Warehouse (inter-site)

**Context:** Items or boxes need to move between two warehouse locations. Staff identifies the need while browsing the item or box list.

**Creation flow:**
1. In item list or box list, apply location filter to isolate items at source warehouse.
2. Multi-select items/boxes → bulk action **"Transport erstellen"**.
3. Specify target warehouse location and note (reason for transfer).
4. Transport created with explicit `transport_items` entries (no single SourceId).

**Completion flow:** same as UC1/UC2 — completion dialog, optional override.

### UC4 — Shelf Full / Location Override at Completion

**Context:** An employee arrives at the planned target shelf but it is full or otherwise unsuitable. They find a free shelf nearby and place items there instead.

**Flow:**
1. Employee opens transport detail, taps **"Abschliessen"**.
2. Completion dialog shows planned target: _"Regal B379-1-0003 (12 Boxen, 47 Artikel)"_.
3. Employee scans a **different** shelf (e.g. `S-B379-1-0005`).
4. Dialog detects mismatch between scanned and planned target. Shows confirmation:
   > **Zielort geändert**
   > Geplant: Regal B379-1-0003
   > Neu gescannt: Regal B379-1-0005 (3 Boxen, 11 Artikel)
   > Trotzdem abschliessen?
5. Employee confirms → backend completes transport with `ActualTargetId = S-B379-1-0005`, `TargetId` unchanged (planned target preserved for audit).
6. Completed transport record shows both planned and actual target.

**Notes:**
- The confirmation step is required even if the override is intentional — prevents accidental wrong-shelf scans.
- If the employee scans the **same** shelf as planned, no extra confirmation is shown (normal completion path).
- `ActualTargetId` is null when the actual matches the planned target (no override needed).

### §5.4 — Completion Dialog (shared flow)

The "Abschliessen" dialog is the same for all use cases:

1. **Target shelf picker** — shows all known shelves as a searchable list. Each shelf entry displays:
   - Shelf label (e.g. "Hubertus – Etage 1 – Regal 0002")
   - Current box count and item count (from aggregated `list-boxes` query)
   - Planned target is pre-selected / highlighted
2. **QR scan shortcut** — employee can scan a shelf QR to auto-select it instead of scrolling.
3. **If scanned/selected shelf ≠ planned target** → override confirmation (§UC4 step 4).
4. **Confirm** → sends `complete-transport` with `confirmedTargetId`.

---

## 6. Location Field During Transit

**Question:** Should item/box `Location` or `BoxID` change when a transport is created?

**Recommendation:** No — items and boxes retain their current location until the transport is **completed**. The transport record is the source of truth for pending intent. This avoids false location data and keeps relocation atomic (one transaction on completion).

**UI signal:** Show a "Transport ausstehend" badge on the box/shelf detail and in the item list row when a pending transport references that entity.

---

## 7. API Surface

| Method | Route | Action module | Description |
|---|---|---|---|
| `POST` | `/api/transports` | `create-transport` | Create transport (staff or API) |
| `GET` | `/api/transports` | `list-transports` | List transports; query params: `state`, `source`, `reference` |
| `GET` | `/api/transports/:id` | `transport-detail` | Single transport + referenced items |
| `POST` | `/api/transports/:id/complete` | `complete-transport` | Relocate items/boxes, mark done |
| `POST` | `/api/transports/:id/cancel` | `cancel-transport` | Mark cancelled |
| `GET` | `/api/boxes?type=shelf&counts=1` | `list-boxes` (extended) | All shelves with box+item count aggregates for target picker |

`complete-transport` payload:
```json
{
  "actor": "string",
  "confirmedTargetId": "string"
}
```

- `confirmedTargetId` is the shelf ID the employee actually chose (scanned or selected).
- If `confirmedTargetId` equals `TargetId`: normal completion, `ActualTargetId` stays null.
- If they differ: override is accepted and `ActualTargetId = confirmedTargetId` is persisted. The mismatch is logged with structured context (`plannedTargetId`, `actualTargetId`, `actor`). No 400 error — the frontend already required explicit confirmation before sending.
- **Stub auto-resolve:** after relocating items, `complete-transport` resolves all active `box_stubs` records for the source shelf (`SourceId` or the shelf containing the source box) by setting `IsActive = 0`, `ResolvedAt = now`, `ResolvedBy = actor`. See `docs/PLANNING_STUB_BOXES.md` for stub schema.

**Shelf list with counts** (`GET /api/boxes?type=shelf&counts=1`):

Extend the existing `list-boxes` action to support an optional `counts=1` parameter that adds per-shelf aggregate columns:
- `BoxCount` — number of boxes with `LocationId = shelf.BoxID`
- `ItemCount` — total items across those boxes (already partially available via existing aggregate logic)

This reuses the existing query and projection; the `counts` flag gates the JOIN to avoid overhead when not needed.

---

## 8. UI & Navigation Changes

### 8.1 New page: `/transports`

- Nav item: **"Transporte"** — placed before "Aktivitäten" in the main nav.
- Shows transport list, filterable by state (default: `pending`), location, reference.
- Each row: TransportID, source label, target label, item count, state badge, created date.
- Tap row → transport detail with item/box list and complete/cancel actions.

### 8.2 Transport creation entry points

| Entry point | How | Scope |
|---|---|---|
| Box detail | "Transport erstellen" button (near "Verschieben") | Whole box contents |
| Shelf detail | "Transport erstellen" button | Whole shelf contents |
| Item list (bulk) | Bulk action bar → "Transport erstellen" | Selected items |
| Box list (bulk) | Bulk action bar → "Transport erstellen" | Selected boxes |
| API | `POST /api/transports` | Programmatic (ERP/shop) |

### 8.3 Transport detail page

- Header: TransportID, state badge, source → target summary, reference, note.
- Item/box list: shows what will be (or was) moved.
- Actions: **"Abschliessen"** (pending only) → opens completion dialog (§5.4); **"Abbrechen"** (pending only).
- Completed transports: read-only with timestamp and actor. If `ActualTargetId` differs from `TargetId`, show both:
  > Ziel: ~~Regal B379-1-0003~~ → **Regal B379-1-0005** (geändert bei Abschluss)

### 8.5 Target shelf picker (in completion dialog and transport creation)

Used in both the creation form (choosing planned target) and the completion dialog (confirming/overriding actual target).

- Searchable list of all shelves fetched from `GET /api/boxes?type=shelf&counts=1`.
- Each shelf row shows:
  - Shelf label (resolved via `shelfLabel.ts` format: `{location_label} – {floor} – {index}`)
  - Box count + item count in a compact badge (e.g. `4 Boxen · 23 Artikel`)
- QR scan button alongside the list: scanning a shelf QR auto-selects it.
- Pre-selects planned `TargetId` in the completion dialog.

### 8.4 "Transport ausstehend" indicator

- Box detail and shelf detail: show a yellow badge/banner when a pending transport references them.
- Item list row: small indicator icon if item has a pending transport.

---

## 9. Implementation Phases

### Phase 1 — Core (unblocked)

1. `models/transport.ts` — TypeScript interfaces (including `ActualTargetId`).
2. DB schema: `transports` + `transport_items` tables with migrations in `backend/db.ts`.
3. `backend/actions/create-transport.ts`, `list-transports.ts`, `transport-detail.ts`.
4. `backend/actions/complete-transport.ts` — reuses `move-item` / `move-box` logic; accepts `confirmedTargetId`; records `ActualTargetId` when override occurs; logs mismatch.
5. `backend/actions/cancel-transport.ts`.
6. Extend `list-boxes` with `counts=1` parameter for shelf picker aggregates.
7. Frontend: `TransportListPage.tsx`, `TransportDetail.tsx`, `TransportCompleteDialog.tsx` (shelf picker + override confirmation).
8. Navigation: add Transporte nav item.

### Phase 2 — Creation entry points

8. "Transport erstellen" button in `BoxDetail.tsx` and shelf detail.
9. Bulk action in `BulkItemActionBar.tsx` and box list.
10. "Transport ausstehend" badge in box/shelf detail and item list.

### Phase 3 — External API & commissioning

11. Document and harden `POST /api/transports` for ERP/shop callers.
12. Reference search/filter on transport list.
13. CSV export of completed transports for audit.

---

## 10. Resolved Decisions

All open questions are now decided.

### Q1: Whole-source vs. selective items (SourceId vs. transport_items)

**✅ Decided: snapshot at creation (Option B).** At creation, enumerate items in source and write them to `transport_items`. Prevents surprise inclusions and gives the employee an explicit, auditable list of what to move.

### Q2: Does completing a transport auto-create a target box?

**✅ Decided: auto-create** if no target box is specified — consistent with existing `RelocateItemCard` behavior.

### Q3: Should items change Location during transit?

**✅ Decided: no.** Items remain at their source location until the transport is completed. The transport badge is the only UI signal during transit. Setting `BoxID = TransportID` would pollute location data and break scan flows.

### Q4: Re-open / edit after creation

**✅ Decided: defer to Phase 2.** V1 transports are immutable after creation; cancel and recreate to change scope.

### Q5: Multiple transports referencing the same item

**✅ Decided:** warn (not block) at creation if the item already has a pending transport. Block at completion if the item has moved since the transport was created (compare current location vs. expected source).

### Q6: Transport weight/item count

**✅ Decided: snapshot at creation** (denormalized). Consistent with how `Box.ItemCount` works.

### Q7: ERP/shop API authentication and schema

**Deferred — needs ERP team alignment.** The `POST /api/transports` endpoint uses the same actor-based auth pattern as other API actions. Exact request contract (field names, reference format) is not yet defined.

### Q8: "Shelf full" indicator in target picker

**✅ Decided: no indicator in v1.** Skip entirely; rely on employee judgment. A configurable threshold may be added later but adds no value without per-shelf capacity data.

---

## 11. Relation to Existing Todo Item

`todo.md` item #18 reads:
> "Add Transport/Temporary box alias for item relocation. A special box type with a `TargetLocation` field to temporarily hold items during multi-step relocation workflows until the contract is resolved."

This planning document supersedes that item. The scope is broader (workflow contract, not just alias box). Todo #18 should be replaced with a link to this document and phased implementation tasks.

---

## 12. Box Interface Reuse — Decision

The user asked whether to reuse the Box interface or create a new class.

**Decision: new `Transport` interface, not a Box subtype.**

Rationale:
- The Box interface is consumed by print routing (`labelType` from BoxID prefix), relocation cards, and list aggregation. Injecting transport records into those flows would require guards everywhere.
- Transport semantics (source + target + state + reference) do not map cleanly onto Box fields (LocationId = one current location only).
- The ID prefix `T-` convention and minting logic CAN be directly reused from `create-box.ts` (copy pattern, not inherit).
- Shared fields (ItemCount, TotalWeightKg, Notes, CreatedAt) are coincidental overlap, not a type hierarchy.
