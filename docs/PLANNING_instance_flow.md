# Instance Agentic Flow — Planning

Status: **design agreed, not yet built.** A per-**instance** agentic flow that consumes intake data
to fill instance specs and reconcile a physical device against its reference (`item_refs`) —
enriching items and surfacing bad references. It **never mutates reference data directly**: its only
route to change a ref is to *trigger a `rework` run* on that ref, which flows through the existing
review / auto-approve gate.

This became a major feature: it also introduces run **history** (today there is one mutable run per
reference) and a global **KI-Runs** list. Both are scoped below to the lowest-risk shape we found.

Related: intake changelog (auto-resolve #903, complete-item #900), agentic README, todo #2
(reference-keyed runs), #47 (cpu persistence), #48 (ambiguous fields), #50 (rework agent),
#51 (auto-approve). Deferred todo: "Intake: scan.txt augmentation of agentic extraction."

---

## 1. Organizing principle — one engine, `scope` + a reconcile stage

Everything is one pipeline, not a parallel flow:

- **scope** ∈ `reference` | `instance` — what the run reads and *owns* (may write).
- **mode** ∈ `extract` (full, web-search) | `rework` (partial, grounded, cat/pricing skipped) |
  `reconcile` (**item-read-only**, see §6).

`reconcile` is special: it is both the **final stage** of every full `extract`/`rework` run (called
inline for a free quality score) **and** a **standalone run mode** invocable on any existing item
without re-running extraction. That dual nature is what lets us reconcile the entire backlog without
mutating item/review state — see §6.

| | reference | instance |
|---|---|---|
| **extract** | today's flow (web search → ref `Langtext`) | — |
| **rework** | targeted ref fix (#893, exists) | fill instance specs from measured data |

The "instance flow" is **scope=instance**, mode=`rework`(fill), ending in the reconcile stage. It
writes **only** `items.InstanceSpecs` directly. Its ref-facing output is **always** a triggered
`rework` run on the reference — never a direct `item_refs` write.

Reuse fact: `rework` is already a mode of the one pipeline (`reworkSpecFields` / `reworkInstructions`
→ `applyReworkPartialUpdate`, cat/pricing skipped). We add an instance-keyed scope, not a new engine.

## 2. The reference-change rule

> The instance flow never mutates `item_refs`. When it finds evidence a ref field is wrong or
> missing, it **enqueues a `rework` run on the ref** (existing Artikelnummer machinery + gate) with
> the evidence in `reworkInstructions`. Whether that proposal auto-applies or waits for an operator is
> the **auto-approve gate's** decision (#51), per confidence.

"Automatic, based on evidence" = automatically *produce an evidence-backed rework that flows through
the trusted path.* No second ref-writing code path exists.

## 3. Data ownership — the item stays the source of truth

Decided: **data lives on the item, as today** (per-field approval was rejected because `Langtext`
bundles many fields under one value; whole-`Langtext` approval stays). Consequences:

- The item (`items` / `item_refs`) remains the operational + shop-ready source of truth that ERP,
  search, print, and export already read. `ReviewState` gates export, unchanged.
- **Runs are history + observability + the reconcile quality metric** — not a staging area. A run's
  "changes" view is a *historical diff of what that run wrote* (before → after), not a pending inbox.
- Manual operator edits (#911) and run writes both land on the item; the review gate and the
  `ambiguousFields` surfacing remain the conflict mechanism (no new merge layer).

## 4. Data available after intake (mostly unused today)

| Source | Column / location | Read by AI pipeline today? |
|---|---|---|
| Raw scan | `items.IntakeScan` (JSON: vendor, model, cpu, ramMb, batteryPercent, serial, mac, components[]) | **No** — written, never read |
| Quality-derived specs | `items.InstanceSpecs` (JSON) | Partial — 3 keys via `INTAKE_TO_SPEC` |
| Quality assessment | `quality_assessments.derived_specs` + condition answers | **No** |
| Phase-2 test files | `{intake-scans}/{serial}/` (+ MAC fallback, `lib/external-docs.ts`) | **No** (deferred todo) |

## 5. Contract approach — `scope` on the spec contract

Add optional fields to `SpecContractField` (`models/spec-contract.ts`):

```jsonc
{ "key": "RAM", "required": true, "scope": "instance",
  "measuredSignal": "ram", "description": "Installed memory in GB" }
```

- `scope`: `"reference"` (default — full back-compat) | `"instance"`.
- `measuredSignal`: generalizes today's hardcoded `INTAKE_TO_SPEC` into the contract (JSON, not code).

The quality/assembly contracts stay the instance **fill sources**; the spec contract's `scope` tag is
the **reconciliation authority** — it names which fields are comparable between an instance's measured
value and the reference `Langtext`. Migration: update contracts, leave stored data as-is (operators +
rework agent #50 correct drift). No backfill.

## 6. Reconcile — an item-read-only step, inline *and* standalone

Reconcile is **non-blocking** and, critically, **never writes item enrichment data**. It reads (item
current state + evidence) and writes **only**:
- the run/history record (verdicts + **data-quality score**), and
- optionally a spawned `rework` proposal (already gated — not a direct write).

Because it is pure w.r.t. the item's `Langtext` / `InstanceSpecs` / `ReviewState`, the same
`reconcile()` serves two invocation paths with no state-mutation risk:
- **Inline**: the final step of every full `extract`/`rework` run — a free quality score on fresh runs.
- **Standalone (`mode=reconcile`)**: invoked on any existing item as its own minimal run — no
  extraction / pricing / categorizer, no review reopen, zero item-data mutation. This is what makes
  the **entire backlog reconcilable** without re-running the heavy flow.

Outputs:
- A run-level **data-quality score** — explicitly *not* the device `Qualität` (1–5 condition); it
  scores how well the produced data coheres with the evidence. Source of truth is the run/history row;
  an **additive** denormalized copy on the item snapshot (`AiDataQuality`-style field) is allowed for
  list/filter. Reconcile's item write surface is **that one additive field only** — never Langtext /
  InstanceSpecs / ReviewState.
- When **instance evidence** exists, it also does the **device ↔ ref comparison** and emits verdicts;
  a `wrong_ref` / `missing_on_ref` verdict spawns a ref `rework` (§2). On a reference-only legacy item
  (no intake data) it degrades to a cheap self-consistency score.

**Backfill without mutation:** stamp `LastReconciledAt` + `ReconcileVersion` on the snapshot row
(exactly as `SpecContractVersion` is stamped today). An idle **`sweepReconcile`** (mirroring
`sweepContractRework`, #894, in `dispatchQueuedAgenticRuns`) enqueues `mode=reconcile` runs where the
stamp is null/stale — self-limiting via the stamp, capped by the running/waiting limits, gated by an
`AUTO_RECONCILE` flag + the existing kill switch (#913). Historical items simply have a null stamp and
drain over time. No migration, no bulk mutation.

| Verdict | Meaning | Action |
|---|---|---|
| `match` | Instance agrees with ref | none |
| `missing_on_ref` | A **reference**-scoped field the ref lacks, consistently evidenced | enqueue ref `rework` (fill) |
| `wrong_ref` | Instance's measured **reference**-scoped attribute contradicts the ref | proposal: relink / correct Artikelnummer (suggest via `searchItemReferences`, #913) |
| `instance_variance` | Field differs across instances of one ref | none — belongs in instance scope |

Only reference-scoped fields may propose a ref change; instance-scoped divergence is
`instance_variance`, never `wrong_ref`. **[open: score scale + whether low coherence forces review]**

## 7. Triggers

Intake `/complete` (first), item creation, and instance change (`InstanceSpecs` / quality edits).
Reuse the `notStarted → queued` feeder discipline (#913). **Coalesce per `ItemUUID`** so
create→intake→edit doesn't spawn near-duplicate instance runs. Instance runs carry no live web search
(they reuse stored `LastSearchLinksJson` only), so auto-triggering is affordable.

## 8. Run history & storage — latest-row snapshot + append-only history

Today `agentic_runs` is **one mutable row per `Artikel_Nummer` (`UNIQUE`)**, upserted — no run
history — and the transcript is a single per-item file, overwritten each run. Rather than convert
`agentic_runs` to append-only in place (which would force changes on every existing reader —
`getAgenticRun`, the item/box `LEFT JOIN ar.Artikel_Nummer = i.Artikel_Nummer`, the upsert
dispatcher):

> **Keep `agentic_runs` as the "latest run per target" snapshot** (one row — existing readers
> untouched). **Add an append-only `agentic_run_history`** row per completed run, carrying the
> transcript (jsonb on the row, self-contained — no media dependency) + inputs + written diff +
> reconcile verdicts + data-quality score. The **KI-Runs list reads history**; item lists / export
> keep reading the snapshot.

The snapshot is a denormalized cache of the newest history row. Existing data seeds as "run 1".
Instance runs relax the snapshot key to `(scope, Artikel_Nummer, ItemUUID)`; only new code reads
instance rows, so nothing legacy breaks. **[open: transcript jsonb vs. per-run file + retention]**

## 9. What a run record carries (KI-Runs detail tabs)

- **Übersicht**: id, scope, mode, target(s) (`Artikel_Nummer` / `ItemUUID`), subcategory,
  `SpecContractVersion`, status, timestamps, duration, retries/error, **trigger provenance**
  (intake-complete / creation / instance-edit / manual / sweeper), actor, **run graph** (parent run
  that spawned this, child runs), affected item(s).
- **Eingaben & Kontext**: target snapshot at start (the "before"), measured `IntakeScan` facts,
  quality answers, Phase-2 summaries, image-attached flag, `missing/unneededSpecFields`,
  `reworkSpecFields` + instructions, carried review notes, search query + `LastSearchLinksJson`,
  few-shot example block.
- **Transkript**: per-stage sections (search → extraction → categorizer → pricing → supervisor →
  reconcile): prompts/messages, tool invocations, raw responses, retries, schema-correction / JSON
  repair, model/provider, latency/tokens if captured.
- **Änderungen dieses Laufs**: historical diff (before → proposed/written) per field, routed to ref
  vs. instance, with evidence/source citation; category + pricing + shop-field outputs;
  `autoApprovable` + the auto-approve signal snapshot.
- **Abgleich**: reconcile verdicts + evidence + suggested action (relink candidates); the
  **data-quality score**; the spawned ref-`rework` run link.
- **Review & Verlauf**: `ReviewState`, `LastReviewDecision`, `ReviewedBy`, `LastReviewNotes`,
  `agentic_run_review_history` entries, applied-at/by, resulting `events` diff rows.

The **item KI tab** renders a compressed card of the latest relevant run(s) — latest instance run +
latest ref run + any open findings — and deep-links into the run detail.

## 10. UI — a new `KI-Runs` list type

Reuses the established list/detail/tab shell (`ItemListPage` / `BoxListPage` /
`RecentActivitiesPage`). There is no dedicated runs list today (runs surface only per-item in
`ItemKiTab` + admin cards `AgenticOverviewCard` / `AgenticDispatchCard`).

- **List**: all runs from `agentic_run_history`, filterable by scope / mode / status / target.
  Graduates the admin "KI queue" card into a navigable list.
- **Detail**: the tabs in §9.
- **Per-item quick trigger** stays in `ItemKiTab`; its output renders via the same run-detail model.

## 11. Phasing

- **Phase 1 — contract `scope`/`measuredSignal` + deterministic instance fill (no LLM, no history, no
  new run type).** Extend `SpecContractField`; retag `201.json` instance fields; replace
  `INTAKE_TO_SPEC` with contract-driven binding; read `IntakeScan` in the fill path; persist scanned
  `cpu` (#47). Shippable; de-risks the schema first.
- **Phase 2 — run history + identity.** Add `agentic_run_history` (append-only, transcript on the
  row) writing on every completed run; seed existing data as run 1; relax the snapshot key to
  `(scope, Artikel_Nummer, ItemUUID)`. Existing readers untouched.
- **Phase 3 — reconcile (item-read-only), inline + standalone + backfill.** Add `reconcile()` as the
  post-supervisor stage of full runs AND a standalone `mode=reconcile` run; data-quality score
  (additive item field), device↔ref verdicts + ref-`rework` spawn; `LastReconciledAt`/`ReconcileVersion`
  stamp + `sweepReconcile` idle backfill (`AUTO_RECONCILE`) so the existing backlog is reconciled with
  no item/review mutation.
- **Phase 4 — the instance flow proper.** scope=instance `rework` run keyed on `ItemUUID`,
  auto-triggered on intake `/complete` (coalesced), reusing stored search only.
- **Phase 5 — `KI-Runs` list type + run-detail tabs** (reading history) + auto-approve interplay
  (low coherence / `wrong_ref` → force review).
- **Phase 6 (later) — Phase-2 test-file summarization** (deferred "scan.txt augmentation");
  reconciliation → aggregate auto-approve signals; rework-agent auto-correction of drifted refs;
  additional triggers (creation, instance edits) if not already in Phase 4.

## 12. Complexity guardrails (committed)

1. Reuse `rework` mode for every ref change — no new ref-writer.
2. Instance flow never hits the web (reuses stored search) — grounded, cheap, safe to auto-trigger.
3. Latest-row snapshot + history table — existing readers untouched; no in-place append migration.
4. Reconcile is item-read-only + non-blocking — inline stage and standalone backfillable run; never
   fails a good run and never mutates item enrichment/review state.
5. Data stays on the item; whole-`Langtext` approval; no staging/merge layer.
6. One `KI-Runs` surface (reused list/detail/tab shell), not per-capability widgets.
7. Confidence/coherence gating reuses auto-approve (#51), not a new policy engine.

## 13. Open questions (carry into build)

1. Transcript storage: jsonb on the history row (leaning this) vs. per-run file + retention policy.
2. Data-quality score: scale, and whether low coherence force-routes a run to review / blocks
   auto-approve.
3. Auto-approve on a reconciliation-driven ref `rework`: confidence bar to auto-apply vs. always stop
   at an operator for ref changes specifically.
4. `wrong_ref` corroboration: how strong a single scan signal, or how many agreeing instances, before
   surfacing "wrong reference" vs. staying silent.

## Resolved decisions

- Instance flow may **only trigger a `rework`** on a ref; never mutates `item_refs` directly.
- Propose-only to the ref, but a proposal may auto-apply through the existing auto-approve gate.
- **Data stays on the item** (as today); whole-`Langtext` approval; no per-field approval, no
  staging/merge layer.
- **Reconcile is item-read-only and dual-path**: the final non-blocking stage of every full run AND a
  standalone `mode=reconcile` run. It writes only the run/history record + one additive item quality
  field (never Langtext / InstanceSpecs / ReviewState), so the entire backlog can be reconciled via an
  idle `sweepReconcile` (version-stamped, `AUTO_RECONCILE`-gated) without mutating item/review state.
  No heavyweight separate pipeline — one `reconcile()`, two invocation paths.
- **Run history via latest-row snapshot + append-only `agentic_run_history`** (existing readers
  untouched); existing data seeded as run 1.
- Contracts updated; existing stored data left as-is.
- Auto-trigger on intake `/complete` (first), coalesced per `ItemUUID`.
- `InstanceText` (custom per-instance prose) is **out of scope**.
- UI is a new `KI-Runs` list type, not a separate "proposals" abstraction.
