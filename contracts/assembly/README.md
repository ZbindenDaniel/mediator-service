# contracts/assembly/

Assembly slot definitions — one JSON file per device subcategory that supports the Zerlegen (disassembly/reassembly) workflow.

## Files
- `102.json` — desktop computers
- `201.json` — laptops (fan, keyboard, display, battery, RAM, storage, mainboard)
- `301.json` — monitors

## Schema
Each file must match the `AssemblyContract` type in `models/assembly-contract.ts`.
Loaded at startup by `backend/lib/quality-contracts.ts`.

## How it works
Each slot (e.g., "RAM") includes a `question` field that ties it into the quality assessment flow. When the Zerlegen UI is shown, the slot state is derived from the matching quality answer:
- `unknown` — question not answered
- `present` — part confirmed present, still in device
- `empty` — quality says part is absent
- `cataloged` — part confirmed present, not yet removed (BoxID=NULL)
- `removed` — part removed and catalogued as a separate item (BoxID set)

## Slot fields for the percentage score
- `weight` — the part's share of its parent's percentage quality. A weighted slot's presence select uses exactly
  `Vorhanden` / `Nicht vorhanden` / `Nicht vorgesehen` / `Fest verbaut` (constants in `models/assembly-contract.ts`) and
  carries no `qualityImpact` (the validator enforces both)
- `Nicht vorgesehen` → slot state `notApplicable`, `Fest verbaut` → `integrated`; both are excluded from the score
- `knockout: {below, cap}` (weighted slots) — a missing/broken part caps the parent (e.g. no mainboard → "Ersatzteil")
- **Unweighted** slots (the refurbishment files) are not scored as slots; their question (`has_fan` with `states` and a
  knock-out) is scored like any other question
- "Entnehmen" records the slot as missing on the parent (answers carried over); unweighted slot → parent also marked
  as spare donor (manual grade 1), weighted slot → the score decides (`backend/lib/parent-slot.ts`)
- Nesting: give the slot's `targetSubcategory` its own assembly file; article-less parts resolve their subcategory
  from the slot they sit in, so the nested contract loads before the part is identified

## Rules
- Only add subcategories where assembly tracking is meaningful (device categories that yield reusable parts)
- Slot question ids must be unique across `general` + this file + `quality/<code>.json` (the validator checks it; components are owned here, not in `quality/`)
- **Slot `key`s are immutable once used** — `item_relations."SlotKey"` stores them and article-less parts derive their subcategory from them; renaming orphans existing parts
- No cycles: a subcategory must not (transitively) contain itself

## Decisions
- Renamed from `disassembly/` to `assembly/` — covers both taking apart and adding parts back, matching the actual Zerlegen workflow
- Contract owns all component questions (presence + specs); quality contract covers device health only

## See also
- [docs/detailed/spare-parts-catalog.md](../../docs/detailed/spare-parts-catalog.md)
