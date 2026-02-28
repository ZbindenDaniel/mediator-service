# Review Flow

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## In short
- Business goal: keep reviewer outcomes deterministic so automation (restart, close, follow-up processing) behaves predictably for the same input.
- User value: reviewers can see consistent states, and operators can audit what changed, who changed it, and why a transition failed.

## Scope
- In scope:
  - Current lifecycle semantics for run status + review state.
  - Manual review actions (`review`, `close`) and restart/retrigger behavior.
  - Persistence side effects on `agentic_runs`, `agentic_run_review_history`, and selected `item_refs` fields.
  - Frontend review entry points and backend action mapping.
  - Logging/error handling paths used for auditability.
- Out of scope:
  - New policy decisions (for unclear behavior, capture open questions instead of redefining behavior).
  - Historical/legacy compatibility beyond what current handlers already accept.

## Core concepts
- `Status` (`agentic_runs.Status`) tracks execution lifecycle (`queued`, `running`, `review`, terminal states).
- `ReviewState` (`agentic_runs.ReviewState`) tracks review outcome semantics (`pending`, `approved`, `rejected`, `not_required`).
- Manual review uses checklist payload signals to derive or confirm final decisions.
- Resolved reviews map to terminal run statuses (`approved` or `rejected`) and can be restarted via restart/retrigger paths.

## Data contracts
- Canonical model links:
  - `models/agentic-statuses.ts`
  - `models/agentic-run.ts`
  - `models/agentic-run-review-history.ts`
  - `models/agentic-orchestrator.ts`
  - `frontend/src/lib/agenticReviewMapping.ts`
- Key fields (review-related):
  - Run lifecycle: `Status`, `LastModified`, `LastError`, `RetryCount`, `NextRetryAt`, `LastAttemptAt`.
  - Reviewer attribution/decision: `ReviewState`, `ReviewedBy`, `LastReviewDecision`, `LastReviewNotes`.
  - Review artifact envelope: `information_present`, `missing_spec`, `unneeded_spec`, `bad_format`, `wrong_information`, `wrong_physical_dimensions`, `notes`, `review_price`, `shop_article`, `reviewedBy`.
- Sync requirements across layers:
  - Review metadata naming must stay aligned between frontend payload builder and backend normalization.
  - `agentic_runs` fields above must stay aligned with shared `AgenticRun` typing.
  - History persistence (`agentic_run_review_history`) must continue storing metadata JSON that includes manual action/source markers.

### Field glossary (one-line purpose per field)
- `Status`: execution state for queue/processing/review/terminal flow.
- `ReviewState`: reviewer-facing state (`pending` vs resolved states).
- `LastReviewDecision`: latest explicit or derived final decision (`approved` / `rejected`).
- `LastReviewNotes`: latest reviewer note payload persisted with the decision.
- `ReviewedBy`: actor attributed to the latest review state update.
- `ReviewMetadata` (history): snapshot of review signals and manual action provenance for audit trails.
- `review_price`: optional manual sale price override propagated to `item_refs.Verkaufspreis`.
- `shop_article`: optional manual publication flag propagated to `item_refs.Shopartikel`.
- `unneeded_spec`: reviewer-provided keys pruned from `item_refs.Langtext` when matching keys exist.

## Review lifecycle (current implementation)
1. **Queued**
   - Run is inserted/updated with `Status=queued` before async execution.
2. **In-review**
   - Agent result with `Status=review` maps `ReviewState` to `pending` and requires manual reviewer action.
3. **Resolved**
   - Manual `review`/`close` finalizes to `Status=approved|rejected` with matching `ReviewState` and `LastReviewDecision`.
4. **Restart/retrigger paths**
   - Restart endpoint re-queues run and can clear/carry review metadata depending on provided payload.
   - Item detail restart flow may retrigger `/api/agentic/run`; if trigger fails, UI auto-cancels the run to avoid zombie queued state.


## Restart metadata preservation/replacement policy
<!-- TODO(agentic-doc-sync): Keep this truth table aligned with restart action/service/result-handler lifecycle updates. -->

Current restart semantics are intentionally explicit and deterministic:

| Restart input shape | Persisted review metadata outcome | Operator impact |
| --- | --- | --- |
| `review` omitted, `replaceReviewMetadata=false` (default) | Existing `ReviewState` / `ReviewedBy` / `LastReviewDecision` / `LastReviewNotes` are preserved. | Restart continues with prior reviewer guidance context. |
| `review` provided, `replaceReviewMetadata=false` | Provided review payload is normalized and applied for restart fields. | Allows reviewer guidance refresh without requiring explicit full clear. |
| `review` provided, `replaceReviewMetadata=true` | Provided review payload is treated as explicit replacement. | Enforces intentional overwrite behavior. |
| `replaceReviewMetadata=true` and `review` omitted | Review metadata is cleared and `ReviewState` resets to `not_required`. | Explicit clear/reset path before next run. |

