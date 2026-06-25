# backend/utils/

Backend utility modules — auth, settings, CSV helpers, print client, intake auth, queue sync.

## Files
- `admin-auth.ts` — validates admin bearer tokens from request headers
- `app-settings.ts` — reads and writes runtime app settings (printer config, sync toggles) persisted in the DB
- `csv-utils.ts` — CSV parsing and serialization helpers used by import/export actions
- `cups-client.ts` — wraps CUPS commands (`lp`, `lpstat`, `lpadmin`, `lpinfo`) for the print subsystem
- `intake-auth.ts` — validates intake station device tokens
- `sync-printer-queues.ts` — reconciles configured printer queues against live CUPS queues

## Relations
- Used by: `backend/actions/` (most action handlers), `backend/workers/`
- See also: [`docs/changelogs/printing.md`](../../docs/changelogs/printing.md)
