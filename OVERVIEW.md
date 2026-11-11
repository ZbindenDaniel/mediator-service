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

1082. ✅ Browser print proxy basic auth (`printer.browser_user`/`_password`, write-only in admin UI) + nginx reference updated for TLS, origin map, htpasswd → [printing]
1081. ✅ Fix label PDF rendering as www-data (Chromium `render_exit_1`: no writable HOME) + bare `host:port` proxy URL gets `http://` → [printing]
1080. ✅ Browser print mode: backend renders the PDF, the browser sends the IPP job to an nginx CORS proxy in front of the LAN CUPS (cloud backend can't reach printers) → [printing]
1079. ✅ User docs rewritten in plain, factual language (no filler, no "the AI learns"), wrong UI labels and a wrong CO₂ example fixed, writing rules in `docs/user/README.md` → [ui]
1078. ✅ Help docs follow feature flags (page + section markers, stripped server-side), new pages Administration / Fundsachen / Aktivitäten / KI-Cockpit, light-on-light help CSS fixed → [ui]
1077. ✅ Merged Gitea `main` (Iyed's Sass build fix, same bug already fixed here) into `main` so the push fast-forwards → [docs-infra]
1076. ✅ Item shop dialog gets "Jetzt mit Shop synchronisieren" (admins; same gate + endpoint as the bulk Shop Sync, now shared via `lib/shopSync.ts`) → [ui]
1075. ✅ Instance pricing (base price × grade/5, min 20 %, CHF 5 rounding, per-instance override) + `Mietware` flag → Shopware tag `rental`; variant children carry their own price. 1146 tests → [item-lifecycle]
1074. ✅ Plan: instance pricing (base price × quality-grade factor + override) and `Mietware` ref flag → Shopware tags (plan shipped in #1075) → [item-lifecycle]
1073. ✅ Activity log level colours: subtle left bar per row (Fehler red + faint tint, Wichtig amber, Info pale blue, Technisch dimmed) + legend; level also in tooltip/aria → [ui]
