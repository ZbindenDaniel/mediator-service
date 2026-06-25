# scripts/

## Purpose
One-off maintenance, migration, and debugging scripts — not part of the production server.

## Contents
- `migrate-sqlite-to-postgres.ts` / `.js` — data migration from the legacy SQLite database to Postgres
- `fix-integer-columns.ts` / `.js` — DB column type repair (run after Postgres migration)
- `media-migration.py` — migrates media files to the new directory layout
- `dump-agentic-search-events.ts` — debug: dumps agentic search event fixtures from DB for analysis
- `smoke-server.ts` — production smoke test: starts server, checks key endpoints, exits
- `build.js` / `prebuild.js` — frontend asset build helpers (run via `npm run build`)
- `run-tests.js` — test runner wrapper
- `reploy.sh` — redeploy helper script for the production server
- `license-inventory.js` — audits third-party license usage

## Relations
- `migrate-sqlite-to-postgres.ts` depends on: `../backend/db-client.ts`, SQLite file
- Most scripts are standalone — run with `npx ts-node scripts/<name>.ts` or `node scripts/<name>.js`

## Scope
Operational tooling only. Not imported by backend or frontend code.

## Rules
- Scripts are one-shot or diagnostic — they should be safe to run multiple times (idempotent) or document clearly if they are not
- Completed migration scripts stay in the repo for reference (document when they were last needed)
