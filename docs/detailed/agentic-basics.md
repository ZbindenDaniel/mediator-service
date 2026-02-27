# Agentic Basics

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## In short
- Business goal: Provide one shared operational model for agentic orchestration so implementation docs can stay focused on flow-specific details instead of re-explaining core mechanics.
- User value: Developers and operators can quickly answer “what stage is this run in, where is it persisted, and what do I inspect when it fails?” without searching across multiple modules.

## Scope
- In scope:
  - Current-state orchestration lifecycle for agentic runs.
  - Core backend modules/directories that own orchestration and status transitions.
  - Persisted run/request/review metadata contracts and shared frontend references.
  - Observability points (structured logs + persisted event history + surfaced API outcomes).
  - Manual fallback/review path role in the orchestration.
- Out of scope:
  - Speculative legacy behavior no longer used in current runtime paths.
  - Prompt-level deep details (covered by flow-specific docs).
  - UI walkthrough details beyond shared contract touchpoints.

## Core concepts
- Terms:
  - **Agentic run**: Per-`Artikel_Nummer` orchestration record in `agentic_runs` tracking queue/execution/review/terminal outcome.
  - **Request log**: Per-request context row (`agentic_request_logs`) used to track dispatch/notification completion and payload snapshots.
  - **Review history**: Append-only review outcome timeline (`agentic_run_review_history`) that captures status, decision, notes, and normalized metadata.
  - **Manual fallback path**: Transition from autonomous extraction into `review`/manual review handling when quality checks fail or operators intervene.
- Entities:
  - `AgenticRun`, `AgenticRequestLog`, `AgenticRunReviewHistoryEntry`, `AgenticRunReviewMetadata`.
  - Orchestration services in `backend/agentic/` (start/cancel/restart/resume + item flow dispatch).
  - Review/status actions in `backend/actions/agentic-status.ts` and companion trigger/cancel/restart endpoints.
- Relationships:
  - Trigger -> queue run -> background invocation -> item-flow stages -> result handler writes run/review fields -> UI reads run/review status and history.
  - Manual review can finalize/autocorrect outcomes and write review history plus persisted status transitions.

## Data contracts
- Canonical model links:
  - `models/agentic-run.ts`
  - `models/agentic-request-log.ts`
  - `models/agentic-run-review-history.ts`
  - `models/agentic-orchestrator.ts`
  - `models/agentic-statuses.ts`
  - `frontend/src/lib/agentic.ts`
  - `frontend/src/lib/agenticReviewMapping.ts`
  - `frontend/src/lib/agenticStatusLabels.ts`
- Persisted contract surfaces:
  - `agentic_runs` table keeps lifecycle state (`Status`, `ReviewState`), retry/error fields (`RetryCount`, `NextRetryAt`, `LastError`, `LastAttemptAt`), and last review snapshot fields (`ReviewedBy`, `LastReviewDecision`, `LastReviewNotes`).
  - `agentic_request_logs` table tracks request lifecycle (`Status`, `Error`, `CreatedAt`, `UpdatedAt`, `NotifiedAt`, `LastNotificationError`) plus payload snapshots (`PayloadJson`).
  - `agentic_run_review_history` table keeps append-only review transitions (`Status`, `ReviewState`, `ReviewDecision`, `ReviewNotes`, `ReviewMetadata`, `ReviewedBy`, `RecordedAt`).
- Key shared types referenced by UI:
  - Trigger payload and failure semantics in `frontend/src/lib/agentic.ts`.
  - Review input mapping (`missing_spec`, `unneeded_spec`, decision booleans, notes, reviewer identity) in `frontend/src/lib/agenticReviewMapping.ts`.
  - Status label mapping (`queued`, `running`, `review`, `approved`, `rejected`, `failed`, `cancelled`, `notStarted`) in `frontend/src/lib/agenticStatusLabels.ts` backed by `models/agentic-statuses.ts`.
- Sync requirements across layers:
  - Keep `models/*` contracts aligned with DB schema and backend status-update SQL bindings in `backend/db.ts`.
  - Keep review metadata field names and caps aligned between frontend mapping utilities and backend normalization/history persistence.
  - Keep status constants + normalization maps aligned with frontend label/UX handling.

### Field glossary (one-line purpose per field)
- `Artikel_Nummer`: Reference-key identity for a run across backend persistence and UI status lookups.
- `Status`: High-level lifecycle state (`queued` -> `running` -> `review`/terminal outcomes).
- `ReviewState`: Review-focused substate (`pending`, `in_review`, `approved`, `rejected`, etc.) paired with lifecycle status.
- `LastError`: Last persisted orchestration failure summary for operator diagnostics.
- `LastAttemptAt`: Timestamp of most recent model invocation attempt.
- `LastSearchLinksJson`: Normalized source-link snapshot exposed for later review/debug.
- `ReviewMetadata`: Serialized normalized review signals (`missing_spec`, `unneeded_spec`, checklist booleans) for auditability.
- `PayloadJson`: Stored request payload snapshot for request-level troubleshooting.

## API/actions
- Endpoint/action names:
  - `POST /api/agentic/run` (`backend/actions/agentic-trigger.ts`)
  - `POST /api/agentic/status/:itemId` + review/close paths (`backend/actions/agentic-status.ts`)
  - `POST /api/agentic/cancel` (`backend/actions/agentic-cancel.ts`)
  - `POST /api/agentic/restart` (`backend/actions/agentic-restart.ts`)
- Request shape:
  - Trigger: `artikelNummer` + query/description (`artikelbeschreibung` fallback rules), optional actor and normalized review metadata.
  - Status/review updates: `artikelNummer` route context + actor + decision/review payload.
