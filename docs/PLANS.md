# Plans & Next Steps

This document tracks active planning items and near-term opportunities. Keep the overview lean by updating detailed plans here.

## Multi-step Plan: Item Instance = 1

Goal: treat item instances as a single canonical record so inventory, exports, and agentic flows converge on the same source of truth while keeping UI workflows simple. Reason: reduce duplicate state, minimize incidental data divergence, and keep changes minimal by adapting existing structures instead of adding new ones.

Checklist (re-check and update this planning doc before starting each subsequent task in the sequence):

- [x] **Grouping rules** – normalized grouping to prefer ItemUUID sequence `1` as the representative instance (fallbacks log when no canonical record is present) while keeping group keys unchanged. Reason: ensure consistent grouping across ingestion, UI, and print flows without expanding schemas.
- [ ] **Export updates** – update CSV/ZIP export mapping to emit instance `1` data and confirm partner column ordering remains stable; verify any data structure fields used by export. Reason: keep external integrations aligned while minimizing downstream churn.
- [ ] **Agentic ref changes** – adjust agentic reference lookups to resolve instance `1` and log fallbacks; validate that any model/schema changes in `models/` and `backend/src/models/` stay in sync. Reason: keep agentic enrichment and approvals anchored to the canonical record.
- [ ] **Printing rules** – align label/print payloads with instance `1` identifiers and ensure existing templates stay unchanged unless required. Reason: preserve print layout stability while avoiding duplicate labels.
- [ ] **UI grouping** – update UI list/detail grouping to surface instance `1` as the primary record with minimal UI changes; confirm user-facing labels stay consistent. Reason: keep operator workflows stable while collapsing duplicates.
- [ ] **Legacy import compatibility** – confirm the importer can accept current-system exports without data loss, documenting any mapping or transform steps and double-checking impacted data structures. Reason: enable migration of existing data while keeping changes scoped to current behavior.

TODO: capture the current-system export format details and confirm how legacy import compatibility should be validated before implementation begins.

Non-goals (unless explicitly requested): no large-scale refactors and no new data structures beyond what is required to support instance `1` grouping or legacy import compatibility.

## Upcoming Opportunities

- Sanitize print preview URLs before injecting them into the DOM to avoid potential XSS issues.
- Capture dispatched CUPS job identifiers in logs so support staff can correlate queue issues with individual label requests.
- Enforce size limits and validate content for uploaded CSV files prior to writing them to disk.
- Integrate dependency vulnerability scanning (e.g., `npm audit`) once registry access is available.

## Risks & Dependencies

- Tests and builds require the `sass` CLI. Missing or partially installed `sass` causes `sh: 1: sass: not found`, and registry restrictions may prevent installing the dependency.
- Follow tracked defects in [`docs/BUGS.md`](BUGS.md) when planning work that may intersect known regressions.
