# Spare Parts Catalog (Zerlegen)

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Original design plan: `~/.claude/plans/what-about-if-we-sorted-book.md`

## In short

- **Business goal:** Broken devices that enter the workshop as part donors have no inventory presence. The Zerlegen feature lets operators catalog components (fan, RAM, SSD, battery …) as individual item instances linked back to the source device — enabling traceability, search, and eventual sale.
- **User value:** One tab, one workflow. Operators assess the device, answer component questions in the quality review, then either confirm parts are still in the device (Cataloged) or extract them to a storage box (Removed).

## Scope

**Phase 1 — shipped:**
- Disassembly contracts (`contracts/disassembly/`) defining which parts are removable per subcategory.
- Quality review integration: component questions rendered alongside general/subcategory questions; answers contribute to quality score and InstanceSpecs.
- Zerlegen section inside the existing Accessories tab (no new tab).
- Four slot states: Potential, Empty, Cataloged, Removed.
- Three API endpoints for cataloging, extracting, and un-cataloging parts.
- Parent device quality auto-set to `Ersatzteil` on first extraction.

**Deferred (phase 2):**
- Bidirectional suggestions ("PS missing → show matching PS items in inventory").
- Shop cross-linking of `Ersatzteil` ref-level links → spare parts on device shop page.
- Agentic article creation pre-seeded with device model + part type.
- `drive_type` question placement (currently in `quality/201.json` — TBD whether it joins the storage slot).
- Navigable parent-device link in spare part `Location` field.

## Core concepts

| Term | Meaning |
|---|---|
| **Disassembly contract** | JSON file defining which physical parts a subcategory has; each part can carry a `qualityQuestion` used during quality assessment |
| **Slot** | One row in the Zerlegen table; corresponds to one part definition in the contract |
| **Potential** | No linked item; quality assessment didn't say the part is absent |
| **Empty** | No linked item; quality assessment confirmed the part is absent (`false` / `"Nicht vorhanden"`) |
| **Cataloged** | Linked item instance exists; `BoxID = null` (part still physically in device) |
| **Removed** | Linked item instance exists; `BoxID ≠ null` (physically extracted to a storage box) |
| **Zerlegt_aus** | `item_relations.RelationType` meaning "this instance was extracted from that device" |
| **Ersatzteil** | `item_ref_relations.RelationType` meaning "this article type is a spare part for that device article" |

`Zerlegt_aus` is for physical extraction (fan, RAM, SSD, keyboard). Accessories that attach externally (power supply, mouse) continue to use the existing `Zubehör` relation.

## Disassembly contract JSON

**Location:** `contracts/disassembly/<subCategoryCode>.json`  
**Current files:** `201.json` (Laptop), `102.json` (Standard-PC), `301.json` (Drucker)

**Schema:**
```json
{
  "version": 1,
  "subCategory": 201,
  "parts": [
    {
      "key": "ram",
      "label": "Arbeitsspeicher",
      "targetSubcategory": 603,
      "qualityQuestion": {
        "id": "ram_gb",
        "type": "select",
        "question": "Wie viel RAM ist verbaut?",
        "values": ["2", "4", "8", "16", "32", "64"],
        "specField": "RAM",
        "specValue": "%v GB"
      }
    }
  ]
}
```

