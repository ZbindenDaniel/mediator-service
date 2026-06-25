# backend/agentic/flow/

## Purpose
Pipeline stage modules — each file owns one step of the item enrichment flow.

## Contents
- `item-flow.ts` — top-level flow coordinator; sequences all stages
- `item-flow-search.ts` — stage 1: web search for product information
- `item-flow-extraction.ts` — stage 2: LLM extraction of specs from search results
- `item-flow-categorizer.ts` — stage 3: category and subcategory assignment
- `item-flow-pricing.ts` — stage 4: market price estimation
- `item-flow-shopware.ts` — stage 5: Shopware product match verification
- `item-flow-ocr.ts` — optional: OCR of attached product images
- `item-flow-schemas.ts` — Zod schemas for LLM output validation
- `context.ts` — shared run context (target item data, run metadata)
- `errors.ts` — typed error classes for stage failures
- `cancellation.ts` — cooperative cancellation tokens for long-running stages
- `chat-flow.ts` — chat assistant flow (separate from enrichment pipeline)
- `prompts.ts` — prompt assembly utilities (template interpolation, fragment accumulation)
- `result-dispatch.ts` — routes validated stage results to `result-handler.ts`
- `schema-contract.ts` — validates LLM output against item spec contracts
- `transcript.ts` — structured run transcript writer (observability)

## Relations
- Called by: `../invoker.ts`
- Uses: `../prompts/` (prompt templates), `../tools/` (LLM tool definitions), `../utils/` (JSON repair, rate limiter)
- Writes to: `../../db-client.ts` (run state), `../../lib/` (item persistence)

## See also
- [docs/detailed/item-flow.md](../../../docs/detailed/item-flow.md) — per-stage contract, field ownership, error handling
