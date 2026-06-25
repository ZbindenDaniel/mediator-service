# backend/ops/

CSV import pipeline — sequential operation modules that transform a raw CSV upload into validated, mapped, label-queued inventory rows.

## Files
- `05-detect-produkt-schema.ts` — detect if CSV matches the Produkt (ERP export) column layout
- `07-detect-kivitendo-schema.ts` — detect Kivitendo schema variant
- `10-validate.ts` — validate rows against the detected schema, emit structured errors
- `20-map-wms.ts` — map WMS field names to internal model fields
- `30-queue-label.ts` — enqueue label print jobs for imported items
- `types.ts` — shared pipeline stage types

## Relations
- Called by: `backend/actions/csv-import.ts` (orchestrates the pipeline)
- Produces: validated row objects consumed by `backend/importer.ts`
- See also: [`docs/changelogs/erp-sync.md`](../../docs/changelogs/erp-sync.md)

## Scope
Pure transformation stages — no DB writes. Each file exports a single stage function.

## Rules
- Stage files are numbered to enforce execution order; gaps allow future stages to be inserted without renaming
- Each stage receives the full pipeline context and returns it augmented (pass-through pattern)
