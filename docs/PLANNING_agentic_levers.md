# PLANNING — Agentic Review: Levers (not a redesign)

> **Premise.** The pipeline already exists and works. We are **not** rebuilding it.
> [`PLANNING_ai_data_quality.md`](PLANNING_ai_data_quality.md) is the **target on the wall** — a
> direction, not a build spec. This doc lists the **smallest changes to the existing pipeline** that
> move it toward that target. **Discipline: every lever must point at a file that ships today.** If it
> can't, it's target-state (parked below), not a lever.

> **Why this doc exists.** The earlier planning drifted into a from-scratch redesign (new objects, a
> Workbench, an instance flow). That's unbuildable as one step. This reframes the same target as a
> sequence of independent pulls on parts we already have — each shippable on its own, each leaving the
> pipeline better and still working.

> **Re-aligned 2026-10-28 after merging `origin/main` (v4.0.0).** Main shipped a lot that touches this
> plan — a real condition quality-grade, a feature system, the capability-contract split, richer
> instance data. §0 records what changed and what it unblocks; the levers and order below already
> reflect it.

---

## 0. The vision this serves, and what main just changed

**Vision (operator's words):** *a system that keeps track of the catalogue and the stock without too
much human input.* Decompose it, because the two halves live in different code:

- **Catalogue** = the **reference** data (descriptions, specs) — the agentic pipeline's domain. "On
  track" = stays complete, clean and conformant **as standards evolve**, with humans reviewing only the
  **exceptions** the machine can't settle itself.
- **Stock** = the physical **instances** and their condition/location — the quality-score + tenancy +
  parts domain (mostly shipped on main). "On track" = condition grades current, parts accounted for,
  and the physical device **reconciled** against its catalogue reference.

These levers are the **catalogue** half. The vision is reached by (a) making catalogue quality
**measurable**, (b) letting the catalogue **self-maintain** when standards change, (c) having the
system **learn** so prevention improves, and only then (d) **reconciling** stock evidence into the
catalogue. "Without too much human input" is not a switch — it's an **autonomy ladder** (§1c): the
system earns each rung by showing, in data, that the rung below it is safe.

**Two quality axes — keep them distinct.** Main's merge makes this concrete:

| Axis | What it measures | Where it lives | Signal |
|---|---|---|---|
| **Condition quality** (stock) | How good is the *physical device* | `models/quality-score.ts`, `backend/lib/quality-score.ts` → `items.Quality` / `QualityScoreMin/Max` | teardown/intake answers + assembly weights |
| **Catalogue data quality** (reference) | How good is the *data about it* | `backend/agentic/findings.ts` → findings (our work) | banned phrases, missing-required, conflicts, decay |

They are **orthogonal** — the agentic pipeline and the condition score never touch each other today.
The eventual Workbench shows **both** per item; a data-quality **grade** (L10) is the catalogue-side
mirror of what main already built for condition.

**What main shipped that moves this plan:**

1. **A proven derived-grade pattern.** `quality-score.ts` computes a range + a 1–5 grade from signals,
   stores it on the item, recomputes it (`recomputeQualityScoreUpward` with an `onGradeChange` hook →
   e.g. shop sync; `recomputeAllQualityScores` for a config-change rebuild via `npm run quality:recompute`),
   and logs a `QualityScoreChanged` event. This is **exactly the store/recompute/surface pattern** a
   catalogue **data-quality grade** needs — so the grade is no longer "premature/parked": we copy a
   shape that already ships. (It stays *parked as a formula* only until we decide the weights — §3.)
2. **Capability-contract split is done.** Reference spec contracts now hold **capability** fields
   (laptop `201.json` = `Prozessor`/`Display`/`Anschlüsse`); **RAM/Speicher/Speichertyp moved to the
   instance layer**. This confirms §1b: `INTAKE_TO_SPEC` (`ram_gb→RAM`, …) maps to keys **no longer in
   the ref contract** → still a silent no-op. L7's prereq is unchanged and real.
3. **Instance data is now actively managed** (not "barely used"): `InstanceSpecs` is written by
   intake/teardown quality answers and maintained by the condition roll-up (`dropLockedSpecs`). The
   **substrate for L7** is richer than when this plan was written — the gap is purely that the *agentic*
   side still ignores it.
4. **A feature system** (`models/features.ts`, `'agentic'` key) gates subsystems per deployment/tenant
   — the natural place to gate an autonomy rung later (§1c).

---

## 1. The machinery we already have (the lever points)

Everything the target needs is *latent* in code today. We lever these, we don't replace them.

| Part | File(s) today | Does today | Latent capability we lever toward |
|---|---|---|---|
| Extraction | `prompts/extract.md` | Writes Langtext/description from web | Can be *steered* to not produce junk (prevention) |
| Wording step | `flow/item-flow-wording.ts` | Rewrites prose to house style, tidies Langtext keys | The style/prevention arm (shipped) |
| Supervisor | `prompts/supervisor.md` (+ `{{SUPERVISOR_REVIEW}}` slot) | Emits PASS/FAIL + a reason | Can emit *structured findings* instead of a verdict |
| Guidance injection | `buildSpecContext`, spec-contract `guidance[]` | Per-subcategory prompt snippets | The channel a **standards** block rides in |
| Findings engine | `backend/agentic/findings.ts`, `reference-findings.ts`, `contracts/standards.json` | Deterministic findings from current content | The **unit of review** — already live |
| Intake conflicts | `buildSpecContext.ambiguousFields` | Measured-vs-ref conflicts (via orphaned `INTAKE_TO_SPEC`) | **Exemplar-scope** findings (L7) |
| Measured data | `items.InstanceSpecs`, `items.IntakeScan` | Written at intake; `InstanceSpecs` now read by the condition score | The exemplar layer's evidence (L7) |
| **Condition grade** | `models/quality-score.ts`, `backend/lib/quality-score.ts` | 1–5 grade + range stored/recomputed per item | **The pattern a data-quality grade copies (L10)** |
| Review UI | `AgenticReviewWizard`, `FindingsPanel` | Wizard + "Zu prüfen" panel | Review-by-exception surface |
| Auto-approve | `config.autoApproveConfig`, `item-flow` `isAutoApprovable` | Flag-gated, gates on **zero block/warn findings** | The throughput valve (shipped) |
| Contract-audit sweeper | `index.sweepContractRework` (`AUTO_REWORK`) | Re-runs stale items, silently | A **legible, trusted** re-grade/self-heal trigger |
| Reject-feedback | `AgenticReviewWizard.buildResult` → `LastReviewNotes` | Folds corrections into next run's prompts | The seed for **growing standards** |
| Run history | `agentic_run_snapshots` (#918) | Snapshot/diff/restore | Provenance + the KI-Runs list later |

---

## 1b. Two facts from the code that shape the levers

**The exemplar (instance) layer is real data the *agentic* side still ignores.** Post-merge,
`InstanceSpecs` is written by quality answers and read by the **condition** score — but the **agentic**
pipeline's only use of measured data is the 3-key `INTAKE_TO_SPEC = { ram_gb→RAM, storage_gb→Speicher,
drive_type→Speichertyp }` feeding `ambiguousFields`. Since the capability split removed `RAM`/`Speicher`
from the ref contract, that map matches nothing → **silent no-op** for laptops. `IntakeScan` is written
but never read by agentic. ⇒ **L7 is where instance data first becomes real *for the catalogue*,** and
its prerequisite is replacing this orphaned mapping with the capability-aware comparison (installed
value ↔ capability) the instance-flow plan ([`docs/plans/instance-flow.md`](plans/instance-flow.md))
describes.

**We already have three learning loops** (L8 extends these, doesn't invent):
1. **Per-item reject feedback (#954):** reject diff → `LastReviewNotes` → parsed by
   `summarizeReviewDirectives` → next run of *that item*.
2. **Cross-item few-shot (`example-selector.ts`):** 2 most recent **approved** items injected as redacted
   examples into extraction — the model learns "what good looks like" from history.
3. **Subcategory aggregation (`review-automation-signals.ts`):** last-10 reviews per subcategory → issue
   rates; currently **dormant** (flags sent at non-blocking defaults).

---

## 1c. The autonomy ladder (how "less human input" is earned)

The vision is not "turn on auto mode." It's a ratchet: each rung is only enabled once the rung below it
has produced **evidence in data** that it's safe. Every rung is already gated or measurable with parts
we have.

| Rung | What runs without a human | Gate / evidence to earn it | Status |
|---|---|---|---|
| 0 | Nothing auto; human reviews every run | — | (old default) |
| 1 | **Clean runs auto-approve** (no block/warn findings) | the findings engine is trusted to spot defects | ✅ L3 shipped |
| 2 | **Catalogue decay is measured** (a data-quality grade per ref) | we can *see* what's decaying before automating its repair | ← **L10, next** |
| 3 | **Stale/sub-grade refs self-heal** (sweeper re-runs, legibly) | grade + legible sweeper show the re-runs are correct | L4 + re-grade |
| 4 | **Prevention improves itself** (recurring findings → standards candidates) | review decisions show which rules recur | L8 |
| 5 | **Stock evidence reconciles into the catalogue** (operator-gated) | exemplar findings proven useful on read | L7 |

L5/L6 (review efficiency + judgment findings) run *alongside* the ladder: they shrink the human cost of
the exceptions that remain at every rung, so "less human input" holds even as volume grows.

---

## 2. The levers (ordered by leverage)

Effort: **S** ≈ hours, **M** ≈ a session, **L** ≈ multi-session. Each row is one existing part + the
smallest change.

| # | Lever | Exists today | The change (small) | Target it serves | Effort | Status |
|---|---|---|---|---|---|---|
| L0 | **Findings from signals we already compute** | `ambiguousFields`, `missingRequired`, texts | scan them into a `findings[]` | the unit of review | S | ✅ shipped (#929/#930) |
| L0b | **Findings reflect current content** | `getAgenticStatus` + ref | compute on read, not from run output | freshness / decay | S | ✅ shipped (#933) |
| L0c | **Show findings** | `AgenticReviewWizard` | "Zu prüfen" panel in KI tab + wizard | surface | S | ✅ shipped (#931/#932) |
| L2a | **Standards → extraction (prevention)** | `extract.md` + guidance channel | inject `standards.json` so the model avoids junk at source | fewer defects at source | S | — |
| L2b ★ | **Separate wording step** | `flow/item-flow-wording.ts` | post-extraction LLM pass rewrites prose to house style + tidies Langtext (facts unchanged) | "same issues every review" | M | ✅ shipped (#934) |
| L3 | **Auto-approve on clean** | `AUTO_APPROVE` gate | gate on **no block/warn findings** (`isAutoApprovable`) | throughput valve (ladder r1) | S | ✅ shipped (#935) |
| **L10** ★ | **Data-quality grade on refs** | *mirror* `quality-score.ts` | derive a 0–1 / 1–5 **data** grade from findings + completeness + contract freshness; surface **on read** first (transient, like `CurrentFindings`), persist/recompute later | measure catalogue decay (ladder r2) | M | ← **next** |
| **L4** | **Legible, trusted self-heal** | `sweepContractRework` + L10 grade | `logEvent` + a dry-run count; re-grade drives *which* refs the sweeper touches, visibly | catalogue self-heals (ladder r3) | S–M | ◑ slice 1 shipped (agentic #1010: events + `previewContractSweep`); grade-driven targeting + UI surface deferred |
| **L8** | **Standards learn from review** | `example-selector.ts` + `review-automation-signals.ts` | feed **finding decisions** into the (dormant) aggregation → surface recurring ones as **standards-rule candidates** | self-improving prevention (ladder r4) | M | — |
| **L5** | **Per-finding actions + verified-collapse (keep summary)** | wizard + `FindingsPanel` | choose-A/B, one-click fix/drop; collapse clean fields; keep the summary step | review by exception | M | — |
| **L6** | **Supervisor emits (lean) findings** | `supervisor.md` | emit coherence/plausibility findings (wording lives in L2b), not PASS/FAIL | judgment findings | M | — |
| **L7** | **Exemplar findings on read (stock→catalogue)** | `reference-findings.ts` + `InstanceSpecs` | compare installed value ↔ capability → **exemplar-scope** findings. **Prereq: replace orphaned `INTAKE_TO_SPEC`** (§1b); aligns with `docs/plans/instance-flow.md` | make instance data real (ladder r5) | L | — |
| L1 | **Scope tag on findings** | `models/agentic-findings.ts` | add `scope: 'reference'\|'exemplar'` | ref/exemplar axis | S | lands with L7 |
| L9 | *(optional)* Run provenance | `agentic_runs` | add `TriggerReason` | legibility | S | low priority |

**Re-weighting (why the order moved).** The vision wants **less human input**, so the autonomy/
self-maintenance levers (**L10 → L4 → L8**) now come *before* the review-efficiency levers (L5/L6).
Review-by-exception is the safety net that makes autonomy trustworthy, so L5/L6 stay important — but
they serve a *shrinking* exception set, not the main line. L7 (reconcile stock into catalogue) is the
bridge to the "stock" half of the vision and the biggest build; it comes once the catalogue side is
measured and self-maintaining, and it's the first lever that needs real new data plumbing.

---

## 2b. L10 in detail (the next build)

**Goal:** one legible number per reference that says *how good the catalogue data is* — the thing the
vision needs to "keep track of the catalogue." It is **derived, not stored by hand**, and it mirrors
`quality-score.ts` so it behaves like the condition grade operators already understand.

**Inputs (all already computed on read):**
- **Conformance** — findings: any `block`/`warn` drags the grade; `info` nudges it.
- **Completeness** — `checkSpecGap`: `missingRequired` (hard) vs `missingDesired` (soft) against the
  ref's current spec contract.
- **Freshness** — stored `SpecContractVersion` vs the contract's current `version` (stale ⇒ decayed).

**Slices (ship smallest first, exactly as findings went L0→L0b→persist):**
1. **Pure function + on-read** (M, low risk, reversible): `computeDataQualityGrade(findings, specGap,
   freshness)` in a new `backend/agentic/data-quality.ts`; surface it transiently in `getAgenticStatus`
   next to `CurrentFindings`; show the badge in the KI tab. **No column, no formula baked into storage**
   — we eyeball it on real refs first, same discipline as L0b.
2. **Persist + recompute** (later): add `items`/`item_refs` columns, a `recomputeDataQualityUpward`
   mirroring the condition roll-up, and wire `onGradeChange` to the sweeper (→ L4). Needs the formula
   signed off, so it waits for slice 1's evidence.

**Open decision (operator's call):** the **weighting/bands** — what makes a catalogue entry "a 5"?
Proposal to start: a 0–1 conformance-completeness-freshness blend mapped through bands like the
condition grade's `DEFAULT_QUALITY_GRADING`, with any unresolved `block` finding capping the grade (a
knock-out, exactly like a swollen battery caps condition). We sketch it in slice 1 and tune on real
data before persisting.

---

## 2c. L5 in detail (findings become the interaction; retire "KI Überarbeitung")

**Problem it fixes.** Today the KI tab has a standalone **"KI Überarbeitung"** button that opens a blind
field-picker + freeform-instruction modal. It (a) overlaps with Starten/Wiederholen/Review, (b) makes
the operator micromanage the AI, and (c) is a scattered rework entry point — the "shadow process" smell
this whole effort set out to kill. With findings now surfaced (L0c) and each `Finding` already carrying
`field` + `ask` + `suggestion`, rework should be something you do **to a surfaced problem**, not a
freeform console.

**The mapping (why the existing machinery is enough).** `reworkFieldOptions` already covers prose
(Artikelbeschreibung/Kurzbeschreibung) *and* every Langtext spec key, and `handleReworkSubmit` already
does a targeted, search-skipping regenerate of a chosen field subset. So a per-finding action just
pre-fills that path from the finding. Finding → action:

| Finding | `ask` | L5 action | Path |
|---|---|---|---|
| banned_phrase | `fix` | **Beheben** — regenerate that prose field (wording step re-cleans it) | existing rework |
| missing_required | `fix` | **Beheben** — regenerate that field to fill it | existing rework |
| intake_conflict | `choose` | **A/B** — set the measured or extracted value (no model call) | new value-set path (L5c) |

**Slices:**
1. **L5a (this build):** `FindingsPanel` gains an optional `onFix(finding)`; findings with `ask === 'fix'`
   render a **Beheben** button that fires a field-scoped rework via the existing path, seeded with a
   short instruction derived from the finding. The standalone button is **demoted** — relabelled
   "Feld manuell überarbeiten…", secondary-styled — kept only as the manual fallback for the
   no-findings case. Wired in the KI tab (persistent panel); the wizard's panel stays read-only.
2. **L5b (shipped):** review by exception in the **wizard** — a clickable stepper marks which steps carry
   a finding (jump straight to them), and verified spec rows (filled, unflagged, not required/conflict)
   collapse behind a "✓ N geprüfte Felder anzeigen" toggle; the summary step is unchanged. **Decision:**
   `onFix` (model rework) is deliberately NOT wired in the wizard — mid-review it would clobber the
   reviewer's unsaved edits; in the wizard the fix *is* the inline edit, and verified-collapse surfaces
   what to edit. Nothing is lost (toggle + summary still show every field).
3. **L5c:** `choose` (A/B) inline resolution for intake_conflict + one-click `drop`, via a direct
   value-set path (not a regenerate). Then the manual button can retire fully.

---

## 3. Explicitly NOT now (target-state, reached by accumulation)

Building any of these up front is the redesign trap. We revisit each only when the levers below it are
in and have produced evidence:

- **The Workbench page** (global KI-Runs list showing *both* quality axes) — emerges once findings +
  grade (L10) + provenance (L9) give it something to show.
- **The data-quality grade *formula* as a committed contract** — the *mechanism* is promoted (L10,
  pattern proven by main), but the exact weights stay unparked only after slice-1 evidence.
- **The full instance/reconcile flow** with its own prompt — L7 gets the *exemplar findings* without it;
  the full flow is [`docs/plans/instance-flow.md`](plans/instance-flow.md)'s job.
- **An LLM standards-auditor** — L2 + L6 + L8 cover prevention, detection, and rule-growth first.

---

## 4. Suggested order (re-aligned 2026-10-28)

1. ✅ **L2b** — separate wording step (#934).
2. ✅ **L3** — auto-approve on clean, gated on findings (#935).
3. **L10** — data-quality grade on refs, on-read slice first (ladder rung 2). ← **next**
4. **L4** — legible self-heal: grade drives the sweeper, visibly (ladder rung 3).
5. **L8** — standards learn from review (ladder rung 4).
6. **L5 / L6** — review-by-exception efficiency + judgment findings (shrink the remaining human cost).
7. **L7 (+ L1 scope tag)** — reconcile stock evidence into the catalogue, after the `INTAKE_TO_SPEC`
   replacement; the bridge to the "stock" half of the vision.
8. *Optional, anytime:* L9.

Stop after any step and the pipeline is still whole. **Mechanics first** — the dedicated review/Workbench
UI (justified by findings × grade × scope) is parked until the mechanics are in.

---

## 5. Relationship to the target doc

`PLANNING_ai_data_quality.md` and `review-by-exception` (artifact) describe the destination — keep them
for the *why* and the shape of the finished thing. This doc is the **only working plan**: it is where we
decide what to build next, and it never proposes anything that isn't a small change to existing code.
When a lever ships, mark it here; when a parked item becomes reachable, promote it to a lever (as L10
was promoted once main shipped the grade pattern it copies).
