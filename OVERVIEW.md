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

911. ✅ Editable instance specs: the "Instanz bearbeiten" card now exposes a key/value editor for `items.InstanceSpecs` (previously write-only via the intake API), and `PATCH /api/items/:id/instance` accepts an `InstanceSpecs` object with full-replace semantics so operators can correct, add, or delete per-instance specs → [item-lifecycle]
910. ✅ Add optional category-level `guidance[]` prompt snippets to spec contracts (`contracts/specs/<sub>.json`): human-authored hints injected per subcategory into the extraction + supervisor review placeholders to steer the LLM on things it often gets wrong (e.g. laptops: don't mention OS in prose) → [agentic]
909. ✅ Agentic auto-retry without re-searching: keep-busy now also claims settled `failed`/`cancelled` runs (cooldown-gated) for retry, and search reuse moved into the invoker as the single decision — it reuses stored `LastSearchLinksJson` whenever present and searches live only when none exist (or a reviewer flagged missing specs). Search results are now persisted the moment they're retrieved (`persistAgenticSearchLinks`), so a run that later fails still leaves them for a search-free retry. Net: an item hits the search provider at most once until reset → [agentic]
908. ✅ Fix agentic search-token burn: the idle-fill "keep-busy" dispatcher used a plain `SELECT` (`fetchIdleFillAgenticRuns`) that re-selected the same `notStarted`+`SearchQuery` runs on every 5s tick, re-billing identical search queries. Replaced with an atomic `claimIdleFillAgenticRuns` (`notStarted`→`running`, `FOR UPDATE SKIP LOCKED`) mirroring the queued path, so each keep-busy run is dispatched exactly once and satisfies the `=== running` promotion guard → [agentic]
907. ✅ Add missing `toMatchObject` matcher to the custom test harness (`test/harness.js`): a recursive subset match reusing the existing partial-match helpers — unblocks the 16 spurious `toMatchObject is not a function` failures across the suite → [testing]
906. ✅ Fix `invalid input syntax for type integer: "201.0"` crash in reviewed-example selection: two read sites (`invoker.ts`, `db.ts`) now cast float-formatted subcategory TEXT via `ROUND(NULLIF(...)::NUMERIC)::INTEGER`, plus a one-time `normalize-category-values` cleanup script for the legacy `"201.0"` data → [agentic]
905. ✅ Auto-resolve robustness: `resolveIntakeQuestions` resolves a question's `showIf` against auto-answered controllers server-side (ask unconditionally when met, drop when not), so a dependent whose controller was `autoFill`/`skipAtIntake`-resolved is never wrongly hidden by the script → [intake]
904. ✅ Enrich intake quality questions: split the generic optical condition into Verfärbungen/Kleberückstände + Kratzer, add laptop condition checks (keyboard/display condition, swollen battery, hinges, dusty fan), and decouple `keyboard_layout` from the keyboard assembly part into the 201 quality contract so a human-only spec is never orphaned by skipping presence → [intake]
903. ✅ Auto-resolve intake questions from the scan: a question declares `autoFill: "<signal>"` (ram/storageSize/storageType/battery) or `skipAtIntake: true` in the contract, and the server auto-answers + drops it — so a laptop is asked only cosmetic condition + OS instead of re-confirming RAM/storage/battery/fan/display. Scan persisted server-side, no script change → [intake]
902. ✅ Generalize intake sub-devices to an extensible `components[]` object (`disks[]` becomes a shorthand): auto-create is serial-gated and kind-agnostic, and a detected serialless PCI device (GPU/NIC) fills assembly info by pre-filling `has_<slotKey>`/`<slotKey>_model` instead of creating an item → [intake]
900. ✅ Intake produces a complete item: the quality step now serves the subcategory's assembly (accessory) questions and scores/derives specs from them, back-fills the canonical required specs (Prozessor/RAM/Speicher) from the scan, and accepts full free-form instanceSpecs from the script (canonical keys, aligned by convention) → [intake]
899. ✅ Deferred-identity in-device components: intake materializes one reference-less component per scanned disk (serial-keyed reports, C- UUID), which graduates at Zerlegung via an atomic identity-set + UUID-swap; parent→Ersatzteil is now contract-gated, and components are excluded from export/print until extracted → [intake]
