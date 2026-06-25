# models/

## Purpose
Shared TypeScript type definitions — the single source of truth for data shapes used by both backend and frontend.

## Contents
- `item.ts` — Item, ItemRef, ItemInstance, field definitions
- `item-detail.ts` — ItemDetail view shape (joined query result)
- `item-relation.ts` — accessory / spare-part relationships between items
- `item-categories.ts` / `item-category-lookups.ts` — category taxonomy
- `box.ts` / `box-detail.ts` / `box-colors.ts` — Box, Shelf, Location types
- `agentic-run.ts` — AgenticRun record, input/output types
- `agentic-statuses.ts` — run status constants and terminal-status set
- `agentic-orchestrator.ts` — orchestration input/output contracts
- `agentic-request-log.ts` / `agentic-run-review-history.ts` — audit log types
- `quality.ts` / `quality-contract.ts` / `spec-contract.ts` — quality assessment and spec contract shapes
- `disassembly-contract.ts` — spare-parts disassembly contract shape
- `co2.ts` — CO₂ impact scoring types
- `event-log.ts` / `event-labels.ts` / `event-resources.json` — event log display metadata
- `intake.ts` — intake station state and step types
- `external-doc.ts` / `item-attachment.ts` — file attachment types
- `label-job.ts` / `print-label.ts` — print job types
- `entity.ts` — generic entity reference (item | box | stub)
- `shelf-locations.ts` / `default-shelf-locations.ts` — location lookup types
- `create-box.ts` — box creation input type
- `index.ts` — re-exports everything

## Relations
- Depended on by: all of `backend/`, all of `frontend/`
- No runtime dependencies — types only

## Scope
Type definitions and constants only. No business logic, no DB queries, no HTTP calls.

## Rules
- All new types go here (not inline in backend or frontend files)
- Constants that must match between backend and frontend (status codes, enum values) belong here
- No imports from `backend/` or `frontend/`

## Decisions
- **Single shared models package**: avoids type drift between backend API responses and frontend consumption; a type change in one place breaks both sides at compile time
