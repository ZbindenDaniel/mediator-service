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
3. **Stable part ID, named after its origin.** In-device components get
   `C-<root device Artikelnummer>-<subcategory>-<####>` (e.g. `C-104523-2132-0003`), numbered per
   (root article, subcategory); `0` stands for a slot without a target subcategory (intake disks
   keyed by device name). The ID is minted once (`backend/lib/part-ids.ts`, shared by intake and
   the catalogue route) and **never changes** — graduation only sets the Artikelnummer — so
   relations, events, attachments and printed labels stay valid. Which device a part sits in comes
   from the `Zerlegt_aus` relation, not the ID. A part created *with* an article (catalog-spare-part
   with a ref) gets the normal `I-<Artikelnummer>-####`.

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

### Creation by hand → `POST /api/items/:parent/spare-parts/component` (#984)
The manual counterpart for the nested quality assessment: `{ slotKey, actor }` creates a reference-less
`C-` component in that slot (no serial needed — identity and reports come later). The slot must exist
on the parent's (effective) assembly contract; an occupied single slot returns 409 with the existing
`itemUUID`; `multipleAllowed` slots accept more. The UI calls it lazily — only when the part's own
assessment is saved — so opening and abandoning a part creates nothing.

### One way out of the device (#1001)
`remove-from-device` is the only path for an article-less part: the Einzelteile "Entnehmen" form
sends the box plus `artikelNummer` or `newRef` (`Artikelbeschreibung`, `Hersteller`,
`Unterkategorien_A`, optional `Langtext`, e.g. `{ "FRU": "…" }`). `move-item` refuses a part still in
its device that has no article (409, "über Einzelteile entnehmen") and any part in a "Fest verbaut"
slot (`isIntegratedSlot`, also enforced by `remove-from-device`); parts with an article
(refurbishment) still relocate through `move-item` as before. Item lists hide article-less in-device
parts (`LISTABLE_ITEM_SQL` in `backend/db.ts`) — they live in the device's Einzelteile tree.

### Graduation → extracted item (`backend/lib/graduate-component.ts`)
Folded into `remove-from-device`. When the item still needs graduation (`needsGraduation`:
no Artikelnummer yet):
1. Resolve the target reference — pick an existing Artikelnummer or create a new ref.
2. `graduateComponentInTx` sets identity/box/location on the **same row** in one transaction
   with the provenance link; the ItemUUID stays (until 2026-10 it was re-minted to `I-…` and every
   UUID-keyed table re-pointed — removed with the stable part IDs).
3. Write the `item_ref_relations` `'Ersatzteil'` provenance link (parent ref → component ref).
- **Subcategory guard (#984):** the component was assessed with its slot's `targetSubcategory`.
  A chosen ref of another subcategory returns 409 (`slotSubCategory`/`refSubCategory`) unless
  `confirmSubCategoryChange: true`; a `newRef` without `Unterkategorien_A` gets the slot's.
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

Extraction and "the parent becomes a spare-part donor" are **decoupled** (#982,
`backend/lib/parent-slot.ts`): removing a part records its slot as missing on the parent (answers
carried over) and the quality calculation decides. The parent is additionally marked as donor
(manual grade 1 + Shopware enqueue) when the slot is **unweighted** (refurbishment contracts —
the historical behaviour); weighted catalogue slots leave it to the score. `markParentAsSpare`
in the request overrides either way.

## Data-model changes (`backend/db.ts` migrations)
- `item_relations.SlotKey` — explicit slot key, so it stops being overloaded onto `Notes`.
- `user_item_marks` FK gains `ON UPDATE CASCADE` — added for the former graduation PK swap; kept,
  harmless now that IDs never change.
- Part ID scheme (`backend/lib/itemIds.ts` `partItemUUIDStem`/`nextPartItemUUID`, minted in
  `backend/lib/part-ids.ts`); `parseSequentialItemUUID` degrades to null on it, so no
  Artikelnummer is ever mis-derived from a part ID. Older random `C-…` IDs (test data) stay valid.

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
