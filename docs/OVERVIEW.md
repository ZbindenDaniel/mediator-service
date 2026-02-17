# Project Overview

The mediator service coordinates warehouse inventory workflows by pairing a TypeScript/Node.js backend with a React frontend for managing boxes, items, and print assets. This overview gives a high-level snapshot of the system, plus references for architecture, planning, issues, and recent changes.

## Mission & Scope

- Provide API endpoints and background workers to manage boxes, items, QR scans, and CSV imports.
- Deliver a responsive React UI that surfaces search, detail, and import tooling for logistics teams.
- Maintain printable label templates and legacy scripts required for production operations.

## Project Parts

- **Backend services (`backend/`)** – API endpoints, background workflows, and integrations.
- **Frontend UI (`frontend/`)** – React screens for inventory operations, search, and printing.
- **Shared models (`models/`)** – TypeScript contracts shared across tiers.
- **Printing assets (`frontend/public/print/`)** – Label templates rendered by frontend and backend.
- **Data & media (`data/`, `media/`)** – CSV imports/exports, QR assets, and item imagery.
- **Agentic flows (`backend/agentic/`)** – AI-assisted enrichment pipeline with human review.

## Current Status (Broad)

- Backend and frontend share aligned TypeScript models and rely on dynamic action loading for API routes.
- CSV import/export, QR scanning, and print label flows are available and continue to receive incremental polish.
- Shopware support currently covers read-only product search plus a queued sync pipeline awaiting a real dispatch client.
- The legacy agentic runtime has been ported into the mediator under `backend/agentic/`; ongoing work focuses on stability and integration follow-through.
- In progress: grouping helpers for list and box detail item payloads to support summarized responses.

