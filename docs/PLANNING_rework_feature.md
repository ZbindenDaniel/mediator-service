# PLANNING — Rework as a Coherent Feature (concept)

> **Status:** CONCEPT / thinking-out-loud. Nothing here is scheduled or agreed. This document
> exists to make the *option space* legible so we can decide what — if anything — is worth building.
> No code, no migrations, no lever-pulling yet.
> **Domain:** [agentic](changelogs/agentic.md) · Related: [PLANNING_ai_runs_optimization.md](PLANNING_ai_runs_optimization.md) (Thread 3, Phase 4), todo #50.
> **Runbooks:** [item-flow](detailed/item-flow.md) (§Rework mode), [review-flow](detailed/review-flow.md).

---

## 1. The complaint (why this doc exists)

Rework works, mechanically. But it does not feel like a *feature* — it feels like several
half-connected mechanisms plus one process that runs in the shadows:

- There are **multiple entry points with no shared structure**.
- The idle auto-rework sweeper is a **shadow process**: it is unclear what it does, when it
  fires, or what it will touch — so nobody trusts it enough to enable it.
- Auto-approve is deliberately left out of scope for now, but it shares common ground with rework
  (both settle a run without a human) and may eventually integrate. Noted, not designed here.

The goal of this doc is **conceptual**: name the pieces, name why they feel incoherent, and sketch
a model under which they *would* be one feature — so a later decision to build is made with eyes open.

---

## 2. Current state — every way a run can (re)start

| # | Entry point | Lives in | Visible to operator? | Records *why*? | Survives restart? |
|---|---|---|---|---|---|
| 1 | **Manual targeted rework** ("KI Überarbeitung") | `ItemKiTab` button → `pendingRework` map → `applyReworkPartialUpdate` | Yes — but **hidden during `review`** (`canRework = !needsReview`), the exact moment a bad field is spotted | No | ❌ in-memory `Map` |
| 2 | **Idle contract-audit sweeper** (`AUTO_REWORK`) | `sweepContractRework` (`index.ts`) → same `pendingRework` map | **No** — no event, no badge, no trace | No | ❌ in-memory `Map` |
| 3 | **Full restart** | `POST …/agentic/restart` | Yes | Partially (review-metadata policy) | n/a (re-queues) |
| 4 | **Retrigger** | `POST /api/agentic/run` (UI after restart) | Yes | No | n/a |
| 5 | **Reject-feedback loop** | reject folds a before→after diff into `LastReviewNotes` → next run's prompts | Indirect (notes only) | Implicitly | Persisted |

Two of these (1, 2) are *targeted rework* — regenerate a chosen subset of fields, preserve the rest.
The others are full re-runs or prompt-nudges. They are not the same thing, but today they blur together.

