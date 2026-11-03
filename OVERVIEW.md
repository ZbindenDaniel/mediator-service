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

1059. 🐞 **FIX: run target dropped the category → self-heal death loop + good items wrongly in review.** One item burned millions of tokens looping; many complete+clean items landed in review reading "5/5 · keine offenen Punkte". Single cause: `buildTargetFromRow` omitted `Unterkategorien_A`, so the run's `subcategoryCode` was null → no contract → `SpecContractVersion` stamped null AND the grade computed null. So a rework could never become non-stale (sweep re-picked it forever) and a validate-only item graded null at the auto-approve gate → review. Fix: the target now carries the category (coerced to number); a full run's categorizer still overwrites it. Belt-and-braces: a 30-min self-heal cooldown bounds any future loop. 1216 pass; tsc clean. → [agentic]
1058. ✅ **Auto-approve conservatism — data-quality floor + sweep respects the queue cap.** Operator saw an item auto-approved reading "Datenqualität 3/5 · 2 Pflichtfelder fehlen". That one is a *staleness artifact* (approved under a looser contract, then fields became required; the self-heal reworks it) — the gate never approves *with* block findings. But the principle needed teeth: auto-approve now also requires a grade floor — supervised runs ≥ `AUTO_APPROVE_MIN_GRADE` (4), validate-only (no supervisor) must hit grade 5, null grade never. And the self-heal sweep now only enqueues when `waiting < MAX_WAITING_RUNS`, so it keeps the pipeline busy without flooding it. Plus: the KI-tab verdict banner now colours by finding severity (red/amber/green) so a settled-but-not-shop-ready item stands out. 1214 pass; tsc clean. → [agentic]
1057. ✅ **Transcript viewer — "what the agent did", inline (KI-Runs surface, slice 1).** The only window into a run was a raw-JSON "Protokoll öffnen" link. New `TranscriptViewer` renders the stored transcript as collapsible per-stage sections (search→extraction→supervisor→…→wording) in the KI tab — each stage's response, with request/messages/tool-calls nested, German labels, last stage open. Loads on demand from the existing `TranscriptUrl` (no new backend); raw-link fallback for legacy transcripts. First slice of the planned KI-Runs surface, pulled forward from existing data. 1211 pass; tsc clean. → [ui]
1056. ✅ **Enrol-time triage — skip the full run for refs whose data is already good (validate-only).** The feeder enrols every run-less ref (462) for a full search→extraction→categorization run; many already have good data, wasting LLM calls and risking churn. New validate-only path assesses the *existing* content and hands it to the auto-approve gate with no LLM. `isValidateOnlyEligible(ref)` (has a spec contract + no block/warn finding) routes already-good refs to it at enrol; the rest get a full run. Triage only ROUTES — approval stays the result handler's separate gate. Rides `pendingValidateOnly`; `runItemFlow` branches after `buildSpecContext`. 1211 pass; tsc clean. → [agentic]
1055. 🐞 **FIX: self-heal sweep never reached an actionable item + feeder now enrols every ref.** The sweep loaded the 20 oldest runs *then* dropped contract-less ones — all 20 were contract-less, so it returned `nothing-stale` forever. Staleness + contract coverage now filter in SQL before the LIMIT (paged past review-restamp skips). The feeder, when the `notStarted` pool runs dry, enrols just enough run-less refs (462 locally) to fill the free waiting slots, so the whole catalogue trickles through. → [agentic]
1054. 🐞 **FIX: "Run now" executes the sweep synchronously + reports why (end the "nothing happens" guessing).** The button only set a force flag and deferred to a tick (no feedback), and the preview ignores the flags on purpose — so a full preview never proved `AUTO_REWORK`/`AUTO_REVIEW` were actually enabled in the running process (if not, the sweep bailed silently on `no-flags-enabled`). Now `POST /api/admin/agentic-self-heal` runs `runSelfHealSweepNow()` synchronously (reusing the dispatcher's captured deps, no idle gate) and returns what it did — up to 5 enqueues or a reason; the card reports it in words and refreshes. `sweepContractRework` returns a `SelfHealSweepResult`. 1205 pass; tsc clean. → [agentic]
1053. ✅ **Main-category spec-contract fallback + draft proposals.** Only 12 of ~140 subcategories had a spec contract, so most items got no completeness findings/grade/self-heal. `getSpecContract` now layers a shared `specs/group-<Hauptkategorie>.json` over the subcategory file (mirrors `getQualityContract`'s group pattern) — one group covers a whole main category; subcategory fields win on conflict. Inert until a group file exists. Draft proposals (group-90/10/70 + coverage README) in `docs/proposals/spec-contracts/`, out of `contracts/specs/` so they don't auto-activate. 1205 pass; tsc clean. → [agentic]
1052. 🐞 **FIX: self-heal sweep was starved by the keep-busy feeder (+ "run now").** Flags all on, preview showed 37 stale, yet nothing ran: the sweep required `autoFed === 0`, but the feeder tops up the waiting queue nearly every tick, so it was permanently starved whenever any notStarted backlog existed. Dropped that condition (kept `scheduled === 0`); added `POST /api/admin/agentic-self-heal` + a "Jetzt ausführen" button that forces a sweep on the next tick. 1205 pass; tsc clean. → [agentic]
1051. ✅ **Fix the Speicher/Kapazität leak.** Storage subcategories require `Speicher` (capacity), but the model emits it as `Kapazität`/`Capacity`, which the key canonicalizer didn't fold — so `Speicher` stayed empty and `missing_required` fired forever (the operator's recurring bug, and much of the self-heal preview's rerun backlog). Added `Kapazität`/`Kapazitaet`/`Capacity`/`Speicherplatz` to `SPEC_KEY_VARIANTS.Speicher` (exact whole-key fold; `RAM-Kapazität` untouched) + reinforced the extract prompt's exact-key rule with the concrete example. 1202 pass; tsc clean. → [agentic]
1050. ✅ **Admin card: Self-Heal preview.** Renders `GET /api/admin/agentic-self-heal` on the admin page (next to auto-dispatch): flag states, standards version, `staleCount/totalCandidates`, per-action counts, and a table of stale items (status, action, version transitions). `staleCount: 0` explains itself — the sweep triggers only on a version bump **and** after contract caches reload (restart or admin contract upload; editing a JSON on disk alone isn't picked up, the registry caches per process). Read-only + refresh. → [ui]
