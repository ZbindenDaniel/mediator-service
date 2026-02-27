# Import & Export

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, importer/exporter mapping logic, and frontend API consumers.

## In short
- Business goal: protect data integrity by making import/export contracts explicit for operators, developers, and agents.
- User value: fewer silent mapping regressions and faster diagnosis when CSV/ZIP payloads fail validation or partially import.

## Scope
- In scope:
  - ZIP/CSV API surfaces currently exposed by backend actions.
  - Current payload/response shapes and mode aliases.
  - CSV/ZIP file structure, required vs optional fields, and parser/serializer mapping behavior.
  - Existing validation, error reporting, and logging behavior visible to UI/users/operators.
- Out of scope:
  - New endpoints, new file formats, or expanded business workflows.
  - Backward-compatibility redesign beyond current alias handling and legacy-header detection already in code.

## Core concepts
- Import is archive-first (`/api/import` + `/api/import/validate`) with stage-ordered ingestion.
- Export is mode-driven (`backup|erp` plus `manual_import|automatic_import` aliases) and header-contract aware.
- ERP sync is script-mediated (`/api/sync/erp`) and stages an `automatic_import` CSV before shell handoff.
- Contracts rely on shared model names (`ItemUUID`, `Artikel_Nummer`, `BoxID`, event fields) plus importer/exporter alias maps.

## Data contracts
- Canonical model links:
  - `models/item.ts`
  - `models/box.ts`
  - `models/event-log.ts`
  - `models/agentic-run.ts`
  - `models/index.ts`
- Parser/serializer contract sources:
  - Export column + header regimes + mode aliases: `backend/actions/export-items.ts`
  - ZIP import staging and stage outcomes: `backend/actions/csv-import.ts`
  - ZIP validation route: `backend/actions/validate-csv.ts`
  - CSV parsing/ingestion + alias hydration + strict checks: `backend/importer.ts`
  - ERP sync script handoff: `backend/actions/sync-erp.ts` and `docs/erp-sync.sh`
- Sync requirements across layers:
  - Shared model field names in `models/` must stay aligned with importer targets (`Artikel_Nummer`, `Einheit`, `ItemUUID`, `BoxID`, category fields, status fields).
  - Export headers (manual vs automatic regimes) must remain aligned with importer alias coverage when renamed.
  - Frontend upload/sync components should tolerate documented backend response fields and partial-failure signals.

### Field glossary (one-line purpose per field)
- `Artikel_Nummer` / `Artikel-Nummer`: material/article identity key for refs and fallback ItemUUID minting.
- `ItemUUID`: per-item instance identity; strict import requires valid non-empty values.
- `BoxID`: container/shelf assignment; validated for shelf/non-shelf format before persistence.
- `Einheit`: quantity semantics (`Stk` vs `Menge`) normalized via shared model helper.
- `Auf_Lager` (`Qty`/`onhand` aliases): stock quantity source for instance split count.
- `Langtext`: long-form structured/plain enrichment text serialized differently by export mode.
- `Veröffentlicht_Status` / `Shopartikel`: publish/shop flags mapped in import/export alias contracts.
- `CreatedAt`/`UpdatedAt`: metadata timestamps passed through export and parsed in import where present.
- Event fields (`CreatedAt`, `EntityType`, `EntityId`, `Event`, `Level`): required for `events.csv` ingestion.

## API/actions
- `/api/import/validate` (`POST`, `backend/actions/validate-csv.ts`)
  - Accepts ZIP (preferred) or raw CSV body.
  - ZIP mode expects at least one CSV (`items.csv` and/or `boxes.csv`); checks unzip availability.
  - Response on success: `{ ok: true, itemCount, boxCount, boxesFileCount }`.
  - Response on validation failure: `{ ok: false, errors, itemCount, boxCount, boxesFileCount }` or `{ error: string }`.
