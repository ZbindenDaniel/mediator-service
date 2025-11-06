# Objective

The ai-flow runtime now lives directly inside the mediator under `backend/agentic/`. The standalone `ai-flow-service/` tree has been deleted after porting its runtime pieces into TypeScript modules that share mediator logging, database helpers, and configuration. The remaining consolidation work focuses on finishing the in-process orchestrator wiring, validating the new search/model integrations, and cleaning up documentation or dependency stragglers.
The latest commit pulled the entire ai-flow-service repository into this project as a gitlink, leaving the mediator backend and frontend still talking to it through REST proxies (/api/agentic/*) that originally forwarded to the external agentic API and authenticated with a shared secret. Consolidating those pieces directly into the mediator app—with in-process validation keyed off persisted request logs—eliminates cross-service overhead, aligns schemas around backend/db.ts, and simplifies deployment.

## Target architecture

- Keep a single Node/TypeScript backend where the agentic workflow runs in-process, sharing the existing SQLite schema (agentic_runs) and helpers under backend/db.ts.
- Replace proxy actions (trigger, health, restart, etc.) with thin controllers that call a local agentic orchestrator instead of making HTTP round-trips
- Update frontend helpers to rely solely on mediator endpoints (drop hard-coded http://127.0.0.1:* values) and let the backend own service selection.
- Remove redundant submodule/dotfiles, merge necessary dependencies into the root package.json, and simplify container orchestration to a single service (Dockerfile, docker-compose.yml).

## Integration plan

- 1. Document the consolidation plan
    - Capture this migration roadmap in docs/AGENT.md (per planning guidelines) and cross-link any AI-specific docs that previously lived in `ai-flow-service/` once their material is copied or referenced.
    - Note the open TODO in backend/config.ts about schema validation so the config refactor can address it while unifying agentic settings.

- 2. Inventory the ai-flow-service gitlink and select essentials
  - ✅ Completed: the historical module map in [docs/ai-flow-service-audit.md](ai-flow-service-audit.md) now serves as a reference for the assets that were migrated into `backend/agentic/`.
  - ✅ Completed: the unused MCP web-search stack and HTTP proxy wrappers were dropped during the TypeScript port so the mediator carries only the runtime components required for the agentic workflow.

- 3. Flatten repository structure & merge dotfiles
  - ✅ Completed: the gitlink/duplicate directory has been removed and all runtime modules now live under `backend/agentic/` following mediator conventions.
  - Merge useful dotfiles (e.g., .eslintrc, .npmrc, .dockerignore) into existing root equivalents; delete duplicates that add no value to the combined project.
  - Fold AI-specific scripts into scripts/ if still needed, otherwise reference them from docs.
  - ✅ Completed: the Tavily client, flow pipeline, and supporting utilities have been ported into TypeScript modules that reuse mediator helpers.

- 4. Unify package and build configuration
  - Merge ai-flow-service dependencies/devDependencies into the root package.json, keeping the build lean by dropping unused packages. Update tsconfig.json if new paths are required.
  - Ensure build steps in package.json and Dockerfile compile the new agentic modules without introducing extra build stages.
  - Clean up docker-compose.yml by removing instructions about a separate agentic base URL once the service is internal.

- 5. Align database schemas on mediator defaults
  - Inspect any AI-flow migrations/schema files and port only the tables actually used at runtime into backend/db.ts, ensuring they follow mediator naming and reuse better-sqlite3 helpers already present.
  - Double-check shared models under models/ (e.g., agentic-run.ts) so new columns or types stay consistent between backend and frontend per user instruction on data structures.
  - If AI-flow introduced a separate database, provide a one-time migration path that copies rows into mediator’s agentic_runs table, logging failures with try/catch blocks.
  - ✅ Added `agentic_request_logs` schema management and helper functions to `backend/db.ts` so mediator owns request log persistence. Legacy AI-flow `request_logs` data will be dropped during consolidation, so no migration script is required.
  - ✅ Wired the in-process orchestrator flows and webhook handlers to those helpers so request lifecycle transitions, payload snapshots, and notification timestamps stay in sync without the ai-flow proxy.

## Agentic environment variables

The mediator now standardises the in-process agentic orchestrator settings behind the `AGENTIC_*` prefix while preserving backwards compatibility with legacy keys from the original ai-flow service. The `backend/agentic/config.ts` loader resolves prefixed variables first and gracefully falls back to the historical names (`MODEL_PROVIDER`, `OLLAMA_BASE_URL`, etc.) so existing deployments keep working.

Supported variables after this change:

- `AGENTIC_MODEL_PROVIDER` (required, defaults to `ollama`) with fallback to `MODEL_PROVIDER`.
- `AGENTIC_OLLAMA_BASE_URL` / `OLLAMA_BASE_URL`.
- `AGENTIC_OLLAMA_MODEL` / `OLLAMA_MODEL`.
- `AGENTIC_OPENAI_API_KEY` / `OPENAI_API_KEY`.
- `AGENTIC_OPENAI_BASE_URL` / `OPENAI_BASE_URL`.
- `AGENTIC_OPENAI_MODEL` / `OPENAI_MODEL`.
- `AGENTIC_MODEL_BASE_URL` / `MODEL_BASE_URL`.
- `AGENTIC_MODEL_NAME` / `MODEL_NAME`.
- `AGENTIC_MODEL_API_KEY` / `MODEL_API_KEY`.
- `AGENTIC_AGENT_API_BASE_URL` / `AGENT_API_BASE_URL` (optional callback integration).
- `AGENTIC_AGENT_SHARED_SECRET` / `AGENT_SHARED_SECRET` (optional callback integration).
- `AGENTIC_QUEUE_POLL_INTERVAL_MS` (used by the mediator server loop).
- `TAVILY_API_KEY`, `SEARCH_RATE_LIMIT_DELAY_MS`, and Shopware-specific credentials (unchanged names, all optional).

All samples (`.env.example`, `docker-compose.yml`, `Dockerfile`) now advertise only the supported keys above; unused placeholders such as `AGENTIC_SEARCH_BASE_URL/PORT/PATH` were removed to avoid dead configuration. Backwards compatibility relies solely on the runtime fallback logic, so no migration step is required.

TODO: Revisit the legacy key fallback once all environments have switched to the `AGENTIC_*` namespace so the config loader can be simplified.

- 6. Implement an in-process agentic orchestrator
  - Create a service module (e.g., backend/agentic/service.ts) that exposes methods for startRun, cancelRun, restartRun, checkHealth, and submitResult. The orchestrator should:
    - Use mediator’s DB helpers to read/write queue state instead of HTTP calls.
    - Contain robust logging via the existing console/logger pattern and wrap external AI calls in try/catch to honor observability requirements.
    - Replace the shared-secret webhook with an internal invocation that validates input directly via orchestrator context (no shared secrets, rely on request-log lookups and job metadata).

  ### Asynchronous dispatch semantics

  - `startAgenticRun` and `restartAgenticRun` now persist the queued run, update the request log with a `queued` status, and immediately return control to the caller while a `setImmediate`-scheduled task transitions the row to `running` before invoking the model.
  - There is no separate worker loop for this dispatch path—the Node.js event loop processes the background callback. Operational dashboards should rely on the `agentic_runs` table (queued → running → completion) to surface progress.
  - Background failures are caught and logged; `recordAgenticRequestLogUpdate` records both the queue handoff (`queued`) and the asynchronous result (`running`, `failed`, etc.) so request logs reflect both handoff and completion states.

  - Update the queue worker to call the orchestrator directly (dependency-inject a function rather than forwardAgenticTrigger).

- 7. Refactor backend actions to drop REST proxies
  - Rewrite backend/actions/agentic-trigger.ts, agentic-health.ts, agentic-restart.ts, and related files so they call the orchestrator instead of fetching AGENTIC_API_BASE. Remove network-specific error classes as appropriate but keep validation and logging.
  - Adjust backend/actions/import-item.ts to queue/trigger runs through the in-process service, maintaining the current agentic status semantics and logging.
  - Update config by deleting AGENTIC_API_BASE/AGENTIC_SHARED_SECRET and replacing them with any new knobs the orchestrator needs (e.g., AI model endpoints, AGENTIC_QUEUE_POLL_INTERVAL_MS) while keeping TODO-driven validation in mind.

- 8. Update frontend integration
  - Remove hard-coded API bases in frontend/src/lib/agentic.ts, ItemDetail.tsx, and ItemCreate.tsx, ensuring the UI only hits mediator endpoints and defers routing to the backend.
  - Simplify the client helper to assume the backend endpoint handles dispatch; keep existing skip logic and add logging/try/catch around new flows as needed.
  - Confirm shared TypeScript types still align with models/ definitions after schema updates.

- 9. Retire obsolete tests & add new coverage
  - Remove or rewrite proxy-focused tests such as test/agentic-health-proxy.test.ts to exercise the new in-process orchestrator and backend actions.
  - Keep `test/agentic-health-proxy.test.ts` and `test/agentic-queue-worker.test.ts` aligned with the in-process orchestrator: they now assert queue metrics, retry backoff, logging, and status transitions without relying on `AGENTIC_API_BASE`. Future backend changes that alter queue semantics should extend these suites instead of reintroducing proxy mocks.
  - Extend existing backend tests (e.g., backend/actions/__tests__/agentic-bulk-queue.test.ts) to cover direct orchestrator calls and verify DB updates/logging.

- 10. Documentation & follow-up
  - Update docs/setup.md, docs/ARCHITECTURE.md, and docs/OVERVIEW.md with the new single-service layout and link any retained AI docs.
  - Mention configuration changes (no more AGENTIC_API_BASE/AGENTIC_SHARED_SECRET; add AGENTIC_QUEUE_POLL_INTERVAL_MS and request-log validation expectations) and point to new logging/monitoring expectations.
  - Close or revise TODO comments encountered during the refactor, including the CLI filtering TODO in scripts/dump-agentic-search-events.ts if it becomes relevant.

- 11. Parallelisation suggestions
  - Repository cleanup & dependency merge (Steps 2–4) can proceed while the database alignment (Step 5) happens in parallel, provided both coordinate on shared files (package.json, backend/db.ts).
  - Orchestrator implementation (Step 6) can start once schema decisions are agreed, while frontend adjustments (Step 8) proceed concurrently after the new backend interface is sketched.
  - Test updates (Step 9) should trail the orchestrator work but can begin with scaffolding as soon as new service contracts are defined.
