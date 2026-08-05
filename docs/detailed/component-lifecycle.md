# Component Lifecycle — deferred-identity in-device components

How a sub-device detected at intake (today: disks) becomes a first-class item that can
graduate into standalone inventory, **without** needing a catalog reference while it is still
inside its parent.

Related: [intake runbook](intake.md) · [spare-parts catalog](spare-parts-catalog.md) ·
request contract: [`intake-image.http`](intake-image.http)

## The problem

Phase-2 intake tests (wipe, SMART, battery) produce artefacts per sub-device, but components
had no identity — reports could only attach to the machine's single serial, and drives never
became items. Goal: make any sub-device the intake image can identify a first-class component
whose reports land on it and which can graduate into inventory, while it carries **no
Artikelnummer** until it is actually extracted.

## Core model

1. **Reports are serial-keyed, not item-keyed.** External-docs storage keys on the serial
   *value* (`SN:<serial>/`), so a report surfaces on whichever item carries that serial — no
   file moves, ever. While a component is in-device its reports aggregate on the parent by
   serial; after graduation the same files surface on the component's own item.
2. **Deferred identity, write-once.** A component is an instance from creation but carries no
   `Artikel_Nummer` while inside its parent. Identity is set **once**, at Zerlegung
   (NULL → value), and is **never changed** afterward. There is no "change reference"
   operation — correcting a mis-set reference is out of scope.
3. **Temporary UUID, re-minted at graduation.** In-device components carry a `C-` UUID (no
   Artikelnummer to embed yet). At graduation the item is re-keyed to a normal
   `I-<Artikelnummer>-####` UUID, so a graduated component is indistinguishable from an
   ordinary item. Cheap because it happens before history accrues, and reports are
   serial-keyed so they are untouched.

## Two states

| State | `Artikel_Nummer` | `BoxID` | Lists | Export / print / agentic |
|---|---|---|---|---|
| **In-device component** | NULL | NULL | nested under parent (ZubehoerMode `connected`) | excluded |
| **Extracted item** | set (write-once) | set | normal standalone row | included |

The gate is **`IN_DEVICE_COMPONENT_SQL`** (`backend/db.ts`): a boxless item with a
`Zerlegt_aus` relation. In-device components match it and are excluded; once graduated (BoxID
set) they drop out and re-enter export/list normally.

## The three operations

### Creation → in-device component (`backend/lib/in-device-components.ts`)
At the intake **ref** step, once the parent machine item exists, `syncInDeviceComponents`
materializes one component per detected sub-device **that has a usable serial** — kind-agnostic
(disks, some serial-bearing NICs/GPUs), the serial is the gate. Serialless sub-devices (typical
PCI cards) are **not** auto-created; they fill assembly info via question pre-fill instead. The
input is the normalized generic `components[]` list (with the `disks[]` shorthand folded in):
- `Artikel_Nummer` NULL, `BoxID` NULL, `Auf_Lager=1`, `SerialNumber` set, a `Zerlegt_aus`
  relation to the parent with `SlotKey` = the device name, and `InstanceSpecs` from the scan
  (size/type/model).
- **Idempotent on re-scan:** keyed on the drive serial (globally unique), so re-running never
  duplicates. A disk whose serial is missing or a placeholder is skipped (can't key reports).
- Runs in one transaction; non-fatal to catalog (a failure logs and continues).

**Serial hardening** (`backend/lib/component-serial.ts`): blank and known SMBIOS/firmware
placeholders (`Default string`, `To be filled by O.E.M.`, single-char fillers, …) are
rejected as identity/report keys, for both machine and component serials.

### Graduation → extracted item (`backend/lib/graduate-component.ts`)
Folded into `remove-from-device`. When the item still needs graduation (`needsGraduation`:
no Artikelnummer yet):
1. Resolve the target reference — pick an existing Artikelnummer or create a new ref.
2. Mint the `I-<Artikelnummer>-####` UUID (collision-guarded).
3. `graduateComponentInTx` runs the whole swap in **one transaction**: re-key the `items` PK +
   set identity/box/location, then re-point every other UUID-keyed row —
   `item_relations` (both directions), `events`, `item_attachments`, `label_queue`.
   `user_item_marks` cascades via its FK's `ON UPDATE CASCADE`. **Reports are serial-keyed →
   untouched.** A partial swap would strand relations/events, so it must be all-or-nothing.
4. Write the `item_ref_relations` `'Ersatzteil'` provenance link (parent ref → component ref).
- **Write-once guard:** re-setting an already-set identity throws `WriteOnceIdentityError`
  → HTTP 409.
- A component that already has a reference (legacy catalog-spare-part instance) is relocated
  as-is, not graduated.

### Deletion
No new code — in-device components share the `Zerlegt_aus` + `BoxID IS NULL` convention that
existing handlers already key on:
- `catalog-spare-part` delete-link refuses when `BoxID` is set (409) and otherwise removes the
  in-device component (relation + item row).
- `remove-item` (parent device removal) hard-deletes **unextracted** (`BoxID IS NULL`)
  children with the device; **extracted** children (BoxID set) survive as real inventory.
- Report files are serial-keyed and left in place on deletion (harmless).

## Parent → Ersatzteil is contract-driven

Extraction and "the parent becomes a spare-part donor" are **decoupled**. `remove-from-device`
marks the parent `Ersatzteil` (quality=1 + Shopware enqueue) only when
`markParentAsSpare` is set — parting a device out for spares marks it; pulling a drive from a
device that will still be resold whole does not. The default (`markParentAsSpare` absent ⇒
true) preserves the historical parting-out behavior; callers pass the contract-driven value.

## Data-model changes (`backend/db.ts` migrations)
- `item_relations.SlotKey` — explicit slot key, so it stops being overloaded onto `Notes`.
- `user_item_marks` FK gains `ON UPDATE CASCADE` — the only UUID FK, needed for the graduation
  PK swap.
- Temporary `C-` UUID scheme (`backend/lib/itemIds.ts`): `generateComponentUUID` /
  `isComponentUUID`; `parseSequentialItemUUID` degrades to null on it, so no Artikelnummer is
  ever mis-derived for a reference-less component.

## Deferred (not built)
- **Re-link / change reference** on a graduated item — out of scope by construction.
- **Severing the `Zerlegt_aus` link on sale/stock-removal** — the provenance link is kept
  after graduation; severing it when the item is sold is deferred.
- **Manual "add unidentified component"** UI — backend deletion/graduation exist; the explicit
  add-in-Zerlegen entry point is not yet exposed.
- **Contract signal source** — where "part this device out" lives (a parent/Auftrag field vs.
  an operator toggle) is still to be wired; today the API honors `markParentAsSpare` and never
  auto-marks without it.
- **Image serial capability** — whether the intake image can read per-drive serials for every
  drive type on the bench (`wwn`/`model` fallback exists) is unverified.
