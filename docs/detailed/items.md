# Items

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## In short
- Business goal: Keep the item domain understandable as the central data object that connects storage, enrichment, import/export, and shop synchronization workflows.
- In short: Items relate to most operational classes (boxes, media, events, agentic runs, export records) and are intentionally split into reference identity (`Artikel_Nummer`) and instance identity (`ItemUUID`).
- User value: Fewer regressions caused by mixed identity usage and clearer expectations for ERP/shop synchronization boundaries.

## Scope
- In scope:
  - Item identity and instance/reference relationships.
  - Status and media-link contracts that impact list/detail/edit paths.
  - Backend action map for item CRUD/list/search + item-touching import/export.
  - Frontend route/component map for item list/detail/edit/create and key UI states.
- Out of scope:
  - Full box-domain behavior (covered in `docs/detailed/boxes.md`).
  - Printer hardware troubleshooting details (covered in `docs/detailed/printing.md`).
  - Agentic orchestration internals beyond item contract touchpoints (covered in `docs/detailed/item-flow.md`).

## Core concepts
- **Identity split (reference vs instance):**
  - `Artikel_Nummer` identifies the reference (`ItemRef`) shared across instances.
  - `ItemUUID` identifies a concrete stock instance (`ItemInstance`).
  - Runtime `Item` is effectively `ItemInstance & Partial<ItemRef>` with optional agentic state.
- **References and instances:**
  - `ItemRef` carries catalog/reference attributes (description, pricing, dimensions, categories, publish flags, media names).
  - `ItemInstance` carries storage/lifecycle fields (`ItemUUID`, `BoxID`, `Location`, timestamps, stock semantics).
  - `ItemDetailResponse` returns both together (`item`, `reference`, `instances`) to support instance-level navigation + reference-level editing.
- **Status fields used in item UX:**
  - `AgenticStatus` follows normalized constants (`queued`, `running`, `review`, `approved`, `rejected`, `failed`, `cancelled`, `notStarted`).
  - `AgenticReviewState` is additional review-oriented context on `Item`.
  - `Veröffentlicht_Status` and `Shopartikel` remain item reference fields relevant for shop/publish visibility.
- **Media linkage:**
  - `Grafikname` and `ImageNames` are reference-level media pointers.
  - Item detail payload also returns resolved `media: string[]`, and UI gallery uses this merged view.
- **Print relevance:**
  - Item labels (`/api/print/item/:id`) route through unified print handling and rely on item/reference fields (`Artikel_Nummer`, dimensions/category labels, quantity semantics via `Einheit` + `Auf_Lager`).
- **Unit differentiation (`Einheit`) and stock semantics:**
  - `Stk`: instance-oriented unit; each persisted instance is expected to represent one physical piece (`Auf_Lager` should be `1` per instance, count via number of instances).
  - `Menge`: bulk-oriented unit; one row can represent aggregate quantity and `Auf_Lager` stores the total stock amount.
  - Consequence: mutation/display logic must branch by `Einheit` so `Stk` flows do not behave like bulk stock.

## Data contracts
- Canonical model links:
  - `models/item.ts`
  - `models/item-detail.ts`
  - `models/agentic-statuses.ts`
  - `models/print-label.ts`
- Backend contract touchpoints:
  - `backend/importer.ts` (CSV ingestion + alias/header normalization into item fields).
  - `backend/actions/save-item.ts` (GET detail response + PUT edit behavior across instance/reference boundaries).
  - `backend/lib/media.ts` and `backend/actions/save-item.ts` media add/remove flows.
- Frontend contract touchpoints:
  - `frontend/src/components/ItemListPage.tsx`
  - `frontend/src/components/ItemDetail.tsx`
  - `frontend/src/components/ItemEdit.tsx`
  - `frontend/src/components/ItemCreate.tsx`
  - `frontend/src/components/ItemMediaGallery.tsx`
  - `frontend/src/utils/logger.ts`

