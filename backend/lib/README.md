# backend/lib/

## Purpose
Domain service utilities — the shared logic layer between action handlers and the database. Business operations that don't belong in a single action.

## Contents
- `media.ts` / `media-request.ts` / `media-audit.ts` / `media-health.ts` — item photo and file storage operations; resolves local vs WebDAV paths
- `quality-contracts.ts` — loads quality/spec/assembly JSON contracts from `../../contracts/` (assembly loading also in `backend/contracts/registry.ts`)
- `parent-slot.ts` — a part left its device: carry the parent's answers over with the slot set to missing, mark as spare donor per contract, recompute
- `quality-score.ts` — percentage quality range + derived 1–5 grade (respects `QualityManual`, U5): effective subcategory (ref, else parent slot target), compute from latest assessment + in-device parts, store on `items."QualityScoreMin/Max"`, walk up `Zerlegt_aus`; `recomputeAllQualityScores` for `npm run quality:recompute`
- `langtext.ts` — Langtext (product description) formatting and serialization
- `labelHtml.ts` / `labelTemplateLoader.ts` — label HTML generation and template resolution
- `co2Calculator.ts` — CO₂ recovery potential scoring
- `priceLookup.ts` — market price lookup helpers
- `itemGrouping.ts` — groups items for agentic response batching
- `itemIds.ts` — item ID parsing and normalization (`I-`, `R-` prefixes)
- `categoryLabelLookup.ts` — maps subcategory numbers to display labels
- `defaultLocation.ts` — resolves the default storage location
- `intake-quality-map.ts` — maps intake station answers to quality assessment format
- `alt-doc-resolver.ts` — resolves alternative external-document directory paths (ALT_DOC_DIRS_FILE)
- `path-guard.ts` — prevents path traversal in file serving
- `features.ts` — deployment feature flags: parses `FEATURES`/`FEATURES_FILE` (fail-fast on typos), `isFeatureEnabled()` for the action gate and background jobs
- `identity.ts` — resolves forward-auth headers into `{ username, groups, tenant, role }`
- `ownership.ts` — tenancy rules: `owner = TenantId ?? defaultTenant`, `canWrite`/`canCreate`, unrestricted for no-login requests + platform admins + background jobs; request context (`runWithIdentity`) for the DB safety net; `canSeePrivate` for reads
- `redaction.ts` — applies the read rule to row shapes: another org's item location → owner name, its boxes/stubs filtered out, person fields cleared; no-op when unrestricted
- `tenants.ts` — in-memory org directory (orgs + sites) loaded from the DB, refreshed on every admin write; feeds identity resolution and `canUseSite()` for shelf creation

## Relations
- Used by: `../actions/` (all domain operations), `../agentic/` (media, quality, langtext)
- Uses: `../db-client.ts` (persistence), `../../contracts/` (runtime JSON contracts)

## Scope
Reusable domain logic only. HTTP request/response handling belongs in `../actions/`. LLM orchestration belongs in `../agentic/`.

## Rules
- Functions here are stateless where possible — take inputs, return outputs
- No `req`/`res` (HTTP) imports — this layer is HTTP-agnostic

## Decisions
- **Request context via `AsyncLocalStorage` (`ownership.ts`)** — new pattern, deliberately narrow. Catalogue entries, items and boxes are written from over a dozen paths (save, import, intake, AI results, snapshots), some outside requests. Instead of threading an identity parameter through every persistence function, the dispatcher runs each action inside `runWithIdentity()`, and the three central upserts in `db.ts` read it for their owner guard. Only these owner guards and the read redaction in `db.ts` (3b) use it; everything else still gets its data through `ctx`. No context = background job = unrestricted (same as before tenancy).
- **Read redaction in the shared `db.ts` reads, not per handler (`redaction.ts`, 3b)** — item/box rows reach the client from ~15 handlers through the same few `db.ts` functions, so redacting there covers them all, including future ones (the plan's "can't be bypassed"). Handlers with their own SQL (search, relations, marks, exports) call the helpers explicitly. Write handlers see redacted rows only for other orgs' items, which the write guards reject anyway. Feeds filter in SQL (not after `LIMIT`) so a page of foreign events doesn't come back empty.
