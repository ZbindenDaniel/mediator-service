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

939. ✅ Spec contract for All-in-One (`contracts/specs/109.json`): the `109 All-in-One` subcategory added in #937 had no spec contract (fell back to `general`); modelled on 102 (Standard-PC) + integrated-display fields (required Prozessor + Bildschirmgröße; optional Auflösung/Touchscreen/Speicher/RAM/Grafikkarte/Anschlüsse) + guidance. Auto-discovered, shipped to dist by the build → [item-lifecycle]
938. ✅ Taxonomy externalization **Phase 2** (frontend): new `TaxonomyProvider` fetches `GET /api/taxonomy` once at boot and exposes `{categories, lookups}`; migrated all consumers (`ItemDetail`, `itemFormShared`, `ItemBasicInfoForm`, `ItemListPage`) to `useTaxonomy()` and deleted the static `frontend/src/data/itemCategories.ts`. The FE no longer imports the taxonomy at build time — it comes from the API, so a deployment's taxonomy needs no FE rebuild. Context defaults to empty (graceful when no provider). All 58 FE tests pass; bundle clean → [docs-infra]
937. ✅ Taxonomy externalization **Phase 1** (backend runtime source): `backend/lib/taxonomy.ts` loads/validates/caches `config/taxonomy.seed.json` (a verified snapshot of the old hardcoded taxonomy, in the new field model — labelInternal/labelExternal, active, categorizerDescription, intake flags); `getItemCategories()` accessor + `GET /api/taxonomy` + startup fail-fast; backend lookup consumers, the categorizer reference (byte-parity tested), and the intake list now read the loader; build ships the seed to `dist/config`. Surfaced+fixed a bug: intake mapped "All-in-One" to code 302 (a printer) → added `109 All-in-One` under Computer. No new test failures → [docs-infra]
936. ✅ Phased plan to externalize the category taxonomy as a runtime, DB-backed, editable data object (`docs/PLANNING_TAXONOMY_EXTERNALIZATION.md`): loaded at startup + served via `GET /api/taxonomy` + seeded into DB from a shipped default, so one image runs any deployment's taxonomy and labels/categories edit without a rebuild (build-time codegen rejected — would force one image per taxonomy); backend stays synchronous via a startup cache, frontend moves to a boot-fetch provider; closes G-C1 → [docs-infra]
935. ✅ New-use-case planning doc: spare-part cataloging as a separate, multi-tenant deployment — readiness inventory (taxonomy hardcoded in 4 hand-synced copies; contracts drop-in; no use-case/tenant/feature-flag concept), feature-disposition (keep/strengthen/remove-by-config/out), and high-concept designs for a feature-flag manifest + two-tier tenancy (shared catalogue / private logistics on the ref↔instance seam) → [docs-infra]
934. ✅ Creating another instance of an existing reference no longer restarts an `approved`/`review` agentic run. `import-item` already declines to re-seed when a run exists, but the frontend then fired its own `POST /api/agentic/run`, and `forwardAgenticTrigger` restarted every non-active run (incl. approved/review), clobbering the result. It now restarts only a `notStarted` run from that automatic path; active/settled runs are returned untouched. Explicit restarts (dedicated `…/agentic/restart`) are unaffected. → [agentic]
933. ✅ Operators can now delete a stored search-result link from an item's KI tab so a bad hit stops poisoning the reuse/grounding pipeline. The `Suchergebnisse (N)` list (search evidence surfaced in #916) was read-only; each link now has a remove control that calls a new `POST /api/item-refs/:id/agentic/search-links/delete` endpoint. Backend service `removeAgenticSearchLink` prunes the URL from `LastSearchLinksJson` (empties persist as `null` = "no evidence") and echoes the run's current Status/ReviewState back through `updateAgenticRunStatus` so only the links change — the run is *not* reset (unlike `deleteAgenticRun`). Logs an `AgenticSearchLinkRemoved` event. → [agentic]
932. ✅ Root-caused "most/all agentic runs fail with EXTRACTION_FAILED": the model returned **empty** completions because (a) the Ollama client set no `num_ctx` (default 2048) so the ~6-7k-token extraction prompt was silently left-truncated, and (b) extraction alone was fed the **raw, unbounded** search blob (16k+ chars for one item) — the sanitizer that shrinks the categorizer's context never ran on it. Fix: `MODEL_NUM_CTX` (default 8192) + optional `MODEL_FORMAT_JSON` on the Ollama client; a new deterministic `condenseSearchText` that keeps spec-bearing lines within a 12k-char budget instead of blindly truncating; and traceability — the blind `json match missing` debug line is now a `warn` with `rawLength`/`hadThinkBlock`/snippet, and the terminal error records `EMPTY_OR_NO_JSON` instead of a null reason. → [agentic]
931. ✅ Admin "Backup" is now a complete, restorable snapshot that never depends on env config. The button routed to `/api/export/items?mode=backup`, which (a) emits only items+boxes — no agentic runs, no events — and (b) resolved Langtext format via `LANGTEXT_EXPORT_FORMAT`, so setting that env to `html` (for ERP) silently made *backups* emit HTML cells that break on re-import. Now: Backup routes to `/api/export/data?format=zip&entities=items,boxes,agentic,events&mode=backup` (the four CSVs the importer already ingests); backup Langtext is **always** JSON (env override confined to the ERP boundary); backup is never row-capped (was truncating agentic/events at 500). Also fixed three latent bugs in `export-data` that made its boxes/agentic/events queries throw against the real schema (unquoted CamelCase identifiers) and added `LastSearchLinksJson` to the agentic export so search evidence survives restore. → [erp-sync]
930. ✅ Skip-search now appends the *collected* search results meaningfully, not just a "search skipped" note. The reuse path built the extraction context by joining only source `description`/`content`, so the common persisted shape (`{url,title?,description?}` with no description) collapsed to an empty string and the prompt rendered `Current search context: None.` despite real stored evidence. Now it formats stored sources via the shared `formatSourcesForRetry` (numbered Title/URL/Description blocks — never empty when sources exist) and labels the block "Previously collected search results (search skipped — extract from these…)" so the model treats it as authoritative. → [agentic]
