# AI Flow Service Inventory Audit

This audit inventories the imported `ai-flow-service/` tree so the team can merge the agentic flow into the mediator backend without surprises. It covers the directory structure, runtime dependencies, configuration overlaps, and any TODOs discovered during review (none were present).

## Directory & Key File Map

The table below lists every directory and top-level file under `ai-flow-service/` with tags indicating whether the asset is primarily **runtime**, **build/config**, or **docs** material.

| Path | Key files / notes | Tags |
| --- | --- | --- |
| `ai-flow-service/Dockerfile` | Two-stage Node 20 image that installs production deps and copies the `web-search/` bundle. 【F:ai-flow-service/Dockerfile†L1-L35】 | build/config |
| `ai-flow-service/.dockerignore` | Excludes node modules, dotfiles, and build artefacts from Docker context. 【F:ai-flow-service/.dockerignore†L1-L9】 | build/config |
| `ai-flow-service/gitignore` | Ignores `node_modules`, `data.db`, `.env`, and logs; note missing leading dot. 【F:ai-flow-service/gitignore†L1-L6】 | build/config |
| `ai-flow-service/.env` | Local developer overrides for model provider, MCP paths, and callback URLs. 【F:ai-flow-service/.env†L1-L19】 | build/config |
| `ai-flow-service/.env.example` | Sample env values for Ollama and MCP CLI wiring. 【F:ai-flow-service/.env.example†L1-L12】 | docs |
| `ai-flow-service/package.json` | Defines Fastify entry point, dependencies, and scripts. 【F:ai-flow-service/package.json†L1-L31】 | build/config |
| `ai-flow-service/package-lock.json` | Dependency lockfile mirroring the standalone service. | build/config |
| `ai-flow-service/Setup.md` | Notes on installing deps, logging behaviour, and MCP usage. 【F:ai-flow-service/Setup.md†L1-L53】 | docs |
| `ai-flow-service/ollama.md` | Provider-specific instructions (retain as doc reference). 【F:ai-flow-service/ollama.md†L1-L8】 | docs |
| `ai-flow-service/logs/` | Stores rotating MCP search logs such as `web-search.log`. 【F:ai-flow-service/logs/web-search.log†L1-L1】 | runtime |
| `ai-flow-service/src/index.js` | Boots Fastify server, opens MCP client, starts notification worker. 【F:ai-flow-service/src/index.js†L1-L16】 | runtime |
| `ai-flow-service/src/api.js` | Fastify API definition, schemas, cancellation handling, callback proxy. 【F:ai-flow-service/src/api.js†L1-L103】 | runtime |
| `ai-flow-service/src/notificationWorker.js` | Replays pending result notifications from SQLite. 【F:ai-flow-service/src/notificationWorker.js†L1-L70】 | runtime |
| `ai-flow-service/src/DOCKER.md` | Extra container instructions tied to standalone service. | docs |
| `ai-flow-service/src/config/` | Zod-based env parsing plus model/search/callback config exports. 【F:ai-flow-service/src/config/index.js†L1-L62】 | runtime |
| `ai-flow-service/src/flow/` | Core item flow orchestrator, extraction pipeline, and cancellation helpers. 【F:ai-flow-service/src/flow/itemFlow.js†L1-L104】【F:ai-flow-service/src/flow/itemFlow.js†L160-L236】 | runtime |
| `ai-flow-service/src/prompts/` | Prompt assets for extraction, supervisor, and Shopware verification. 【F:ai-flow-service/src/prompts/extract.md†L1-L4】 | runtime |
| `ai-flow-service/src/search/` | Legacy MCP client plumbing and response parsing for web search (marked for removal). 【F:ai-flow-service/src/search/responseParser.js†L1-L120】 | runtime (deprecated) |
| `ai-flow-service/src/tools/` | LangChain-facing tool wrappers for web and Shopware search; drop `searchWeb` once MCP dependency is removed. 【F:ai-flow-service/src/tools/searchWeb.js†L1-L50】 | runtime (candidate for removal) |
| `ai-flow-service/src/utils/` | Logger, SQLite wrapper, JSON helpers, LangChain utilities, external callbacks. Merge or replace with mediator utilities during integration. 【F:ai-flow-service/src/utils/logger.js†L1-L19】【F:ai-flow-service/src/utils/db.js†L1-L74】【F:ai-flow-service/src/utils/externalApi.js†L1-L79】 | runtime |
| `ai-flow-service/src/tests/` | Node-based test runner plus HTTP fixtures for standalone validation. 【F:ai-flow-service/src/tests/run-tests.js†L1-L40】 | docs |
| `ai-flow-service/web-search/` | MCP stdio server plus logger that is no longer used—plan to delete during consolidation. 【F:ai-flow-service/web-search/index.js†L1-L80】 | runtime (remove) |

## Runtime Dependency Destinations

