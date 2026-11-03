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

1054. 🐞 **FIX: "Run now" executes the sweep synchronously + reports why (end the "nothing happens" guessing).** The button only set a force flag and deferred to a tick (no feedback), and the preview ignores the flags on purpose — so a full preview never proved `AUTO_REWORK`/`AUTO_REVIEW` were actually enabled in the running process (if not, the sweep bailed silently on `no-flags-enabled`). Now `POST /api/admin/agentic-self-heal` runs `runSelfHealSweepNow()` synchronously (reusing the dispatcher's captured deps, no idle gate) and returns what it did — up to 5 enqueues or a reason; the card reports it in words and refreshes. `sweepContractRework` returns a `SelfHealSweepResult`. 1205 pass; tsc clean. → [agentic]
1053. ✅ **Main-category spec-contract fallback + draft proposals.** Only 12 of ~140 subcategories had a spec contract, so most items got no completeness findings/grade/self-heal. `getSpecContract` now layers a shared `specs/group-<Hauptkategorie>.json` over the subcategory file (mirrors `getQualityContract`'s group pattern) — one group covers a whole main category; subcategory fields win on conflict. Inert until a group file exists. Draft proposals (group-90/10/70 + coverage README) in `docs/proposals/spec-contracts/`, out of `contracts/specs/` so they don't auto-activate. 1205 pass; tsc clean. → [agentic]
1052. 🐞 **FIX: self-heal sweep was starved by the keep-busy feeder (+ "run now").** Flags all on, preview showed 37 stale, yet nothing ran: the sweep required `autoFed === 0`, but the feeder tops up the waiting queue nearly every tick, so it was permanently starved whenever any notStarted backlog existed. Dropped that condition (kept `scheduled === 0`); added `POST /api/admin/agentic-self-heal` + a "Jetzt ausführen" button that forces a sweep on the next tick. 1205 pass; tsc clean. → [agentic]
1051. ✅ **Fix the Speicher/Kapazität leak.** Storage subcategories require `Speicher` (capacity), but the model emits it as `Kapazität`/`Capacity`, which the key canonicalizer didn't fold — so `Speicher` stayed empty and `missing_required` fired forever (the operator's recurring bug, and much of the self-heal preview's rerun backlog). Added `Kapazität`/`Kapazitaet`/`Capacity`/`Speicherplatz` to `SPEC_KEY_VARIANTS.Speicher` (exact whole-key fold; `RAM-Kapazität` untouched) + reinforced the extract prompt's exact-key rule with the concrete example. 1202 pass; tsc clean. → [agentic]
1050. ✅ **Admin card: Self-Heal preview.** Renders `GET /api/admin/agentic-self-heal` on the admin page (next to auto-dispatch): flag states, standards version, `staleCount/totalCandidates`, per-action counts, and a table of stale items (status, action, version transitions). `staleCount: 0` explains itself — the sweep triggers only on a version bump **and** after contract caches reload (restart or admin contract upload; editing a JSON on disk alone isn't picked up, the registry caches per process). Read-only + refresh. → [ui]
1049. ✅ **Self-heal preview endpoint — make the sweep observable (L4b).** Operator turned the flags on and saw nothing, with no way to tell why. New admin read `GET /api/admin/agentic-self-heal` → `getSelfHealPreview()` shows the eligible backlog across all statuses *regardless of flag gating*: `{ flags, standardsVersion, totalCandidates, staleCount, counts, byStatus, items }`. `staleCount: 0` ⇒ nothing is stale (the common gotcha: editing `standards.json` exclusions without bumping its `version` leaves every item stamped "current"); a flag `false` ⇒ that slice won't act. Pure read, reuses tested `planSelfHealSweep`. 1202 pass; tsc clean. → [agentic]
1048. ✅ **Pending-review self-heal — the pipeline re-judges the human-review backlog (AUTO_REVIEW, gated).** The queue we ultimately want to shrink. Under the new default-off `AUTO_REVIEW` flag, the idle sweep also picks up version-stale `review` items and re-runs them through the supervised pipeline so they're re-judged under the current rules — now-clean ones auto-approve (needs `AUTO_APPROVE`), the rest stay in review. Safety: a review item is never silently re-stamped (dropped to skip), and version-current pending items are left for the human (no thrash). Review-by-exception — the supervisor re-judges, we don't deterministically override. `listContractAuditCandidates(limit, statuses)`; event `PendingReviewSelfHeal`. 1202 pass; tsc clean. → [agentic]
1047. ✅ **One-line run verdict (deterministic "what happened" summary).** Operator: the diff works but is cluttered — wanted a one-sentence verdict. The `summary` field was a hardcoded placeholder; the real signals (status + findings + grade) were never composed. New pure `composeRunVerdict` builds a scannable line (`Review nötig · Datenqualität 2/5 (Lückenhaft) · 2 Pflichtfelder fehlen (Speicher, Speichertyp)`), attached as transient `CurrentVerdict` (same source as findings/grade) and shown as a banner atop the KI tab. Reused by the pending-review sweep next. 1193 pass; tsc clean. → [agentic]
1046. ✅ **Unified self-heal sweep with an entry-point router (acts on both staleness axes, gated).** Operator's correction: a standards (exclusion/style) change can be fixed by re-wording, but a spec-contract change needs *extraction* — and supervision must happen either way. New pure `decideSelfHealAction` routes each stale item to the cheapest correct entry point: `skip`/`restamp`/`rework` (targeted extraction)/`reword` (search-free run, wording re-applies house rules)/`rerun` (full search-free run when both axes stale — a targeted rework would skip wording). The sweep acts via a `skipSearch` run (supervised — supervision runs on every extraction), stamping both versions so it self-limits. `planSelfHealSweep`/`previewSelfHealSweep`; contract-only funcs delegate. Lean wording-only entry deferred (needs standalone supervisor call). Behind `AUTO_REWORK` (default off). 1186 pass; tsc clean. → [agentic]
1045. ✅ **Stamp `StandardsVersion` on runs + surface the standards backlog (stale-data self-heal, slices 1–2).** So the exclusion rules (#1041) can clean up the *existing* catalogue, not just new runs. Split for safety: slice 1 stamps the applied standards version on each completed run (new `agentic_runs."StandardsVersion"` column, wired end-to-end like `SpecContractVersion`); slice 2 adds an **observation-only** `planStandardsSweep`/`previewStandardsSweep` dry-run + a sweep log line (`standardsStale: N`) reporting which settled items predate the current standards version. No reprocessing wired — the acting re-word (slice 3) stays flag-gated and needs explicit go. 1178 pass; tsc clean. → [agentic]
