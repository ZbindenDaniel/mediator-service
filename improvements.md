# Improvements backlog

## Short term
- CSV template download
  - Endpoint `GET /api/template/csv` returns header-only CSV (optionally 1–2 demo rows).
  - Link on `/ui/import` as “Vorlage herunterladen”.

- Label queueing rules
  - Decide when to queue labels: (a) every import, (b) only new items, (c) user toggle.
  - Implement:
    - Single item: after upsert in `/ui/api/import/item` → `queueLabel.run(ItemUUID)` (guarded by flag or checkbox).
    - CSV import: via `ops/30-queue-label.js` or flag.

- Field help / validation hints (DE)
  - Small helper text for JSON formats (if reintroduced), WMS URL format, and Materialnummer conventions.

- Search UX
  - “Find” should also match by `BoxID`, `Description` (partial), with pagination.

- Events in UI
  - Show recent events inline on `/ui/item/:uuid` and `/ui/box/:id`.

- CSV export for WMS
  - Add `text/csv` download in addition to JSON at `/api/export/wms`.

- Settings
  - Simple config UI to set `BASE_QR_URL`, printer host/port, and toggle “auto queue label”.

## Medium term
- Auth / roles
  - Shared secret or IP allowlist for write endpoints; CSRF token for forms.

- Schema evolution
  - Lightweight migrations and versioned attributes.

- Bulk edits
  - Move many items between boxes in one action.

## Done
- Auto-generate UUID server-side if missing (and client-side helper on `/ui/import`).
