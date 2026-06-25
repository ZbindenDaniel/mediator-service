# frontend/src/components/admin/

Admin panel cards — each file is a self-contained card shown on `AdminPage.tsx`.

## Files
- `AdminGate.tsx` — auth wrapper that hides admin UI from non-admin users
- `AgenticOverviewCard.tsx` — agentic queue stats and bulk controls
- `ExportCard.tsx` — manual CSV/ZIP export trigger
- `NightlyErpSyncCard.tsx` — nightly ERP sync toggle and last-run status
- `PrintQueueCard.tsx` — label print queue management
- `PrinterQueuesCard.tsx` — CUPS printer queue list, sync, diagnostics
- `PrinterSettingsCard.tsx` — printer server configuration (host, port, mode)
- `SystemStatusCard.tsx` — health check overview

## Relations
- Mounted by: `frontend/src/components/AdminPage.tsx`
- See also: [`docs/changelogs/printing.md`](../../../../docs/changelogs/printing.md)