### What targeted rework actually does (for reference)
- Regenerates only operator/sweeper-selected fields; `applyReworkPartialUpdate` deterministically
  preserves all other fields; categorizer + pricing are skipped (agentic changelog #893).
- The sweeper's decision is pure and testable (`decideContractAuditAction`): stale contract version →
  `rework` (missing required fields) / `restamp` (already complete) / `skip` (current).
- A pre-rework **snapshot already exists** (Phase 4, #918): the AI-written fields are captured before
  the run mutates them, with retention "keep 4 + always last-approved."

---

## 3. Diagnosis — the four things that make it a "shadow"

1. **A run has no provenance.** `TriggerReason` exists only on `agentic_run_snapshots`, never on the
   run row. So no surface (KI tab, event log, run status) can ever answer "why did this re-run?"
   The information is thrown away at the moment it is known.

2. **The sweeper's trigger is invisible and indirect.** It fires on
   `stored SpecContractVersion < current`, which only moves when a human bumps a `version` in a
   `contracts/specs/*.json` file. There is no view of *"N items are now stale and will be reworked,"*
   no dry-run, no "this run was started by contract-audit" stamp, and it emits **no `logEvent`** on
   enqueue/re-stamp. It quietly enqueues one item per idle tick. This is the exact shape of a process
   one cannot trust: an invisible cause producing invisible effects.

3. **The two targeted-rework paths share only an in-memory `Map`** (`pendingRework`), dropped on
   restart (todo #49). So even the *visible* manual path is fragile — restart mid-queue and a targeted
   rework silently degrades into a full re-run (or loses its field list).

4. **Rework can demote a good item to `failed`.** The intended "on rework failure, keep the prior
   approved/review state" closure (AI-runs doc Thread 3B) is documented as deferred and **not
   implemented**. So enabling automatic rework currently means accepting that it may occasionally turn
   an `approved` item into `failed`. This alone is enough to keep the switch off.

---

## 4. The unifying idea

There is one clean concept hiding under all of this:

> **Rework = a run that regenerates a chosen subset of fields, preserves the rest, always records
> *why* it started, and never destroys the prior good state on failure.**

Under that definition, the "multiple entry points" stop being separate mechanisms. They become
**trigger reasons** feeding one observable, restart-safe, non-destructive path:

```
                            ┌─────────────────────────────────────────────┐
  trigger reason  ───────▶  │  one rework path                            │
  ─ manual (KI tab)         │  • regenerate selected fields, preserve rest│
  ─ from review             │  • stamp WHY on the run + emit an event     │
  ─ contract-audit (auto)   │  • snapshot before, restore prior on failure│
  ─ (later) reject-retry    │  • pending spec persisted on the run row    │
                            └─────────────────────────────────────────────┘
```

The trigger differs; the machinery, the audit trail, and the safety net are shared. That is the
difference between "a feature" and "several scripts that happen to call the same map."

---

## 5. The lever space (options, not commitments)

Each lever is independent and independently shippable. Listed with intent + rough cost + what it buys.
**None is scheduled.** This is the menu.

### L1 — Run provenance (`TriggerReason` on the run row)
- **What:** stamp *why* each run started (`manual_rework`, `contract_audit`, `operator_restart`,
  `new_item`, `reject_retry`, …); surface in the KI tab + event log.
- **Cost:** one additive column + a display string. Small.
- **Buys:** "something re-ran" → "auto-rework: contract 201 v2→v3, field Prozessor." This is the
  backbone every other lever borrows; it is the single highest confidence-per-effort item.

### L2 — Make the sweeper legible
- **What:** `logEvent` on every sweeper enqueue/re-stamp (shows in item history), and a **dry-run
  preview** — an admin/KI-tab count of "N items stale against the current contract; here is what would
  rework and which fields" — visible *before* `AUTO_REWORK` is flipped.
- **Cost:** the event is tiny; the preview reuses `listContractAuditCandidates` + `checkSpecGap`
  read-only (no enqueue). Small–medium.
- **Buys:** turns the shadow process into an inspectable one. You see the blast radius before arming it.

### L3 — Persist pending rework on the run row
- **What:** move rework fields/instructions off the in-memory `Map` onto the run (a `PendingReworkJson`
  column or similar). Both triggers write it; the invoker is the single consumer.
- **Cost:** additive column + read/clear wiring; retires todo #49 for this path. Medium.
- **Buys:** restart-safety and genuine unification — manual and auto stop being two code paths.

### L4 — Rework-failure closure
- **What:** on rework failure, restore the prior terminal state (`approved`/`auto_approved`/`review`)
  instead of dropping to `failed`. The pre-rework snapshot (Phase 4) already holds the data.
- **Cost:** mostly wiring: remember the pre-rework status, restore on failure. Medium.
- **Buys:** removes the "rework can nuke a good item" trap — the precondition for ever trusting
  automatic rework. Without this, L2's legibility still won't earn the switch being on.

### L5 — Rework reachable from review
- **What:** surface targeted rework inside the review UI, not only after completion (today
  `canRework = !needsReview` hides it during review).
- **Cost:** frontend gating + a decision on whether rework-from-review keeps the run in `review` or
  re-enters the pipeline (see open questions). Medium.
- **Buys:** fix-the-field-you-see-is-wrong without a full restart — the most common operator moment.

### Sketch of a coherent first cut (if we ever build)
**L1 + L2 + L4** makes what already exists *legible and safe*; **L3** is the natural cleanup to pair
with them; **L5** is an independent UX win. Deliberately unscheduled — recorded so the decision is cheap later.

---

## 6. Common ground with auto-approve (noted, out of scope)

Auto-approve and rework are two halves of "settle a run without a human":
- Both hinge on the same "is this clearly good?" signal (supervisor PASS + confidence + no
  missing-required + no ambiguous fields — `item-flow.ts` `autoApprovable`).
- A natural future integration: a rework that comes back **clearly good** could auto-approve under the
  same gate, closing the loop (auto-detect stale → auto-rework → auto-approve) — but only once L4
  (failure closure) and L1/L2 (provenance + legibility) exist, or the loop is just a faster shadow.
- Explicitly **not designed here.** Flagged so we don't paint ourselves into a corner.

---

## 7. Open questions (decide before, not during, any build)

- **Provenance vocabulary:** what is the closed set of `TriggerReason` values, and is it shared with
  the snapshot table's existing `TriggerReason` (dedupe the concept) or kept separate?
- **Rework-from-review semantics:** does targeted rework during `review` keep the run in `review`
  (partial refresh in place) or send it back through the pipeline?
- **Failure-closure scope:** restore only the run *status*, or also roll back any partially-written
  fields from the failed rework? (Snapshot supports either.)
- **Sweeper autonomy:** should the contract-audit sweeper ever act on its own, or only ever *propose*
  (surface "N stale, review to rework") and let an operator confirm — i.e. is "auto" the right default
  at all, or is the real fix a visible backlog + one-click "rework these"?
- **Pending-rework persistence shape:** a dedicated column vs. folding into an existing run field;
  interaction with the reset paths that clear `SearchQuery`.
- **Anti-thrash:** a cap on consecutive auto-reworks per item (todo #50 Phase 2b already flags this) —
  needed the moment the sweeper is trusted to run unattended.

---

## 8. Related
- [PLANNING_ai_runs_optimization.md](PLANNING_ai_runs_optimization.md) — Thread 3 (rework closure),
  Phase 4 (snapshots/diff/restore, shipped).
- todo #50 (rework mechanism: Phase 1 manual ✅, Phase 2a idle sweeper ✅, Phase 2b LLM auditor planned),
  #49 (persist pending flags across restart).
- Code: `backend/agentic/index.ts` (`sweepContractRework`, `decideContractAuditAction`),
  `backend/agentic/flow/item-flow.ts` (rework mode, `autoApprovable`),
  `frontend/src/components/item-tabs/ItemKiTab.tsx` (`canRework`).
