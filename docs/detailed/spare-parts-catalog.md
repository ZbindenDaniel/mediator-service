# Spare Parts Catalog (Einzelteile)

Related: [component-lifecycle.md](component-lifecycle.md) (deferred-identity components), [intake-image-guide.md](intake-image-guide.md) (contracts at intake).

## In short

- **Business goal:** Broken devices that enter the workshop as part donors have no inventory presence. The Einzelteile page lets operators catalog components (fan, RAM, SSD, battery …) as individual item instances linked back to the source device — enabling traceability, search, and eventual sale.
- **User value:** One tab, one workflow. Operators assess the device, answer component questions in the quality review, then either confirm parts are still in the device (Cataloged) or extract them to a storage box (Removed).

## Scope

**Shipped:**
- Assembly contracts (`contracts/assembly/`) defining which parts a subcategory has.
- Quality integration: component questions rendered alongside general/subcategory questions;
  answers contribute to the quality score and InstanceSpecs — in both the operator quality
  review **and** the intake quality step.
- **Einzelteile page (#996)** `/items/:id/einzelteile`: left the Aufbau tree (slots per work step, presence chips
  saved per click via `PATCH …/quality-review/answers`, nested assemblies indented), right the selected node's own
  Zustand (`QualityReviewStep` with `questionScope="none"`), Entnehmen/Lösen/Mit Artikel erfassen. Data from one call,
  `GET /api/items/:id/parts-tree` (`actions/parts-tree.ts`; reference-less creation in `actions/part-component.ts`).
  Replaced the Zerlegen section of the Accessories tab and the modal drill-down. Entnehmen = `PartRemovalForm` →
  `remove-from-device` (sets the article when there is none); built-in parts are assessed but never removable; device
  questions fully covered by assessed parts are locked in the form and on the server (`refinedQuestionIds`).