- `/api/import` (`POST`, `backend/actions/csv-import.ts`)
  - Accepts ZIP body, using `X-Filename` for archive naming/normalization.
  - Stages and ingests in fixed order: `ingestBoxesCsv -> ingestCsvFile -> ingestAgenticRunsCsv -> ingestEventsCsv`.
  - Response includes `stageOrder`, `stageOutcomes`, duplicate metadata, counters, and overall `ok` status.
- `/api/export/items` (`GET`, `backend/actions/export-items.ts`)
  - Required query: `actor`.
  - Optional query: `mode` (`backup|erp|manual_import|automatic_import`), plus date filters (`createdAfter`, `updatedAfter`).
  - Returns staged export artifact for download (manual headers vs automatic ERP headers based on mode/header regime).
- `/api/sync/erp` (`POST`, `backend/actions/sync-erp.ts`)
  - Request JSON requires non-empty string array `itemIds`.
  - Stages `automatic_import` CSV via `stageItemsExport`, then executes `docs/erp-sync.sh`.
  - Returns phase-aware JSON (`phase`, `ok`, `exitCode`, `stdout`, `stderr`, `error`).

## Explicit file-structure contract (CSV/ZIP)
- ZIP archive expectations (import routes)
  - Must be a valid ZIP payload.
  - Safe-entry filtering is applied before reading entries.
  - Supported content classes: `items.csv` (or first discovered CSV), optional `boxes.csv`, optional `events.csv`, optional `agentic_runs.csv`, optional media assets.
- `items.csv`
  - Required in practical full-item import flows; optional if only other file types are being ingested.
  - Required fields in strict mode: valid `Artikel-Nummer` and valid `itemUUID`/`ItemUUID`.
  - Optional fields: metadata/category/shop/publication fields and alias variants handled by importer alias maps.
- `boxes.csv`
  - Optional.
  - Required field per row: `BoxID`.
  - `BoxID` format is validated (shelf vs non-shelf pattern checks).
- `events.csv`
  - Optional.
  - Required fields per row: `CreatedAt`, `EntityType`, `EntityId`, `Event`, `Level`.
- `agentic_runs.csv`
  - Optional.
  - Requires `Artikel_Nummer` to attach run rows; rows missing matching `item_refs` are skipped with counters/logs.

## Field mapping and mode aliases
- Export mode aliases:
  - `manual_import -> backup`
  - `automatic_import -> erp`
- Header regimes:
  - `backup` uses manual/legacy display headers from `columnDescriptors`.
  - `erp` uses automatic header contract (`partnumber`, `type`, `image`, etc.) and omits grouped `ItemUUID` column.
- Import alias hydration:
  - Partner/source aliases (e.g., `partnumber -> Artikel-Nummer`, `image_names -> Grafikname(n)`) are hydrated before normalization.
  - Quantity aliases (`Auf_Lager`, `Qty`, `onhand`, etc.) and date aliases are normalized with guarded logging.
- Legacy detection:
  - Unknown columns are logged.
  - Legacy header signatures/version flags are detected and logged (validation/import paths).

## Data-structure double-check checklist
Keep these in sync whenever contracts change:
- [ ] `models/item.ts` field names/types vs importer read/write fields in `backend/importer.ts`.
- [ ] Export `columnDescriptors` + automatic header contract in `backend/actions/export-items.ts` vs importer partner alias map in `backend/importer.ts`.
- [ ] `Einheit` enum/normalization (`models/item.ts`) vs export fallback normalization and import defaulting.
- [ ] `ItemUUID`/`Artikel_Nummer` strict requirements and mint fallback behavior in `backend/importer.ts`.
- [ ] `BoxID` format assumptions in `models/box.ts` comments vs `ingestBoxesCsv`/item-import BoxID validators.
- [ ] Event-log required columns (`EVENT_REQUIRED_FIELDS` in importer) vs `models/event-log.ts` expectations.
- [ ] Frontend import/sync response handling (`frontend/src/components/ImportCard.tsx`, `frontend/src/components/BulkItemActionBar.tsx`) vs backend response payload keys.

## Validation & error reporting (current behavior)
- Validation route (`/api/import/validate`)
  - Fails with 500 if unzip is unavailable for ZIP validation.
  - Returns 400 when ZIP has no readable CSV content or CSV parsing fails.
  - Returns row-level error arrays when validator flags issues.
