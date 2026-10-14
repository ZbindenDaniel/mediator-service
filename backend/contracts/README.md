# backend/contracts/

Runtime contract registry — loads JSON contract files from disk and exposes them to action handlers via the `ActionContext`.

## Files
- `registry.ts` — loads and caches all contracts at startup (quality, spec, assembly, impact); `getQualityContract(sub)` merges `quality/group-<floor(sub/10)>.json` first
- `paths.ts` — shipped vs `CONTRACTS_OVERLAY_DIR` resolution (overlay wins)
- `validate.ts` — per-file + cross-file contract validation (ids, showIf targets, slot targets vs taxonomy, assembly cycles, weights, `multi`); used by Jest, `npm run contracts:check` and the admin upload

## Relations
- Reads from: `contracts/quality/`, `contracts/specs/`, `contracts/assembly/`, `contracts/impact/` (root-level JSON)
- Used by: `backend/server.ts` (injects registry into `ActionContext`)
- See also: [`contracts/README.md`](../../contracts/README.md)

## Scope
Contract loading, caching and validation (`validate.ts`). Derivation logic (scores, specs) lives in `backend/lib/quality-contracts.ts` and `backend/lib/quality-score.ts`.

## Decisions
- **Admin upload reports only problems it introduces** (validate the set before and after): a pre-existing issue in another file must not block every edit, and a contract may be uploaded before its subcategory exists (file codes are not checked on upload, slot targets are)
- Registry lives in `backend/contracts/` (not root `contracts/`) because it is server-side runtime code, while root `contracts/` holds the JSON data files shared with frontend
