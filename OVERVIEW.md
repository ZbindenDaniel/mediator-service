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

922. ✅ Fix invalid JSON in `contracts/quality/201.json` — a trailing comma after `has_os` made the file unparseable, and both contract loaders swallow parse errors and return `null`, so the laptop-specific quality questions (OS, keyboard, screen, swollen battery, hinges, fan) were silently dropped at intake and in operator review. Removed the comma, bumped the contract version 6→7. (Separate from the still-open "intake asks RAM/storage" report — the resolver + station script are both correct for a well-formed scan; that symptom points upstream at `build_scan_payload`.) → [intake]
921. ✅ AI-runs phase 4: run history — snapshots + KI-tab diff + non-destructive restore. New `agentic_run_snapshots` table captures the AI-written fields **before** each run/rework; the KI tab shows a "KI-Verlauf" timeline with a field-level before→after diff (Langtext key-by-key via `computeSnapshotDiff`) and a "Wiederherstellen" button. Restore overlays a version's fields, records a new `restore` snapshot (non-destructive), and re-prunes. Retention: keep 4 recent **+ always the last approved** state. API `GET/POST /api/item-refs/:artikel/agentic/snapshots[/:id/restore]` → [agentic]
920. ✅ AI-runs phase 3: identity grounding to stop a confused search flipping the device class (the "PC → Pokémon card set" failure). No new schema — reuses the run's stable `SearchQuery` anchor + the known subcategory label (`getSubcategoryLabelFromCode`) to inject a "this item IS a `<class>`; never change the device class — prefer the provided value/null over contradicting the known identity" fragment into the extraction + supervisor prompts (not the categorizer). Reworded `extract.md`'s "correct Artikelbeschreibung to sources" rule accordingly → [agentic]
919. ✅ AI-runs phase 1b: surface stored search evidence in the KI tab. `agentic_runs.LastSearchLinksJson` was persisted (and already reached the frontend on the shared `AgenticRun` type) but never displayed. New `AgenticSearchSources` component (+ defensive `parseAgenticSearchSources`) renders the stored `{url,title?,description?}[]` as a compact link list with domains; `ItemDetail` pushes a `Suchergebnisse (N)` row (React-node value, no `AgenticStatusCard` change). Read-only for now — curation is the follow-up (todo #21) → [agentic]
918. ✅ AI-runs phase 1a (from the design doc): (1) fixed the recurring Ollama `UND_ERR_HEADERS_TIMEOUT` at the root — `ensureModelHttpTimeouts` installs a global undici dispatcher raising `headersTimeout`/`bodyTimeout` (default 10 min, env `MODEL_HTTP_HEADERS_TIMEOUT_MS`/`_BODY_TIMEOUT_MS`) before any model client is built, so a slow first token is no longer misread as a transport failure (retry now covers only genuine drops); added `undici` dep. (2) Made the three untraceable queue→`failed` paths (`stale-run-auto-cancelled`, `over-cap-cancelled`, `missing-search-query`) legible via `recordQueueTerminalTransition` — a structured `from→to/reason` log line **and** an `AgenticRunFailed` item event with a `category` tag (`infra-cancelled` vs `invalid-state`) → [agentic]
917. 📝 Design doc `docs/PLANNING_ai_runs_optimization.md` — analysis + options (no behavior change yet) for five agentic-run pain points as one design: (1) bad `Artikelbeschreibung` poisoning the search anchor, (2) stored search sources never surfaced in the UI, (3) rework unreachable during review + no failure closure, (4) "waiting" (`queued`) runs silently dropping to `failed` via three untraceable queue paths, (5) Ollama `UND_ERR_HEADERS_TIMEOUT` burning runs. Unifying frame: make the run a transparent, steerable object; proposed sequencing + open questions for brainstorm → [agentic]
916. ✅ Fallback-chain alt-doc directories: a dir can now declare `identifierTypes: ["serialNumber","macAddress"]` and files are listed/served/uploaded under every accepted type the item has — so a serial-less intake machine's `MAC:`-keyed wipe reports (stored but invisible after #915) now surface in the UI, item detail, and file-serve. Adds `resolveAltDocDirPaths` + a shared `lib/external-docs.ts` (`buildExternalDocSummary` union + serve resolver) and always-canonical MAC folder names (`40:16:7e:..`/`40167e..` → `40167E..`) → [media]
915. ✅ Fix intake MAC-keyed external-doc uploads failing with `identifier_not_set`: an `SN:`/`MAC:` URL prefix now **declares** the identifier type and that wins over the dir's default `identifierType`, so a `serialNumber`-typed dir (`wipe-reports`) accepts `MAC:`-keyed machine-level/orphan wipe reports (drives with no readable serial). Threaded an optional `identifierTypeOverride` through `resolveAltDoc*`; the overridden value is still pattern-validated + path-guarded → [media]
914. ✅ Harden the agentic auto-dispatcher: demote keep-busy to feed **only** `notStarted` runs into the waiting queue (capped at N running + N waiting via `MAX_CONCURRENT_RUNNING_RUNS`), never resurrecting `failed`/`cancelled` runs (so operator stops hold); failed runs are now terminal (no auto-requeue); add an admin kill switch (`agentic_auto_dispatch_enabled`, Admin page card); and add in-process retries + timeouts to Tavily search and the Ollama client so transient blips are absorbed within a run instead of permanently failing it → [agentic]
913. ✅ Fix intake reference matching + "HP HP HP" brand triplication: intake now reuses the same reference matcher as manual item creation (extracted `searchItemReferences` from `/api/search?scope=refs`) instead of a bespoke `Kurzbeschreibung`-only substring query that missed imported refs; and the new-ref name (plus the agentic hand-off description) no longer prepends `Hersteller` — the model already carries the brand, so prepending it was the third "HP". The duplicate-brand-in-`model` from the netboot image is left to be fixed at its source (todo), not masked here → [intake]
