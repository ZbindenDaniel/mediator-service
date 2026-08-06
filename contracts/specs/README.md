# contracts/specs/

Item specification field definitions — one JSON file per device subcategory.

## Files
Each file is named by subcategory number:
- `102.json` — desktop computers
- `103.json` — servers
- `105.json` — workstations
- `201.json` — laptops
- `204.json` — tablets
- `301.json` — monitors
- `401.json` — network equipment
- `601.json` — audio/video
- `701.json` — smartphones

## Schema
Each file must match the `SpecContract` type in `models/spec-contract.ts`.
Loaded at startup by `backend/lib/quality-contracts.ts`.

## Rules
- Each spec field has a `key`, `label`, `type`, and optionally `unit` and `options`
- Keys must be stable — they are stored in item `Langtext` JSON and referenced by agentic extraction
- Adding a new field is safe; renaming breaks existing data

## Category guidance (`guidance`)
Optional top-level `guidance: string[]` — human-authored prompt snippets injected into the agentic
extraction and supervisor prompts for this subcategory, to steer the model on things it often gets
wrong (e.g. `"3.5\" HDDs usually measure 146×101×26 mm"` or `"Do not mention the OS in the prose"`).

- Each entry is free-form text; it is sanitized (code fences / role prefixes stripped, capped at 400
  chars) before injection, so keep entries short and declarative.
- Entries feed the `{{EXTRACTION_REVIEW}}` and `{{SUPERVISOR_REVIEW}}` placeholders via
  `appendPlaceholderFragment` in `backend/agentic/flow/item-flow-extraction.ts`.
- Guidance is advisory and does not change stored data, so it does **not** require a `version` bump
  (unlike `fields`). Bump `version` only if you also want an idle sweep to re-enrich existing items.
