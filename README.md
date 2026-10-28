# Mediator Service

Inventory and cataloguing system for a refurbishing warehouse: every device and part gets a record, a
label and a place on a shelf, is enriched by an AI pipeline with human review, and is handed off to the
ERP (kivitendo) and the web shop (Shopware).

TypeScript throughout — a Node `http` backend with Postgres, a React SPA, and shared types in `models/`.
Current version: see `package.json` (3.3.x). The UI and user help are in German.

## What it does

| Area | Summary | Runbook |
|---|---|---|
| Items | A **reference** (`item_refs`, one per Artikel-Nummer) holds product data; **instances** (`items`, one per physical unit) hold stock, location, serial/MAC, condition. | [items](docs/detailed/items.md) |
| Storage | Boxes (`B-`) on shelves (`S-`), relocation, placement scanning, stubs for uncatalogued shelf content. | [boxes](docs/detailed/boxes.md), [stubs](docs/detailed/stubs.md) |
| QR & labels | QR labels for items/boxes/shelves, printed through CUPS (Brother QL queues); camera and keyboard-wedge scanning. | [qr_codes](docs/detailed/qr_codes.md), [printing](docs/detailed/printing.md) |
| Quality & specs | Per-subcategory JSON contracts in `contracts/` drive the condition questionnaire, required spec fields and CO₂ scoring. | [contracts/](contracts/README.md), [co2-impact](docs/detailed/co2-impact.md) |
| Spare parts | Disassembly ("Zerlegen") of devices into tracked components via assembly contracts. | [spare-parts-catalog](docs/detailed/spare-parts-catalog.md) |
| AI enrichment | Queued agentic runs (Ollama or OpenAI-compatible + Tavily search) fill descriptions, specs, dimensions and price; a review wizard approves or rejects with feedback. | [agentic-basics](docs/detailed/agentic-basics.md), [review-flow](docs/detailed/review-flow.md) |
| Intake station | Netboot image scans a device and walks the operator through cataloguing via `/api/intake/*`. | [intake](docs/detailed/intake.md) |
| ERP | CSV import/export, approval-gated push to kivitendo, optional nightly sync. | [import_export](docs/detailed/import_export.md), [nightly-erp-sync](docs/detailed/nightly-erp-sync.md) |
| Shop | Queued Shopware sync: products, variants, stock, images, categories. | [shopware](docs/detailed/shopware.md) |
| Media & docs | Item photos (local or WebDAV), attachments, and per-serial external documents (wipe reports, test results). | [media-storage](docs/detailed/media-storage.md) |

## Quick start (local)

Needs Node 20 and Docker.

```bash
npm install
cp .env.example .env            # set DATABASE_URL (Postgres is required, there is no SQLite fallback)
docker compose up -d postgres   # or the full stack: postgres, cups, mediator, proxy, authentik
npm start                       # builds, then serves UI + API on http://localhost:8080
```

```bash
npm test        # prebuild checks + jest suite
npm run smoke   # HTTP/HTTPS smoke checks against a running server
```

Deployment, Docker/CI, printing and auth setup: [docs/setup.md](docs/setup.md). All environment
variables: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Repository layout

| Path | Contents |
|---|---|
| [backend/](backend/README.md) | Server, action handlers (one file per endpoint), DB access, agentic pipeline, workers |
| [frontend/](frontend/README.md) | React SPA, print templates |
| [models/](models/README.md) | Types shared by backend and frontend |
| [contracts/](contracts/README.md) | Runtime JSON contracts: quality, specs, assembly, CO₂ |
| [cups/](cups/README.md) | CUPS print-server image |
| [scripts/](scripts/README.md) | Build, test and one-off migration scripts |
| [docs/](docs/) | Architecture, setup, runbooks (`detailed/`), changelogs, plans, user help (`user/`) |

## Documentation

- [OVERVIEW.md](OVERVIEW.md) — current focus and the last 10 changes
- [todo.md](todo.md) — open bugs, feature queue, decisions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together
- [docs/detailed/](docs/detailed/README.md) — per-domain runbooks
- [docs/changelogs/](docs/changelogs/README.md) — change history by topic, with the reasoning behind each change
- [docs/plans/](docs/plans/README.md) — designs for upcoming features
- [docs/user/](docs/user/0_Overview.md) — operator help (German), also served in-app at `/hilfe`

Contributors and coding agents: start with [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).
