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

965. ✅ **Consistent help formatting and Umlagern guide**: render steps, nested lists, notes, and code across all help pages; expand Erste Schritte with relocation by BoxID/name, scanning, new boxes, and result checks. → [ui]
964. ✅ **Help tables and headings**: render Markdown tables as styled HTML tables with shaded headers and alternating rows; improve heading sizes and spacing. → [ui]
963. ✅ **Relocation searches keep box-name matches**: the shared destination picker preserves backend-ranked results, displays each box's Label alongside its BoxID, and keeps selecting by BoxID; documented API/UI test-box creation, public HTTPS/Basic Auth, and missing-box 404 troubleshooting. → [ui]
962. ✅ **Documented item relocation execution flow** through the dialog, move API, persistence, and refresh; identified the destination input filtering out box-name matches already returned by the backend. → [ui]
961. ✅ **Item list: price filter + price sort.** New "Preis" filter (Alle / Ohne Preis / Mit Preis — 0 or empty counts as no price) and a "Preis" sort key; unpriced rows always sink to the bottom, and the CHF column shows the amount instead of ✓ while sorting by price. Persisted with the other list filters; jest now maps the bare `models` alias so `ItemListPage` logic is testable. → [ui]
960. ✅ **Shelf colour picker**: the shelf "Regal-Details" card (Notizen tab) gained a colour picker (Standort palette as swatches, reset to default); stored as `boxes."Color"` (`#rrggbb`, validated in `move-box`) and used as the shelf row's left marker in the box list. → [storage]
959. ✅ **Fotos tab captures from the camera**: `ItemImagesTab` gained a "Foto aufnehmen" button that opens the existing `PhotoCaptureModal` (from `ItemCreate`); the shot is persisted through the same `persistMediaUpdate`/slot logic as a picked file. Hidden when no camera API. → [media]
958. ✅ **Search never returns nothing when weaker matches exist**: the ≥50 % token rule moved from SQL (`WHERE token_hits >= …`, now `>= 1`) into JS — identical results whenever any row clears it, otherwise the best weaker matches come back ranked, with `relaxed: true` on the `/api/search` response and a `(relaxed…)` note on the `[search]` log. Covers items, boxes, refs and every `searchItemReferences` caller (intake `select_ref` included). UI hint deferred. → [ui]
957. ✅ Intake `select_ref` no longer comes back **empty for a clearly-named device**: the DMI vendor string ("Intel(R) Client Systems") polluted the ref search term — 5 tokens with a ≥50% hit threshold meant an `Intel NUC …` ref (2 hits) never qualified → `0 references`. `findRefCandidates` now strips `(R)`/`(TM)` marks + corporate filler (Inc/Corp/Client Systems/…), dedupes tokens, and falls back vendor+model → model → vendor before giving up; logs `[intake-start] ref candidates` with the tried terms. The untagged `search … (refs) →` line is now `[search]`. → [intake]
956. ✅ Shopware sync **survives a shop DB reset**: `upsertProduct` verifies the persisted `ShopwareProductId` (`/api/search-ids/product`) before PATCHing and falls back to the `productNumber` lookup → re-create instead of `WRITE_TYPE_INTEND_ERROR`; the re-resolved id is persisted → [erp-sync]

