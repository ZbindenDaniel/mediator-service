# Transport Boxes (T-) — Planning Document

_Status: Draft · Date: 2026-04-18_

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
  TransportID   TEXT PRIMARY KEY,   -- T-DDMMYY-####
  SourceId      TEXT,               -- shelf or box ID (nullable if items specified directly)
  TargetId      TEXT NOT NULL,      -- shelf or location ID
  State         TEXT NOT NULL DEFAULT 'pending',  -- pending | done | cancelled
  Reference     TEXT,               -- order no., commission ref, free text
  Note          TEXT,
  ItemCount     INTEGER,            -- denormalized summary
  TotalWeightKg REAL,               -- denormalized summary
  CreatedAt     TEXT NOT NULL,
  CreatedBy     TEXT,
  CompletedAt   TEXT,
  CompletedBy   TEXT,
  UpdatedAt     TEXT NOT NULL
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
  TransportID: string;          // T-DDMMYY-####
  SourceId?: string | null;     // shelf or box being transported
  TargetId: string;             // destination shelf or location
  State: TransportState;
  Reference?: string | null;    // order/commission reference
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
2. Select transport → see source, target, item count summary.
3. Tap **"Abschliessen"** → prompted to confirm/scan target location.
4. On confirm: backend relocates all items in source box/shelf to target, marks transport `done`.

### UC2 — Warehouse → Store (commissioning / inbound)

**Context:** A store orders items from the warehouse. An order reference exists (e.g. shop order ID or ERP reference).

**Creation flow (API or staff):**
1. API call `POST /api/transports` with `targetId`, `reference`, optional `sourceId` or list of item IDs.
   - Staff equivalent: filter item list by article number / location → bulk select → "Transport erstellen" with reference field.
2. Transport created in `pending` state with `Reference = order-number`.

**Completion flow (warehouse employee):**
1. Transport list → filter or search by reference.
2. Select transport → see which items/boxes are included.
3. Scan target location → backend moves items, marks done.
4. Reference is preserved on the completed transport for audit.

### UC3 — Warehouse → Warehouse (inter-site)

**Context:** Items or boxes need to move between two warehouse locations. Staff identifies the need while browsing the item or box list.

**Creation flow:**
1. In item list or box list, apply location filter to isolate items at source warehouse.
2. Multi-select items/boxes → bulk action **"Transport erstellen"**.
3. Specify target warehouse location and note (reason for transfer).
4. Transport created with explicit `transport_items` entries (no single SourceId).

**Completion flow:** same as UC1/UC2.

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

`complete-transport` payload:
```json
{ "actor": "string", "confirmedTargetId": "string" }
```
`confirmedTargetId` must match (or be accepted as valid substitute for) the transport's `TargetId`. Mismatch → 400 with structured error. This prevents accidental delivery to the wrong location.

---

## 8. UI & Navigation Changes

### 8.1 New page: `/transports`

- Nav item: **"Transporte"** (between Boxen and Scan, or after Aktivitäten).
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
- Actions: **"Abschliessen"** (pending only) → confirms target via scan or dropdown; **"Abbrechen"** (pending only).
- Completed transports: read-only with timestamp and actor.

### 8.4 "Transport ausstehend" indicator

- Box detail and shelf detail: show a yellow badge/banner when a pending transport references them.
- Item list row: small indicator icon if item has a pending transport.

---

## 9. Implementation Phases

### Phase 1 — Core (unblocked)

1. `models/transport.ts` — TypeScript interfaces.
2. DB schema: `transports` + `transport_items` tables with migrations in `backend/db.ts`.
3. `backend/actions/create-transport.ts`, `list-transports.ts`, `transport-detail.ts`.
4. `backend/actions/complete-transport.ts` — reuses existing `move-item` / `move-box` logic.
5. `backend/actions/cancel-transport.ts`.
6. Frontend: `TransportListPage.tsx`, `TransportDetail.tsx`.
7. Navigation: add Transporte nav item.

### Phase 2 — Creation entry points

8. "Transport erstellen" button in `BoxDetail.tsx` and shelf detail.
9. Bulk action in `BulkItemActionBar.tsx` and box list.
10. "Transport ausstehend" badge in box/shelf detail and item list.

### Phase 3 — External API & commissioning

11. Document and harden `POST /api/transports` for ERP/shop callers.
12. Reference search/filter on transport list.
13. CSV export of completed transports for audit.

---

## 10. Open Questions

### Q1: Whole-source vs. selective items (SourceId vs. transport_items)

When a transport is created from a shelf, does it mean "move everything currently on this shelf" or "move items that were on this shelf at creation time"?

- **Option A (dynamic):** `SourceId` without snapshot — completion queries current shelf contents. Simpler, but items added after transport creation are included unintentionally.
- **Option B (snapshot):** At creation, enumerate items in source and write them to `transport_items`. Explicit and auditable.
- **Recommendation:** Option B. Snapshot at creation. Prevents surprise inclusions and gives the employee a clear list of what to move.

### Q2: Does completing a transport auto-create a target box?

If the target is a shelf, items need a box at the destination. Options:
- Auto-create a new box at target shelf on completion (mirrors existing `RelocateItemCard` behavior).
- Require the employee to specify an existing target box.
- **Recommendation:** Auto-create if no target box is specified (consistent with existing relocation flow).

### Q3: Should items change Location during transit?

Could set item `Location = 'in-transit'` or `BoxID = TransportID` to show movement status.
- Risk: pollutes location data; scan flows may break.
- **Recommendation:** Keep items at source location until completion. Use transport badge as UI signal only.

### Q4: Re-open / edit after creation

Can a pending transport have items added or removed after creation?
- Needed if commissioning orders change before pickup.
- **Recommendation:** Defer to Phase 2. V1 transports are immutable after creation; cancel and recreate to change scope.

### Q5: Multiple transports referencing the same item

Is it valid to have two pending transports referencing the same item?
- Could cause conflicting moves.
- **Recommendation:** Warn (not block) at creation if item already has a pending transport. Block at completion if item has moved since transport was created (compare current location vs. expected source).

### Q6: Transport weight/item count

ItemCount and TotalWeightKg on the transport: compute on creation from snapshot (Phase 1), or aggregate live from transport_items join?
- **Recommendation:** Snapshot at creation (denormalized), updated if items change. Consistent with how `Box.ItemCount` works.

### Q7: ERP/shop API authentication and schema

Details undefined. The `POST /api/transports` endpoint should accept the same actor-based auth pattern as other API actions. The exact request contract (field names, reference format) needs alignment with ERP team.

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
