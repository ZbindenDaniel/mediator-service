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

916. ✅ Fallback-chain alt-doc directories: a dir can now declare `identifierTypes: ["serialNumber","macAddress"]` and files are listed/served/uploaded under every accepted type the item has — so a serial-less intake machine's `MAC:`-keyed wipe reports (stored but invisible after #915) now surface in the UI, item detail, and file-serve. Adds `resolveAltDocDirPaths` + a shared `lib/external-docs.ts` (`buildExternalDocSummary` union + serve resolver) and always-canonical MAC folder names (`40:16:7e:..`/`40167e..` → `40167E..`) → [media]
915. ✅ Fix intake MAC-keyed external-doc uploads failing with `identifier_not_set`: an `SN:`/`MAC:` URL prefix now **declares** the identifier type and that wins over the dir's default `identifierType`, so a `serialNumber`-typed dir (`wipe-reports`) accepts `MAC:`-keyed machine-level/orphan wipe reports (drives with no readable serial). Threaded an optional `identifierTypeOverride` through `resolveAltDoc*`; the overridden value is still pattern-validated + path-guarded → [media]
914. ✅ Harden the agentic auto-dispatcher: demote keep-busy to feed **only** `notStarted` runs into the waiting queue (capped at N running + N waiting via `MAX_CONCURRENT_RUNNING_RUNS`), never resurrecting `failed`/`cancelled` runs (so operator stops hold); failed runs are now terminal (no auto-requeue); add an admin kill switch (`agentic_auto_dispatch_enabled`, Admin page card); and add in-process retries + timeouts to Tavily search and the Ollama client so transient blips are absorbed within a run instead of permanently failing it → [agentic]
913. ✅ Fix intake reference matching + "HP HP HP" brand triplication: intake now reuses the same reference matcher as manual item creation (extracted `searchItemReferences` from `/api/search?scope=refs`) instead of a bespoke `Kurzbeschreibung`-only substring query that missed imported refs; and the new-ref name (plus the agentic hand-off description) no longer prepends `Hersteller` — the model already carries the brand, so prepending it was the third "HP". The duplicate-brand-in-`model` from the netboot image is left to be fixed at its source (todo), not masked here → [intake]
912. ✅ Fix intake asking about the drive despite the scan knowing it: `POST /api/intake/start` rebuilt the scan object and dropped the canonical `components[]` list (kept only the `disks[]` shorthand), so a drive reported via `components[]` yielded null `storageSize`/`storageType` signals and the `storage_gb`/`drive_type` questions were asked instead of auto-resolved. `/start` now forwards `components[]` too (the `ref` answer path already did) → [intake]
911. ✅ Editable instance specs: the "Instanz bearbeiten" card now exposes a key/value editor for `items.InstanceSpecs` (previously write-only via the intake API), and `PATCH /api/items/:id/instance` accepts an `InstanceSpecs` object with full-replace semantics so operators can correct, add, or delete per-instance specs → [item-lifecycle]
910. ✅ Add optional category-level `guidance[]` prompt snippets to spec contracts (`contracts/specs/<sub>.json`): human-authored hints injected per subcategory into the extraction + supervisor review placeholders to steer the LLM on things it often gets wrong (e.g. laptops: don't mention OS in prose) → [agentic]
909. ✅ Agentic auto-retry without re-searching: keep-busy now also claims settled `failed`/`cancelled` runs (cooldown-gated) for retry, and search reuse moved into the invoker as the single decision — it reuses stored `LastSearchLinksJson` whenever present and searches live only when none exist (or a reviewer flagged missing specs). Search results are now persisted the moment they're retrieved (`persistAgenticSearchLinks`), so a run that later fails still leaves them for a search-free retry. Net: an item hits the search provider at most once until reset → [agentic]
908. ✅ Fix agentic search-token burn: the idle-fill "keep-busy" dispatcher used a plain `SELECT` (`fetchIdleFillAgenticRuns`) that re-selected the same `notStarted`+`SearchQuery` runs on every 5s tick, re-billing identical search queries. Replaced with an atomic `claimIdleFillAgenticRuns` (`notStarted`→`running`, `FOR UPDATE SKIP LOCKED`) mirroring the queued path, so each keep-busy run is dispatched exactly once and satisfies the `=== running` promotion guard → [agentic]
907. ✅ Add missing `toMatchObject` matcher to the custom test harness (`test/harness.js`): a recursive subset match reusing the existing partial-match helpers — unblocks the 16 spurious `toMatchObject is not a function` failures across the suite → [testing]
