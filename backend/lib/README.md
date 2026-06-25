# backend/lib/

## Purpose
Domain service utilities — the shared logic layer between action handlers and the database. Business operations that don't belong in a single action.

## Contents
- `media.ts` / `media-request.ts` / `media-audit.ts` / `media-health.ts` — item photo and file storage operations; resolves local vs WebDAV paths
- `quality-contracts.ts` — loads and caches quality/spec/disassembly JSON contracts from `../../contracts/`
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

## Relations
- Used by: `../actions/` (all domain operations), `../agentic/` (media, quality, langtext)
- Uses: `../db-client.ts` (persistence), `../../contracts/` (runtime JSON contracts)

## Scope
Reusable domain logic only. HTTP request/response handling belongs in `../actions/`. LLM orchestration belongs in `../agentic/`.

## Rules
- Functions here are stateless where possible — take inputs, return outputs
- No direct Express `req`/`res` imports — this layer is HTTP-agnostic
