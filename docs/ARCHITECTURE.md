# Architecture

How the pieces fit together. Per-domain detail lives in the runbooks under
[`detailed/`](detailed/README.md); folder-level rules and decisions in each folder's `README.md`.

```
 browser (React SPA, scanners)        intake station (netboot)        Brother QL printers
            │  /api/*                            │ /api/intake/*                ▲
            ▼                                    ▼                              │ lp
 ┌──────────────────────────── backend (Node http) ───────────────────────┐   CUPS
 │ server.ts → action loader → actions/<endpoint>.ts → db.ts / lib/ / agentic/ │──┘
 │ background loops: print queue · agentic dispatcher · Shopware worker ·     │
 │                   nightly ERP sync · CSV inbox watcher                     │
 └───────┬───────────────────────┬──────────────────────┬─────────────────────┘
         ▼                       ▼                      ▼
     Postgres            media (local / WebDAV)    external: Ollama/OpenAI, Tavily,
                                                   kivitendo ERP, Shopware
```

## Principles

- **One action per endpoint.** `backend/server.ts` loads every module in `backend/actions/` and routes
  requests to it. Actions validate, delegate to `db.ts`/`lib/`/`agentic/`, log, and shape errors.
  No web framework — plain `http`/`https` servers.
- **Shared types.** `models/` is imported by backend and frontend alike, so a contract change breaks
  both sides at compile time.
- **Contracts as data.** Quality questions, required spec fields, assembly slots and CO₂ thresholds
  are JSON files in `contracts/`, loaded at runtime by `backend/contracts/` and served to the UI and
  the intake station. Adding a subcategory contract needs no code change.
- **References vs instances.** `item_refs` (one row per Artikel-Nummer) holds product data and is
  what the agentic pipeline enriches and what ERP/Shopware receive; `items` (one row per unit, keyed by
  `ItemUUID`) holds stock, location, identifiers and condition.
- **Everything persistent is in Postgres** (`DATABASE_URL` required). Background queues (print jobs,
  agentic runs, Shopware sync) are tables, claimed with `FOR UPDATE SKIP LOCKED`, so several app
  instances can share one database (see *Running several instances* below).
- **Schema is created and migrated in code.** `initDb()` in `backend/db.ts` runs `CREATE … IF NOT EXISTS`
  then additive `ALTER … ADD COLUMN IF NOT EXISTS` on every start. Indexes on added columns must come
  after the `ALTER` that adds them.

## Backend

| Path | Role |
|---|---|
| `server.ts` | HTTP(S) server, action loader, static UI, help pages, background loops |
| `config.ts` | Environment parsing ([ENVIRONMENT.md](ENVIRONMENT.md)) |
| `db-client.ts` / `db.ts` | Pool + `query`/`withTransaction`; schema init and persistence helpers |
| `actions/` | One file per endpoint |
| `agentic/` | Enrichment pipeline: queue, invoker, flow stages, prompts, tools |
| `lib/` | Domain helpers: media, external docs, quality, langtext, CO₂, components, labels |
| `importer.ts`, `ops/` | CSV ingestion pipeline |
| `print.ts`, `labelpdf.ts` | Label rendering (HTML template → PDF via Chromium) and `lp` dispatch |
| `shopware/`, `workers/` | Shopware clients and the sync-queue worker |
| `scripts/erp-sync.sh` | kivitendo CSV import, invoked by `/api/sync/erp` |

### Background loops (started in `server.ts`)

| Loop | What it does |
|---|---|
| Print worker (750 ms) | Sends queued label jobs to CUPS |
| Agentic dispatcher | Promotes `queued` runs to `running` up to the concurrency cap; resumes interrupted runs on start; optional keep-busy feeder and `AUTO_REWORK` idle sweeper |
| Shopware worker | Only with `SHOPWARE_SYNC_ENABLED`; pushes queued product/stock changes |
| Nightly ERP sync (60 s poll) | Once per UTC day at `ERP_NIGHTLY_SYNC_HOUR`, if enabled in `system_settings`; see [nightly-erp-sync](detailed/nightly-erp-sync.md) |
| Inbox watcher | Imports CSVs dropped into `INBOX_DIR` |

`system_settings` is a key/value table for runtime toggles that admins flip in the UI (nightly sync,
keep-busy feeder, printer settings). Add new toggles there rather than new tables.

### Running several instances

Several instances on one database are safe: each queue row is claimed atomically, so nothing is
processed twice. Caveats:

- **Labels print wherever they're claimed.** Every instance polls `label_queue` and prints to its own
  CUPS queue; a job can't be targeted at a printer or location yet.
- **The agentic concurrency cap is per instance**, so the effective global cap is N × cap.
- Instances have no identity, registration or liveness tracking.

## Frontend

React 18 + `react-router-dom`, bundled with esbuild (`frontend/bundle.js`), served by the backend from
`dist/frontend/public`. Routes are in `frontend/src/components/App.tsx`; the main layout is a list on the
left and a tabbed detail panel on the right (single column on mobile). API calls go through
`frontend/src/data/`. Print templates are plain HTML in `frontend/public/print/`, rendered by the backend
for both preview and printing. See [frontend/README.md](../frontend/README.md).

## Media

- Item photos: `MEDIA_STORAGE_MODE=local` → `dist/media`; `webdav` → `<MEDIA_ROOT_DIR>/shopbilder`
  (a mounted filesystem path, never a URL). The ERP mirror uses `<MEDIA_ROOT_DIR>/shopbilder-import`.
- External documents (wipe reports, test results, datasheets) are read from mounts configured in
  `ALT_DOC_DIRS_FILE`, keyed by serial, MAC, EAN or Artikel-Nummer.
- Runtime code never bulk-deletes in media roots; cleanup is an explicit operator script.

Details: [media-storage](detailed/media-storage.md).

## Auth (current state)

Shared secrets only: nginx Basic Auth at the proxy, `ADMIN_SECRET` for `/api/admin/*`, `INTAKE_TOKEN`
for `/api/intake/*`. The operator name is typed into the browser and sent as `actor`. Authentik runs
in the Compose stack but is not enforced yet (todo 33c).
