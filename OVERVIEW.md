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

1043. ✅ **Unified self-heal sweep with an entry-point router (acts on both staleness axes, gated).** Operator's correction: a standards (exclusion/style) change can be fixed by re-wording, but a spec-contract change needs *extraction* — and supervision must happen either way. New pure `decideSelfHealAction` routes each stale item to the cheapest correct entry point: `skip`/`restamp`/`rework` (targeted extraction)/`reword` (search-free run, wording re-applies house rules)/`rerun` (full search-free run when both axes stale — a targeted rework would skip wording). The sweep acts via a `skipSearch` run (supervised — supervision runs on every extraction), stamping both versions so it self-limits. `planSelfHealSweep`/`previewSelfHealSweep`; contract-only funcs delegate. Lean wording-only entry deferred (needs standalone supervisor call). Behind `AUTO_REWORK` (default off). 1186 pass; tsc clean. → [agentic]
1042. ✅ **Stamp `StandardsVersion` on runs + surface the standards backlog (stale-data self-heal, slices 1–2).** So the exclusion rules (#1041) can clean up the *existing* catalogue, not just new runs. Split for safety: slice 1 stamps the applied standards version on each completed run (new `agentic_runs."StandardsVersion"` column, wired end-to-end like `SpecContractVersion`); slice 2 adds an **observation-only** `planStandardsSweep`/`previewStandardsSweep` dry-run + a sweep log line (`standardsStale: N`) reporting which settled items predate the current standards version. No reprocessing wired — the acting re-word (slice 3) stays flag-gated and needs explicit go. 1178 pass; tsc clean. → [agentic]
1041. ✅ **Operator exclusion rules via the wording step (control surface, slice 1).** Root cause of RAM/hardDrive/OS leaks: additive pipeline, no step owned removal, and a deterministic denylist can't track every spelling. Fix (direction D): one step — **wording** — applies **operator rules** from `standards.json` (`exclusions: string[]`, plain language) **semantically** (so "no OS" catches "Betriebssystem"), removing matching specs **and** prose; a contract-defined field is protected by a safety net. Retired the brittle `reference-instance-filter` denylist. First "say it once, the pipeline obeys" slice. 1176 pass; tsc clean. → [agentic]
1040. ✅ **Robust ref/instance key-drop (fix brittle denylist).** An auto-approved item still had `RAM`/`hardDrive`/`OS` as specs — the exact-key denylist missed variants. Rewrote `dropInstanceSpecKeys`: concept-match (German stems as substrings, short tokens word-bounded) + the **spec contract as authority** (a key the contract defines survives; a drive's `Speicher`/module's `RAM-Kapazität` stay) + capability guard. Host detection hardened (assembly `ram`/`storage` slot OR `RAM-Slots` field). Only acts on fresh runs for host subcategories. 1181 pass; tsc clean. → [agentic]
1039. ✅ **Data-quality badge polish + OS drop.** Badge moved to the top of the KI tab (under the buttons) and given its **own** label scale (Vollständig/Gut/Ausreichend/Lückenhaft/Mangelhaft) instead of the wrongly-reused condition labels ("Neuwertig"). Installed **OS** added to the ref/instance key-drop (per-unit, like RAM/disk). 1179 pass; tsc clean. → [ui]
1038. 🐞 **FIX: findings panel + data-quality badge never rendered (wrong data source).** The UI reads `agentic` from `GET /api/items/:id`, which returned the bare run and never computed `CurrentFindings`/`CurrentDataQuality` — those were only attached by the *status* endpoint. So the entire review-by-exception surface (findings, "Beheben", badge, wizard step markers) was inert in the real app, only alive in the preview harness. Fixed with one shared `attachCurrentReviewSignals(run, ref)` called by both endpoints. Explains the "no extra info/quality" report. 1179 pass; tsc clean. → [agentic]
1037. ✅ **Deterministic ref/instance backstop — strip installed RAM/disk from the reference.** The #1011 prevention prompt kept leaking (model still put fitted RAM/disk in references), so added a deterministic strip in `item-flow`, scoped to slotted compute devices (assembly has a `ram`/`storage` part): `stripInstalledSizesFromName` cleans fitted sizes from the Artikelbeschreibung (a name — safe), `dropInstanceSpecKeys` drops bare installed Langtext keys (capability keys kept). Kurzbeschreibung prose left to wording (grammar). New `reference-instance-filter.ts` + tests; 1177 pass; tsc clean. → [agentic]
1036. ✅ **Spec value canonicalization — deterministic layer (lever L11, slice 1).** The value-level twin of key canonicalization: `canonicalizeSpecValue`/`canonicalizeSpecValuesRecord` fold known variants (`DP`/`Display Port`→`DisplayPort`) onto a canonical value, wired into `item-flow` right after the key fold. Whole-value, case-insensitive, idempotent — the safe "auto-correct a known" (no prose, no model). Seed vocab (`Anschlüsse`, `Speichertyp`); compound/multi-token + operator-editable vocab deferred. 1172 pass; tsc clean. → [agentic]
1035. ✅ **Findings are the residue (prevent-not-flag, step 1).** Per-finding **"Beheben"** now shows only for `missing_required` (a regenerate is the right fix only when the value is absent). A banned phrase is a deterministic known the wording pass rewrites away (no safe strip — substring rules), and an intake conflict needs A/B (L5c); neither poses a "click to fix" ask anymore. Resolves the operator's "why flag what we can correct?" critique. 1167 pass; tsc clean. → [ui]
1034. 🔧 Plan refinement: **slotted components (RAM/disk/battery) are ASSEMBLY, not flat instance-specs** — verified the laptop/PC assembly contracts already model a `ram` slot (`multipleAllowed`→603), filled per unit via `Zerlegt_aus`/`SlotKey` and scored by the condition grade. Data model has three homes: reference capability · assembly slots · `scope:'instance'` for non-slotted values only. Narrows L7's scope field. → [docs-infra]
