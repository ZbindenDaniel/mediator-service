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
- **Auto-dispatcher feeds `notStarted` only (demoted, #913)**: the keep-busy feeder (`claimNotStartedAgenticRuns`) promotes only `notStarted` → `queued`, capped at `MAX_WAITING_RUNS` (= running cap), and never re-claims `failed`/`cancelled` runs — an operator stop is durable and a permanently-failing item cannot loop. Failures are terminal (no auto-requeue); transient hiccups are absorbed by in-process retries within a run (Tavily/Ollama), not by resurrecting runs. Admin-disablable via the `agentic_auto_dispatch_enabled` system setting. When the `notStarted` pool can't fill the free waiting slots, the feeder enrols that many refs that have no `agentic_runs` row yet (`enrolItemRefsWithoutAgenticRun`, refs with stock first), so every ref eventually reaches the pipeline without flooding it.
- **Provider selects the model settings (#1030)**: `AGENTIC_MODEL_PROVIDER` picks which `AGENTIC_<PROVIDER>_*` block `config.ts` reads; generic `MODEL_*`/`AGENTIC_MODEL_*` keys are only a fallback. Previously all providers' keys fed one first-wins chain, so a configured Ollama URL silently hijacked OpenAI runs.

- **Every cockpit lever and unattended decision leaves an activity-log row (#1072)**: lever toggles/self-heal triggers are `Batch` events with the operator as actor; auto-approve, self-heal and correction-note reworks are per-item events with actor `agentic-service` / `auto-rework`. Per-run plumbing (queued, result received, restamp) is `debug`. New event keys must be registered in `models/event-resources.json` — unregistered keys render as errors (guarded by `test/event-resources-coverage.test.ts`)

## See also
- [docs/detailed/agentic-basics.md](../../docs/detailed/agentic-basics.md) — run lifecycle, state machine, observability guide
- [docs/detailed/item-flow.md](../../docs/detailed/item-flow.md) — per-stage pipeline contract
- [docs/detailed/review-flow.md](../../docs/detailed/review-flow.md) — reviewer actions, automation signals
