# Inventory Placement Actions — Feature Planning

## Overview

This document covers **placement actions**: fast mobile flows for physically organising stock by
scanning entities into their storage locations. This is distinct from inventory *verification*
(PLANNING_INVENTORY.md), which checks that items are where they're recorded.

Two workflows are supported:

1. **Scan items into a box** — open a box or shelf, scan item QR codes; each item is assigned to
   that box.
2. **Scan boxes onto a shelf** — open a shelf, scan box QR codes; each box is assigned to that
   shelf.

No schema changes are required. Both workflows use existing move endpoints.

---

## Use Cases

### UC-1: Rapid item intake

An employee unpacks incoming goods and scans each item into a target box one by one. The phone
navigates to the scanner for each item and returns automatically. If an item is already in the
target box, the scan is silently accepted. If an item is in a different box, a warning prompts
the operator to confirm the move or skip.

### UC-2: Shelf organisation

An employee slots boxes onto a shelf and scans each box to record the location. Same loop as
UC-1 but at the box/shelf level.

---

## Data Model

No schema changes. Existing fields used:

| Field | Entity | Description |
|-------|--------|-------------|
| `BoxID` | Item | Current box/shelf assignment |
| `LocationId` | Box | Current shelf assignment |

---

## Architecture: QR scanner callback loop

Each scan is a single atomic navigation round-trip through the existing `/scan` page:

```
[PlacementScanView] ──navigate──▶ [/scan?returnTo=...&intent=placement-scan]
       ▲                                 │ user scans QR
       │   navigate(returnTo,            │
       └── { state.qrReturn }) ◀─────────┘
```

No sessionStorage needed: the URL carries `targetId` + `mode`, and `location.state.qrReturn`
carries each individual scan result. All state is ephemeral React component state.

**Loop exit:** operator taps "Fertig" (returns to BoxDetail, triggers reload) or "Abbrechen"
(returns without data change). The scanner's own back button also exits.

---

## UI Placement

New buttons in `BoxDetail` actions bar:

- **"Einscannen"** — always shown when a box or shelf is open; starts `items` mode.
- **"Behälter einlagern"** — shown only when the current entity is a shelf (`isShelf = true`);
  starts `boxes` mode.

---

## Flows

### Flow A: Item already in target box

```
Scan I-1234 → GET /api/items/:itemUUID → item.BoxID === targetId
→ no warning, auto-navigate back to scanner
```

### Flow B: Item from elsewhere

```
Scan I-1234 → GET /api/items/:itemUUID → item.BoxID !== targetId
→ show warning: "I-1234 ist in B-007. Hierher verschieben?"
  [Verschieben] → POST /api/items/:itemUUID/move { toBoxId: targetId, actor }
  [Überspringen] → no API call
→ auto-navigate to scanner for next scan
```

### Flow C: Box already on target shelf

```
Scan B-042 → GET /api/boxes/:boxId → box.LocationId === targetId
→ no warning, auto-navigate back to scanner
```

### Flow D: Box from elsewhere

```
Scan B-042 → GET /api/boxes/:boxId → box.LocationId !== targetId
→ show warning: "B-042 ist in S-03. Hierher verschieben?"
  [Verschieben] → POST /api/boxes/:boxId/move { LocationId: targetId, actor }
  [Überspringen] → no API call
→ auto-navigate to scanner for next scan
```

---

## API Endpoints Used

All existing — no new endpoints required.

| Operation | Endpoint | Body |
|-----------|----------|------|
| Look up item | `GET /api/items/:itemUUID` | — |
| Move item to box | `POST /api/items/:itemUUID/move` | `{ toBoxId, actor }` |
| Look up box | `GET /api/boxes/:boxId` | — |
| Move box to shelf | `POST /api/boxes/:boxId/move` | `{ LocationId, actor }` |

---

## Frontend Changes

### New component: `PlacementScanView`

Route: `/placement/:targetId?mode=items|boxes`

Full-screen page (not a modal). Manages the scan loop with ephemeral React state for pending
warnings. Auto-navigates to `/scan` after each scan is resolved.

### Modified: `BoxDetail`

Two new action buttons added to the always-visible actions bar.

### Modified: `QrScannerPage`

`'placement-scan'` added to the `QrScanIntent` union type and validation block. No other change.

### Modified: `App.tsx`

New route `/placement/:targetId` registered.

---

## Resolved Decisions

1. **Additive only** — unscanned records are not changed. Operator scans only what they want to
   update; nothing is implicitly moved or removed.

2. **Always warn** — if an entity is currently assigned elsewhere, always show a confirmation
   before moving. Never silently relocate.

3. **No persistent scan history** — each navigation mount handles one scan result. There is no
   running list shown across scans. Operators who need an audit trail use the event log.

4. **No sessionStorage** — URL params carry target context; `location.state` carries each scan
   result. Closing and reopening the page starts fresh (expected behaviour).

5. **No new backend endpoints** — existing move and detail endpoints cover all operations.

6. **Boxes mode entry point** — only exposed on shelf entities (`isShelf = true`), because moving
   boxes to a non-shelf box would create nested-box ambiguity.
