# Project Overview

Runbooks: [docs/detailed/](docs/detailed/README.md) · Changelogs: [docs/changelogs/](docs/changelogs/README.md)

## Current focus
- Stabilize ERP sync by removing unproven continuation heuristics and preserving only behavior backed by known request evidence.
- Harden pricing-agent JSON reliability by repairing malformed model output before schema validation.

## System map

| Area | README | Primary changelog |
|---|---|---|
| Backend server | [backend/](backend/README.md) | — |
| Agentic pipeline | [backend/agentic/](backend/agentic/README.md) | [agentic](docs/changelogs/agentic.md) |
| API action handlers | [backend/actions/](backend/actions/README.md) | — |
| Frontend SPA | [frontend/](frontend/README.md) | [ui](docs/changelogs/ui.md) |
| Shared models | [models/](models/README.md) | — |
| Runtime contracts | [contracts/](contracts/README.md) | [item-lifecycle](docs/changelogs/item-lifecycle.md) |
| Print server | [cups/](cups/README.md) | [printing](docs/changelogs/printing.md) |
| Reference docs | [docs/detailed/](docs/detailed/README.md) | — |

## Topic changelogs

| Topic | File | Covers |
|---|---|---|
| Item lifecycle | [item-lifecycle.md](docs/changelogs/item-lifecycle.md) | Item CRUD, quality, specs, accessories, spare parts, CO₂ |
| Agentic pipeline | [agentic.md](docs/changelogs/agentic.md) | AI enrichment, extraction, review flow, dispatch queue |
| ERP sync | [erp-sync.md](docs/changelogs/erp-sync.md) | ERP import/export, CSV, Langtext, nightly sync, Shopware |
| Printing | [printing.md](docs/changelogs/printing.md) | Labels, CUPS, printer queues, drivers |
| Media & files | [media.md](docs/changelogs/media.md) | Photos, attachments, external docs, WebDAV |
| Storage & boxes | [storage.md](docs/changelogs/storage.md) | Boxes, locations, relocation, stubs, placement |
| Device intake | [intake.md](docs/changelogs/intake.md) | Intake station, netboot, cataloguing flow |
| Scanning & QR | [scanning.md](docs/changelogs/scanning.md) | QR generation, scanner workflows, audit |
| UI/UX | [ui.md](docs/changelogs/ui.md) | Frontend layout, navigation, help pages |
| Testing | [testing.md](docs/changelogs/testing.md) | Test coverage, test rewrites, test infrastructure |
| Docs & infra | [docs-infra.md](docs/changelogs/docs-infra.md) | Documentation, config, Docker, DB migrations |

## Recent changes (last 10)

868. ✅ Fix categorizer markdown response; repair to JSON + strengthen prompt → [agentic]
867. ✅ Restore OverviewPanel on desktop; fix Liste button clearing selection → [ui]
866. ✅ Fix reference-only items missing LastSyncedAt in item list query → [erp-sync]
865. ✅ Fix 3 skipSearch bugs; replace notes-regex with explicit UI confirm; wire skipSearch through API + restart → [agentic]
864. ✅ No-planner correction flow: skipSearch feeds stored LastSearchLinksJson into extraction → [agentic]
863. ✅ Fix stub deletion, BoxID event filter 500, marks visibility, shelf BoxCount, Created/Updated events → [storage]
862. ✅ Surface extraction confidence in UI; events.Meta → JSONB + box filter; stub close action → [agentic]
861. ✅ Contract-informed pipeline: SpecContext coalesces contract + Langtext + InstanceSpecs; structured review Step 3 → [agentic]
860. ✅ Atomic label-queue claim (FOR UPDATE SKIP LOCKED); enables cross-instance shared printing → [printing]
859. ✅ Atomic SELECT FOR UPDATE SKIP LOCKED claim query for multi-instance agentic safety → [agentic]
858. ✅ Rewrite 14 SQLite-backed tests to Postgres mock pattern; removed from testPathIgnorePatterns → [testing]
