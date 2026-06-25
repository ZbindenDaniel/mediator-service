# backend/agentic/utils/

Utility modules shared across the agentic pipeline — JSON handling, LangChain integration, rate limiting, source text formatting.

## Files
- `json.ts` — sanitize and parse LLM JSON output (strip code fences, repair malformed objects, detect placeholders)
- `langchain.ts` — LangChain model invocation wrapper with retry and structured logging
- `rate-limiter.ts` — token-bucket rate limiter for API calls
- `source-formatter.ts` — format web search results and item data into prompt-ready text blocks

## Relations
- Used by: `backend/agentic/flow/` (pipeline stages)
- See also: [`backend/agentic/README.md`](../README.md)

## Scope
Stateless utilities only. No DB access, no run state.
