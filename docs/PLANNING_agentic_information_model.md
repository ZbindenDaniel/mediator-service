# PLANNING — The item as an information object (the agentic process, end to end)

> **Role: the organizing *story*.** The pain-based target
> ([`PLANNING_ai_data_quality.md`](PLANNING_ai_data_quality.md)) says *why*; the levers doc
> ([`PLANNING_agentic_levers.md`](PLANNING_agentic_levers.md)) says *what to build next*. This says
> *what the whole process **is***: what information flows in, what complete picture we want, and how
> each transform refines one into the other. It is the frame a complete plan hangs on.
>
> **Status:** DRAFT, co-authored with the operator (extends their inputs/outputs/transforms sketch).
> Iterate freely.

---

## 1. An item is an information object that fills up over time

An item is never created complete. Information about it arrives from several **sources**, at different
times, through different hands, and is **refined** toward a complete, trustworthy picture. Two facts
shape everything downstream:

- The picture has **two scopes** — **reference** (true for every unit of a model) and **instance**
  (true for this one physical device) — filled by different sources. Keeping them distinct is not
  pedantry: it decides what each transform may write and what "complete" means.
- **No single step or actor completes it.** The process is a **relay** — pipeline, intake station and
  human review each add part of the picture, often separated in time and by person.

## 2. What comes in — sources

| Source | Provides | Scope | Trust |
|---|---|---|---|
| **Operator input** | the seed: identity, category, instructions, and later corrections | both | authoritative but sparse |
| **Web / search** | model-level knowledge: capabilities, prose, typical specs | reference | plausible, must be grounded |
| **Intake station** | measured evidence of *this* device: structured scan + test results (`memtest` → real RAM size, `SMART` → disk health/size, battery, `dmidecode`/`lspci` → board/CPU/slots) | instance | high-trust, but only what it can measure |

Intake **test results are evidence an agent reasons over**, not just stored numbers: `memtest`'s actual
size confirms (or contradicts) installed RAM; `SMART` confirms the disk; a battery report feeds
condition. An instance-checking agent's job is to turn this evidence into verified instance specs.

## 3. What we want — the complete picture

Every target field has four attributes: a **scope**, the **source(s)** it is filled from, a
**standard** (what "good" means), and a **state** (missing / filled / verified / stale).

**Reference (per model, shared across units)**
- description / wording (house style)
- ref-specs = **capabilities** — what the model *supports* (RAM slots/capacity/type, CPU family, ports)
- assembly information — parts, slots, what can be removed/swapped
- model-generic media

**Instance (per physical unit)**
- **slot fill-state** = which **assembly slots** are populated with what — the most faithful model of a
  fillable component. A RAM slot, a drive bay or a battery bay is an **assembly part** (`multipleAllowed`
  for RAM), already modelled: `contracts/assembly/201.json` (laptops) / `102.json` (PCs) define a `ram`
  slot → `targetSubcategory` 603 (RAM module); a filled slot links a child item via `item_relations`
  `Zerlegt_aus`/`SlotKey`, and the condition quality-score already scores it. So "fitted RAM / disk" is
  **slot state**, not a flat spec string.
- instance-specs = **installed / measured** values that are *not* slotted (OS, serial, battery wear %),
  or a spec-only answer for a slot with no linked item (`allowSpecOnly`).
- quality assessment — physical condition grade (already shipped)
- logistics — location / box; per-unit media & attachments

**Commercial / cross-cutting**
- shop data — price, publish status
- misc attachments

## 4. How we get from in → out — transforms

Three transforms refine the picture; one principle governs all three.

- **Agentic pipeline** — turns web + operator input into **reference** data (description, ref-specs,
  assembly); and (planned) turns intake evidence into **instance** data + **reconciliation**.
- **Intake station** — turns the physical device into measured **instance** evidence.
- **User review** — the **judgment gate**: resolves what the machine cannot, approves customer-facing
  changes, and teaches the standards.

### The governing principle: do everything you can, escalate only the residue

Each transform **applies every correction it deterministically knows** (prevention + auto-correct) and
**escalates to a human only what needs judgment** — ambiguity (two plausible values), risk (a claim
that might be invented), or an open choice (no canonical answer).

