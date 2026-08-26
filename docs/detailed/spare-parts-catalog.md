# Spare Parts Catalog (Zerlegen)

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Related: [component-lifecycle.md](component-lifecycle.md) (deferred-identity components),
>   [intake-image-guide.md](intake-image-guide.md) (contracts at intake).

## In short

- **Business goal:** Broken devices that enter the workshop as part donors have no inventory presence. The Zerlegen feature lets operators catalog components (fan, RAM, SSD, battery …) as individual item instances linked back to the source device — enabling traceability, search, and eventual sale.
- **User value:** One tab, one workflow. Operators assess the device, answer component questions in the quality review, then either confirm parts are still in the device (Cataloged) or extract them to a storage box (Removed).

## Scope

**Shipped:**
- Assembly contracts (`contracts/assembly/`) defining which parts a subcategory has.
- Quality integration: component questions rendered alongside general/subcategory questions;
  answers contribute to the quality score and InstanceSpecs — in both the operator quality
  review **and** the intake quality step.
- Zerlegen section inside the existing Accessories tab (no new tab).
- Four slot states: Potential, Empty, Cataloged, Removed.
- API endpoints for cataloging, extracting, and un-cataloging parts.
- **Deferred-identity components** ([component-lifecycle.md](component-lifecycle.md)): intake
  auto-creates one reference-less in-device component per scanned disk; `remove-from-device`
  doubles as graduation (set identity write-once + re-mint UUID).

**Deferred (phase 2):**
- Bidirectional suggestions ("PS missing → show matching PS items in inventory").
- Shop cross-linking of `Ersatzteil` ref-level links → spare parts on device shop page.
- Agentic article creation pre-seeded with device model + part type.
- Navigable parent-device link in spare part `Location` field.
- Auto-creating linked items for non-serialed accessory slots (only serialed disks become
  components today; other slots are captured as specs).

## Core concepts

| Term | Meaning |
|---|---|
| **Assembly contract** | JSON file defining the parts a subcategory has; each part carries a `question` (presence/spec) and optional `specQuestion`, used during quality assessment |
| **Slot** | One row in the Zerlegen table; corresponds to one part definition in the contract |
| **Potential** | No linked item; quality assessment didn't say the part is absent |
| **Empty** | No linked item; quality assessment confirmed the part is absent (`false` / `"Nicht vorhanden"`) |
| **Cataloged** | Linked item instance exists; `BoxID = null` (part still physically in device) |
| **Removed** | Linked item instance exists; `BoxID ≠ null` (physically extracted to a storage box) |
| **Zerlegt_aus** | `item_relations.RelationType` meaning "this instance was extracted from that device" |
| **Ersatzteil** | `item_ref_relations.RelationType` meaning "this article type is a spare part for that device article" |

`Zerlegt_aus` is for physical extraction (fan, RAM, SSD, keyboard). Accessories that attach externally (power supply, mouse) continue to use the existing `Zubehör` relation.

## Assembly contract JSON

**Location:** `contracts/assembly/<subCategoryCode>.json` (renamed from `disassembly/`)
**Current files:** `201.json` (Laptop), `102.json` (Standard-PC), `301.json` (Drucker)

**Schema** (`models/assembly-contract.ts`):
```json
{
  "version": 1,
  "subCategory": 201,
  "parts": [
    {
      "key": "storage",
      "label": "SSD / HDD",
      "targetSubcategory": 901,
      "multipleAllowed": true,
      "noLink": true,
      "question": {
        "id": "storage_gb", "type": "select", "question": "Speicher (SSD/HDD)?",
        "values": ["128", "256", "512", "1000", "2000"], "specField": "Speicher", "specValue": "%v GB"
      },
      "specQuestion": {
        "id": "drive_type", "type": "select", "question": "Speichertyp?",
        "values": ["SSD", "NVMe SSD", "HDD", "SSD + HDD", "eMMC"], "specField": "Speichertyp", "specValue": "%v"
      }
    }
  ]
}
```