### Contract-check list (use before item-domain changes)
- [ ] Identity fields stay explicit: do not treat `Artikel_Nummer` and `ItemUUID` as interchangeable in handlers or UI payloads.
- [ ] `Item`, `ItemRef`, and `ItemInstance` edits remain synchronized with `ItemDetailResponse` shape.
- [ ] If status values change, update `models/agentic-statuses.ts`, backend filtering/normalization, and frontend status label/filter usage together.
- [ ] If media field semantics change (`Grafikname`, `ImageNames`, `media[]`), verify save/edit detail responses and `ItemMediaGallery` assumptions.
- [ ] If quantity or unit semantics change, re-check print payload logic (`print-unified`) and list/detail quantity displays.
- [ ] If import/export columns change, re-check `backend/importer.ts` aliases and `backend/actions/export-items.ts` header contracts.


### Field glossary (one-line purpose per field)
- `ItemUUID`: Unique identifier for one concrete inventory instance used for item-level mutation/navigation.
- `Artikel_Nummer`: Shared reference identifier used to join all instances of the same catalog item.
- `Einheit`: Unit mode selector (`Stk` instance mode vs `Menge` bulk mode) that controls stock semantics.
- `Auf_Lager`: Current stock quantity; for `Stk` expected as `1` per instance, for `Menge` the aggregate quantity on the row.
- `BoxID`: Current box assignment for placement and relocation workflows.
- `Location`: Physical location context (nullable when not placed).
- `Datum_erfasst`: Capture/entry timestamp used for chronology and import provenance.
- `UpdatedAt`: Last update timestamp used for sorting and change tracking.
- `AgenticStatus`: Current agentic run lifecycle state driving list filters and review states.
- `AgenticReviewState`: Review decision/status metadata paired with agentic outputs.
- `Grafikname`: Primary media reference name/path used as the preferred display image.
- `ImageNames`: Serialized additional media references associated with the item reference.
- `Verkaufspreis`: Sell price field used in edit/review/export contracts.
- `Veröffentlicht_Status`: Publish toggle/status used by shop/export and visibility logic.
- `Shopartikel`: Shop relevance flag indicating whether the item is considered a shop article.
- `Langtext`: Structured/legacy specification payload that the item enrichment flow primarily builds, validates, and reviews before downstream export/sync.

## Backend action map
| Flow | Endpoint/action | File | Notes |
|---|---|---|---|
| Create item/import one file | `POST /api/import/item` (`import-item`) | `backend/actions/import-item.ts` | Handles uploaded CSV/image style ingestion for new item creation pathways. |
| Increment/add instance | `POST /api/items/:id/add` (`add-item`) | `backend/actions/add-item.ts` | Branches by `Einheit`: bulk stock increment vs new instance mint/persist; emits events + sync queue jobs. |
| Read detail | `GET /api/items/:id` (`save-item` GET branch) | `backend/actions/save-item.ts` | Returns `ItemDetailResponse` payload (`item`, `reference`, `instances`, `media`, events, agentic info). |
| Edit item | `PUT /api/items/:id` (`save-item` PUT branch) | `backend/actions/save-item.ts` | Applies instance-safe edits + reference update logic + media mutation paths. |
| Remove/decrement | `POST /api/items/:id/remove` (`remove-item`) | `backend/actions/remove-item.ts` | Branches by stock model; deletes instance or decrements bulk quantity. |
| Bulk delete | `POST /api/items/bulk/delete` (`bulk-delete-items`) | `backend/actions/bulk-delete-items.ts` | Deletes multiple selected rows with per-item error handling/logging. |
| List/search/filter | `GET /api/items` (`list-items`) | `backend/actions/list-items.ts` | Supports search/subcategory/box/agentic/entity filters and returns both `items` + `groupedItems`. |
| Adjacent navigation | `GET /api/items/:id/adjacent` (`item-adjacent`) | `backend/actions/item-adjacent.ts` | Used by item detail prev/next navigation. |
| Export item dataset | `GET /api/export/items` (`export-items`) | `backend/actions/export-items.ts` | Emits contract-specific headers (`manual_import`/`automatic_import`) and serializes item/reference fields. |
| Bulk import archive touching items | `POST /api/import` (`csv-import`) | `backend/actions/csv-import.ts` | Stages ZIP, ingests items/boxes/events/agentic files, and extracts media assets; major side effects for item records. |

