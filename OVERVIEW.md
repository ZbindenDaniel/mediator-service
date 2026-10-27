# Project Overview

Runbooks: [docs/detailed/](docs/detailed/README.md) · Changelogs: [docs/changelogs/](docs/changelogs/README.md)

## Current focus
- Agentic quality: AI-runs optimization phase 2 and the operator-gated instance flow — see [docs/plans/](docs/plans/README.md).
- Shopware follow-ups: reverse stock sync from orders, backfill of pre-existing products.

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

963. ✅ Plans trimmed to three future designs in `docs/plans/`, user help updated for recent features, legacy compose/deploy files removed → [docs-infra]
962. ✅ Docs cleanup: rewrote README/setup/architecture/env docs for v3.3, deleted stale trackers, finished plans and placeholder docs, pruned resolved items from todo.md → [docs-infra]
961. ✅ Item list: "Preis" filter and sort; unpriced rows sink to the bottom → [ui]
960. ✅ Shelf colour picker in Regal-Details, stored as `boxes."Color"` and shown in the box list → [storage]
959. ✅ Fotos tab can capture from the camera ("Foto aufnehmen") → [media]
958. ✅ Search falls back to the best weaker matches (`relaxed: true`) instead of returning nothing → [ui]
957. ✅ Intake `select_ref` strips vendor noise ("Intel(R) Client Systems") so named devices find their ref → [intake]
956. ✅ Shopware sync survives a shop DB reset (verifies stored product id, re-creates if gone) → [erp-sync]
955. 🔧 Planning: instance agentic flow — reconcile intake evidence against the reference, operator-gated (`docs/plans/instance-flow.md`) → [agentic]
954. ✅ Rejected reviews feed a before→after correction diff into the next run's prompts → [agentic]
