# Improvements backlog

## Short term
- CSV template download
  - Add endpoint `GET /api/template/csv` that returns a header-only CSV (optionally with 1–2 example rows).
  - Link it from `/ui/import` as “Vorlage herunterladen”.

- Label queueing rules
  - Decide: queue label for (a) every imported item, (b) only new items, or (c) only when a checkbox is ticked in the form.
  - Implement at:
    - Single item: in `/ui/api/import/item` after upsert -> `queueLabel.run(ItemUUID)`
    - CSV import: in `ops/30-queue-label.js` (already queues) or behind a flag.

- Field help / validation hints (DE)
  - Show small helper text for UUID, AttributesJson (JSON), and WMS link formats.

## Medium term
- Roles / auth
  - Simple shared secret or local IP allowlist for write operations.
  - CSRF token for form posts.

- History visibility
  - Show recent events directly on `/ui/item/:uuid` and `/ui/box/:id`.

- Better search
  - Add search by description / BoxID with `LIKE` and simple pagination.

- Export formats
  - Add `text/csv` export in addition to JSON at `/api/export/wms`.

- Settings
  - UI to set `BASE_QR_URL`, printer host/port, and toggle auto-queue labels.

## Long term
- Schema evolution
  - Migrations (keeping data), versioned attributes.
- Bulk edits
  - Web UI to move many items between boxes.
