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
<!-- TODO(progress-updates): regroup the summary with each milestone and keep the detailed log in RECENT_HIGHLIGHTS. -->
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
