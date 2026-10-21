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

1010. ✅ Kivi/Shop sync controls verified behind `erp-sync`/`shopware` (they showed because unlisted features default to on); admin status card's ERP/Shopware lines gated too, bulk-bar gating test → [ui]
1009. ✅ Todo cleanup: 59 finished entries moved to `docs/archive/todo-done.md`, duplicate #1000/#1001 ui entries renumbered to #1002/#1003, two stale open questions dropped → [docs-infra]
1008. ✅ Agentic startup resume only re-invokes stale `running` runs; the dead `queued` branch (and its slot use) is gone, since the dispatcher's claim picks those up → [agentic]
1007. ✅ Item detail neighbours: the list writes `ids=prev,current,next` for every selection, so arrow navigation no longer shows the previous item's neighbours and the detail skips its own `/api/items` fetch → [ui]
1006. ✅ ERP CSV timestamps without a zone are read as Zurich time (were server-local: 2 h apart between container and dev machine); nightly-sync setting seeded after `initDb` (was lost on a fresh DB) → [erp-sync]
1005. ✅ Device questions locked by assessed parts drop the InstanceSpecs lines they wrote (e.g. "Gehäuse-Zustand: Beschädigt"), in the score roll-up and on the device save; hand-edited values kept → [item-lifecycle]
1004. ✅ Grade bands calibrated for weighted scoring: 5 ≥ 95 %, 4 ≥ 85 %, 3 ≥ 60 %, 2 ≥ 40 %, grade-2 knock-out caps 0.39 → 0.59; 84 % of laptop answer combinations keep their old grade, none drops; testers fine-tune → [item-lifecycle]
1003. ✅ Item list follow-up: filter labels above their fields in wider cells (inputs no longer squeezed), CHF column shows the real price and is on by default, new "Geändert" column + sort (latest change of any instance), sortable column headers (click again flips), "Spalten" moved to the start of the list above the table → [ui]
1002. ✅ Item list filters: search matches every word in any order across name, manufacturer, number, serial, EAN and spec values (accents ignored, only ever wider than before); Behälter filter also matches the shelf; Unterkategorie by name; rarely used filters under "Weitere Filter (N aktiv)"; text filters and sorting no longer reload the list (only Ki-Status/Typ/Platzierung hit the server); "Spalten" picker per browser from one column table → [ui]
1001. ✅ Parts without an article stay in the device tree: lists hide them, "Entnehmen" goes through `remove-from-device` and sets the article right there (new, prefilled with label/FRU, or existing), `move-item` refuses them; device questions lock once all their parts are assessed (form + server, `refinedQuestionIds`); "Fest verbaut" parts are assessable records that can never leave the device. Cleanup: one contract loader, form gets parts from the caller, tree + component routes split out → [item-lifecycle]
