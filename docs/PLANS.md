# Plans & Next Steps

This document tracks active planning items and near-term opportunities. Keep the overview lean by updating detailed plans here.

## Multi-step Plan: Agentic review learning loop

Goal: convert review feedback into structured, reusable signals that improve run quality over time for each application instance. Reason: reduce repeated reviewer corrections, keep prompt updates evidence-based, and minimize code additions by extending existing agentic metadata and prompt assembly structures.

Checklist (execute one step at a time; update this section before each subsequent task):

- [ ] **TODO markers in touched files** – add/update TODO comments in `models/agentic.ts`, `backend/agentic/index.ts`, `backend/agentic/invoker.ts`, `backend/agentic/flow/item-flow.ts`, and the review UI component before behavior changes. Reason: keep scope explicit and avoid hidden follow-up work.
- [ ] **Structured review contract** – extend shared review metadata with `structuredFeedback` fields (`information_present`, `missing_spec[]`, `bad_format`, `wrong_information`, `wrong_physical_dimensions`) while keeping `notes` as an additional channel for uncaught signals. Reason: preserve current workflows while enabling deterministic routing.
- [ ] **Review normalization + logging** – normalize/validate structured fields (trim, dedupe, limits, null handling), add try/catch around parsing, and log sanitized diagnostics only. Reason: protect data quality and observability without exposing raw reviewer text.
- [ ] **Review lifecycle retention** – persist iteration-level review history snapshots in a separate append-only review-history store while keeping latest review state on the run record (preferred over creating a new run for each retry). Reason: preserve learning data without changing operator workflow or run identity semantics.
- [x] **Prompt placeholder mapping** – use existing placeholder style and add review placeholders (`{{CATEGORIZER_REVIEW}}`, `{{EXTRACTION_REVIEW}}`, `{{SUPERVISOR_REVIEW}}`, `{{EXAMPLE_ITEM}}`) resolved from structured review + aggregate signals. Reason: keep injection mechanics explicit and avoid scattered string assembly.
- [ ] **Influence map per flow stage** – define and centralize trigger logic that maps structured fields to one or many placeholder fragments (e.g., `InjectConditionally(condition, placeholder, text)`). Reason: keep behavior auditable with minimal code additions.
- [ ] **Subcategory aggregation thresholds** – aggregate the last `10` reviewed items per subcategory and convert results into boolean triggers via documented thresholds. Reason: support stable automation (e.g., formatter on/off) from repeated signals.
- [ ] **Dynamic example injection** – inject the latest reviewed same-subcategory item into extraction prompt with strict redaction/length limits; fallback to the current static prompt example when no reviewed item is available. Reason: improve relevance while controlling token growth and leakage risk.
- [ ] **Agent card metrics** – expose aggregation window/sample size + trigger states in the agent card payload/UI. Reason: make the learning effect transparent for operators.
- [ ] **Manual prompt tuning loop** – document how aggregated metrics and examples inform prompt updates and release-over-release validation. Reason: keep human-in-the-loop improvements measurable.

Detailed plan, decisions, and open questions: `docs/agentic-review-learning-loop.md`.
