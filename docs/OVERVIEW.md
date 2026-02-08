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

Detailed progress notes have been moved to `docs/RECENT_HIGHLIGHTS.md`.

## Documentation Map

- **Architecture & data flow** → [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- **Current plans & next steps** → [`docs/PLANS.md`](PLANS.md)
- **Known issues & bugs** → [`docs/BUGS.md`](BUGS.md)
- **Recent changes** → [`docs/RECENT_HIGHLIGHTS.md`](RECENT_HIGHLIGHTS.md)
- **Setup & operations** → [`docs/setup.md`](setup.md)
- **Category taxonomy data** → [`docs/data_struct.md`](data_struct.md)