| Dependency | Current responsibility | Proposed mediator location |
| --- | --- | --- |
| `fastify`, `@fastify/cors`, `@fastify/swagger`, `@fastify/swagger-ui` | Serve `/run`, `/cancel`, `/health`, and Swagger docs in `src/api.js`. 【F:ai-flow-service/src/api.js†L1-L59】 | Migrate handlers into `backend/agentic/http/server.ts` so Fastify routes live beside mediator actions while we transition off the proxy. |
| `dotenv` | Loads env vars for config parsing. 【F:ai-flow-service/src/config/index.js†L1-L27】 | Fold into `backend/agentic/config.ts` (mirroring existing `backend/config.ts`) and reuse mediator config loader. |
| `zod` | Validates env, payloads, and tool schemas. 【F:ai-flow-service/src/api.js†L1-L13】【F:ai-flow-service/src/config/index.js†L1-L46】 | Centralize shared schemas under `backend/agentic/schema/` to align with mediator TypeScript models. |
| `pino` | Structured logging for agentic modules. 【F:ai-flow-service/src/utils/logger.js†L1-L19】 | Replace with mediator logger wrapper at `backend/agentic/logging.ts` that delegates to existing console patterns. |
| `sqlite3` | Persists request logs and notification queue. 【F:ai-flow-service/src/utils/db.js†L1-L67】 | Port logic into `backend/agentic/persistence/request-logs.ts` that reuses the core `backend/db.ts` connections. |
| `@langchain/ollama`, `@langchain/openai` | Instantiate provider-specific chat models inside the flow orchestrator. 【F:ai-flow-service/src/flow/itemFlow.js†L160-L213】 | Introduce `backend/agentic/models/ollama.ts` and `backend/agentic/models/openai.ts` factories invoked by the orchestrator. |
| `@modelcontextprotocol/sdk` | Previously hosted the MCP stdio web-search server. 【F:ai-flow-service/web-search/index.js†L1-L53】 | Drop entirely—the mediator will not carry the unused MCP server forward. |
| `axios`, `cheerio` | Fetch and scrape search results within the MCP server. 【F:ai-flow-service/web-search/index.js†L1-L20】 | Remove alongside the MCP web-search module unless future mediator features require them. |
| `@tavily/core` | Tavily API client consumed by the legacy MCP server. 【F:ai-flow-service/web-search/index.js†L200-L244】 | Keep as a documented integration by wrapping requests in `backend/agentic/tavily/client.ts` with mediator logging/try-catch semantics. |
| `uuid` | Intended for request identifiers but unused in runtime code (tests rely on `crypto.randomUUID`). | Drop during merge or replace with mediator `backend/utils/id.ts` if unique IDs are required. |

## Tavily API Notes

- Tavily calls should be centralised behind a mediator wrapper that provides configuration validation, structured logging, and retry-aware error handling. When porting, prefer a TypeScript module such as `backend/agentic/tavily/client.ts` that exports high-level search helpers and shields the rest of the codebase from raw HTTP usage.
- Document required Tavily environment variables alongside other agentic settings in the combined mediator `.env.example`, mirroring any rate limit or safety guardrails from the standalone service.

## Redundant or Conflicting Configurations

- Duplicate environment files: both `.env` and `.env.example` exist under `ai-flow-service/`, overlapping with the mediator root `.env.example`. The runtime file also adds `RESULT_API_URL` and `SEARCH_WEB_ALLOWED_ENGINES` entries that will need reconciliation with mediator config defaults. 【F:ai-flow-service/.env†L1-L19】【F:ai-flow-service/.env.example†L1-L12】
- Docker assets: `ai-flow-service/Dockerfile`, `.dockerignore`, and `src/DOCKER.md` duplicate container guidance already covered by the mediator `Dockerfile`. They should be merged into the root build pipeline before deleting the duplicates. 【F:ai-flow-service/Dockerfile†L1-L35】【F:ai-flow-service/src/DOCKER.md†L1-L80】
- Git ignore rules: the standalone `gitignore` lacks the leading dot and repeats entries already covered by the repository’s root `.gitignore`. Merge any missing patterns (e.g., `logs/`) into the primary ignore list and drop the duplicate. 【F:ai-flow-service/gitignore†L1-L6】
- Package manifests: `ai-flow-service/package.json` and `package-lock.json` should be folded into the root `package.json`/`package-lock.json` once dependency decisions are finalised. 【F:ai-flow-service/package.json†L1-L31】

## TODO Log

- TODO: Delete the unused MCP web-search implementation (`ai-flow-service/web-search/`, related `src/search/` helpers, and their dependencies) during the consolidation step so the mediator avoids bundling dormant tooling.
- TODO: Create a dedicated Tavily client module under `backend/agentic/tavily/client.ts` that wraps `@tavily/core` with mediator logging and error handling, and document its configuration in `.env.example`.
- TODO: Evaluate the utilities under `ai-flow-service/src/utils/` and merge or replace them with mediator equivalents (`backend/src/lib/logger.ts`, `backend/db.ts`, etc.) to prevent duplicated helpers and data-access patterns.

No TODO comments were present in the audited files (`rg -n "TODO" ai-flow-service` returned no matches); the items above track follow-up work discovered during the review. 【59f365†L1-L1】