## Progress Updates
- **Agentic search planner query-priority guidance refresh**: updated planner instructions to prioritize exact product-name queries, then exact-name-plus-missing-attribute queries, allow only one fallback variant, and explicitly avoid forced `site:`/domain-constrained query construction; planner source-list context is now marked optional in prompt composition to preserve recall while keeping the response contract unchanged.
<!-- TODO(agentic-review-context-transcript): Revisit directive summary shape if structured review metadata replaces composed notes. -->
- **Agentic review-context transcript bootstrap**: item flow now writes an initial `review-context` transcript section immediately after writer initialization (before shopware and other early exits), storing normalized reviewer notes, skip-search state, and concise missing/unneeded directive counts with capped note length and guarded logging.
<!-- TODO(agentic-pricing-telemetry): Revisit threshold defaults after collecting confidence/evidence distributions. -->
- **Pricing decision-tree hardening**: documented explicit price-source precedence (`directListingPrice` -> `trustedHistoricalPrice` -> `null`), disallowed implicit zero-price acceptance, added confidence/evidence gating for non-null outputs, enriched pricing parse logs with source URL + parse status, and added edge-case tests for empty/conflicting/malformed/zero pricing payloads.
<!-- TODO(agentic-prompt-templates): Bump fragment versions + snapshots whenever shared policy text changes. -->
- **Shared prompt fragment templates + version telemetry**: extracted duplicated role/output/error/example guidance into reusable prompt-template fragments, kept role prompts focused on explicit deltas, logged per-run shared template versions during composition, and added snapshot coverage to detect unintended prompt drift.
<!-- TODO(agentic-search-dedupe-heuristics): Re-tune domain cap/diversity thresholds once retrieval quality telemetry stabilizes. -->
- **Agentic search traffic dedupe + taxonomy guardrails**: normalized and deduplicated planner queries before execution, blocked taxonomy/internal-category targeted web lookups in favor of product-fact searches, deduplicated sources by domain+title+URL hash with per-domain caps, introduced vendor-diversity ordering heuristics, and added per-run retrieval metrics (`uniqueQueries`, `uniqueDomains`, `duplicateSuppressionCount`) plus focused tests for taxonomy rejection and dedupe behavior.
- **Agentic search-link persistence for runs**: persisted normalized/deduplicated search source links (`LastSearchLinksJson`) on `agentic_runs` updates so reviewer and diagnostics workflows can inspect evidence URLs after completion, with guarded serialization logging and focused result-handler coverage.
<!-- TODO(agentic-schema-contract): Keep prompt docs and validators aligned when schema fields change. -->
- **Agentic canonical Spezifikationen schema contract**: simplified to one shared item-structure contract across extraction/categorization/supervision prompts and validators, removed envelope versioning complexity, and now injects canonical schema text through prompt placeholders so agents receive the contract inline with key telemetry + compatibility tests retained.
- **Spezifikationen boundary normalization hardening**: centralized Spezifikationen→Langtext normalization at extraction validation boundary with structured from/to type telemetry (`fromType`, `toType`, `keysCount`) and explicit validation issues for non-normalizable payload shapes to reduce retry drift and generic failures.
<!-- TODO(agentic-review-spec-field-ui): Revisit selector affordances after reviewer telemetry confirms usage patterns. -->
- **Supervisor dual-category gating in extraction**: added an explicit second-category requirement gate so supervisor PASS now allows null `_B` fields for single-category payloads, enforces complete/distinct `_B` fields only when explicitly requested, and logs structured decision-path context (including guarded error handling) for category validation outcomes.
- **Categorizer↔supervisor second-category alignment simplification**: kept the stage contract lightweight by honoring explicit `requiresSecondCategory` flags when present while retaining fallback behavior and structured supervisor validation logs to reduce conflicts with minimal code growth.
- **Agentic review spec-field selectors in UI**: derived normalized Langtext spec fields for review flows, added minimal field-selection modal support for unnecessary/missing specs with fallback logging, and covered selected-field to payload mapping via focused component-level tests.
<!-- TODO(agentic-review-unneeded-spec): validate analytics consumer readiness for the new unneeded_spec signal. -->
- **Agentic unneeded-spec review signal contract**: added shared/FE/BE support for structured `unneeded_spec` arrays alongside `missing_spec`, normalized and persisted both lists through manual review and history paths, and extended logs with count-only review signal metrics.
- **Agentic invoker review-directive composition**: updated invocation review normalization to consume `notes`, `missing_spec`, and `unneeded_spec`, compose deterministic directive text in `reviewNotes` transport, and add defensive normalization telemetry with focused payload-shaping tests.
<!-- TODO(progress-updates): regroup the summary with each milestone and keep the detailed log in RECENT_HIGHLIGHTS. -->
- **Todo backlog refinement from review feedback**: incorporated clarified decisions (run-start ignore policy, qty=0 explicit-navigation visibility, review-driven shop approval), removed non-codebase full-image-backup scope, and tightened remaining open questions for next-step planning.
- **Todo backlog prioritization pass**: rewrote `todo.md` into a priority-ordered backlog with per-task reason/goal statements and a dedicated open-questions section to support incremental planning before implementation.
- **Review automation zero-sample threshold clarity**: replaced sentinel `Number.MAX_SAFE_INTEGER` thresholds with explicit zero-count thresholds for empty review samples and guarded trigger evaluation behind `sampleSize > 0`, keeping logs readable while preserving non-trigger behavior with no data.
- **Agentic reviewer placeholder wiring in stage prompts**: added extraction/categorizer/supervisor reviewer placeholder tokens directly to prompt templates so existing fragment assembly now injects reviewer guidance without new orchestration layers, with stage-level placeholder presence/replacement tests for regression safety.
- **Agentic review intent clarity + per-step telemetry**: replaced checklist prompts with explicit German reviewer questions for description, kurztext, unnecessary/missing specifications, and dimensions, mapped each step to stable internal signal keys without schema changes, and added per-step completion/abort logs to improve drop-off visibility while preserving sequential checklist→note flow.
- **Agentic review checklist-first ordering + stage telemetry**: reordered review prompts so structured checklist questions complete before optional notes, kept the existing review payload keys (`notes`, booleans, `missing_spec`) intact, added checklist-stage logging (`checklistStarted`, `checklistSubmitted`, `noteProvided`), and wrapped review open/submit flow in guarded try/catch handling while preserving user-abort exits.
- **Agentic review lifecycle determinism**: split checklist submissions into pending-only transitions, enforced finalize transitions (`close` or explicit decision) to persist approved/rejected states with matching run status updates, and added guarded transition/error logging plus focused lifecycle integration tests to prevent lingering pending states.
- **Prompt-injection review signal semantics alignment**: updated reviewer checklist wording to explicit plausibility/formatting/missing-info/dimension-missing prompts, mapped answers onto existing structured flags without schema growth, added normalized signal-count logging in frontend/backend handlers, and covered mapping/normalization behavior with focused tests.
- **Manual review history persistence parity**: wired `/agentic/review` and `/agentic/close` manual paths to persist normalized review-history entries with non-blocking error handling, added signal-count logging for manual history writes, and aligned event resources so `AgenticReviewSubmitted` has explicit level/topic metadata.
- **Manual review history status fallback fix**: prevented checklist review history inserts from writing null `Status` by falling back to existing run status (`review`) when no final decision status is set, and clarified transition logs with a `stateChanged` flag for pending-to-pending updates.
- **Checklist review auto-finalization**: switched `/agentic/review` checklist submissions to resolve an immediate final decision (`approved` when no negative signals, `rejected` when any negative signal exists), keeping history/event persistence aligned with the final state and adding derived-decision logging context.
- **Agentic close finalization flow hardening**: unified close-note prompt completion under a single `Review Abschliessen` action, treated explicit cancel as user-abort, derived and submitted binary final decisions (`approved`/`rejected`) from review automation signals, and added structured close start/complete/abort/error logging without changing backend contracts.
- **Agentic review completion UX simplification**: removed the empty-note reconfirmation loop, finalized the review-note modal labels for direct completion, and added focused submit telemetry (`hasNote`) while keeping the existing `notes` and structured flag payload contract unchanged.
- **Agentic review evidence-first dialog layout**: reworked review prompts into sectioned data cards (Artikelbeschreibung/Kurzbeschreibung, Langtext key-value preview, Maße/Gewicht) with emphasized question rows, responsive large-dialog constraints, and guarded preview-format fallbacks with section-scoped warning logs.
- **Agentic checklist-only review flow**: replaced binary approve/reject entry with a single review CTA, captured structured checklist payload submission in one flow, and extended backend review handling/logging for non-binary `action: 'review'` submissions while preserving existing review metadata fields.
- **Agentic reviewed-example prompt injection**: added same-subcategory latest-approved example selection with redaction + payload caps, wired `{{EXAMPLE_ITEM}}` prompt assembly fallback behavior, and added focused selector tests for hit/miss/truncation paths.
- **Agentic reviewed-example query hardening**: updated invoker example selection to resolve review decision and review timestamp columns dynamically (`ReviewState`/`LastReviewDecision`, `LastModified`/`UpdatedAt`) with scoped fallback logging so startup remains stable across migration states.
- **Agentic subcategory review automation signals**: added last-10 reviewed-event aggregation by subcategory with proportional low-volume thresholds, low-confidence telemetry, trigger booleans, top missing-spec keys, and focused boundary tests.
- **Agentic review loop transparency**: captured structured review booleans/missing-spec notes from the UI, aligned trigger payload contracts, and surfaced agent-card percentage/trigger metrics with denominator context plus graceful fallback UI tests.
- **Prompt placeholder assembly hardening**: added deterministic multi-fragment placeholder resolution for review-stage placeholders, note sanitization safeguards, fragment-count/length logging, and focused tests for append/fallback/failure behavior.
- **Agentic review signal contract hardening**: aligned frontend/backend review metadata with deterministic boolean/null signals, added capped+deduped `missing_spec` normalization, and covered malformed/legacy payload paths with focused tests and sanitized logging.
- **Agentic review history retention**: added append-only persistence for per-run review events while keeping latest review fields on `agentic_runs`, with non-blocking history-write logging and focused handler/aggregation tests.
- **Agentic human-only review history persistence**: restricted review-history inserts to explicit human review actions while keeping agent completion state updates intact, added suppression logging for non-human review metadata, and covered supervisor-note suppression with focused result-handler tests.
- **Agentic extraction prompt guardrails**: clarified that `Spezifikationen` is an open object for additional evidence-backed keys and tightened anti-placeholder guidance with matching tests to boost technical detail capture.
- **QR scan & navigation polish**: streamlined the landing scan entry, return-to flows, and destination routing for item/box/shelf scans with validation/logging baked in.
- **QR scan callback routing**: added a callback-driven scan mode for search-triggered scans so QR results navigate directly to item/box detail pages while keeping return navigation for relocation flows.
- **QR scan intent handoff contract**: added optional `intent` metadata (`add-item`, `relocate-box`, `shelf-add-box`) across scanner entry/return flows so box-detail and relocation handlers can avoid cross-flow payload consumption with legacy fallback logging.
- **QR return ownership fix**: box detail now leaves non-item (`S-`/`B-`) QR return payloads for relocation handlers while adding explicit consume/ignore telemetry and safer state-clearing error logging.
- **Agentic pipeline & identifiers**: consolidated around Artikel_Nummer-only identifiers, tightened run orchestration/queueing, and added logging to make migrations and recovery safer.
- **Agentic search evidence limit alignment**: restored the default extraction follow-up search allowance to three queries, added truncation telemetry with requested-vs-effective limits, and refreshed focused limit tests.
- **Imports/exports & data contracts**: grouped export modes for ERP vs backup, normalized CSV headers and media paths, and strengthened import validation with clearer diagnostics.
- **UI layout & media/printing**: refined item/box detail layouts, media handling, and print label flows while keeping responsive behaviors consistent.
- **Ops/testing guardrails**: captured failing test notes, improved test harness diagnostics, and documented logging/infra updates for smoother operations.
- **Agentic search sanitization tuning**: preserved spec-like lines (dimensions, weights, power/voltage, price/model hints) during source cleanup and added focused tests/logging to improve missing-schema recovery without broad prompt growth.
- **Agentic Spezifikationen prompt alignment**: switched LLM-facing prompt/schema wording to `Spezifikationen` while keeping internal `Langtext` contracts, added guarded key remapping around item-flow LLM payloads, and refreshed focused extraction tests for Spezifikationen-to-Langtext normalization behavior.
- **Langtext value contract hardening**: standardized structured `Langtext` payloads to support `string` + `string[]` values end-to-end, added parser normalization telemetry for dropped/converted values, and expanded focused contract/parse tests to prevent drift across backend/frontend helpers.
- **Agentic prompt format determinism**: removed non-JSON comment noise from item-format prompt fixtures, documented the Spezifikationen/Langtext mapping in prompt prose, and added parseability coverage in schema tests.
- **Extraction spec telemetry**: added Langtext/Spezifikationen key-count logging to detect placeholder-only payload regressions earlier.
- **Box list filter/sort parity**: aligned box list search with Box-ID/location terms, added date-based sorting options, and surfaced per-box item-count plus total-weight aggregates for faster inventory triage.

Detailed progress notes have been moved to `docs/RECENT_HIGHLIGHTS.md`.

## Documentation Map

- **Architecture & data flow** → [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- **Current plans & next steps** → [`docs/PLANS.md`](PLANS.md)
- **Known issues & bugs** → [`docs/BUGS.md`](BUGS.md)
- **Recent changes** → [`docs/RECENT_HIGHLIGHTS.md`](RECENT_HIGHLIGHTS.md)
- **Setup & operations** → [`docs/setup.md`](setup.md)
- **Category taxonomy data** → [`docs/data_struct.md`](data_struct.md)
