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