- `key` — stable identifier used as `item_relations.Notes` to link a spare part to its slot.
- `targetSubcategory` — default subcategory for new item instances created from this slot.
- `qualityQuestion` — optional; same shape as `QualityQuestion` in `models/quality-contract.ts`. `qualityImpact` is optional (RAM amount doesn't affect quality score; fan absence does).
- Adding a new subcategory: drop a new JSON file — the registry auto-discovers it on restart, no code change needed.

## Quality integration

`disassemblyToQualityContract(dc)` (`backend/lib/quality-contracts.ts`) converts the disassembly parts into a synthetic `QualityContract` containing only the parts' `qualityQuestion`s. This is injected as a third contract into `buildQualityCheckResponse()` alongside `[general, subCat, disassembly]`.

**Effect:**
- Component questions (fan present?, battery condition?, RAM amount?) appear in the quality review modal alongside the existing quality questions.
- `deriveQualityFromAnswers` picks up `qualityImpact` from disassembly questions (e.g. `has_fan: false → 1`).
- `deriveSpecsFromAnswers` picks up `specField`/`specValue` (e.g. `ram_gb: "16" → { "RAM": "16 GB" }`).
- `updateItemInstanceSpecs` writes the derived specs into `items.InstanceSpecs` — visible on the Instance tab.

The quality contract files (`contracts/quality/`) no longer contain component questions that moved to disassembly contracts. Old assessments with those question IDs in their stored `responses` JSON still render correctly — the answers blob is preserved verbatim.

## Data model

No new tables. Uses existing columns with new `RelationType` values:

| Table | RelationType | Direction | Meaning |
|---|---|---|---|
| `item_relations` | `'Zerlegt_aus'` | Child → Parent | Instance X extracted from device instance Y |
| `item_ref_relations` | `'Ersatzteil'` | Child → Parent | Article X is a spare part type of device article Y |
| `item_ref_relations` | `'Zubehör'` | (existing) | Article X is compatible accessory for device article Y |

`item_relations.Notes` stores the `slotKey` (e.g. `"fan"`, `"ram"`) to map each linked instance back to its contract slot.

New item instances created by `catalog-spare-part` have:
- `BoxID = null` (not yet in a box — still in the device)
- `Location = device.Bezeichnung` (human-readable provenance; searchable)
- `Artikel_Nummer` from the operator's article selection

## API

### `GET /api/items/:parentUuid/spare-parts`
Returns all `Zerlegt_aus`-linked children of the parent device, with `slotKey`, `BoxID`, `Location`, and article description.

### `POST /api/items/:parentUuid/spare-parts`
Catalogs a new spare part. Body: `{ artikelNummer, actor, slotKey? }`.  
Creates an `items` row (BoxID=null) and an `item_relations` row (Zerlegt_aus), plus an `item_ref_relations` Ersatzteil link if the parent has an `Artikel_Nummer`. Returns `{ itemUUID }`.

### `DELETE /api/items/:uuid/spare-part-link`
Removes the spare part link and deletes the item instance. Only allowed when `BoxID = null` (part not yet extracted). Returns 409 if already extracted.

### `POST /api/items/:uuid/remove-from-device`
Physically extracts the spare part to a storage box. Body: `{ toBoxId, actor }`.  
Updates `items.BoxID` + `Location`, inserts a `quality_assessments` row (`tag='Ersatzteil', value=1`) on the parent device, logs `RemovedFromDevice` + `SparePartRemoved` events, enqueues Shopware sync for the parent.

**Error codes:**

| Status | Condition |
|---|---|
| 400 | Missing required field; item has no `Zerlegt_aus` link |
| 404 | Item or box not found |
| 409 | Spare part already extracted (BoxID set); duplicate link |
| 500 | UUID generation failure |

## UI components

| Component | File | Role |
|---|---|---|
| `ItemAccessoriesTab` | `frontend/src/components/item-tabs/ItemAccessoriesTab.tsx` | Fetches disassembly contract, spare parts list, and quality responses; passes all to `ZubehoerCard` |
| `ZubehoerCard` | `frontend/src/components/ZubehoerCard.tsx` | Renders Zerlegen table below Zubehör content; derives slot states; shows action buttons |
| `SparepartSlotPopup` | `frontend/src/components/SparepartSlotPopup.tsx` | Quick-confirm popup on "Hinzufügen": shows top matching refs, one-tap confirm, fallback to full search |
| `QualityReviewStep` | `frontend/src/components/QualityReviewStep.tsx` | Renders disassembly questions in a dedicated section before subcategory questions |

Slot state derivation in `ZubehoerCard.deriveSlotState()`:
1. Linked spare part exists → Cataloged or Removed (based on BoxID).
2. No link; quality answer is `"false"` or `"Nicht vorhanden"` → Empty.
3. Otherwise → Potential.

The Zerlegen section only renders when `disassemblyContract` is non-null (i.e. a contract exists for the item's subcategory).

## Logging

| Event | EntityId | When |
|---|---|---|
| `SparePartCataloged` | Parent device UUID | POST spare-parts succeeds |
| `RemovedFromDevice` | Spare part UUID | POST remove-from-device succeeds |
| `SparePartRemoved` | Parent device UUID | POST remove-from-device succeeds |

## Test checklist

**Static:**
- `backend/__tests__/quality-contracts.test.ts` — `disassemblyToQualityContract`, `deriveQualityFromAnswers`, `deriveSpecsFromAnswers`, `buildQualityCheckResponse` with disassembly contract merged.
- `backend/actions/__tests__/catalog-spare-part.test.ts` — GET/POST/DELETE routes, validation, event logging.
- `backend/actions/__tests__/remove-from-device.test.ts` — success path, validation, QA insertion non-fatal.

**Runtime:**
1. Enter quality assessment for a Laptop → component questions appear (fan, keyboard, battery, RAM, storage).
2. Answer "Akku: Nicht vorhanden" → battery slot shows ✕ (Empty) in Zerlegen.
3. Answer "RAM: 16 GB" → InstanceSpecs shows "RAM: 16 GB"; RAM slot shows ◎ (Potential).
4. Click "Hinzufügen" on Lüfter → popup shows matching fan articles → confirm → slot becomes ◉ (Cataloged).
5. Click "Entnehmen" → select box → slot becomes ○ (Removed); parent device quality badge shows "Ersatzteil".
6. `GET /api/contracts/disassembly/201` returns the contract JSON.

## Open questions

- [ ] `drive_type` placement: stay in `quality/201.json` or move to storage slot in disassembly contract?
- [ ] Phase 2 bidirectional suggestions — requires structured spec matching across inventory.
