# backend/agentic/

## Purpose
AI enrichment pipeline — queues, orchestrates, and supervises LLM-driven metadata extraction for inventory items. Handles the full run lifecycle from trigger to review.

## Contents
- `index.ts` — public API: `beginRun`, `cancelRun`, `deleteRun`, `restartRun`, `dispatchQueuedAgenticRuns`, `resumeStaleAgenticRuns`
- `invoker.ts` — spawns individual run execution; wires together flow stages
- `result-handler.ts` — persists LLM results (specs, pricing, shop fields) back to item/run records
- `review-automation-signals.ts` — derives auto-approve/reject signals from reviewer answers
- `config.ts` — concurrency limits, timeout thresholds, model config
- `example-selector.ts` — selects relevant few-shot examples to inject into prompts
- `flow/` — pipeline stage modules (search, extraction, categorization, pricing, supervisor, review)
- `prompts/` — LLM prompt templates (.md files) and JSON schemas
- `tools/` — LLM function/tool call definitions
- `utils/` — rate limiter, JSON repair, LangChain helpers, search result formatter

## Relations
- Depends on: `../db-client` (run state persistence), `../lib/` (media, quality, langtext), `../../models` (AgenticRun types), `../../contracts/` (quality contracts)
- Depended on by: `../actions/agentic-*.ts` (HTTP trigger/status/cancel/review endpoints), `../server.ts` (queue dispatcher on startup)
- External: Anthropic Claude API (via LangChain), Tavily search API, Shopware ERP

## Scope
Orchestration, prompting, and LLM interaction only. Item DB persistence belongs in `../lib/`. UI review rendering belongs in `../../frontend/`.

## Rules
- Each pipeline stage lives in a separate `flow/` module; `invoker.ts` sequences them
- Prompt templates are `.md` files in `prompts/` — never inline multi-line strings in `.ts`
- All model calls go through `utils/langchain.ts` — no direct `@anthropic-ai/sdk` imports elsewhere in this folder
- Run state transitions use the status constants from `../../models/agentic-statuses.ts`

## Decisions
- **Async queue dispatch**: enrichment takes 30–120 s; blocking an HTTP response was not acceptable; runs are queued and dispatched in background
- **Transcript-based observability**: each run writes a structured transcript (via `flow/transcript.ts`) so failures can be diagnosed without re-running
- **Supervisor stage**: added after extraction quality was inconsistent; supervisor validates extracted data and can trigger re-extraction before committing
- **Postgres for the queue**: SQLite's write lock blocked concurrent run dispatches; Postgres `withTransaction` serializes queue operations correctly

## See also
- [docs/detailed/agentic-basics.md](../../docs/detailed/agentic-basics.md) — run lifecycle, state machine, observability guide
- [docs/detailed/item-flow.md](../../docs/detailed/item-flow.md) — per-stage pipeline contract
- [docs/detailed/review-flow.md](../../docs/detailed/review-flow.md) — reviewer actions, automation signals
