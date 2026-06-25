# cups/

## Purpose
CUPS print server Docker image — provides label printing for Brother QL and other supported printers on the local network.

## Contents
- `Dockerfile` — CUPS image definition; installs drivers, ptouch-ql, ghostscript
- `cupsd.conf` — CUPS daemon configuration (listen address, access policy)
- `queues.conf` — print queue definitions loaded at startup
- `entrypoint.sh` — container startup: installs queues, polls for a refresh signal, runs lpinfo on demand
- `drivers/` — place custom `.deb` printer driver files here (e.g. proprietary Brother packages); empty in repo
- `ppds/` — PPD driver description files for specific printer models

## Relations
- Used by: `backend/actions/admin-printer-queues.ts`, `backend/actions/printer-status.ts`
- Backend communicates via: `backend/lib/cups-client.ts` (CUPS HTTP API on port 631)

## Scope
Print server only. Label content and PDF rendering live in `backend/labelpdf.ts` and `frontend/public/print/`. This container receives rendered PDFs via `lp`.

## Rules
- QL-series printers using the open-source `ptouch-ql` driver work without any files in `drivers/`
- Proprietary drivers (QL-800, QL-1100) go in `drivers/` — they are `.deb` packages installed during image build
- PPD files in `ppds/` are referenced by queue definitions in `queues.conf`

## Decisions
- **Separate Docker container for CUPS**: CUPS requires a persistent root daemon; running it inside the main Node container was not viable; the separate container also makes driver installation independent of app deploys
- **entrypoint.sh hot-reload**: CUPS caches device discovery for 60 s by default; the polling signal mechanism allows the UI "Scannen" button to force an immediate `lpinfo` without restarting the container
- **ptouch-ql over proprietary Brother driver**: the open-source driver covers QL-500/550/560/570/580/700 without binary packages; covers the QL-560 in production use

## See also
- [docs/detailed/printing.md](../docs/detailed/printing.md) — end-to-end print flow
- [docs/detailed/printer-server-setup.md](../docs/detailed/printer-server-setup.md) — Raspberry Pi CUPS setup
