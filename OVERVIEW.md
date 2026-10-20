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

989. ✅ CUPS optional in production: moved into `docker-compose.prod.printing.yaml`, included by the deploy workflow unless the host `.env` has `PRINTING_ENABLED=false` (revamp unchanged; a host without printers needs no `./cups`) → [docs-infra]
989. ✅ `docker-compose.prod.catalogue.yaml` mounts host `catalogue/` + `contracts-overlay/` and sets the catalogue paths; deployment guide: `.env` paths are container paths, troubleshooting for the fatal taxonomy-seed ENOENT, inbox EACCES and invalid event-log values; `.env.example` no longer suggests the non-existent `Warning` level → [docs-infra]
988. ✅ Simple deployment guide `docs/detailed/deployment.md`: one-time logins/.env, build+push to `gitea.revamp-it.ch`, `pull`/`up -d` on the host, rollback, troubleshooting for the expired-cert (x509), `reqPackageAccess` and `MEDIATOR_DOMAIN` errors → [docs-infra]
987. ✅ Branch brought in order for a staging build: work committed in logical commits, GitHub `main` merged (contracts re-migrated, chassis spec key fixed, stale intake test updated), CLIs moved to `backend/cli/` so `taxonomy:apply`/`contracts:check`/`quality:recompute` run inside the image (`node dist/backend/cli/*.js`); staging steps in `config/catalogue/README.md`; image build verified locally → [docs-infra]
986. ✅ Practical guide `docs/detailed/taxonomy-and-contracts.md`: categories + quality/spec/assembly contracts, how quality % and grade are calculated, copy-paste file anatomy, recipes, live-DB taxonomy changes, data-protecting rules, troubleshooting; linked from `contracts/README.md` → [docs-infra]
985. ✅ Catalogue taxonomy is now **only Laptop + its components** (20 Laptop/201, 210 Laptop-Komponenten 2101–2132; the reused generic codes moved into 210); `npm run taxonomy:apply -- <seed>` makes an existing DB match a seed (upsert + deactivate the rest, never delete) since startup only seeds an empty DB; `docker-compose.catalogue.yml` wires seed, contract overlay and feature manifest into the stack; `contracts:check` lists contracts outside the taxonomy as unused instead of failing → [docs-infra]
984. ✅ **Nested quality assessment** (parts-catalogue Phase 4): in "Qualität bewerten", weighted slots show their part's status/range and "Bewerten →"; the part's assessment opens on top with a breadcrumb (Laptop › Displayassembly › Webcam), "Speichern & zurück" creates the part lazily (new `POST /api/items/:parent/spare-parts/component`, reference-less `C-` component, also for not-yet-created ancestors) then saves it; unsaved answers per level survive in localStorage; graduation refuses a ref of another subcategory than the slot (R5, 409 unless confirmed); quality modal now sends `notes`. Jest: route/guard + jsdom drill-down tests; browser walkthrough not done → [item-lifecycle]
983. ✅ Instance tab shows the quality % range next to the grade (+ "zu wenig bewertet für eine Note", "manuell"); `QualityManual` on the item API; spec-contract drafts for all 32 laptop part types in `config/catalogue/contracts/specs/` (identifying fields + FRU + compatible models), validated by Jest; plan questions C2/C3 settled → [item-lifecycle]
982. ✅ **One quality system for all deployments**: answers are named states (fine-grained default scale in `general.json`, per-question overrides), components carry weights, knock-outs cap the item on certain defects; the 1–5 grade is derived pessimistically from the lower bound of the % range and only when the range is narrow (else "?"). Manual grade flag (`QualityManual`), shared Hauptkategorie contracts (`group-<code>`), intake uses the same path, "Entnehmen" keeps the parent's answers (slot → missing; spare marking contract-driven), legacy `is_functional` shortcut removed; all shipped contracts migrated (severe answers → knock-outs, draft weights). Catalogue taxonomy 210 + part tree drafted in `config/catalogue/`. ⚠ ordinary refurbishment devices now grade one band higher until bands are calibrated (plan C1). Full suite: same 5 pre-existing failures as HEAD → [item-lifecycle]
981. ✅ Tenancy UI: another org's items are read-only in the UI (edit/relocate/remove/review/attachment/accessory/photo actions hidden via `permissions` in the item detail response), their org location opens an **org card** (name + contact email, `GET /api/orgs/:id`) instead of failing as a box, and "Ki Status" only shows with the AI feature on → [docs-infra]