Additionally, when model-result processing transitions a run into pending review (`Status=review`), previous reviewer attribution/decision/notes are cleared (`ReviewedBy`, `LastReviewDecision`, `LastReviewNotes`) so each review cycle starts cleanly.

## API/actions
- Status fetch:
  - `GET /api/item-refs/:artikelNummer/agentic` (legacy `/api/items/:id/agentic` still accepted).
- Manual review transitions:
  - `POST /api/item-refs/:artikelNummer/agentic/review`
  - `POST /api/item-refs/:artikelNummer/agentic/close`
- Restart/retrigger:
  - `POST /api/item-refs/:artikelNummer/agentic/restart` (re-queue/reset path)
  - `POST /api/agentic/run` (model trigger path used by UI retrigger flow)
- Related control actions:
  - `POST /api/item-refs/:artikelNummer/agentic/cancel`
  - `POST /api/item-refs/:artikelNummer/agentic/delete`

## Reviewer actions and persistence effects
- `review` action (checklist submit):
  - Backend resolves decision from explicit `decision` or derived checklist signals.
  - Persists run transition, review decision fields, and review metadata history entry.
- `close` action (finalize directly):
  - Defaults to `approved` if no explicit decision is sent.
  - Upserts run if missing, otherwise updates existing run.
- Shared side effects after finalized decision:
  - Writes review history row (when insert dependency available).
  - Emits decision event (`AgenticReviewApproved` / `AgenticReviewRejected`).
  - Applies manual reference updates (`Verkaufspreis`, `Shopartikel`) when payload values are present.
  - On approved: applies fallback price if no sale price exists.
  - Prunes reviewer-marked `unneeded_spec` keys from `Langtext` object.
  - On rejected: clears retry/attempt/error scheduling fields to reset follow-up state.

## Frontend entry points and backend mappings
- Item detail review submit:
  - `frontend/src/components/ItemDetail.tsx` builds payload via `buildAgenticReviewSubmissionPayload(...)` and posts to `/agentic/review`.
- Item detail close:
  - Uses `persistAgenticRunClose(...)` (`frontend/src/lib/agentic.ts`) to call `/agentic/close`.
- Item detail restart:
  - Posts restart payload to `/agentic/restart`, then conditionally retriggers `/api/agentic/run`.
  - If retrigger fails, calls persisted cancel helper to avoid stale intermediate state.

## Logging & error handling
- Transition logging:
  - Backend logs attempted review transitions with from/to state + actor.
  - Manual history persistence logs success/failure with counts and action metadata.
- Validation/parse errors:
  - Body read and JSON parse failures return `400` and log structured context.
  - Missing actor, invalid id, unresolved decision return explicit `400` responses.
- Persistence failures:
  - DB no-op updates or exceptions return `500` with transition detail context.
  - Side-effect updates (history insert, manual item field updates, pruning, fallback pricing) are wrapped in guarded `try/catch` blocks and logged without crashing response flow.

## Failure modes & troubleshooting
- Review payload accepted by UI but rejected by backend:
  - Check missing `actor`, malformed JSON, or unresolved decision derivation.
- Run exists in review but decision not visible:
  - Check update no-op/DB error logs for transition payload and affected `Artikel_Nummer`.
- Manual updates not reflected on item:
  - Inspect manual update logs for missing `item_refs` entry or missing persistence helper binding.
- Restart succeeded but run not progressing:
  - Verify whether restart returned already-queued run and whether retrigger was skipped/failed then auto-cancelled.

## Test/validation checklist
- Contract checks:
  - Keep shared interfaces in `models/agentic-orchestrator.ts` and frontend mapping in sync when changing review payload fields.
- Lifecycle checks:
  - Confirm checklist-derived and explicit decisions still produce `approved`/`rejected` transitions.
  - Confirm close path defaults to `approved` when no explicit decision is provided.
- Persistence checks:
  - Confirm review history rows capture status/review state/decision and metadata JSON.
  - Confirm item side effects (`Verkaufspreis`, `Shopartikel`, `Langtext` pruning) only apply when expected inputs are present.

## Open questions / TODO
- [ ] Should `close` continue defaulting to `approved` when no decision is provided, or require explicit operator intent?
- [ ] Should manual `review_price` / `shop_article` updates apply when final decision is `rejected`, or be restricted to approved outcomes?
- [ ] Should review history source become a first-class DB column instead of JSON metadata (`source: manual-review`)?
- [ ] Should `ReviewState` naming be standardized (`pending` vs `in_review`) across all producers/tests to reduce ambiguity?