- Slot states: Unknown, Present, Empty, Cataloged, Removed, plus NotApplicable ("Nicht vorgesehen") and Integrated
  ("Fest verbaut") for canonical presence selects (#980).
- Parts are created lazily on their first save (`POST …/spare-parts/component`); unsaved answers per node survive
  in localStorage (`qualityDraft`). The #984 modal drill-down was removed in #996.
- Removing a part (Entnehmen / remove-from-device) records its slot as missing on the parent with the parent's
  answers carried over; unweighted slots additionally set the parent to grade 1 (manual), as before (#982).
- Percentage quality range per item incl. in-device parts (weighted slots/questions, unchecked = uncertainty),
  recomputed up the `Zerlegt_aus` chain — see [PLANNING_PARTS_CATALOGUE.md](../PLANNING_PARTS_CATALOGUE.md) §5.
- API endpoints for cataloging, extracting, and un-cataloging parts.
- **Deferred-identity components** ([component-lifecycle.md](component-lifecycle.md)): intake
  auto-creates one reference-less in-device component per scanned disk; `remove-from-device`
  doubles as graduation (set identity write-once; the part ID stays).

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
part ID `C-<root Artikelnummer>-<subcategory>-<####>` that never changes — see [component-lifecycle.md](component-lifecycle.md).

## API

### `GET /api/items/:parentUuid/spare-parts`
Returns all `Zerlegt_aus`-linked children of the parent device, with `slotKey`, `BoxID`, `Location`, and article description.

### `POST /api/items/:parentUuid/spare-parts`
Catalogs a new spare part (with a reference). Body: `{ artikelNummer, actor, slotKey? }`.
Creates an `items` row (BoxID=null) and an `item_relations` row (Zerlegt_aus), plus an `item_ref_relations` Ersatzteil link if the parent has an `Artikel_Nummer`. Returns `{ itemUUID }`.

### `POST /api/items/:parentUuid/spare-parts/component`
Catalogs a part into a slot **without a reference** (in-device `C-` component) — used by the nested
quality assessment. Body: `{ slotKey, actor }`. Returns `{ itemUUID, subCategory }` (201); 400 for a slot
the device contract doesn't define; 409 with the existing `itemUUID` when a single slot is occupied.

### `DELETE /api/items/:uuid/spare-part-link`
Removes the spare part link and deletes the item instance. Only allowed when `BoxID = null` (part not yet extracted). Returns 409 if already extracted.

### `POST /api/items/:uuid/remove-from-device`
Physically extracts the spare part to a storage box. Body: `{ toBoxId, actor, markParentAsSpare?, artikelNummer?, newRef? }`.
- If the item is a **reference-less in-device component** (deferred identity), this is its
  **graduation**: it sets the identity write-once (`artikelNummer` or `newRef`); the part keeps its
  `C-` ID (see [component-lifecycle.md](component-lifecycle.md)); a re-set attempt returns 409.
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
| `EinzelteilePage` | `frontend/src/components/einzelteile/EinzelteilePage.tsx` | Full-screen route, two columns, selected node in `?node=` (`<itemUUID>` or `<parent>~<slotKey>` for a part not created yet) |
| `PartsTreeView` | `frontend/src/components/einzelteile/PartsTreeView.tsx` | Left: steps, slot rows, presence chips / spec selects, status |
| `PartNodePanel` | `frontend/src/components/einzelteile/PartNodePanel.tsx` | Right: own questions, lazy create, Entnehmen (`RelocateItemCard`), Lösen, Mit Artikel erfassen (`SparepartSlotPopup`) |
| helpers | `frontend/src/lib/partsTree.ts` | Slot state, step grouping, next open part, API calls |
| `ItemAccessoriesTab` | `frontend/src/components/item-tabs/ItemAccessoriesTab.tsx` | Components summary + link; `ZubehoerCard` keeps only accessory links |
| `QualityReviewStep` | `frontend/src/components/QualityReviewStep.tsx` | Asks the slot questions of its `questionScope` (`create` at creation, `none` on the Einzelteile page) |

Slot state (`slotState` in `lib/partsTree.ts`): a part item in the slot wins (in device → assessed/open, in a box →
removed); else the stored answer, else the contract `default` (shown dashed, not stored); else unknown.

## Logging

| Event | EntityId | When |
|---|---|---|
| `SparePartCataloged` | Parent device UUID | POST spare-parts succeeds |
| `ComponentDetected` | Parent device UUID | intake materializes a disk component |
| `ComponentGraduated` | Component UUID (unchanged) | remove-from-device graduates a reference-less component |
| `RemovedFromDevice` | Spare part UUID | POST remove-from-device succeeds |
| `SparePartRemoved` | Parent device UUID | POST remove-from-device succeeds |

## Test checklist

**Static:**
- `backend/__tests__/quality-contracts.test.ts` — `assemblyToQualityContract`, `deriveQualityFromAnswers`, `deriveSpecsFromAnswers`, `buildQualityCheckResponse` with the assembly contract merged.
- `backend/lib/__tests__/intake-specs-assembly.test.ts` — assembly questions + scan-derived specs at intake.
- `backend/actions/__tests__/catalog-spare-part.test.ts` — GET/POST/DELETE routes, validation, event logging.
- `backend/actions/__tests__/remove-from-device.test.ts` — relocate + graduation + contract-gate.

**Runtime:**
1. Create a laptop (catalogue): only device questions are asked (`askOnCreate: []`); refurbishment still asks its slots.
2. Instance tab → **Einzelteile** → steps with progress; "2. Laufwerk" shows a dashed "– n. v." default.
3. Battery "✓ da" → saved at once; click the battery → assess → "Speichern" creates `C-<Art>-2132-0001` and stays on it.
4. Device range follows; re-saving the device's Zustand keeps the presence answers.
5. "Entnehmen…" → box → row shows "entnommen · B-…"; "Lösen" deletes a wrongly created part.
6. `GET /api/contracts/assembly/201` returns the contract JSON.

## Open questions

- [ ] Phase 2 bidirectional suggestions — requires structured spec matching across inventory.
