# contracts/assembly/

Assembly slot definitions — one JSON file per device subcategory that supports the Zerlegen (disassembly/reassembly) workflow.

## Files
- `102.json` — desktop computers
- `201.json` — laptops (battery, RAM, storage, GPU)
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

## Rules
- Only add subcategories where assembly tracking is meaningful (device categories that yield reusable parts)
- Each slot's `question` key must match a question in the corresponding `quality/` contract

## Decisions
- Renamed from `disassembly/` to `assembly/` — covers both taking apart and adding parts back, matching the actual Zerlegen workflow
- Contract owns all component questions (presence + specs); quality contract covers device health only

## See also
- [docs/detailed/spare-parts-catalog.md](../../docs/detailed/spare-parts-catalog.md)
