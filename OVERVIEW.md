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

1038. 🐞 **FIX: findings panel + data-quality badge never rendered (wrong data source).** The UI reads `agentic` from `GET /api/items/:id`, which returned the bare run and never computed `CurrentFindings`/`CurrentDataQuality` — those were only attached by the *status* endpoint. So the entire review-by-exception surface (findings, "Beheben", badge, wizard step markers) was inert in the real app, only alive in the preview harness. Fixed with one shared `attachCurrentReviewSignals(run, ref)` called by both endpoints. Explains the "no extra info/quality" report. 1179 pass; tsc clean. → [agentic]
1037. ✅ **Deterministic ref/instance backstop — strip installed RAM/disk from the reference.** The #1011 prevention prompt kept leaking (model still put fitted RAM/disk in references), so added a deterministic strip in `item-flow`, scoped to slotted compute devices (assembly has a `ram`/`storage` part): `stripInstalledSizesFromName` cleans fitted sizes from the Artikelbeschreibung (a name — safe), `dropInstanceSpecKeys` drops bare installed Langtext keys (capability keys kept). Kurzbeschreibung prose left to wording (grammar). New `reference-instance-filter.ts` + tests; 1177 pass; tsc clean. → [agentic]
1036. ✅ **Spec value canonicalization — deterministic layer (lever L11, slice 1).** The value-level twin of key canonicalization: `canonicalizeSpecValue`/`canonicalizeSpecValuesRecord` fold known variants (`DP`/`Display Port`→`DisplayPort`) onto a canonical value, wired into `item-flow` right after the key fold. Whole-value, case-insensitive, idempotent — the safe "auto-correct a known" (no prose, no model). Seed vocab (`Anschlüsse`, `Speichertyp`); compound/multi-token + operator-editable vocab deferred. 1172 pass; tsc clean. → [agentic]
1035. ✅ **Findings are the residue (prevent-not-flag, step 1).** Per-finding **"Beheben"** now shows only for `missing_required` (a regenerate is the right fix only when the value is absent). A banned phrase is a deterministic known the wording pass rewrites away (no safe strip — substring rules), and an intake conflict needs A/B (L5c); neither poses a "click to fix" ask anymore. Resolves the operator's "why flag what we can correct?" critique. 1167 pass; tsc clean. → [ui]
1034. 🔧 Plan refinement: **slotted components (RAM/disk/battery) are ASSEMBLY, not flat instance-specs** — verified the laptop/PC assembly contracts already model a `ram` slot (`multipleAllowed`→603), filled per unit via `Zerlegt_aus`/`SlotKey` and scored by the condition grade. Data model has three homes: reference capability · assembly slots · `scope:'instance'` for non-slotted values only. Narrows L7's scope field. → [docs-infra]
1033. 🔧 Decision: ref/instance split via a **`scope` field** on `SpecContractField` (operator's pick over a separate instance-spec contract) — but **deferred to the instance arm (L7)**, not built now: verified there's no existing scope field, the RAM/Speicher in ref contracts is mostly capabilities/product-specs (correct), and a scope field with no consumer is inert. Decision locked (instance-flow §17 reversed); the RAM-in-ref leak stays held by the #1011 prevention rule. → [docs-infra]
1032. ✅ **`AGENTIC_MODEL_PROVIDER` now selects the model settings** — Ollama and OpenAI blocks can both stay configured; switching is one setting (previously a filled Ollama URL/model hijacked OpenAI runs). Generic `MODEL_*` keys are now fallbacks; per-provider vision models added. → [agentic]
1031. ✅ **Keep per-unit values out of the model reference** (prevention). A reviewer rejected "no RAM/harddrive in the model description" but the next run re-added them — the reject note reaches the model yet is soft and had no standing rule behind it. Added a standing rule to `extract.md` (no fitted RAM / disk capacity / battery wear / serial in description **or** specs; capabilities like "bis zu 32 GB" are fine) and `wording.md` (keep them out of prose). It's the ref/instance boundary made structural. Deterministic strip of already-present values deferred (needs the instance arm + Phase 0). → [agentic]
1030. 🔧 Plan: **the agentic process as one story** (`PLANNING_agentic_information_model.md`). An item is an information object filled over time from three sources (operator / web / intake test-evidence) toward a picture typed by **scope** — reference=capabilities, instance=installed — via three transforms (pipeline / intake / review). Core principle (resolves the operator's findings critique): each transform **auto-corrects deterministic knowns and escalates only judgment residue** — *a finding is the residue, not the defect list* (the guarantee phrase should be removed, not flagged). Levers §2c notes the pending L5 refinement. → [docs-infra]
1029. ✅ **Offline UI preview harness** (`npm run preview:ui`). Renders the agentic review surfaces — data-quality badge, findings panel with "Beheben", review wizard (stepper + verified-collapse) — from inline fixtures into `dist/ui-preview/index.html`, openable in any browser with **no backend, DB, model or real item**. Fixes the "can't get an item into the right state to see it" blocker. Verified by a headless-Chromium render check. → [testing]
