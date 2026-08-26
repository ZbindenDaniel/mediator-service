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

935. ✅ Backup/import upload no longer fails with `413 Request Entity Too Large`. The nginx proxy (`config/nginx/mediator.conf`) never set `client_max_body_size`, so its 1 MB default rejected multi-MB backups (`POST /api/import/validate`) before they reached the backend. Added a server-level `client_max_body_size 50m` with headroom for backup growth; backend imposes no body limit of its own. → [docs-infra]
934. ✅ Creating another instance of an existing reference no longer restarts an `approved`/`review` agentic run. `import-item` already declines to re-seed when a run exists, but the frontend then fired its own `POST /api/agentic/run`, and `forwardAgenticTrigger` restarted every non-active run (incl. approved/review), clobbering the result. It now restarts only a `notStarted` run from that automatic path; active/settled runs are returned untouched. Explicit restarts (dedicated `…/agentic/restart`) are unaffected. → [agentic]
933. ✅ Operators can now delete a stored search-result link from an item's KI tab so a bad hit stops poisoning the reuse/grounding pipeline. The `Suchergebnisse (N)` list (search evidence surfaced in #916) was read-only; each link now has a remove control that calls a new `POST /api/item-refs/:id/agentic/search-links/delete` endpoint. Backend service `removeAgenticSearchLink` prunes the URL from `LastSearchLinksJson` (empties persist as `null` = "no evidence") and echoes the run's current Status/ReviewState back through `updateAgenticRunStatus` so only the links change — the run is *not* reset (unlike `deleteAgenticRun`). Logs an `AgenticSearchLinkRemoved` event. → [agentic]
932. ✅ Root-caused "most/all agentic runs fail with EXTRACTION_FAILED": the model returned **empty** completions because (a) the Ollama client set no `num_ctx` (default 2048) so the ~6-7k-token extraction prompt was silently left-truncated, and (b) extraction alone was fed the **raw, unbounded** search blob (16k+ chars for one item) — the sanitizer that shrinks the categorizer's context never ran on it. Fix: `MODEL_NUM_CTX` (default 8192) + optional `MODEL_FORMAT_JSON` on the Ollama client; a new deterministic `condenseSearchText` that keeps spec-bearing lines within a 12k-char budget instead of blindly truncating; and traceability — the blind `json match missing` debug line is now a `warn` with `rawLength`/`hadThinkBlock`/snippet, and the terminal error records `EMPTY_OR_NO_JSON` instead of a null reason. → [agentic]
931. ✅ Admin "Backup" is now a complete, restorable snapshot that never depends on env config. The button routed to `/api/export/items?mode=backup`, which (a) emits only items+boxes — no agentic runs, no events — and (b) resolved Langtext format via `LANGTEXT_EXPORT_FORMAT`, so setting that env to `html` (for ERP) silently made *backups* emit HTML cells that break on re-import. Now: Backup routes to `/api/export/data?format=zip&entities=items,boxes,agentic,events&mode=backup` (the four CSVs the importer already ingests); backup Langtext is **always** JSON (env override confined to the ERP boundary); backup is never row-capped (was truncating agentic/events at 500). Also fixed three latent bugs in `export-data` that made its boxes/agentic/events queries throw against the real schema (unquoted CamelCase identifiers) and added `LastSearchLinksJson` to the agentic export so search evidence survives restore. → [erp-sync]
930. ✅ Skip-search now appends the *collected* search results meaningfully, not just a "search skipped" note. The reuse path built the extraction context by joining only source `description`/`content`, so the common persisted shape (`{url,title?,description?}` with no description) collapsed to an empty string and the prompt rendered `Current search context: None.` despite real stored evidence. Now it formats stored sources via the shared `formatSourcesForRetry` (numbered Title/URL/Description blocks — never empty when sources exist) and labels the block "Previously collected search results (search skipped — extract from these…)" so the model treats it as authoritative. → [agentic]
929. ✅ Admin Datenexport was completely dead + Abbrechen silently no-op'd. (1) `ExportCard` fetched `/api/export/items?mode=…` with **no `actor`** param, but the endpoint hard-requires it (`400 actor is required`); `if(!res.ok) throw` swallowed the 400, so every "Herunterladen" button just spun and downloaded nothing. It now resolves the operator via `ensureUser()`, appends `&actor=…`, and surfaces failures inline instead of only logging. (2) `persistAgenticRunCancellation` still carried the `!/^\d+$/` numeric-only Artikel_Nummer guard that was already removed from `persistAgenticRunClose` (#876) — it silently rejected every non-numeric reference (spare-part/component refs) client-side, so Abbrechen "did nothing". Dropped the guard (kept the `I-` instance guard). The KI-run delete/reset path itself was verified sound (wired, routed, `deleteAgenticRun` unit-tested, typechecks) — its "make deletion stick" fix already landed in #876. → [erp-sync]
928. ✅ Fix "queued agentic run → running → cancelled immediately": the concurrency cap became non-atomic when #499d8a4 removed the per-invocation running-count gate from the queued→running promotion, leaving only the dispatcher's `availableSlots = MAX − runningCount` read. The dispatch `setInterval` has no reentrancy guard, so a tick outlasting 5s overlaps the next; both read the same low count, both `claimQueuedAgenticRuns`, and together over-fill the running slots — then the over-cap sweep flipped the excess to `failed`. Three-layer fix: (1) reentrancy guard on the dispatch loop (`server.ts`); (2) `claimQueuedAgenticRuns` takes a running-cap arg and clamps its `LIMIT` to the free slots inside the same atomic statement; (3) the over-cap safety net now **requeues** the freshest excess to `queued` (keeps the oldest/in-progress running) instead of failing it, so a run that can't run yet waits. → [agentic]
927. ✅ Item list: new "KI-Datum" sort (last agentic run), optional column like `lastSynced`/`entryDate` → [ui]
926. ✅ Intake: honour the operator-typed Artikelbeschreibung + make every question skippable. (1) Field-name mismatch — the station sends `newRef.Artikelbeschreibung` but `findOrCreateRef` only read `newRef.Kurzbeschreibung`, so the typed value was dropped and the garbage scanned model ("HP Notebook") always won; now operator text is authoritative (precedence: operator → Kurzbeschreibung → scan model → Hersteller). (2) "Don't know" is valid on any question — empty answers are treated as unanswered in `deriveQualityFromAnswers`/`deriveSpecsFromAnswers` (no more `RAM: " GB"`) and dropped from the intake merge so a skip can't clobber a scan value. TUI empty-to-skip patch handed to the image repo. → [intake]