- Import route (`/api/import`)
  - Returns 408 for upload/staging timeout thresholds, 413 for oversized payloads.
  - Returns 400 for malformed ZIPs or missing supported archive content.
  - Returns 409 for duplicate archive checks while still exposing stage/context information.
  - Returns per-stage success/error details through `stageOutcomes` and aggregated message text.
- ERP sync (`/api/sync/erp`)
  - Returns 400 on invalid JSON or invalid `itemIds` payload.
  - Returns 404 when provided IDs do not resolve to exportable items.
  - Returns 502 on non-zero shell script exit and includes stdout/stderr for operator diagnosis.

## Logging points for diagnosis
- Import ZIP buffering/staging/cleanup logs: `backend/actions/csv-import.ts`.
- Stage-level ingestion completion/failure logs (`ingestBoxesCsv`, `ingestCsvFile`, `ingestAgenticRunsCsv`, `ingestEventsCsv`): `backend/actions/csv-import.ts`.
- Validation ZIP enumeration/parsing/legacy-schema logs: `backend/actions/validate-csv.ts`.
- Row-level mapping/normalization/failure telemetry (ItemUUID, Artikel_Nummer, Einheit, quantity aliases, malformed Langtext, missing references): `backend/importer.ts`.
- Export header-regime selection, serialization mismatch failures, grouping behavior, and media fallbacks: `backend/actions/export-items.ts`.
- ERP sync phase logs (`request_received`, `export_staged`, `script_started`, `script_finished`, `cleanup_done`) and media mirror runtime markers: `backend/actions/sync-erp.ts`.

## Config & environment flags
- Import-related:
  - `IMPORTER_FORCE_ZERO_STOCK` (forces zero-stock import behavior).
- ERP/sync-related:
  - `ERP_MEDIA_MIRROR_ENABLED`
  - `ERP_MEDIA_MIRROR_DIR`
  - Script/runtime env consumed by `docs/erp-sync.sh` (`ERP_MEDIA_SOURCE_DIR` injection, profile/mapping variables as documented in environment docs/script).
- See also: `docs/ENVIRONMENT.md`.

## Failure modes & troubleshooting
- Invalid ZIP / missing CSV files
  - Signal: `400` with explicit missing-content error.
  - Recovery: repackage archive with `items.csv` and optional companion files in root or safe subpaths.
- Header drift between exporter and importer alias map
  - Signal: unknown-column warnings and missing-field row failures.
  - Recovery: update exporter header contract and importer alias table in same change.
- Strict-import identifier failures
  - Signal: row-failure telemetry (`missing-artikel-nummer`, `missing-item-uuid`, `invalid-item-uuid`).
  - Recovery: repair source identifiers before retrying strict imports.
- ERP sync script failures
  - Signal: `502` with non-zero `exitCode`, stdout/stderr, and script phase logs.
  - Recovery: inspect `docs/erp-sync.sh` output and profile/mapping config.

## Test/validation checklist
- Static checks:
  - Verify documented endpoint names and mode aliases against action matchers/parsers.
  - Verify required-field lists against importer constants and strict checks.
- Runtime checks:
  - Exercise `/api/import/validate` for ZIP missing-file and parse-failure paths.
  - Exercise `/api/import` for duplicate archive, partial-stage failure, and success responses.
  - Exercise `/api/sync/erp` invalid payload and non-zero script exit response shape.
- Contract sync verification:
  - Update importer alias map and export header contract together.
  - Re-check shared model fields after any import/export field rename.

## Open questions / TODO
- [ ] TODO: If importer/exporter contracts change, update this doc and `OVERVIEW.md` in the same patch.

## Recommendations (minimal, current-behavior focused)
- Keep import/export field changes paired: update serializer headers, importer aliases, and shared model fields together.
- Prefer phase/stage-aware error payloads over generic failures to preserve current operator diagnostics.
- Preserve existing logging granularity around row failures and stage outcomes; avoid reducing context.
