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

---

## 1. The machinery we already have (the lever points)

Everything the target needs is *latent* in code today. We lever these, we don't replace them.

| Part | File(s) today | Does today | Latent capability we lever toward |
|---|---|---|---|
| Extraction | `prompts/extract.md` | Writes Langtext/description from web | Can be *steered* to not produce junk (prevention) |
| Supervisor | `prompts/supervisor.md` (+ `{{SUPERVISOR_REVIEW}}` slot) | Emits PASS/FAIL + a reason | Can emit *structured findings* instead of a verdict |
| Guidance injection | `buildSpecContext`, spec-contract `guidance[]` | Per-subcategory prompt snippets | The channel a **standards** block rides in |
| Findings engine | `backend/agentic/findings.ts`, `reference-findings.ts`, `contracts/standards.json` | Deterministic findings from current content | The **unit of review** — already live |
| Intake conflicts | `buildSpecContext.ambiguousFields` | Computes measured-vs-ref conflicts | **Exemplar-scope** findings (barely used) |
| Measured data | `items.InstanceSpecs`, `items.IntakeScan` | Stored at intake | The exemplar layer's evidence |
| Review UI | `AgenticReviewWizard`, `FindingsPanel` | Wizard + "Zu prüfen" panel | Review-by-exception surface |
| Auto-approve | `config.autoApproveConfig`, `item-flow` `autoApprovable` | Flag-gated, gates on confidence | Gate on **zero findings** instead |
| Contract-audit sweeper | `index.sweepContractRework` (`AUTO_REWORK`) | Re-runs stale items, silently | A **legible** re-grade trigger |
| Reject-feedback | `AgenticReviewWizard.buildResult` → `LastReviewNotes` | Folds corrections into next run's prompts | The seed for **growing standards** |
| Run history | `agentic_run_snapshots` (#918) | Snapshot/diff/restore | Provenance + the KI-Runs list later |

---

## 1b. Two facts from the code that shape the levers

**Instance data is barely used today (and is currently broken).** The *only* pipeline use of measured
data is a 3-key map `INTAKE_TO_SPEC = { ram_gb→RAM, storage_gb→Speicher, drive_type→Speichertyp }`
feeding `ambiguousFields` (conflict hint in review). Because the contracts were restructured to
capabilities (`RAM`/`Speicher` removed from `201.json`), the map now matches nothing → **silent no-op**
for laptops. `IntakeScan` is written but never read; scanned CPU only pre-fills quality questions.
⇒ The exemplar layer is essentially unused. **L7 is where instance data first becomes real**, and its
prerequisite is fixing/replacing this orphaned mapping.

**We already have three learning loops** (L8 extends these, doesn't invent):
1. **Per-item reject feedback (#954):** reject diff → `LastReviewNotes` → parsed by
   `summarizeReviewDirectives` → next run of *that item*.
2. **Cross-item few-shot (`example-selector.ts`):** 2 most recent **approved** items injected as redacted
   examples into extraction — the model learns "what good looks like" from history.
3. **Subcategory aggregation (`review-automation-signals.ts`):** last-10 reviews per subcategory → issue
   rates; currently **dormant** (flags sent at non-blocking defaults).

---

## 2. The levers (ordered by leverage)

Effort: **S** ≈ hours, **M** ≈ a session, **L** ≈ multi-session. Each row is one existing part + the
smallest change.

| # | Lever | Exists today | The change (small) | Target it serves | Effort | Status |
|---|---|---|---|---|---|---|
| L0 | **Findings from signals we already compute** | `ambiguousFields`, `missingRequired`, texts | scan them into a `findings[]` | the unit of review | S | ✅ shipped (#929/#930) |
| L0b | **Findings reflect current content** | `getAgenticStatus` + ref | compute on read, not from run output | freshness / decay | S | ✅ shipped (#933) |
| L0c | **Show findings** | `AgenticReviewWizard` | "Zu prüfen" panel in KI tab + wizard | surface | S | ✅ shipped (#931/#932) |
| **L2a** | **Standards → extraction (prevention)** | `extract.md` + guidance channel | inject `standards.json` so the model avoids junk; keep extraction focused on *correct data* | fewer defects at source | S | — |
| **L2b** ★ | **Separate wording step** | `flow/item-flow-wording.ts` (new) | post-extraction LLM pass that **rewrites** the prose into house style + tidies Langtext keys, stripping fluff/source-copy per `standards.json` (facts unchanged); normal always-on stage (no flag) | "same issues every review" | M | ✅ shipped (agentic #934) |
| **L3** | **Auto-approve on clean** | `AUTO_APPROVE` gate | repoint gate to **no block/warn findings** (`isAutoApprovable`); implicitly requires the wording pass | throughput valve | S | ✅ shipped (agentic #935) |
| **L5** | **Per-finding actions + verified-collapse (keep summary)** | wizard + `FindingsPanel` | choose-A/B, one-click fix/drop; collapse clean fields; **retain the summary/decision step** | review by exception | M | — |
| **L6** | **Supervisor emits (lean) findings** | `supervisor.md` | emit a small list of *coherence/plausibility* findings (wording lives in L2b), not PASS/FAIL | judgment findings | M | — |
| **L7** | **Exemplar findings on read** | `reference-findings.ts` + `InstanceSpecs` | compare measured-vs-ref → **exemplar-scope** findings. **Prereq: fix orphaned `INTAKE_TO_SPEC`** (§1b) | make instance data real | M | — |
| **L8** | **Standards learn from review** | `example-selector.ts` + `review-automation-signals.ts` | feed **finding decisions** into the (dormant) aggregation → surface recurring ones as **standards-rule candidates**; pair with the few-shot loop | self-improving standards | M | — |
| **L1** | **Scope tag on findings** | `models/agentic-findings.ts` | add `scope: 'reference'\|'exemplar'` | ref/exemplar axis | S | cosmetic until L7 |
| **L4** | *(optional)* Legible sweeper | `sweepContractRework` | `logEvent` + dry-run count | trust auto re-run | S | low priority |
| **L9** | *(optional)* Run provenance | `agentic_runs` | add `TriggerReason` | legibility | S | low priority |

None requires rebuilding the pipeline. **L2b is the one genuinely new step** — small, and the operator's
own shape (harden extraction on data, do wording separately) rather than bloating the supervisor.

---

## 3. Explicitly NOT now (target-state, reached by accumulation)

These are the parts of the target that only make sense as an *emergent* result of the levers — building
any of them up front is the redesign trap:

- **The Workbench page** (global KI-Runs list) — emerges once findings + provenance (L1/L9) give it
  something to show.
- **A quality-grade formula** — premature until we see which findings actually recur (needs L8's data).
- **The full instance/reconcile flow** with its own prompt — L7 gets the *exemplar findings* without it.
- **An LLM standards-auditor** — L2 + L6 + L8 cover prevention, detection, and rule-growth first.

We revisit each only when the levers below it are in and have produced evidence.

---

## 4. Suggested order (revised with operator remarks)

1. ✅ **L2b** — separate wording step (shipped, #934).
2. ✅ **L3** — auto-approve on clean, gated on findings (shipped, #935).
3. **L5** — turn the panel into a real review interaction (bounded actions + verified-collapse, keep the
   summary step). ← **next**
4. **L6** — lean supervisor findings (coherence/plausibility).
5. **L7** (after the `INTAKE_TO_SPEC` fix) + **L8** (standards learn from review) + **L1** scope tag.
6. *Optional, anytime:* L4, L9.

Stop after any step and the pipeline is still whole. **Mechanics first** — the dedicated review UI
component (justified by the volume of findings × scope × grade) is parked until the mechanics are in.

---

## 5. Relationship to the target doc

`PLANNING_ai_data_quality.md` and `review-by-exception` (artifact) describe the destination — keep them
for the *why* and the shape of the finished thing. This doc is the **only working plan**: it is where we
decide what to build next, and it never proposes anything that isn't a small change to existing code.
When a lever ships, mark it here; when a parked item becomes reachable, promote it to a lever.
