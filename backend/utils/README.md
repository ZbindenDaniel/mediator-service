# backend/utils/

Backend utility modules — auth, settings, CSV helpers, print client, intake auth, queue sync.

## Files
- `actor.ts` — `resolveActor(ctx, requestActor)`: the logged-in username wins over a client-sent actor name (audit trail)
- `admin-auth.ts` — admin access: logged-in platform admin, or the `ADMIN_SECRET` bearer (break-glass; reachable only from inside the host when Authentik is on)
- `app-shell.ts` — serves index.html / bundle.js / bundle.css with `Cache-Control: no-cache` + ETag, so browsers pick up a new frontend after a deploy (304 when unchanged)
- `app-settings.ts` — reads and writes runtime app settings (printer config, sync toggles) persisted in the DB
- `csv-utils.ts` — CSV parsing and serialization helpers used by import/export actions
- `cups-client.ts` — wraps CUPS commands (`lp`, `lpstat`, `lpadmin`, `lpinfo`) for the print subsystem
- `intake-auth.ts` — validates intake station device tokens
- `write-guard.ts` — handler-level tenancy checks: `guardWrite` / `guardWriteMany` (403 for another org's item/box/catalogue entry, all-or-nothing for bulk) and `guardCreate`; skips the owner lookup for unrestricted requests
- `require-identity.ts` — `AUTH_REQUIRED` gate: data routes 401 without a forward-auth identity
- `sync-printer-queues.ts` — reconciles configured printer queues against live CUPS queues

## Relations
- Used by: `backend/actions/` (most action handlers), `backend/workers/`
- See also: [`docs/changelogs/printing.md`](../../docs/changelogs/printing.md)
