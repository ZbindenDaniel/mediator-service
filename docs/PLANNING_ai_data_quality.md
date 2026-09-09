# PLANNING — AI Data Quality Lifecycle (the one plan)

> **Status:** DESIGN / thinking consolidated. This is the single plan that supersedes and folds in
> [`PLANNING_rework_feature.md`](PLANNING_rework_feature.md) (rework levers) and
> [`PLANNING_instance_flow.md`](PLANNING_instance_flow.md) (instance flow + reconciliation + KI-Runs).
> Both were earlier approaches to the *same goal*; neither is set in stone. Everything below is
> anchored on real operator pain, not on any one mechanism.
> **Ancestor (mostly shipped):** [`PLANNING_ai_runs_optimization.md`](PLANNING_ai_runs_optimization.md)
> (#916 search sources, #917 grounding, #918 snapshots/diff/restore).
> **Domain:** [agentic](changelogs/agentic.md) · Runbooks: [item-flow](detailed/item-flow.md), [review-flow](detailed/review-flow.md).

---

## 1. The pain (the north star — everything serves these five)

1. **No capacity to review runs; they pile up.** Review is a per-item, one-at-a-time chore with no
   queue, no triage, no throughput valve.
2. **Even approved items go bad.** The system's output quality evolves; "approved" is a point-in-time
   stamp, not a guarantee the content still meets today's bar. Approved ≠ still good.
3. **Reviews hit the same issues over and over** — content that's *too explicit* ("this Windows 10
   laptop with 8 GB RAM…"), unnecessary/marketing specs, formatting drift. The pipeline keeps making
   the same class of mistake; reviewers keep hand-fixing it individually.
4. **Intake and review are separated in time and people.** Whoever boots/catalogues a device is often
   not whoever reviews it, and not at the same moment. The current model assumes one operator threads
   an item from creation → review. Reality is async and multi-person.
5. **No broad overview of item data.** It is hard-to-impossible to see, across the inventory, what's
   good, what's stale, what's missing, what needs attention.

**The through-line:** *item data is a living asset, produced continuously by a pipeline whose notion of
"good" keeps changing, catalogued and reviewed by different people at different times — and there is no
operational surface to see it, keep it good over time, and share the load.*

This is not a "rework feature." It is a **data-quality lifecycle**. Rework, reconciliation,
auto-approve, and the runs page are all *mechanisms* inside one loop:

```
  produce ──▶ grade ──▶ surface ──▶ triage ──▶ review / rework ──▶ (standards evolve) ──▶ re-grade ──┐
     ▲                                                                                               │
     └───────────────────────────────────────────────────────────────────────────────────────────┘
```

Every pain maps to one weak link in that loop: #1 triage, #2 re-grade, #3 the "review/rework" step
repeating avoidable work, #4 surface+triage being person/time-independent, #5 grade+surface.

---

## 2. Why the contract "smells" — and what it means for this plan

One file, `contracts/specs/<subcategory>.json` (`{key, required, description}[] + guidance[]`), is wired
into **six** consumers: the extraction target schema, prompt `guidance[]`, the completeness gate
(`checkSpecGap → missingRequired`), the **auto-approve** gate, the **rework sweeper** staleness key
(`SpecContractVersion` vs the file's `version`), and the **Shopware** filterable-property whitelist
(`getFilterableSpecKeys`).

The coupling is legitimate — a pipeline must know what "complete" means. **The smell is overloading +
no change-governance:** one artifact is schema *and* guidance *and* completeness policy *and* approval
policy *and* staleness key *and* shop presentation, with a single `version` integer as the only knob.
So a "cleanup" edit silently moves extraction, review, auto-approve, rework, and shop filtering at once.
The recent capability-restructure proved it: field *meaning* changed (installed value → model
capability) with **no consumer updated** → `INTAKE_TO_SPEC` silently no-ops, and auto-approve + the
sweeper now grade against the wrong fields. It didn't just get tighter — it went quietly wrong.

**Consequence for this plan:** un-overload the contract (Phase 0). Separate the concerns it currently
conflates:
- **Schema** — what fields exist (the contract's real, legitimate job).
- **Standards** — what *good content* looks like (§Pillar C). Not the same as "which keys exist."
- **Policy** — completeness/approval thresholds and versioning discipline (explicit, testable).

This is also the direct root fix for pains #2 and #3: the thing that's *supposed* to encode "what good
looks like" is too overloaded to do it reliably.

---

## 3. The pillars (mechanisms, each mapped to pain)

### Pillar A — The Workbench: one operational surface  · pains #1, #4, #5
A **global KI-Runs / data-quality list** (reusing the `ItemListPage`/detail/tab shell — the "AI
processes page" idea, now with a real job). It is:
- the **shared work queue** — items needing attention, *decoupled from who created them or when*
  (directly serves #4);
- the **data overview** — quality grade, open findings, staleness, missing fields, filterable across
  the inventory (serves #5);
- the **triage console** — batch actions, filters by status/scope/grade/findings/subcategory (serves #1).

Run-detail tabs (Übersicht / Eingaben & Kontext / Transkript / Änderungen / Abgleich / Review & Verlauf)
per the instance-flow plan §9. Reuses shipped `AgenticSnapshotsPanel` (#918) + `AgenticSearchSources`
(#916). Read-only first; actions layer on in Pillar D.

### Pillar B — The Quality Signal: a measurable, explainable grade  · pains #1, #2, #5
A per-item **data-quality grade** (NOT the physical `Qualität` 1–5). Composed from:
- **completeness** (required fields present, via the schema),
- **conformance** (does content meet the Standards — Pillar C),
- **freshness** (graded against the *current* standards/contract version — this is what makes #2
  visible: an approved item whose grade dropped because the bar rose).

The grade drives triage (surface the worst), the auto-approve valve (Pillar F), and re-review
(staleness → re-surface). Informational first; gating later.

### Pillar C — Standards, separated from schema  · pains #2, #3
The heart of the "same issues every review" fix. Encode the house rules for *content shape* as a
**runtime-editable Standards artifact** (e.g. `contracts/guidelines/standards.json`, read fresh, no
redeploy) — distinct from the field schema:
- content rules: "don't over-explain / no narrative sentences", "no marketing or invented specs",
  formatting/German-style rules, per-subcategory do/don't (generalizes today's `guidance[]` + the
  reject-feedback loop #954, which currently re-learns these one rejection at a time).
Standards are used **twice**:
1. **Steer generation** — injected into extraction/supervisor (like `guidance[]`, but first-class).
2. **Grade & audit existing items** — an **LLM standards-auditor** (todo #50 Phase 2b) scores an item
   against the standards and proposes targeted reworks for violations. This is how "this Win10 laptop
   with 8 GB RAM…" and "unnecessary specs" get fixed *systematically* instead of re-typed by every
   reviewer.

### Pillar D — Rework: the single execution arm  · pains #2, #3
One rework path (regenerate a chosen field subset, preserve the rest), fed by *reasons*, not scattered
entry points: manual pick · standards-audit finding · reconciliation proposal · reject-feedback. It is
**operator-gated, provenance-stamped, and failure-safe** (a failed rework restores the prior good
state, never demotes an approved item to `failed`). Folds in the entire rework-levers doc:
- **L1 provenance** — `TriggerReason` on the run row (why it started), surfaced in the Workbench.
- **L2 legible sweeper** — the idle contract-audit sweeper emits events + a dry-run preview ("N items
  stale, here's what would rework") before it's trusted to run unattended.
- **L3 persist pending rework** — off the in-memory `Map`, onto the run row (survives restart; unifies
  all trigger reasons through one invoker consumer).
- **L4 failure closure** — restore prior terminal state on failure (uses the #918 pre-rework snapshot).
- **L5 reachable from review** — fix-the-field-you-see without a full restart.

### Pillar E — Reconciliation: one evidence source (not a separate feature)  · pains #2, #4
The instance-flow plan's contribution, **demoted from "centerpiece" to "one input"**: for compute/
bootable devices, compare intake evidence (scan + `memtest`/SMART/battery + `InstanceSpecs`) against the
reference's web-derived data → a **reconciliation object** (findings + operator-gated proposed reworks +
a contribution to the quality grade). It never mutates the ref and never auto-triggers; it *feeds*
Pillar B (grade) and Pillar D (rework). It is also the concrete answer to #4: intake captures the
evidence now, reconciliation/review happens later, by someone else, on the Workbench.

### Pillar F — Auto-approve: the throughput valve  · pain #1
Clearly-good-by-standards (Pillar B grade above a bar + no missing-required + no ambiguous) →
`auto_approved`, ERP-eligible, off the human queue. Everything else queues on the Workbench. Already
exists (flag-gated, off); this plan makes its gate *correct* (Phase 0 fixes the contract fallout) and
*trustworthy* (graded against real standards, not just field presence).

---

## 4. What already exists vs. what's new (build on, don't reinvent)

| Exists (shipped) | New (this plan) |
|---|---|
| Auto-approve `auto_approved` state (flag, off) | The Workbench surface (Pillar A) |
| Idle contract-audit sweeper (flag, off, shadow) | The quality grade (Pillar B) |
| Snapshots + diff + restore (#918) | Standards artifact + LLM auditor (Pillar C) |
| Search-sources panel (#916) | Run provenance + global run history/log |
| Grounding block (#917) | Rework failure-closure + pending-persistence (L3/L4) |
| Review wizard + reject-feedback (#953/#954) | Reconciliation object + instance flow (Pillar E) |
| Manual targeted rework (#893) | Contract concern-separation (Phase 0) |

Net: much of this is **wiring shipped mechanisms into one loop + one surface**, plus three genuinely
new pieces (quality grade, standards artifact/auditor, reconciliation).

---

## 5. Phasing (pain-first, each phase independently shippable)

- **Phase 0 — Foundations & un-smelling.** *(unblocks trust; low risk)*
  Separate contract concerns (schema vs standards vs policy); fix the capability-restructure fallout
  (orphaned `INTAKE_TO_SPEC`; re-validate auto-approve + sweeper against the new contracts; document the
  restructure — the doc-debt from instance-flow §17.6). Add **run provenance** (`TriggerReason`) +
  terminal-transition events (rework L1). *Serves: correctness under all pains.*
- **Phase 1 — The Workbench (read-only).** *(fastest relief for #1/#4/#5)*
  Global KI-Runs/data-quality list reusing the shell; columns = status + first-cut grade
  (completeness+freshness even before Standards) + open findings + provenance; filters; deep-link to
  item. A per-run history/log so the list has something to read.
- **Phase 2 — Rework made safe & legible.** *(makes #2/#3 fixes trustworthy)*
  L4 failure-closure, L3 pending-persistence, L5 reachable-from-review, L2 sweeper legibility+dry-run.
  Now rework is safe to point automation at.
- **Phase 3 — Standards & the real quality grade.** *(the core fix for #3, sharp end of #2)*
  Standards artifact (runtime-editable); use it to steer generation, grade items (upgrades Pillar B),
  and drive the LLM standards-auditor that proposes reworks for recurring violations.
- **Phase 4 — Reconciliation (instance flow).** *(correctness + #4)*
  Instance-spec contract + measured fills; reconciliation object feeding the grade + rework arm;
  standalone `mode=reconcile`, backfillable. (instance-flow Phases 1′–4, now a contributor.)
- **Phase 5 — Automation valves.** *(throughput for #1)*
  Auto-approve clearly-good-by-standards; idle sweepers (contract / standards / reconcile) — now safe
  because Phases 0/2 made them legible + failure-safe.

Ordering rationale: **surface before automation.** You cannot trust auto-approve/sweepers (#1's valve,
#2's engine) until you can *see* what they do (Phase 1) and they *can't destroy good data* (Phase 2).
Phase 0 is the prerequisite because the graders are currently measuring against the wrong ruler.

---

## 6. Guardrails (committed)

1. **Surface before automation** — no auto-anything an operator can't inspect (Workbench) and undo
   (failure-closure) first.
2. **Rework is the only writer of regenerated content**, always operator-gated for ref changes, always
   provenance-stamped, always failure-safe.
3. **Data stays on the item** (as today). Runs/history/reconciliation are observability + proposals,
   not a staging layer. `ReviewState` still gates export.
4. **Contract concerns stay separated** (schema / standards / policy); versioning is explicit and
   change-impact is testable — no more silent six-hat edits.
5. **One surface** (KI-Runs/data-quality workbench), not per-capability widgets.
6. **Reconciliation is scoped to compute/bootable subcategories** (the intake API's domain) and is one
   evidence source, not the centerpiece.

---

## 7. Open questions (carry into build)

- **Quality grade formula:** what exactly composes it (completeness/conformance/freshness weights), and
  is it one number, a letter grade, or a small vector? Explainable enough that a reviewer trusts it.
- **Standards representation:** free-text rules vs. structured checks vs. few-shot examples — what does
  the auditor grade against, and how do we keep it from being leaky prompt guidance (todo #50's concern)?
- **Re-grade trigger:** does a standards/contract version bump re-grade eagerly (sweeper) or lazily (on
  next view)? Interaction with the "approved item silently goes stale" UX — do we notify, or just
  re-surface on the Workbench?
- **Auto-approve bar vs. grade:** is auto-approve a threshold on the same grade the Workbench shows, or
  a separate stricter gate? (Common-ground integration the user flagged.)
- **Contract split shape:** where do standards live relative to the spec contract file, and how do the
  two versions interact for staleness?
- **Workbench vs. ItemKiTab division:** what stays per-item vs. moves to the global surface.

---

## 8. Provenance of this plan (what it absorbs)

- `PLANNING_rework_feature.md` → Pillar D (L1–L5) + the contract-smell diagnosis (§2). **Superseded.**
- `PLANNING_instance_flow.md` → Pillar E (reconciliation), Pillar A (KI-Runs list + run-detail tabs),
  run-history model, contract §17 findings → Phase 0. **Superseded** (its detail preserved here at a
  higher altitude; consult it for the reconciliation-object field-level schema until that migrates in).
- `PLANNING_ai_runs_optimization.md` → shipped ancestors (#916/#917/#918) reused across pillars. Kept
  as history.
