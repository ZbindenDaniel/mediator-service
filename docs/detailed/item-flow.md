# Item Flow

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## In short
- Business goal: make the agentic item enrichment path predictable and safe by documenting explicit stage transitions and stage-owned mutations.
- User value: operators can trace why an item lands in `completed` vs `needs_review`, and developers can change prompts/validators without silently breaking contracts.

## Scope
- In scope:
  - Runtime flow in `runItemFlow` and `runExtractionAttempts` (search/extraction/categorization/pricing/supervisor/review handoff).
  - Existing policy gates and fallback behavior only (no new policy logic).
  - Field-level ownership for stage writes and validation boundaries.
  - Stage logging/error handling map for debugging malformed/partial outputs.
- Out of scope:
  - UI review checklist details (see `docs/detailed/review-flow.md`).
  - New approval policy logic or threshold tuning.
  - ERP import/export and non-agentic item mutation paths.

## Core concepts
- **Orchestrator**: `backend/agentic/flow/item-flow.ts` owns high-level transition sequencing and callback payload assembly.
- **Extraction loop**: `backend/agentic/flow/item-flow-extraction.ts` runs iterative extraction + supervisor outcomes (complete, retry, context advance, additional search, fail).
- **Specialized stages**:
  - Categorization: `item-flow-categorizer.ts`.
  - Pricing: `item-flow-pricing.ts`.
- **Result handoff**: `backend/agentic/flow/result-dispatch.ts` persists request payload, applies result handler, and marks notification success/failure.
- **Review transition surface**: `backend/actions/agentic-status.ts` persists manual decision outcomes and reviewer-driven reference adjustments.

## Stage-by-stage workflow (current implementation)
1. **Input normalization + early gate (`runItemFlow`)**
   - Coerces target payload, resolves item id/search term, trims reviewer notes, records review-note directive summary.
   - Gate: invalid/non-object target logs warning and yields flow error path.
2. **Search gating decision (`runItemFlow`)**
   - Computes missing schema fields (`identifyMissingSchemaFields`).
   - Optional planner call (`evaluateSearchPlanner`) decides `shouldSearch`; planner failures degrade to `shouldSearch=true`.
   - Final gate: `finalShouldSearch = !skipSearch && plannerShouldSearch`.
3. **Search collection (`collectSearchContexts`)**
   - Executes initial/follow-up search collection and source aggregation.
   - Produces `searchContexts`, aggregated sources, and text builders consumed by extraction loop.
4. **Extraction iteration loop (`runExtractionAttempts`)**
   - Sends prompt+context to model, parses JSON, validates against `AgentOutputSchema`/`TargetSchema`-aligned rules, tracks supervision guidance.
   - Handles iterative outcomes:
     - `complete` -> finalize.
     - `needs_more_search` -> invoke additional search, append context, continue.
     - context/pass retries -> continue until attempt/pass limits.
     - fatal parse/schema/provider errors -> throw `FlowError`.
5. **Categorization stage (`runCategorizerStage`)**
   - Enriches category codes (A/B main/sub categories) with taxonomy reference.
   - Locked fields (`__locked`) are preserved and not overwritten.
   - Invalid JSON/schema from categorizer throws explicit `FlowError` (`CATEGORIZER_INVALID_JSON`, `CATEGORIZER_SCHEMA_FAILED`).
6. **Pricing stage (`runPricingStage`)**
   - Requests pricing decision payload and applies confidence/evidence thresholds.
   - If initial pricing JSON is malformed, executes bounded JSON repair pass before giving up.
   - Returns partial patch `{ Verkaufspreis }` only when price is usable and policy thresholds pass.
7. **Supervisor outcome + final payload assembly**
   - Extraction loop returns `success`, `data`, `supervisor`, `sources`.
   - Orchestrator merges target + stage outputs and builds callback payload:
     - success -> `status=completed`, `reviewDecision=approved`.
     - non-success -> `status=needs_review`, `reviewDecision=changes_requested`, reviewer notes populated.
8. **Dispatch + review handoff (`dispatchAgenticResult`)**
   - Persist request payload -> apply result handler -> mark notification success.
   - Any dispatch failure marks notification failure and surfaces error.
   - Downstream manual review endpoint (`agentic-status`) decides approve/reject/close and may update fallback price/spec fields.

## Policy gates and fallback behavior
- **Search gate**:
  - Inputs: `skipSearch`, planner outcome, missing fields.
  - Fallback: planner exception logs error and defaults to searching.
- **Extraction validity gate**:
  - JSON parse + schema validation gate candidate acceptance.
  - Fallback: iterative retry/context advance/additional search path until bounded limits.