- Response shape:
  - Trigger returns queued run or declined reason (`already-exists`, validation failures).
  - Status/review endpoints return updated run payload + HTTP errors for invalid transitions/inputs.
- Error cases:
  - Missing required item/query identifiers, duplicate active run, unavailable invocation dependency, persistence failures.

## UI components & routes
- Routes:
  - Item detail/status surfaces consume agentic status and review fields from backend action payloads.
- Key components:
  - `frontend/src/components/ItemForm_agentic.tsx`
  - `frontend/src/components/AgenticSpecFieldReviewModal.tsx`
  - `frontend/src/components/AgenticReviewMetricsRows.tsx`
- User flows:
  - Trigger run from item context -> monitor status labels -> perform manual review when required -> confirm final approved/rejected state.

## State machine / workflow
1. **Enqueue**
   - `startAgenticRun` validates request context, writes `agentic_runs` as `queued`, and logs `AgenticRunQueued`/`AgenticRunRequeued` events.
2. **Dispatch and execution**
   - Background scheduler moves run to `running`, then executes item-flow orchestration (`context` -> optional planner/search -> extraction attempts -> dispatch result payload).
3. **Result application**
   - Result handler normalizes output/review metadata, persists run fields, and transitions run status toward `review` or terminal success/failure outcomes.
4. **Manual fallback/review path**
   - If autonomous flow returns needs-review signals or fails quality gates, run enters review-required handling; operators submit review decisions that transition to `approved` or `rejected` and append review-history entries.
5. **Operational controls**
   - Cancel/delete/restart endpoints force deterministic terminal/reset states (`cancelled`, `notStarted`, re-`queued`) with request-log completion tracking.

## Logging & error handling
- Log identifiers/events:
  - Backend orchestration logs under `[agentic-service]`, `[agentic-trigger]`, and `[agentic-review]` for validation, state transitions, persistence failures, and resume behavior.
  - Item-flow modules emit structured stage logs (search gating, search execution, extraction/correction, dispatch failures).
  - Persisted events via `logEvent` include `AgenticRunQueued`, `AgenticRunRequeued`, and cancellation/restart lifecycle events.
- Warning conditions:
  - Missing optional dependencies (e.g., invocation unavailable), stale-run resume skips, review metadata parse issues, non-fatal event logging failures.
- Error conditions:
  - DB upsert/update failures, model invocation failures, result dispatch failures, invalid lifecycle transitions.
  - Request-log persistence failures are logged with request IDs and status context.
- Failure surfacing:
  - HTTP responses expose declined/failure reasons for trigger/status actions.
  - Persisted `LastError`/`LastAttemptAt` on runs plus request-log `Error`/notification fields provide operator-readable diagnostics.
- try/catch boundaries:
  - Service and action layers wrap queue/update/persist operations; item-flow stages wrap planner/search/extraction/serialization and rethrow typed `FlowError` for consistent failure handling.

## Config & environment flags
- Required flags:
  - Agent-model invocation availability/configuration required for autonomous progress beyond queued state.
- Optional flags:
  - Search/provider-specific settings used by planner/search modules.
  - Resume-related startup behavior relies on stale-run sweep in service startup path.
- Defaults/constraints:
  - Status normalization defaults unknown values to `queued` to preserve deterministic lifecycle handling.

## Dependencies & integrations
- Database:
  - `backend/db.ts` owns run/request/review-history schemas plus status-update statements.
- Device integrations (printer/camera):
  - None in core agentic orchestration path.
- External services:
  - LLM provider/invoker through `backend/agentic/invoker.ts`.
  - Search/shopware integrations in `backend/agentic/flow/item-flow-search.ts` and `backend/agentic/flow/item-flow-shopware.ts`.

## Failure modes & troubleshooting
- Run remains `queued`:
  - Detection signals: `[agentic-service] Agentic model invocation unavailable; run will remain queued` logs; `LastError` populated.
  - Recovery: verify invoker configuration/wiring and restart/resume queue processing.
- Run fails during flow execution:
  - Detection signals: structured `FlowError` logs with code/context; `Status=failed`, `LastError`, `LastAttemptAt` persisted.
  - Recovery: inspect stage-specific logs (search/extraction/dispatch) and request payload snapshot in `agentic_request_logs.PayloadJson`.
- Manual review mismatch/confusion:
  - Detection signals: run stuck in review states or rejected unexpectedly.
  - Recovery: inspect `agentic_run_review_history` sequence, verify checklist-to-payload mapping and status labels used by UI.

## Test/validation checklist
- Static checks:
  - Keep `models/agentic-*.ts` and `backend/db.ts` schema/statement fields synchronized.
  - Keep frontend status/review mapping helpers aligned with model contract names.
- Runtime checks:
  - Trigger -> queued -> running -> review/terminal status progression using agentic action endpoints.
  - Validate cancel/restart transitions and resulting persisted run/request-log updates.
  - Verify manual review submission writes review history and final status updates.
- Contract sync verification:
  - Compare status constants/normalization in `models/agentic-statuses.ts` against backend transition logic and frontend label mappings.
  - Compare `AgenticRunReviewMetadata` fields with frontend mapping output and persisted `ReviewMetadata` history JSON.

## Guardrails (current behavior only)
- Focus documentation and implementation on observable current runtime behavior.
- Do not infer or document speculative legacy paths unless they are still executed by current code.
- Prefer minimal contract-preserving edits when adjusting orchestration docs or flow code.

## Specialized deep-dives
- Item execution details: [`item-flow.md`](./item-flow.md)
- Review/decision details: [`review-flow.md`](./review-flow.md)

## Open questions / TODO
- [ ] TODO(agentic-basics): Add explicit cross-reference once item/review deep-dives document full endpoint matrices and response examples.
