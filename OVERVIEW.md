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

1078. ✅ User docs rewritten in plain, factual language (no filler, no "the AI learns"), wrong UI labels and a wrong CO₂ example fixed, writing rules in `docs/user/README.md` → [ui]
1077. ✅ Help docs follow feature flags (page + section markers, stripped server-side), new pages Administration / Fundsachen / Aktivitäten / KI-Cockpit, light-on-light help CSS fixed → [ui]
1076. ✅ Item shop dialog gets "Jetzt mit Shop synchronisieren" (admins; same gate + endpoint as the bulk Shop Sync, now shared via `lib/shopSync.ts`) → [ui]
1075. ✅ Instance pricing (base price × grade/5, min 20 %, CHF 5 rounding, per-instance override) + `Mietware` flag → Shopware tag `rental`; variant children carry their own price. 1146 tests → [item-lifecycle]
1074. ✅ Plan: instance pricing (base price × quality-grade factor + override) and `Mietware` ref flag → Shopware tags (plan shipped in #1075) → [item-lifecycle]
1073. ✅ Activity log level colours: subtle left bar per row (Fehler red + faint tint, Wichtig amber, Info pale blue, Technisch dimmed) + legend; level also in tooltip/aria → [ui]
1072. ✅ KI cockpit audit trail: lever changes (auto-flags, dispatch, manual self-heal) + auto-approvals logged, 6 unregistered self-heal keys no longer show as errors, cockpit shows "Letzte KI-Ereignisse" → [agentic]
1071. ✅ Event log usable for operators: debug level demotes per-item bulk noise (shop sync, KI results), bulk actions write one summary row, `/api/activities` filters topics/levels server-side with cursor paging (100/page), activities page gets Wichtig/Standard/Alles, day headers, folded bursts, error accent → [ui]
1070. ✅ **Cockpit: surface the correction backlog (close the reject→correct loop visibly).** Stabilization win — we ship the reject-with-note → self-heal re-run (#1069) but the cockpit showed no sign of it, so a reject felt like it vanished. Added `countRejectedRunsWithNotes` → `PipelineCockpit.correctionBacklog`, rendered as a "zur Korrektur (abgelehnt + Notiz)" stat beside "veraltet (Self-Heal)" under the behaviour chart. One cheap COUNT + one tile; makes the loop observable (and reminds that AUTO_REWORK drains it). Full suite 1229 pass; tsc + bundle clean. → [agentic]
1069. ✅ **Review notes → self-heal correction run ("note 'Do X' → corrected next run").** Operator lever: reject an item in the review wizard with a note (which already folds in the reviewer's before→after diff) and the self-heal sweep later re-runs it with that note as extraction guidance — no new UI, reusing `LastReviewNotes`. New `listRejectedRunsWithNotes` + a `sweepCorrectionNotes` pass in the sweep (gated AUTO_REWORK, prioritised over the staleness plan, one enqueue/tick, cooldown-guarded); the enqueued run carries the note via `pendingReviewNotes` → the dispatcher sets `review.notes` → extraction injects it (the existing reviewer-guidance path, works on a full run). Self-limiting: the run transitions the item out of `rejected` so it drops from the query. AUTO_REWORK must be on. 1224 pass; tsc clean. → [agentic]
