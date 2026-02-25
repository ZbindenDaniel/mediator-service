# Mediator Service

Mediator Service is the warehouse operations backbone for inventory tracking, ERP handoff, and AI-assisted item enrichment. It combines a TypeScript/Node.js backend, a React frontend, and shared data contracts so inventory data stays consistent from scan to export.

## Why this project exists

The system reduces manual work and inventory mismatches by keeping one operational source of truth across:
- **Warehouse operations**: locate items quickly, scan boxes/shelves, move stock, and print labels.
- **Backoffice workflows**: ingest and export CSV data for ERP-driven processes.
- **Data quality workflows**: enrich partially known items with agentic assistance and human review before publication.

## Core functionality

### Inventory and storage management
- Track item references (`ItemRef`) and concrete instances (`itemInstances`) with box assignments and stock signals.
- Maintain box (Behälter) and location structures for physical retrieval.
- Support bulk and single-item inventory operations through API actions and UI flows.

### CSV import/export and ERP sync support
- Import structured inventory data from CSV pipelines.
- Export inventory in dedicated regimes (manual/operator-friendly vs ERP/automatic contracts).
- Stage ERP sync flows from backend actions and scripts, including media-mirroring support used in sync operations.

### Agentic enrichment and review workflow
- Run AI-assisted extraction/categorization/pricing flows for incomplete item data.
- Preserve review checkpoints so human reviewers can approve, reject, or refine results.
- Keep prompt/output handling deterministic with schema validation and reliability guardrails tracked in project docs.

### QR scanning and print workflows
- Generate and consume QR payloads for box/location navigation.
- Support scanner-driven routing in the frontend.
- Integrate print template assets used for labels and warehouse handling.

## Repository layout

- `backend/` — API actions, persistence, integrations, and agentic orchestration.
- `frontend/` — React UI for operations, scanning, and review tooling.
- `models/` — shared TypeScript contracts used across backend and frontend.
- `docs/` — architecture, setup, planning notes, known issues, and highlights.
- `scripts/` — build/test/verification helpers and operational scripts.

## Current product focus

The active roadmap and progress tracking live in:
- `OVERVIEW.md` (root task tracker)
- `docs/OVERVIEW.md` (high-level project status + documentation map)

Current priorities are:
- deterministic ERP sync behavior
- stable and reviewable agentic output contracts
- incremental UX polish for operational inventory flows

## Quick start (local)

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.example .env
```

3. Start local services:

```bash
docker compose up -d
```

4. Build and run:

```bash
npm run build
npm start
```

The compiled backend serves frontend assets from `dist/frontend/public`.

## Common commands

```bash
npm run build   # compile TypeScript, bundle frontend, copy public assets
npm start       # run compiled server
npm test        # run prebuild checks and the test harness
npm run smoke   # run HTTP/HTTPS smoke checks
```

## Documentation map

- Setup and environment: [`docs/setup.md`](docs/setup.md)
- Architecture and data flow: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Current plans: [`docs/PLANS.md`](docs/PLANS.md)
- Known issues: [`docs/BUGS.md`](docs/BUGS.md)
- Recent highlights: [`docs/RECENT_HIGHLIGHTS.md`](docs/RECENT_HIGHLIGHTS.md)

## Contributor notes

- Keep changes scoped and prefer existing mediator patterns over new abstractions.
- If you modify shared contracts, verify alignment across `models/`, backend usage, and frontend usage.
- Extend existing logging/error-handling paths for operationally relevant flow changes.

<!-- TODO(agent): Keep this functionality overview aligned with docs/OVERVIEW.md when core workflows shift. -->
<!-- TODO(agent): Revisit quick-start once multi-node/service-split deployment guidance is finalized. -->