- Banned phrase with a known fix → **removed**, not flagged (the operator's guarantee example).
- Value with a canonical form → **canonicalized** (L11), not flagged.
- Required field the model can fill → **filled**, not flagged.
- Intake-vs-web conflict on installed RAM → **escalated** (which is right needs judgment).
- A factual claim that might be a hallucination → **escalated**.

⇒ **A "finding" is the residue, not the defect list.** The review surface shows the handful of genuine
questions; everything deterministic is already done by the time a human looks. Auto-corrections are
surfaced as **applied changes** (a diff, for transparency and undo) — never as a pending ask. This is
the correction to the first findings design, which flagged deterministic knowns and asked a human to
approve the obvious.

## 5. The state of the picture — quality + lifecycle

- **Data-quality grade** (per scope) = how **complete / conformant / fresh** the picture is. Today it
  is **reference-only**; it gains an **instance dimension** when §4's instance arm lands.
- **Findings** = the open residue needing judgment.
- **Lifecycle:** produced → **auto-corrected** → graded → (residue) triaged → reviewed → **re-graded**
  as standards evolve. **Auto-approve** = complete + conformant with no residue. **Self-heal** = re-run
  when a standard/contract version rises. (These are the autonomy ladder in the levers doc.)

## 6. Governance — the definitions that drive both prevention and checking

One source of truth, read by every transform, so prevention and checking never disagree:

- **Contracts** — the schema has **three homes**, not two:
  1. the **reference capability** contract — what the model supports (RAM-Slots/Kapazität/Typ, ports);
  2. the **assembly** contract — the **slots/structure** (RAM/drive/battery as parts, filled per unit) —
     *already the home for fillable components*, and the most faithful model of "a slot that can be
     filled or not";
  3. the **instance-spec** scope (the agreed `scope` field, levers L7) — only for **non-slotted**
     measured values (OS, serial, battery wear). Installed RAM/disk are **slot fill-state (2)**, so they
     are largely *not* a `scope:'instance'` spec — which narrows what the scope field (L7) must carry.
  The ref/instance/assembly split is a first-class axis (see
  [`docs/plans/instance-flow.md`](plans/instance-flow.md) §17 + the scope decision there).
- **Standards** — house rules for content shape **+ controlled value vocabularies** (L11). Used twice:
  steer generation (prevent) and audit existing data (grade / escalate).
- **Reconciliation rules** — installed ↔ capability **plausibility** (installed RAM ≤ capacity, type ∈
  supported, identity matches) — not equality.

## 7. What a complete plan must cover (the axes this story exposes)

1. **Source model** — what each input provides, its scope + trust.
2. **Target model** — every field of §3 typed by scope + domain, with its source(s), standard, state.
3. **Transform model** — which step/actor fills which target from which source, each as
   "prevent-what-you-can + escalate-the-residue".
4. **Quality / lifecycle model** — grade + findings + the produce→…→re-grade loop, per scope.
5. **Governance** — contracts (ref + instance), standards + vocabularies, reconciliation rules.

**A plan is "complete" when every target field in (2) has a named transform (3), a standard (6), and a
place in the lifecycle (4).** The gaps below are where it is not yet complete.

## 8. Where this maps onto what exists / is planned

- **Reference arm — mostly shipped, but over-flags.** Extraction, wording step, findings engine, the
  L10 data-quality grade all exist — but §4's principle is **not yet applied**: deterministic knowns
  (banned phrases, canonicalization) are flagged instead of auto-corrected. Fixing that is the next
  refinement of L5/findings.
- **Instance arm + reconciliation — designed, not built.** Intake writes `InstanceSpecs` and the
  condition score reads them, but the **agentic** side ignores instance data; the one bridge
  (`INTAKE_TO_SPEC`) is orphaned. Blocked by **Phase 0** (normalize the capability ref contracts across
  compute subcategories) before an instance-spec contract + reconcile can be defined (levers L7/L1).
- **Governance — partial.** `standards.json` exists (banned phrases only); capability contracts are
  mid-refactor and inconsistent; the instance-spec contract is undefined; value vocabularies are L11
  (planned).

The complete plan is the ordered filling of these gaps, each step prevention-first and residue-only
for the human — tracked as levers in the working doc.
