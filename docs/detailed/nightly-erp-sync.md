# Nightly ERP Sync

**Status:** Implemented  
**Owner:** `backend/server.ts` (scheduler), `backend/actions/admin-nightly-erp-sync.ts` (admin API), `backend/db.ts` (`listRefsChangedSinceSync`, `markRefsSynced`, `getSystemSetting`, `setSystemSetting`)

---

## Purpose

Automatically push changed product references to the ERP each night so the ERP catalogue stays current without manual operator intervention. Only references that have been manually synced at least once are eligible — this keeps operators in control of when a new product enters the ERP cycle.

---

## Opt-in model

An `item_refs` row participates in nightly sync only when its `LastSyncedAt` column is **not null**. The first time an operator exports a product manually (via the admin export UI), `LastSyncedAt` is written. From that point on the nightly job maintains it automatically.

This design prevents accidental ERP submissions before an operator has reviewed a new product.

---

## Detection: what triggers a sync

`listRefsChangedSinceSync()` (in `backend/db.ts`) returns Artikel_Nummern where:

- `item_refs.Shopartikel = 1` (product is marked for the shop)
- `item_refs.LastSyncedAt IS NOT NULL` (operator has approved it for the cycle — opt-in gate)
- At least one instance (`items` row) has `UpdatedAt > item_refs.LastSyncedAt` (something changed since the last sync)

Relocation-only changes currently set `UpdatedAt` and will trigger a re-sync. This is acceptable for v1 — the extra ERP round-trip is harmless and the simpler detection avoids per-column change tracking.

---

## Scheduler timing

The scheduler is a 60-second `setInterval` in `backend/server.ts`. Each tick:

1. Checks `now.getUTCHours() === ERP_NIGHTLY_SYNC_HOUR` (default: 2 AM UTC, configurable via `ERP_NIGHTLY_SYNC_HOUR` env var).
2. Checks `lastErpNightlySyncDate` — skips if already ran today.
3. Reads `erp_nightly_sync_enabled` from `system_settings` — skips if `'false'`.
4. Checks `ERP_SYNC_ENABLED` compile-time flag — skips and logs if false.
5. Calls `listRefsChangedSinceSync()`.
6. If any refs are returned: records today's date **before** the HTTP call (prevents double-trigger on slow syncs or restarts), then POSTs `{ artikelNummern }` to `/api/sync/erp`.
7. On HTTP 200: calls `markRefsSynced(artikelNummern)` to advance `LastSyncedAt`.

The in-process HTTP call reuses the same `/api/sync/erp` endpoint used by manual syncs — no separate code path.

---

## Runtime toggle

The toggle is stored in the `system_settings` database table under key `erp_nightly_sync_enabled`. On first server startup it is seeded from the `ERP_NIGHTLY_SYNC_ENABLED` environment variable (default: `false`). After that, the env var is ignored and the database value is authoritative.

Operators change the toggle from the admin page (NightlyErpSyncCard). The change takes effect within 60 seconds (next scheduler tick).

---

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `ERP_NIGHTLY_SYNC_ENABLED` | `false` | Sets the DB toggle on first startup only. Subsequent changes must be made via the admin page. |
| `ERP_NIGHTLY_SYNC_HOUR` | `2` | UTC hour at which the scheduler runs (0–23). Changing this requires a restart. |
| `ERP_SYNC_ENABLED` | (see config.ts) | Master ERP switch — nightly sync is skipped entirely when this is false. |

---

## Database schema additions

`item_refs` table:
```sql
ALTER TABLE item_refs ADD COLUMN IF NOT EXISTS "LastSyncedAt" TEXT;
```
Added idempotently in `initDb()` via a separate `execBatch` call so it is safe to run on every startup against an already-migrated database.

`system_settings` table (shared across all runtime toggles):
```sql
CREATE TABLE IF NOT EXISTS system_settings (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);
```

---

## Admin API

- `GET /api/admin/nightly-erp-sync` — returns `{ enabled: boolean }` from `system_settings`.
- `POST /api/admin/nightly-erp-sync` — body `{ enabled: boolean }`, writes to `system_settings`, returns updated `{ enabled: boolean }`.

Both routes require `Authorization: Bearer <ADMIN_SECRET>`.

---

## Logs to watch

| Log line | Meaning |
|---|---|
| `[nightly-erp-sync] No changed refs to sync` | Scheduler ran, nothing to do — all synced refs are up-to-date. |
| `[nightly-erp-sync] Starting sync { count, date }` | Sync initiated for N refs. |
| `[nightly-erp-sync] HTTP response { status: 200 }` | ERP accepted the submission; `LastSyncedAt` will be updated. |
| `[nightly-erp-sync] HTTP response { status: 4xx/5xx }` | ERP rejected — refs are NOT marked synced. Will retry the next night. |
| `[nightly-erp-sync] Request failed` | Network error reaching the local `/api/sync/erp` endpoint. |
| `[nightly-erp-sync] Skipped: ERP_SYNC_ENABLED is false` | Master ERP switch is off. |
| `[nightly-erp-sync] Scheduler error` | Unexpected exception in the scheduler tick. |

---

## Troubleshooting

**Sync never runs**
- Confirm `ERP_SYNC_ENABLED=true` and that the toggle is `true` in the admin page.
- Check `ERP_NIGHTLY_SYNC_HOUR` — the scheduler only fires at that exact UTC hour.
- Verify at least one ref has `LastSyncedAt IS NOT NULL` (has been manually synced once).

**Refs are synced but the ERP doesn't update**
- Check `[nightly-erp-sync] HTTP response` status — non-200 means the ERP rejected the payload and refs were not marked synced.
- Inspect `/api/sync/erp` logs for the underlying ERP error.

**Same refs synced every night despite no changes**
- `UpdatedAt` may be advancing on each startup or import. Check if the importer unconditionally writes `UpdatedAt` even for unchanged rows.

**New product not being synced automatically**
- Expected: the product has never been manually exported, so `LastSyncedAt IS NULL`. Trigger one manual export from the admin page to enrol it.

---

## Deferred

- **Partial success handling**: if the ERP accepts only some of the submitted refs, all are still marked synced. Fine for v1; a per-ref result map would improve this.
- **Restart recovery**: if the server restarts after `lastErpNightlySyncDate` is set but before `markRefsSynced` runs, that night's sync is lost (the in-memory guard already fired). The once-per-day window means it will retry the next night.
- **Relocation-only filter**: relocation currently sets `UpdatedAt` and triggers a re-sync even though the ERP data didn't change. Could be filtered by comparing a change fingerprint — deferred until it causes noticeable ERP churn.
