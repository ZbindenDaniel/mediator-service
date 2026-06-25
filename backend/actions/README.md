# backend/actions/

## Purpose
HTTP action handlers — one file per API endpoint. The action boundary between HTTP and domain logic.

## Contents

**Item operations**
- `add-item.ts`, `save-item.ts`, `edit-item-instance.ts`, `import-item.ts` — create/update items
- `list-items.ts`, `item-adjacent.ts` — list and navigate items
- `remove-item.ts`, `delete-entity.ts` — delete items and entities
- `bulk-delete-items.ts`, `bulk-move-items.ts`, `bulk-update-ref-fields.ts` — bulk operations
- `quality-review.ts` — save quality assessment answers
- `spec-gap.ts` — identify missing specification fields

**Box / storage**
- `create-box.ts`, `box-detail.ts`, `list-boxes.ts`, `move-box.ts` — box management
- `create-stub.ts`, `list-stubs.ts` — uncatalogued shelf stubs
- `move-item.ts` — relocate items between boxes

**Agentic pipeline**
- `agentic-trigger.ts`, `agentic-cancel.ts`, `agentic-restart.ts`, `agentic-delete.ts` — run lifecycle
- `agentic-status.ts`, `agentic-health.ts`, `agentic-request-context.ts` — observability
- `agentic-bulk-queue.ts`, `agentic-bulk-restart-failed.ts` — batch operations
- `agentic-trigger-failure.ts` — failure reporting endpoint

**Import / export**
- `csv-import.ts`, `validate-csv.ts` — CSV ingestion
- `export-items.ts`, `export-data.ts` — export to backup or ERP format
- `sync-erp.ts` — manual ERP sync trigger

**Printing**
- `print-item.ts`, `print-box.ts`, `print-label.ts`, `print-unified.ts` — label print requests
- `admin-label-queue.ts` — label queue management
- `admin-printer-queues.ts`, `admin-printer-settings.ts` — CUPS configuration
- `printer-status.ts` — printer health

**Intake station**
- `intake-start.ts`, `intake-categories.ts`, `intake-answer.ts`, `intake-complete.ts` — cataloguing flow

**Media / attachments**
- `item-attachments.ts`, `item-external-docs.ts`, `item-external-docs-write.ts` — file management
- `media-health.ts` — storage health check

**Spare parts**
- `catalog-spare-part.ts` — catalog a disassembled part
- `remove-from-device.ts` — mark part as removed from parent device
- `item-relations.ts` — manage accessory/spare-part links

**Other**
- `search.ts`, `material-number.ts` — search endpoints
- `searchShopware.ts` — Shopware product search proxy
- `qr-scan.ts` — QR code scan handling
- `recent-activities.ts`, `overview.ts` — dashboard data
- `user-marks.ts` — per-user item bookmarks
- `chat.ts` — AI assistant chat
- `contracts.ts` — serve JSON contracts to frontend
- `health.ts` — server health check
- `admin-config.ts`, `admin-nightly-erp-sync.ts` — admin controls
- `index.ts` — action loader: maps routes to handlers

## Relations
- Delegates to: `../lib/` (domain logic), `../agentic/` (enrichment), `../db.ts` / `../db-client.ts` (persistence)
- Loaded by: `../server.ts` via `loadActions()`

## Scope
HTTP boundary only. Handlers validate inputs and return responses. Business logic belongs in `../lib/` or `../agentic/`. No DB calls except through helpers.

## Rules
- One exported handler per file
- File name must reflect the endpoint it serves (e.g., `move-item.ts` → `POST /api/items/:id/move`)
- No shared mutable state between handlers

## Decisions
- **Flat file structure over sub-folders**: the volume of actions is manageable as a flat list; sub-folders would add navigation overhead with little grouping benefit