## Frontend map (list/detail/edit)
- Routes (React Router):
  - `/items` → `ItemListPage`
  - `/items/new` → `ItemCreate`
  - `/items/:itemId` → `ItemDetail`
  - `/items/:itemId/edit` → `ItemEdit`
- Key components:
  - `ItemListPage` + `ItemList` for grouped list/search/filter/sort states.
  - `ItemDetail` for instance/reference merged view, agentic review context, and related actions.
  - `ItemEdit` + shared form sections (`ItemForm`, `forms/itemFormShared.tsx`) for editing.
  - `ItemCreate` for creation/import-assisted creation flows.
  - `ItemMediaGallery` for media render, modal preview, add/remove actions and failure fallback states.
- Notable UI states worth preserving:
  - Grouped vs raw instance perspective in list (`groupedItems` consumption).
  - Agentic status filter and normalized status labels.
  - Quantity display behavior depends on `Einheit` and can hide quantity row when unit is invalid/missing.
  - Media failure states: failed image sources are tracked and logged without crashing page render.

## Logging & error handling (current patterns only)
- Backend actions primarily use `console.info/warn/error` with contextual objects and explicit try/catch around:
  - request parsing,
  - data mutation transactions,
  - queue/job enqueue side effects,
  - archive extraction and CSV stage boundaries.
- Item mutations (`add-item`, `save-item`, `remove-item`, bulk delete) consistently log:
  - actor/item identifiers,
  - phase-specific error names,
  - fallback behavior (e.g., continue response with warning vs fail request).
- Import side effects (`csv-import`, `importer.ts`) log extraction timing, buffer sizes, skip/reject reasons, and stage-level failures.
- Frontend uses `frontend/src/utils/logger.ts` (`logger` + `logError`) and defensive try/catch in UI flows where logging itself should never break interaction.

## Failure modes & troubleshooting (item-specific)
- Identity mismatch (`ItemUUID` used where `Artikel_Nummer` is expected): check detail payload composition and reference lookups in `save-item`.
- Missing/invalid status filter values: verify status normalization constants and list filter parsing.
- Media inconsistencies: verify both stored `Grafikname`/`ImageNames` and detail `media[]` assembly; inspect save-item media write/remove logs.
- Import/export drift: compare importer aliases/header recognition against exporter contract header set.

## Open questions / TODO
- [ ] Is `ItemReferenceEdit` intentionally a direct alias to `ItemRef`, or should edit payloads be narrower to prevent accidental reference-field writes?
- [ ] Should `ImageNames` remain a serialized reference field long-term, or be fully replaced by media table/file metadata (several TODO markers suggest migration intent)?
- [ ] Audit follow-up: are there any remaining flows that still rely on `Auf_Lager` for `Einheit=Stk` despite the contract expectation of `Auf_Lager=1` per instance?
- [ ] Is there a documented compatibility policy for `entityFilter=references` list behavior, or is it considered internal/experimental?

## Changelog
- 2026-02-26: Replaced template draft with full item-domain reference (identity, contracts, backend/frontend maps, and logging/error handling notes).
- 2026-02-26: Incorporated review feedback: switched intro heading to "In short", clarified `Stk` vs `Menge`, and added one-line field glossary.
- 2026-02-26: Clarified "In short" to describe item centrality/relations and refined `Langtext` purpose for enrichment-flow motivation.
