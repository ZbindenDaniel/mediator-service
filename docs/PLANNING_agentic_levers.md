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

## 2. The levers (ordered by leverage)

Effort: **S** ≈ hours, **M** ≈ a session, **L** ≈ multi-session. Each row is one existing part + the
smallest change.

| # | Lever | Exists today | The change (small) | Target it serves | Effort | Status |
|---|---|---|---|---|---|---|
| L0 | **Findings from signals we already compute** | `ambiguousFields`, `missingRequired`, texts | scan them into a `findings[]` | the unit of review | S | ✅ shipped (#929/#930) |
| L0b | **Findings reflect current content** | `getAgenticStatus` + ref | compute on read, not from run output | freshness / decay | S | ✅ shipped (#933) |
| L0c | **Show findings** | `AgenticReviewWizard` | "Zu prüfen" panel in KI tab + wizard | surface | S | ✅ shipped (#931/#932) |
| **L1** | **Scope tag on findings** | `models/agentic-findings.ts` | add `scope: 'reference'\|'exemplar'` (all current = reference) | ref/exemplar axis | S | next |
| **L2** | **Standards into the prompt (prevention)** | guidance-injection channel | render `standards.json` into `{{EXTRACTION_REVIEW}}`/`{{SUPERVISOR_REVIEW}}` | stop producing junk | S | — |
| **L3** | **Auto-approve on zero findings** | `AUTO_APPROVE` gate | repoint gate from confidence → no blocking findings | throughput valve | S | — |
| **L4** | **Legible sweeper** | `sweepContractRework` | add a `logEvent` + a dry-run count endpoint | trust the re-grade | S | — |
| **L5** | **Per-finding actions + verified-collapse** | wizard + `FindingsPanel` | choose-A/B, one-click fix/drop; collapse clean fields | review by exception | M | — |
| **L6** | **Supervisor emits findings (detection)** | `supervisor.md` | output a small findings list, not PASS/FAIL; parse into `findings[]` | judgment findings | M | — |
| **L7** | **Exemplar findings on read** | `reference-findings.ts` + `ambiguousFields` | fold `InstanceSpecs`-vs-ref conflicts into on-read findings | exemplar layer | M | — |
| **L8** | **Reject-feedback → standards candidate** | `LastReviewNotes` loop | count recurring reviewer corrections, surface as a suggested rule | standards grow themselves | M | — |
| **L9** | **Run provenance** | `agentic_runs` | add `TriggerReason` column, show it | legibility, KI-Runs list | S | — |

Each of L1–L9 is independent. None requires a new subsystem. Pulling L1–L5 already delivers a real
review-by-exception gate; L6–L9 deepen it.

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

## 4. Suggested order

1. **L1 + L2 + L3** (all S) — scope the findings, steer generation, drain the queue. One session.
2. **L4 + L9** (S) — make the auto-work legible before anyone trusts it.
3. **L5** (M) — turn the panel into an actual review interaction.
4. **L6** (M) — widen *what* gets caught (tone/coherence).
5. **L7, L8** (M) — the exemplar axis + self-growing standards, once the base is trusted.

Stop after any step and the pipeline is still whole.

---

## 5. Relationship to the target doc

`PLANNING_ai_data_quality.md` and `review-by-exception` (artifact) describe the destination — keep them
for the *why* and the shape of the finished thing. This doc is the **only working plan**: it is where we
decide what to build next, and it never proposes anything that isn't a small change to existing code.
When a lever ships, mark it here; when a parked item becomes reachable, promote it to a lever.
