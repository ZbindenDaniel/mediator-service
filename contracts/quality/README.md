# contracts/quality/

Quality assessment question sets — one JSON file per device subcategory.

## Files
Each file is named by subcategory number (matching `items.SubCategory`):
- `general.json` — fallback questions used when no subcategory-specific contract exists
- `102.json` — desktop computers
- `103.json` — servers
- `105.json` — workstations
- `201.json` — laptops (v4: battery/RAM/storage questions moved to disassembly contract)
- `204.json` — tablets
- `301.json` — monitors
- `302.json` — projectors
- `401.json` — network equipment
- `701.json` — smartphones
- `1802.json` — printers

## Schema
Each file must match the `QualityContract` type in `models/quality-contract.ts`.
Loaded at startup by `backend/lib/quality-contracts.ts`.

## Rules
- Questions use boolean (yes/no) or multi-choice format
- Each question has a `weight` for quality score calculation
- Do not add executable code — data only
