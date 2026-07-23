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

886. ✅ Scanner UX: full-frame visual scan feedback (green ✓ / red ✗) + explicit "Schliessen" exit that routes the placement loop into inventory reconciliation → [scanning]
885. ✅ Inventory scan gets an exit route: unscanned box items can be stock-removed or location-cleared → [storage]
884. ✅ Intake reference step: bootable-only categories, auto-fill description from scanned model, drop redundant "funktionsfähig?" question → [intake]
883. ✅ Hardware barcode scanners no longer submit forms: global capture-phase keystroke-timing guard swallows the scanner's trailing Enter (human Enter-to-submit preserved) → [scanning]
882. ✅ Add 62x29 label template with inline QR rendering and instance UUID support → [printing]
881. ✅ Fix production initDb crash-loop: move premature item_attachments("Artikel_Nummer") index after the ALTER that adds the column (unblocks Confidence migration too) → [docs-infra]
880. ✅ Remove hardcoded ERP sync credentials; read from env + fail fast (503) when unconfigured → [erp-sync]
879. ✅ Gate ERP export/sync to approved items only (configurable via ERP_SYNC_REQUIRE_APPROVAL, default on) → [erp-sync]
878. ✅ Fix "container mediator is unhealthy": guard events.Meta→jsonb migration so legacy non-JSON rows can't abort initDb startup → [docs-infra]
877. ✅ Route product-level attachments (Scope/Artikel_Nummer) so all instances of a product see them → [media]
