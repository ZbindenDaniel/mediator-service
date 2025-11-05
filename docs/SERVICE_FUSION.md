# Objective

The latest commit pulled the entire ai-flow-service repository into this project as a gitlink, leaving the mediator backend and frontend still talking to it through REST proxies (/api/agentic/*) that forward to AGENTIC_API_BASE and expect a shared secret. Integrating only the essential AI flow pieces into the mediator app—while keeping the existing documentation but linking to it—will eliminate cross-service overhead, align schemas around backend/db.ts, and simplify deployment.

## Target architecture

- Keep a single Node/TypeScript backend where the agentic workflow runs in-process, sharing the existing SQLite schema (agentic_runs) and helpers under backend/db.ts.
- Replace proxy actions (trigger, health, restart, etc.) with thin controllers that call a local agentic orchestrator instead of making HTTP round-trips
- Update frontend helpers to rely solely on mediator endpoints (drop hard-coded http://127.0.0.1:* values) and let the backend own service selection.
- Remove redundant submodule/dotfiles, merge necessary dependencies into the root package.json, and simplify container orchestration to a single service (Dockerfile, docker-compose.yml).

## Integration plan

- 1. Document the consolidation plan
    - Capture this migration roadmap in docs/AGENT.md (per planning guidelines) and cross-link any AI-specific docs that remain in ai-flow-service/ once material is copied or referenced.
    - Note the open TODO in backend/config.ts about schema validation so the config refactor can address it while unifying agentic settings.

- 2. Inventory the ai-flow-service gitlink and select essentials
  - Reference the curated module map in [docs/ai-flow-service-audit.md](ai-flow-service-audit.md) when deciding which runtime pieces belong under `backend/agentic/`.
  - Expand the gitlink locally, list the modules that power /run, /run/cancel, /health, and result callbacks, and mark which ones need to live under backend/agentic/ (e.g., orchestrator, search pipeline, queue consumers).
  - Remove the unused MCP web-search stack (`web-search/`, `src/search/`, and related LangChain tool wrappers) instead of migrating it so the mediator avoids dead dependencies.
  - Ignore tooling/docs that duplicate what the mediator repo already provides; keep only the runtime pieces required for the agentic workflow.

- 3. Flatten repository structure & merge dotfiles
  - Remove the gitlink entry and bring over the selected source files into a new backend/agentic/ (or similar) namespace that fits mediator conventions
  - Merge useful dotfiles (e.g., .eslintrc, .npmrc, .dockerignore) into existing root equivalents; delete duplicates that add no value to the combined project.
  - Fold AI-specific scripts into scripts/ if still needed, otherwise reference them from docs.
  - Add a Tavily client module under `backend/agentic/tavily/client.ts` that encapsulates `@tavily/core` usage with mediator logging and error handling, and merge overlapping utilities from `ai-flow-service/src/utils/` into existing helpers.

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

- 6. Implement an in-process agentic orchestrator
  - Create a service module (e.g., backend/agentic/service.ts) that exposes methods for startRun, cancelRun, restartRun, checkHealth, and submitResult. The orchestrator should:
    - Use mediator’s DB helpers to read/write queue state instead of HTTP calls.
    - Contain robust logging via the existing console/logger pattern and wrap external AI calls in try/catch to honor observability requirements.
    - Replace the shared-secret webhook with an internal invocation that validates input directly (no AGENTIC_SHARED_SECRET).

  - Update the queue worker to call the orchestrator directly (dependency-inject a function rather than forwardAgenticTrigger).

- 7. Refactor backend actions to drop REST proxies
  - Rewrite backend/actions/agentic-trigger.ts, agentic-health.ts, agentic-restart.ts, and related files so they call the orchestrator instead of fetching AGENTIC_API_BASE. Remove network-specific error classes as appropriate but keep validation and logging.
  - Adjust backend/actions/import-item.ts to queue/trigger runs through the in-process service, maintaining the current agentic status semantics and logging.
  - Update config by deleting AGENTIC_API_BASE/AGENTIC_SHARED_SECRET and replacing them with any new knobs the orchestrator needs (e.g., AI model endpoints), keeping TODO-driven validation in mind.

- 8. Update frontend integration
  - Remove hard-coded API bases in frontend/src/lib/agentic.ts, ItemDetail.tsx, and ItemCreate.tsx, ensuring the UI only hits mediator endpoints and defers routing to the backend.
  - Simplify the client helper to assume the backend endpoint handles dispatch; keep existing skip logic and add logging/try/catch around new flows as needed.
  - Confirm shared TypeScript types still align with models/ definitions after schema updates.

- 9. Retire obsolete tests & add new coverage
  - Remove or rewrite proxy-focused tests such as test/agentic-health-proxy.test.ts to exercise the new in-process orchestrator and backend actions.
  - Extend existing backend tests (e.g., backend/actions/__tests__/agentic-bulk-queue.test.ts) to cover direct orchestrator calls and verify DB updates/logging.

- 10. Documentation & follow-up
  - Update docs/setup.md, docs/ARCHITECTURE.md, and docs/OVERVIEW.md with the new single-service layout and link any retained AI docs.
  - Mention configuration changes (no more AGENTIC_API_BASE/AGENTIC_SHARED_SECRET) and point to new logging/monitoring expectations.
  - Close or revise TODO comments encountered during the refactor, including the CLI filtering TODO in scripts/dump-agentic-search-events.ts if it becomes relevant.

- 11. Parallelisation suggestions
  - Repository cleanup & dependency merge (Steps 2–4) can proceed while the database alignment (Step 5) happens in parallel, provided both coordinate on shared files (package.json, backend/db.ts).
  - Orchestrator implementation (Step 6) can start once schema decisions are agreed, while frontend adjustments (Step 8) proceed concurrently after the new backend interface is sketched.
  - Test updates (Step 9) should trail the orchestrator work but can begin with scaffolding as soon as new service contracts are defined.
