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

929. ✅ Admin Datenexport was completely dead + Abbrechen silently no-op'd. (1) `ExportCard` fetched `/api/export/items?mode=…` with **no `actor`** param, but the endpoint hard-requires it (`400 actor is required`); `if(!res.ok) throw` swallowed the 400, so every "Herunterladen" button just spun and downloaded nothing. It now resolves the operator via `ensureUser()`, appends `&actor=…`, and surfaces failures inline instead of only logging. (2) `persistAgenticRunCancellation` still carried the `!/^\d+$/` numeric-only Artikel_Nummer guard that was already removed from `persistAgenticRunClose` (#876) — it silently rejected every non-numeric reference (spare-part/component refs) client-side, so Abbrechen "did nothing". Dropped the guard (kept the `I-` instance guard). The KI-run delete/reset path itself was verified sound (wired, routed, `deleteAgenticRun` unit-tested, typechecks) — its "make deletion stick" fix already landed in #876. → [erp-sync]
928. ✅ Fix "queued agentic run → running → cancelled immediately": the concurrency cap became non-atomic when #499d8a4 removed the per-invocation running-count gate from the queued→running promotion, leaving only the dispatcher's `availableSlots = MAX − runningCount` read. The dispatch `setInterval` has no reentrancy guard, so a tick outlasting 5s overlaps the next; both read the same low count, both `claimQueuedAgenticRuns`, and together over-fill the running slots — then the over-cap sweep flipped the excess to `failed`. Three-layer fix: (1) reentrancy guard on the dispatch loop (`server.ts`); (2) `claimQueuedAgenticRuns` takes a running-cap arg and clamps its `LIMIT` to the free slots inside the same atomic statement; (3) the over-cap safety net now **requeues** the freshest excess to `queued` (keeps the oldest/in-progress running) instead of failing it, so a run that can't run yet waits. → [agentic]
927. ✅ Item list: new "KI-Datum" sort (last agentic run), optional column like `lastSynced`/`entryDate` → [ui]
926. ✅ Intake: honour the operator-typed Artikelbeschreibung + make every question skippable. (1) Field-name mismatch — the station sends `newRef.Artikelbeschreibung` but `findOrCreateRef` only read `newRef.Kurzbeschreibung`, so the typed value was dropped and the garbage scanned model ("HP Notebook") always won; now operator text is authoritative (precedence: operator → Kurzbeschreibung → scan model → Hersteller). (2) "Don't know" is valid on any question — empty answers are treated as unanswered in `deriveQualityFromAnswers`/`deriveSpecsFromAnswers` (no more `RAM: " GB"`) and dropped from the intake merge so a skip can't clobber a scan value. TUI empty-to-skip patch handed to the image repo. → [intake]
925. ✅ "Ki-Status" list filter now applies on multiselect close, not per-checkbox → [ui]
924. ✅ Intake "asks RAM/storage" root-caused + made visible: the resolver and station script are both correct for a well-formed scan — the real cause is the netboot image's `build_scan_payload` reading disk `sizeGb` from `smartctl` `.user_capacity.bytes` (an ATA/SATA field, **empty for NVMe** → `sizeGb:0` → `storage_gb` asked). In-repo: `resolveIntakeQuestions` now returns `detected` + `unresolvedAutoFill`; the quality-step responses carry `detectedSpecs` (omit-but-inform), and both build paths log a `[intake] question resolution` line so a mis-scan is diagnosable. Contract (`intake-image.http`/guide) now requires `lsblk`-sourced disk size; the image patch is handed off. → [intake]
923. ✅ Fix invalid JSON in `contracts/quality/201.json` — a trailing comma after `has_os` made the file unparseable, and both contract loaders swallow parse errors and return `null`, so the laptop-specific quality questions (OS, keyboard, screen, swollen battery, hinges, fan) were silently dropped at intake and in operator review. Removed the comma, bumped the contract version 6→7. (Separate from the still-open "intake asks RAM/storage" report — the resolver + station script are both correct for a well-formed scan; that symptom points upstream at `build_scan_payload`.) → [intake]
922. ✅ Highlight the search input inside "Ähnliche Artikel prüfen" results — matching words from the typed description are now wrapped in a `<mark class="suggestion-highlight">` in each candidate's Artikelnummer + Artikelbeschreibung, so operators can spot a real match faster. New pure `highlightMatches` helper (word-tokenized, ≥2 chars, regex-escaped, case-insensitive, longest-first); `SimilarItemsPanel` takes a `highlightTerm` prop fed the `searchTerm` from `ItemMatchSelection` → [ui]
921. ✅ AI-runs phase 4: run history — snapshots + KI-tab diff + non-destructive restore. New `agentic_run_snapshots` table captures the AI-written fields **before** each run/rework; the KI tab shows a "KI-Verlauf" timeline with a field-level before→after diff (Langtext key-by-key via `computeSnapshotDiff`) and a "Wiederherstellen" button. Restore overlays a version's fields, records a new `restore` snapshot (non-destructive), and re-prunes. Retention: keep 4 recent **+ always the last approved** state. API `GET/POST /api/item-refs/:artikel/agentic/snapshots[/:id/restore]` → [agentic]
920. ✅ AI-runs phase 3: identity grounding to stop a confused search flipping the device class (the "PC → Pokémon card set" failure). No new schema — reuses the run's stable `SearchQuery` anchor + the known subcategory label (`getSubcategoryLabelFromCode`) to inject a "this item IS a `<class>`; never change the device class — prefer the provided value/null over contradicting the known identity" fragment into the extraction + supervisor prompts (not the categorizer). Reworded `extract.md`'s "correct Artikelbeschreibung to sources" rule accordingly → [agentic]
919. ✅ AI-runs phase 1b: surface stored search evidence in the KI tab. `agentic_runs.LastSearchLinksJson` was persisted (and already reached the frontend on the shared `AgenticRun` type) but never displayed. New `AgenticSearchSources` component (+ defensive `parseAgenticSearchSources`) renders the stored `{url,title?,description?}[]` as a compact link list with domains; `ItemDetail` pushes a `Suchergebnisse (N)` row (React-node value, no `AgenticStatusCard` change). Read-only for now — curation is the follow-up (todo #21) → [agentic]
918. ✅ AI-runs phase 1a (from the design doc): (1) fixed the recurring Ollama `UND_ERR_HEADERS_TIMEOUT` at the root — `ensureModelHttpTimeouts` installs a global undici dispatcher raising `headersTimeout`/`bodyTimeout` (default 10 min, env `MODEL_HTTP_HEADERS_TIMEOUT_MS`/`_BODY_TIMEOUT_MS`) before any model client is built, so a slow first token is no longer misread as a transport failure (retry now covers only genuine drops); added `undici` dep. (2) Made the three untraceable queue→`failed` paths (`stale-run-auto-cancelled`, `over-cap-cancelled`, `missing-search-query`) legible via `recordQueueTerminalTransition` — a structured `from→to/reason` log line **and** an `AgenticRunFailed` item event with a `category` tag (`infra-cancelled` vs `invalid-state`) → [agentic]
