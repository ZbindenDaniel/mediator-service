# backend/

## Purpose
Express HTTP server — action handlers, database access, agentic pipeline, scheduled workers, and all server-side business logic.

## Contents
- `server.ts` — HTTP/HTTPS server bootstrap, inbox watcher, worker startup
- `config.ts` — all environment variables in one place; consumed everywhere
- `db-client.ts` — Postgres connection pool, `query`/`queryOne`/`execute`/`withTransaction`
- `db.ts` — higher-level DB helpers and item persistence functions
- `importer.ts` — CSV ingestion coordinator
- `labelpdf.ts` — PDF label rendering
- `print.ts` — print job dispatch
- `publicResolver.ts` — resolves public-facing media URLs
- `actions/` — HTTP action handlers (one file per endpoint)
- `agentic/` — AI enrichment pipeline
- `contracts/` — runtime contract registry (loaded from root `contracts/` JSON files)
- `lib/` — domain service utilities (media, quality, labels, langtext, CO₂, etc.)
- `ops/` — numbered CSV import pipeline stages
- `shopware/` — Shopware/ERP HTTP client and queue
- `utils/` — general utilities (CSV, date, string helpers)
- `workers/` — background schedulers

## Relations
- Depends on: `../models` (shared TypeScript types), `../contracts/` (runtime JSON contracts)
- Depended on by: `../frontend` (via HTTP `/api/*`)
- External: Postgres DB, CUPS print server, Shopware ERP, Tavily search API

## Scope
All server-side code lives here. No presentation logic. No direct frontend imports.

## Rules
- All DB calls go through `db-client.ts` — no raw `pg` imports elsewhere
- Action handlers in `actions/` are thin: validate → delegate to `lib/` or `agentic/`
- Config values come from `config.ts` — no `process.env` reads outside that file
- One action file per HTTP endpoint

## Decisions
- **Postgres over SQLite**: migrated for concurrent write support required by the agentic queue — multiple runs can be dispatched and updated simultaneously
- **Hand-rolled action loader** (`loadActions()`): avoids framework lock-in; each action is a plain async function exported from a single file
- **No ORM**: query builder complexity exceeded benefit for this schema size; raw parameterized SQL is explicit and auditable