- `key` — stable slot identifier; stored on the relation to map a linked instance back to its slot.
- `targetSubcategory` — default subcategory for new item instances created from this slot.
- `multipleAllowed` — the slot may hold several instances (e.g. RAM). Not reflected at intake (one answer).
- `noLink` — spec-only slot: the spec answer is sufficient, no item link is created (e.g. storage).
- `question` — primary question (presence boolean or spec select); `qualityImpact` optional (RAM amount doesn't affect quality; fan absence does).
- `specQuestion` — optional secondary spec question (e.g. `drive_type`), not used for quality scoring.
- Adding a subcategory: drop a JSON file — the registry (`backend/contracts/registry.ts`) auto-discovers it on restart.

## Quality integration

`assemblyToQualityContract(ac)` (`backend/lib/quality-contracts.ts`) flattens the assembly parts
into a synthetic `QualityContract` containing each part's `question` **and** `specQuestion`. It is
injected into `buildQualityCheckResponse()` alongside `[general, assembly, subCat]` — by both the
operator quality review (`quality-review.ts`) and the intake quality step (`intake-answer.ts`).

**Effect:**
- Component questions (fan present?, battery condition?, RAM amount?) appear alongside the other quality questions.
- `deriveQualityFromAnswers` picks up `qualityImpact` (e.g. `has_fan: false → 1`).
- `deriveSpecsFromAnswers` picks up `specField`/`specValue` (e.g. `ram_gb: "16" → { "RAM": "16 GB" }`).
- `updateItemInstanceSpecs` writes the derived specs into `items.InstanceSpecs` — visible on the Instance tab.

The quality contract files (`contracts/quality/`) no longer contain component questions that moved to the assembly contract. Old assessments with those question IDs in their stored `responses` JSON still render correctly — the answers blob is preserved verbatim.

## Data model

No new tables. Uses existing columns with new `RelationType` values:

| Table | RelationType | Direction | Meaning |
|---|---|---|---|
| `item_relations` | `'Zerlegt_aus'` | Child → Parent | Instance X extracted from device instance Y |
| `item_ref_relations` | `'Ersatzteil'` | Child → Parent | Article X is a spare part type of device article Y |
| `item_ref_relations` | `'Zubehör'` | (existing) | Article X is compatible accessory for device article Y |

The slot key (e.g. `"fan"`, `"ram"`) maps each linked instance back to its contract slot. It is
stored in `item_relations."SlotKey"` (all writes and reads target it). `"Notes"` remains for
genuine `Zubehör` relation notes.

New item instances created by `catalog-spare-part` have:
- `BoxID = null` (not yet in a box — still in the device)
- `Location = device.Bezeichnung` (human-readable provenance; searchable)
- `Artikel_Nummer` from the operator's article selection

Intake-created in-device components differ: **no `Artikel_Nummer`** (deferred identity) and a
temporary `C-` UUID until graduation — see [component-lifecycle.md](component-lifecycle.md).

## API

### `GET /api/items/:parentUuid/spare-parts`
Returns all `Zerlegt_aus`-linked children of the parent device, with `slotKey`, `BoxID`, `Location`, and article description.

### `POST /api/items/:parentUuid/spare-parts`
Catalogs a new spare part (with a reference). Body: `{ artikelNummer, actor, slotKey? }`.
Creates an `items` row (BoxID=null) and an `item_relations` row (Zerlegt_aus), plus an `item_ref_relations` Ersatzteil link if the parent has an `Artikel_Nummer`. Returns `{ itemUUID }`.

### `DELETE /api/items/:uuid/spare-part-link`
Removes the spare part link and deletes the item instance. Only allowed when `BoxID = null` (part not yet extracted). Returns 409 if already extracted.

### `POST /api/items/:uuid/remove-from-device`
Physically extracts the spare part to a storage box. Body: `{ toBoxId, actor, markParentAsSpare?, artikelNummer?, newRef? }`.
- If the item is a **reference-less in-device component** (deferred identity), this is its
  **graduation**: it sets the identity write-once (`artikelNummer` or `newRef`) and re-mints the
  `C-` UUID to `I-<Artikelnummer>-####` atomically (see [component-lifecycle.md](component-lifecycle.md)); a re-set attempt returns 409.
- Relocates the item to the box (`BoxID` + `Location`) and writes the `Ersatzteil` provenance link.
- Marks the **parent** device `Ersatzteil` (quality=1 + Shopware enqueue) **only when
  `markParentAsSpare`** — contract-gated, decoupled from extraction; default true preserves the
  historical parting-out behavior.
- Logs `RemovedFromDevice` + `SparePartRemoved` (and `ComponentGraduated` on graduation).

**Error codes:**

| Status | Condition |
|---|---|
| 400 | Missing required field; item has no `Zerlegt_aus` link; graduation without `artikelNummer`/`newRef` |
| 404 | Item or box not found |
| 409 | Identity already set (write-once); spare part already extracted (BoxID set); duplicate link |
| 500 | UUID generation failure |

## UI components

| Component | File | Role |
|---|---|---|
| `ItemAccessoriesTab` | `frontend/src/components/item-tabs/ItemAccessoriesTab.tsx` | Fetches the assembly contract, spare parts list, and quality responses; passes all to `ZubehoerCard` |
| `ZubehoerCard` | `frontend/src/components/ZubehoerCard.tsx` | Renders Zerlegen table below Zubehör content; derives slot states; shows action buttons |
| `SparepartSlotPopup` | `frontend/src/components/SparepartSlotPopup.tsx` | Quick-confirm popup on "Hinzufügen": shows top matching refs, one-tap confirm, fallback to full search |
| `QualityReviewStep` | `frontend/src/components/QualityReviewStep.tsx` | Renders assembly (component) questions in a dedicated section before subcategory questions |

Slot state derivation in `ZubehoerCard.deriveSlotState()`:
1. Linked spare part exists → Cataloged or Removed (based on BoxID).
2. No link; quality answer is `"false"` or `"Nicht vorhanden"` → Empty.
3. Otherwise → Potential.

The Zerlegen section only renders when an assembly contract exists for the item's subcategory.

## Logging

| Event | EntityId | When |
|---|---|---|
| `SparePartCataloged` | Parent device UUID | POST spare-parts succeeds |
| `ComponentDetected` | Parent device UUID | intake materializes a disk component |
| `ComponentGraduated` | Component (new) UUID | remove-from-device graduates a reference-less component |
| `RemovedFromDevice` | Spare part UUID | POST remove-from-device succeeds |
| `SparePartRemoved` | Parent device UUID | POST remove-from-device succeeds |

## Test checklist

**Static:**
- `backend/__tests__/quality-contracts.test.ts` — `assemblyToQualityContract`, `deriveQualityFromAnswers`, `deriveSpecsFromAnswers`, `buildQualityCheckResponse` with the assembly contract merged.
- `backend/lib/__tests__/intake-specs-assembly.test.ts` — assembly questions + scan-derived specs at intake.
- `backend/actions/__tests__/catalog-spare-part.test.ts` — GET/POST/DELETE routes, validation, event logging.
- `backend/actions/__tests__/remove-from-device.test.ts` — relocate + graduation + contract-gate.

**Runtime:**
1. Quality assessment for a Laptop → component questions appear (fan, keyboard, battery, RAM, storage).
2. Answer "Akku: Nicht vorhanden" → battery slot shows ✕ (Empty) in Zerlegen.
3. Answer "RAM: 16 GB" → InstanceSpecs shows "RAM: 16 GB"; RAM slot shows ◎ (Potential).
4. Click "Hinzufügen" on Lüfter → popup shows matching fan articles → confirm → slot becomes ◉ (Cataloged).
5. Click "Entnehmen" → select box → slot becomes ○ (Removed); parent quality badge shows "Ersatzteil" only if marked as a spare.
6. `GET /api/contracts/assembly/201` returns the contract JSON.

## Open questions

- [ ] Phase 2 bidirectional suggestions — requires structured spec matching across inventory.
