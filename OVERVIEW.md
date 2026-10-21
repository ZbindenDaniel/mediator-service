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

999. ✅ Einzelteile page actually styled: its CSS had gone into the generated, gitignored `styles.css` instead of `styles.scss`, so the browser got none of it (bullets, default buttons, detail panel pushed below the tree); moved to `styles.scss`, checked by headless-Chromium screenshots at desktop and phone width; filled slots drop their presence chips, global button styles reset in the tree, "Kategorie N" and "KI-Priorität" hidden where meaningless → [ui]
998. ✅ Group contract by taxonomy parent: `group-<code>` was picked by `floor(sub / 10)`, so catalogue parts 2110–2132 (mainboard, daughterboard, touchpad, speakers …) got no Zustand/FRU at all — now resolved via the taxonomy (`parentCategoryCode`, also in `contracts:check`, admin upload and the AI categorizer); part drafts for mainboard (POST, damage), daughterboard (interfaces, ports), touchpad, speakers → [item-lifecycle]
997. ✅ Einzelteile page reworked after first look: whole page below the fixed header (the top line with the exit had been hidden under it), "✕ Schliessen" + Esc, real tree with the device as root (assessed right there), work steps as branches with progress bars, aligned rows; one "Speichern" that stays on the part (no "Verwerfen", no auto-jump) → [item-lifecycle]
996. ✅ **Einzelteile page** (parts-catalogue 6d–6f): instance tab "Einzelteile" opens `/items/:id/einzelteile` — left the Aufbau per work step with presence chips saved per click (dashed = contract default), nested assemblies indented; right the selected part's own Zustand, lazy creation, "Speichern & nächstes →", Entnehmen/Lösen/Mit Artikel erfassen; one `GET …/parts-tree`. Zerlegen section of the Zubehör tab and the modal drill-down removed; new articles get the spec-contract fields prefilled in Langtext (warning on empty required); catalogue 201 asks only the device (refurbishment questions + `refinedBy`), steps/defaults for 201/2101 → [item-lifecycle]
995. ✅ Docker image moved from Debian 11 to 12 (`node:20-bookworm` / `-bookworm-slim`): bullseye left LTS on 2026-08-31 and its security pool now returns 404, which broke every image build; runtime tools (Chromium, CUPS client, CLIs) verified in the new image → [docs-infra]
994. ✅ Slot answers and the assessment form can no longer overwrite each other: `PATCH /api/items/:id/quality-review/answers` merges slot answers into the latest assessment in place (slot ids only, no history row per click), and `POST …/quality-review` keeps stored slot answers the body does not send, read at save time (parts-catalogue 6c) → [item-lifecycle]
993. ✅ Contract fields `askOnCreate` / `steps` + `step` / `default` (assembly) and `refinedBy` (questions), validated by `contracts:check`; one `assemblyToQualityContract(ac, scope)` in `models/` for frontend, intake and server, `loadCreationQuestions` for both intake routes, create form asks the `create` scope; scoring: unassessed slots no longer count, device questions drop out once all their `refinedBy` slots are assessed/missing (parts-catalogue 6b) → [item-lifecycle]
992. ✅ Authentik seeds itself: blueprints in `config/authentik/blueprints/` (mounted by `docker-compose.authentik.yml`) create the groups, Proxy Provider, `mediator` application, embedded-outpost host and the local test logins `dev-admin`/`dev-worker` on every start — a recreated stack needs no clicks → [docs-infra]
991. ✅ Stable part IDs (parts-catalogue 6a): in-device parts are `C-<root device Artikelnummer>-<subcategory>-<####>` (e.g. `C-104523-2132-0003`), minted by one helper (`backend/lib/part-ids.ts`) for the catalogue route and intake; graduation only sets the Artikelnummer — the ID never changes, the re-key of relations/events/attachments/labels is gone → [item-lifecycle]
989. ✅ `docker-compose.prod.catalogue.yaml` mounts host `catalogue/` + `contracts-overlay/` and sets the catalogue paths; deployment guide: `.env` paths are container paths, troubleshooting for the fatal taxonomy-seed ENOENT, inbox EACCES and invalid event-log values; `.env.example` no longer suggests the non-existent `Warning` level → [docs-infra]
