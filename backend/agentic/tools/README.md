# backend/agentic/tools/

## Purpose
LLM tool (function call) definitions — describe callable tools the model can invoke during enrichment.

## Contents
- `shopware.ts` — Shopware product search tool definition
- `sqlite-echo.ts` — debug tool: echoes a query back (development/testing only)
- `tavily-client.ts` — Tavily web search tool; wraps the Tavily API for search-stage calls

## Relations
- Registered in: `../flow/item-flow-search.ts` and `../flow/item-flow-shopware.ts`
- `tavily-client.ts` calls: Tavily external API (requires `TAVILY_API_KEY` in config)

## Rules
- Tool definitions must match the LangChain `DynamicTool` / `StructuredTool` interface
- `sqlite-echo.ts` is not registered in production flows — test/debug only
