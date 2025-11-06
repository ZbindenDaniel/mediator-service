# Agentic Runtime Inventory

The standalone `ai-flow-service/` directory has been retired now that its runtime modules live under `backend/agentic/` inside the mediator backend. The new TypeScript layout reuses mediator logging, database helpers, and configuration so agentic runs execute entirely in-process.【F:docs/SERVICE_FUSION.md†L1-L27】

## Current layout
| Path | Purpose |
| --- | --- |
| `backend/agentic/config.ts` | Loads model, search, and Shopware settings from environment variables with zod validation so the orchestrator shares mediator config patterns.【F:backend/agentic/config.ts†L1-L86】 |
| `backend/agentic/invoker.ts` | Provides the `AgenticModelInvoker` that pulls item records from SQLite, runs the item flow, dispatches Tavily search, and records notification outcomes with mediator logging semantics.【F:backend/agentic/invoker.ts†L1-L176】 |
| `backend/agentic/flow/` | Contains the item flow orchestrator, search collectors, extraction attempts, Shopware verification, and cancellation helpers that compose the end-to-end enrichment pipeline.【F:backend/agentic/flow/item-flow.ts†L1-L45】【F:backend/agentic/flow/item-flow-search.ts†L1-L88】 |
| `backend/agentic/tools/tavily-client.ts` | Wraps the Tavily API with typed responses, rate limiting, and structured error handling so web search logs integrate cleanly with mediator consoles.【F:backend/agentic/tools/tavily-client.ts†L1-L110】 |
| `backend/agentic/tools/shopware.ts` | Implements Shopware catalog lookups with token caching and configuration overrides that respect mediator defaults.【F:backend/agentic/tools/shopware.ts†L1-L44】 |
| `backend/agentic/utils/` | Hosts the shared rate limiter, JSON utilities, and LangChain adapters now consumed by the flow.【F:backend/agentic/utils/rate-limiter.ts†L1-L78】 |
| `backend/agentic/prompts/` | Stores the extraction, supervisor, and Shopware prompts plus the target item JSON schema used by the item flow.【F:backend/agentic/prompts/extract.md†L1-L26】 |

## Follow-up
- Remaining integration and cleanup tasks stay tracked in [docs/SERVICE_FUSION.md](SERVICE_FUSION.md), including dependency pruning and expanded test coverage for the new orchestrator.【F:docs/SERVICE_FUSION.md†L18-L69】
