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

904. ✅ Enrich intake quality questions: split the generic optical condition into Verfärbungen/Kleberückstände + Kratzer, add laptop condition checks (keyboard/display condition, swollen battery, hinges, dusty fan), and decouple `keyboard_layout` from the keyboard assembly part into the 201 quality contract so a human-only spec is never orphaned by skipping presence → [intake]
903. ✅ Auto-resolve intake questions from the scan: a question declares `autoFill: "<signal>"` (ram/storageSize/storageType/battery) or `skipAtIntake: true` in the contract, and the server auto-answers + drops it — so a laptop is asked only cosmetic condition + OS instead of re-confirming RAM/storage/battery/fan/display. Scan persisted server-side, no script change → [intake]
902. ✅ Generalize intake sub-devices to an extensible `components[]` object (`disks[]` becomes a shorthand): auto-create is serial-gated and kind-agnostic, and a detected serialless PCI device (GPU/NIC) fills assembly info by pre-filling `has_<slotKey>`/`<slotKey>_model` instead of creating an item → [intake]
901. ✅ Consolidate the assembly slot key onto `item_relations."SlotKey"`: `catalog-spare-part` writes and reads it directly (clean cutover, no backfill/fallback), and `Notes` stays for genuine Zubehör relation notes → [item-lifecycle]
900. ✅ Intake produces a complete item: the quality step now serves the subcategory's assembly (accessory) questions and scores/derives specs from them, back-fills the canonical required specs (Prozessor/RAM/Speicher) from the scan, and accepts full free-form instanceSpecs from the script (canonical keys, aligned by convention) → [intake]
899. ✅ Deferred-identity in-device components: intake materializes one reference-less component per scanned disk (serial-keyed reports, C- UUID), which graduates at Zerlegung via an atomic identity-set + UUID-swap; parent→Ersatzteil is now contract-gated, and components are excluded from export/print until extracted → [intake]
898. ✅ Add Authentik (server + worker + own Postgres/Redis) to the docker-compose stack for user management; Phase 1 stands it up only — forward-auth enforcement (proxy + backend roles) deferred → [docs-infra]
897. ✅ Add opt-in "einfacher Modus" (simple mode): user-settings dialog toggle hides UI via a body CSS class — opt-out model, so every future nav item/tab is hidden by default unless marked `simple-keep` → [ui]
896. ✅ Add separate manually-triggered Gitea deploy workflow: SSHes to the Docker host and rolls the mediator compose service onto a chosen image tag → [docs-infra]
895. ✅ Add Gitea Actions workflow to build & publish the Docker image to Gitea's own container registry (no PAT; runs on main/tags/dispatch) → [docs-infra]