- **Categorizer validity gate**:
  - Must parse and validate categorizer payload contract.
  - Fallback: explicit failure (`FlowError`) escalates to orchestrator-level failure path.
- **Pricing acceptance gate**:
  - Requires parseable+validated pricing payload and `confidence >= 0.6` + `evidenceCount >= 2` for a usable non-zero price.
  - Fallbacks:
    - malformed JSON -> repair attempt.
    - repair fails or low-confidence/low-evidence/no-usable-price -> stage returns `null` patch (no price mutation).
- **Dispatch gate**:
  - Requires `applyAgenticResult` handler.
  - Fallback: mark notification failure with error text, then rethrow.

## Field-level contract map (critical writes/updates)
### Canonical models/types
- Shared item fields: `models/item.ts` (`ItemRef` and related shapes).
- Agentic status enums/contracts: `models/agentic-statuses.ts`, `models/agentic-run.ts`, `models/agentic-request-log.ts`.
- Flow target/output schemas: `backend/agentic/flow/item-flow-schemas.ts` (`TargetSchema`, `AgentOutputSchema`).
- Result payload contract: `backend/agentic/result-handler.ts` (`AgenticResultPayload`).

### Stage ownership and mutations
- **Extraction** (primary structured content)
  - Writes candidate values for `Artikelbeschreibung`, `Kurzbeschreibung`, `Langtext`, dimensions/weight, and may propose category fields/pricing hints.
  - Handles `Spezifikationen` -> `Langtext` boundary normalization.
- **Categorization**
  - Owns category code patching: `Hauptkategorien_A/B`, `Unterkategorien_A/B`.
  - Respects `__locked` fields from candidate state.
- **Pricing**
  - Owns `Verkaufspreis` patch only when decision gate passes.
  - Does not force mutation on malformed/low-confidence responses.
- **Orchestrator/final assembly**
  - Ensures `Artikel_Nummer` continuity and merges stage patches into final item payload.
  - Sets status/review contract fields in callback payload (`status`, `needsReview`, `reviewDecision`, `reviewNotes`, `error`, `sources`).
- **Manual review endpoint**
  - Persists review state transitions and may apply reviewer-provided price/shop changes and spec-pruning on `Langtext`.

## Validation and malformed/partial output handling
- **Parse boundaries**
  - `parseJsonWithSanitizer` is used across extraction/categorizer/pricing stage boundaries.
- **Schema boundaries**
  - `TargetSchema` and `AgentOutputSchema` enforce required keys/types and numeric normalization behavior.
  - Categorizer and pricing stages validate with local zod schemas before patch application.
- **Malformed output behavior**
  - Extraction: invalid JSON/schema stays in retry/iteration workflow; final failure raises `FlowError` with context.
  - Categorizer: malformed JSON/schema is non-recoverable for that run and throws.
  - Pricing: malformed JSON gets one repair path; if still invalid or policy-rejected, returns `null` patch (flow continues).
- **Partial output behavior**
  - Stage patches are additive; absent fields remain from target/previous candidate.
  - Final success is determined by extraction/supervisor outcome, not by every optional field being present.

## Logging and error-handling map by stage
- **Orchestrator (`item-flow.ts`)**
  - Logs search gating resolution, planner failures, cancellation handling, persisted failure telemetry (`persistLastError`) and structured `FlowError` context.
  - try/catch wraps whole run to normalize unexpected failures to `INTERNAL_ERROR`.
- **Extraction loop (`item-flow-extraction.ts`)**
  - Logs iteration decisions, search expansion, schema telemetry (`logSchemaKeyTelemetry`), and parse/validation diagnostics.
  - Converts provider/search failures into typed `FlowError` (`RATE_LIMITED`, `SEARCH_FAILED`, etc.).
- **Categorizer (`item-flow-categorizer.ts`)**
  - Logs prompt payload setup, taxonomy load outcome, parsed response details.
  - Throws explicit typed failures for reference load/invoke/parse/schema steps.
- **Pricing (`item-flow-pricing.ts`)**
  - Logs invocation timeout, parse/validation warnings, repair-attempt start/success/failure, and final decision metadata (`selectedSource`, `confidence`, `evidenceCount`).
  - Uses local timeout + bounded repair timeout to avoid hanging stage execution.
- **Dispatch (`result-dispatch.ts`)**
  - Logs persistence/dispatch/notification failure points and always attempts failure marking on dispatch exceptions.
- **Review transition (`actions/agentic-status.ts`)**
  - Logs attempted state transitions, fallback price/spec-pruning side effects, and persistence errors for reviewer actions.

## Open questions / TODO
- [ ] TODO: add direct links to concrete API endpoints once agentic route docs are split out from review-flow.
