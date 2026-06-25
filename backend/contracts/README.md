# backend/contracts/

Runtime contract registry — loads JSON contract files from disk and exposes them to action handlers via the `ActionContext`.

## Files
- `registry.ts` — loads and caches all contracts at startup (quality, spec, assembly, impact)

## Relations
- Reads from: `contracts/quality/`, `contracts/specs/`, `contracts/assembly/`, `contracts/impact/` (root-level JSON)
- Used by: `backend/server.ts` (injects registry into `ActionContext`)
- See also: [`contracts/README.md`](../../contracts/README.md)

## Scope
Only contract loading and caching. Schema validation and derivation logic lives in `backend/lib/quality-contracts.ts`.

## Decisions
- Registry lives in `backend/contracts/` (not root `contracts/`) because it is server-side runtime code, while root `contracts/` holds the JSON data files shared with frontend
