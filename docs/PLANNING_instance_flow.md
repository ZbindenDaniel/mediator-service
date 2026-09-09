# Instance Agentic Flow — Planning

Status: **design in progress.** An **instance** agentic flow that consumes intake evidence (the
netboot artifacts + instance specs) to fill instance specs and **reconcile** a physical compute
device against its reference (`item_refs`) — producing a **reconciliation object** that flags
findings and proposes operator actions. It **never mutates reference data**, and it **never triggers
a ref change on its own**: any ref rework is enqueued only after an **operator approves** it.

Scope note: this feature works hand-in-hand with the **intake API, which only serves
network-bootable compute devices** (laptops, PCs, workstations, servers). So the contract changes and
the flow apply to **compute subcategories only** for now — not monitors, phones, peripherals, etc.

This became a major feature: it also introduces run **history** (today there is one mutable run per
reference) and a global **KI-Runs** list. Both are scoped below to the lowest-risk shape we found.

Related: intake changelog (auto-resolve #903, complete-item #900, components #902), agentic README,
todo #2 (reference-keyed runs), #47 (cpu persistence), #48 (ambiguous fields), #50 (rework agent),
#51 (auto-approve). Deferred todo: "Intake: scan.txt augmentation of agentic extraction."

---

## 1. Organizing principle

Two run families over one shared run-record + history model:

- **scope=reference** — today's flow (web `extract` → ref `Langtext`) and `rework` (targeted ref fix,
  #893). Unchanged.
- **scope=instance** — the **new instance flow**: read measured evidence, fill instance specs, and
  reconcile the device against the reference. Ends by producing a **reconciliation object** (§5).

**Reuse vs. new flow — to validate, not assumed.** The instance flow is *not* a `rework`; its steps
and prompts differ (no web search, no categorizer/pricing; it compares measured data to the
reference's already-gathered web data). Before building, confirm what — if anything — of the existing
`item-flow` stages/prompts is genuinely reusable. Working assumption: a **dedicated, smaller instance
flow oriented on the existing one**, reusing plumbing (LLM client via `utils/langchain`,
`flow/transcript`, `flow/schema-contract`, search-result formatting) but with its own prompt(s) and
step sequence. `rework` appears only as an *output* the operator may approve (§4).

## 2. Evidence — the instance flow's real inputs

After intake `/complete`, a bootable device has produced netboot artifacts that are strong,
device-truthful evidence — far better than web guesses:

| Evidence | Source | Use |
|---|---|---|
| `dmidecode` | intake artifact | board/CPU/RAM identity + slots |
| `lspci` | intake artifact | GPU / NIC / controllers present |
| `memtest` | intake artifact | RAM health + actual size |
| CPU stress-test | intake artifact | CPU model confirmed + stability |
| SMART / wipe report | serial-keyed Phase-2 file | disk identity + health |
| `items.IntakeScan` | JSON on the item | vendor, model, cpu, ramMb, batteryPercent, components[] |
| `items.InstanceSpecs` | JSON on the item | quality-derived instance specs |

These + existing instance specs are the flow's input. The reference's web-derived `Langtext` (and
its stored search sources) is the *comparison target* — the flow does **not** search the web itself.
Artifacts land as attachments/Phase-2 files; the flow resolves them via `lib/external-docs.ts`
(serial/MAC fallback chain). Enumerated evidence is what makes reconciliation meaningful.

## 3. Contract approach — ⚠ SUPERSEDED, see §17

> **The `scope`-field approach below is superseded by shipped work.** The reference spec contracts were
> restructured around **model capabilities** (e.g. `102.json`: `RAM-Slots`/`RAM-Kapazität`/`RAM-Typ`),
> removing installed-value fields — so there is nothing left to tag. The revised approach is a
> **separate instance-spec contract**; see §17. Text kept for history.

### (superseded) Contract approach — `scope` on the spec contract (compute subcategories only)

Add optional fields to `SpecContractField` (`models/spec-contract.ts`):

```jsonc
{ "key": "RAM", "required": true, "scope": "instance",
  "measuredSignal": "ram", "description": "Installed memory in GB" }
```

- `scope`: `"reference"` (default — full back-compat) | `"instance"`.
- `measuredSignal`: generalizes today's hardcoded `INTAKE_TO_SPEC` into the contract (JSON, not code).

Defining the instance spec set per contract is what makes the flow **controllable** — it names which
fields are instance-owned (filled from measured data) and which are comparable to the ref. Added
**only to compute/bootable subcategories** (start with 201 laptops; then 102/105/103). Migration:
update contracts, leave stored data as-is (operators + rework agent #50 correct drift). No backfill.

## 4. The reference-change rule — operator-gated, no auto-trigger

> The instance flow never mutates `item_refs`, and it **never enqueues a ref `rework` on its own.**
> When it finds evidence a ref field is wrong or missing, it records that as a **proposed action** in
> the reconciliation object (§5). An **operator reviews and approves**; only then is the existing ref
> `rework` enqueued (with the evidence carried in `reworkInstructions`).

The flow's job is to **flag**, not to act on the reference. Approval must be **one click** for the
operator, but the human gate is mandatory for any ref change. (Auto-triggering — both auto-running the
instance flow and auto-enqueuing rework — is **deferred**; MVP is operator-initiated end to end.)

## 5. The reconciliation object (the artifact — centerpiece)

One per instance, **versioned + timestamped**, stored on the run/history record with a snapshot
pointer on the item. It is the flow's deliverable and the thing the UI renders and the operator acts
on.

Contents:
- **Identity**: `itemUUID`, `artikelNummer`, `subcategory`, `contractVersion`, `producedAt`,
  `producedByRunId`.
- **Evidence digest**: which artifacts were present (dmidecode/lspci/memtest/CPU-stress/SMART), the
  instance-specs snapshot used, and which reference web sources it compared against.
- **Field comparisons** (per instance-scoped spec field): `{ measured, refValue, verdict, confidence,
  evidenceRef }` where verdict ∈ `match` | `missing_on_ref` | `conflict` | `instance_variance`.
- **Findings**: human-readable statements ("device reports AMD Ryzen 5, reference says Intel i5").
- **Proposed actions** (operator-gated, *not executed*): `propose_ref_rework { fields, instructions,
  evidence }`, `relink_artikelnummer { candidates }` (candidates via `searchItemReferences`, #913),
  and applied-directly instance updates it owns (see below).
- **Data-quality score**: informational only for now (a coherence indicator; *not* the device
  `Qualität` 1–5). No gating yet.
- **Status**: `open` / `acknowledged` / `actioned` / `dismissed` — the operator workflow state.

What it enables: the operator sees findings + one-click actions (approve the ref rework, relink the
Artikelnummer, accept/dismiss). It is also the **idempotence key**: compare its `producedAt` /
`contractVersion` (and the latest artifact timestamp) against the item to decide whether a (re)run is
warranted — no new artifacts/specs since the last reconciliation ⇒ nothing to do.

Instance-owned writes: measured **fills of empty instance specs** apply directly (the instance is
owned, the data is measured). A **conflict** with an existing instance-spec value is a *finding*, not
a silent overwrite.

## 6. Reconcile — item-read-only, inline *and* standalone (backfillable)

Reconcile is **non-blocking** and **never writes item enrichment data** (its only item writes are the
instance-spec fills it owns per §5 and the informational quality score). It reads (instance evidence +
reference web data) and writes the **reconciliation object** to the run/history record; any ref effect
is a *proposed action*, never a write.

Because it is otherwise pure w.r.t. the item, the same reconcile logic serves two paths:
- **Inline**: the final step of an instance flow run.
- **Standalone (`mode=reconcile`)**: invoked on any existing compute item as its own minimal run — no
  extraction, no review reopen. This is what makes the **existing backlog reconcilable** without
  re-running any heavy flow.

**Backfill without mutation:** the reconciliation object's timestamp/`contractVersion` *is* the
staleness stamp. An idle **`sweepReconcile`** (mirroring `sweepContractRework`, #894) can enqueue
`mode=reconcile` for compute items whose reconciliation is missing/stale — self-limiting, capped,
gated by an `AUTO_RECONCILE` flag + the kill switch (#913). **Deferred for MVP** (auto-triggers are
deferred); the standalone manual run is the MVP entry point, the sweeper is a later add.

## 7. Data ownership — the item stays the source of truth

Decided: **data lives on the item, as today** (per-field approval rejected — `Langtext` bundles many
fields; whole-`Langtext` approval stays). Stay as close to the existing structure as meaningfully
possible.

- The item (`items` / `item_refs`) remains the operational + shop-ready source of truth ERP, search,
  print, and export read. `ReviewState` gates export, unchanged.
- **Runs + the reconciliation object are history / observability / proposals** — not a staging area.
- Manual operator edits (#911) and run writes both land on the item; the review gate and
  `ambiguousFields` remain the conflict mechanism. No new merge layer.

## 8. Run history & storage — latest-row snapshot + append-only history

**UPDATE (main shipped `agentic_run_snapshots`, #918 — build on it, don't reinvent).** Main now has a
snapshot-before-run history of the **AI-written reference fields** (`Artikelbeschreibung`, `Langtext`,
dimensions, price, categories…), keyed on `Artikel_Nummer`, retention "4 most recent + last approved",
with a **diff view + non-destructive restore** in the KI tab (`AgenticSnapshotsPanel`). Its model
comment explicitly says **instance fields (`InstanceSpecs`, serial/MAC) are deferred to "their own
history later"** — that is precisely this feature's gap.

So the revised plan:
- **Instance-field history = extend the snapshot model to instance scope** (an instance-keyed snapshot
  capturing `InstanceSpecs` + the reconciliation object), rather than a separate `agentic_run_history`
  table. Reuse `AgenticSnapshotsPanel`'s diff/restore.
- `agentic_runs` stays the "latest run per target" snapshot; existing readers untouched. The
  remaining genuinely-new piece for the **global KI-Runs list** is a per-run record (status + inputs +
  transcript across *all* runs, not just the capped field-snapshots). Decide at build time whether that
  is a light `agentic_run_log` or a widening of snapshots; the capped snapshot table is not a complete
  per-run log.
- Transcript still moves to jsonb (today a single overwritten per-item file).

## 9. What a run record carries (KI-Runs detail tabs)

- **Übersicht**: id, scope, mode, target(s), subcategory, `SpecContractVersion`, status, timestamps,
  duration, retries/error, trigger provenance (manual / intake / sweeper), actor, run graph
  (parent/child runs), affected item(s).
- **Eingaben & Kontext**: target snapshot at start, measured evidence digest (§2), instance specs,
  reference web sources compared against, control inputs.
- **Transkript**: per-stage sections — prompts/messages, tool invocations, raw responses, retries,
  model/provider (jsonb on the history row).
- **Änderungen dieses Laufs**: historical diff (before → written) of instance-spec fills; category /
  pricing / shop outputs for reference runs.
- **Abgleich** (the reconciliation object, §5): field comparisons, findings, proposed actions with
  operator controls, data-quality score.
- **Review & Verlauf**: `ReviewState`, decisions, `agentic_run_review_history`, applied-at/by,
  resulting `events` diff rows, spawned-rework link (once an operator approved it).

The **item KI tab** renders a compressed card of the latest relevant run(s) + open reconciliation
findings, and deep-links into the run detail.

## 10. UI — a new `KI-Runs` list type

Reuses the established list/detail/tab shell (`ItemListPage` / `BoxListPage` /
`RecentActivitiesPage`). No dedicated runs list exists today (runs surface only per-item in
`ItemKiTab` + admin cards). List reads `agentic_run_history`, filterable by scope / mode / status /
target; detail carries the tabs in §9; the per-item quick trigger stays in `ItemKiTab`.

## 11. Phasing (MVP-first, operator-initiated)

- **Phase 1 — contract `scope`/`measuredSignal` + deterministic instance fill (no LLM, no history, no
  new run type).** Extend `SpecContractField`; tag instance fields in the compute contracts (201
  first); replace `INTAKE_TO_SPEC` with contract-driven binding; read `IntakeScan`; persist scanned
  `cpu` (#47). Shippable; de-risks the schema.
- **Phase 2 — run history + identity.** Add `agentic_run_history` (append-only, transcript jsonb)
  written on each completed run; seed existing data as run 1; relax the snapshot key. Readers
  untouched.
- **Phase 3 — the reconciliation object + reconcile logic (standalone, manual).** Define the object
  (§5); ingest the netboot artifacts (§2) via `lib/external-docs.ts`; compare measured vs. reference
  web data; produce findings + proposed actions + informational quality score. Operator-triggered on a
  single item; **no auto-trigger, no auto-rework.**
- **Phase 4 — operator actions on the reconciliation.** One-click **approve → enqueue ref `rework`**
  (human-gated), relink Artikelnummer, acknowledge/dismiss; status workflow on the object.
- **Phase 5 — `KI-Runs` list type + run-detail tabs** (reading history), incl. the Abgleich tab.
- **Phase 6 (later) — automation.** Auto-trigger the instance flow on intake `/complete` (coalesced),
  the idle `sweepReconcile` backfill, and a data-quality-score gate. All deferred until the MVP runs.

## 12. Complexity guardrails (committed)

1. Ref changes happen **only** via the existing `rework`, and **only after operator approval** — no
   new ref-writer, no auto-trigger.
2. Instance flow never hits the web — it compares against the reference's stored web data.
3. Latest-row snapshot + append-only history — existing readers untouched; no in-place migration.
4. Reconcile is item-read-only + non-blocking — inline and standalone; produces the reconciliation
   object; idempotent via its own timestamp/version.
5. Data stays on the item; whole-`Langtext` approval; no staging/merge layer.
6. Scoped to compute/bootable subcategories (the intake API's domain).
7. One `KI-Runs` surface (reused shell), not per-capability widgets.

## 13. Open questions (carry into build)

1. Reuse vs. dedicated instance flow: audit the existing `item-flow` stages/prompts for genuine reuse
   before writing a new flow (lean: dedicated, small, oriented on the existing one).
2. Reconciliation object schema: refine the field set in §5 (verdict enum, action types, status
   machine) against the first real compute contract.
3. Instance-spec conflict handling: exact rule for measured-vs-existing disagreement (surface as
   finding; never silent overwrite — confirm no auto-apply on conflict).
4. Which compute subcategories get `scope` tags in Phase 1 beyond 201.

## Resolved decisions

- Instance flow **never mutates `item_refs`** and **never auto-triggers a ref `rework`** — it flags
  findings in the reconciliation object; an **operator approves** (one click) to enqueue the existing
  rework. Auto-triggering (flow + rework) is **deferred** — MVP is operator-initiated end to end.
- The **reconciliation object** is the flow's artifact (§5): evidence digest, field comparisons,
  findings, operator-gated proposed actions, informational data-quality score, status. It is also the
  idempotence/staleness key.
- **Reconcile is item-read-only** (writes only the reconciliation object + owned instance-spec fills +
  the informational score), dual-path (inline + standalone `mode=reconcile`), backfillable — so the
  backlog can be reconciled without mutating item/review state. Not a `rework`.
- **Data stays on the item** (as today); whole-`Langtext` approval; no per-field approval / staging.
- Contract `scope`/`measuredSignal` added **only to compute/bootable subcategories**; existing stored
  data left as-is.
- Run history via **latest-row snapshot + append-only `agentic_run_history`** (transcript as jsonb);
  existing data seeded as run 1.
- Data-quality score is **informational only** for now; a gating trigger is a later add.
- `InstanceText` (custom per-instance prose) is **out of scope**.
- UI is a new `KI-Runs` list type, not a separate "proposals" abstraction.

---

## 14. Relation to shipped AI-runs-optimization work (#916 / #917 / #918)

A sibling effort ([`PLANNING_ai_runs_optimization.md`](PLANNING_ai_runs_optimization.md)) already
shipped pieces this plan assumed it would build. Reuse, don't duplicate:

| Shipped | What it gives us | How this feature reuses it |
|---|---|---|
| Run snapshots + diff + restore (#918, `AgenticSnapshotsPanel`, `agentic_run_snapshots`) | Per-item AI-field version history, before→after diff, non-destructive restore | Instance history = extend snapshots to instance scope (§8); reconciliation "approve → rework" uses the pre-rework snapshot for safe rollback |
| Search-sources panel (#916, `AgenticSearchSources`) | Renders `LastSearchLinksJson` + query count in the KI tab | The reconcile "evidence / reference web data compared" view reuses this |
| Grounding block (#917) | Injects `SubCategory` label + anchor into extraction/categorizer/supervisor | Reconcile compares measured vs. ref *within a known device class* — same anchor |
| Review wizard (#953/#954) | Edit-in-place review, before→after correction diff into next run | The operator "approve proposed action" UX should match the wizard's patterns, not a new modal language |
| Rework closure (sibling Thread 3, partly pending) | Rework reachable from review + failure-restores prior state | The reconciliation's `propose_ref_rework` action feeds the *same* rework path (`onReworkSubmit`) |

Net: this feature is now mostly **instance-scope extensions of already-shipped reference-scope
machinery**, plus the reconcile logic and the global KI-Runs list.

## 15. UI/UX inventory (for layout decision) — EXISTS vs NEW

**A. Global `KI-Runs` surface**
- (NEW) Nav entry + list page (reuse `ItemListPage` shell); filters scope/mode/status/subcategory/
  has-findings/date/target; columns target·scope+mode·status·quality·#findings·#open-actions·trigger·
  time.
- (NEW) Run-detail view with tabs (below).

**B. Run-detail tabs**
- (NEW) Übersicht — identity, status, timeline, trigger provenance, run graph, affected item(s).
- (NEW) Eingaben & Kontext — evidence digest; **reuse `AgenticSearchSources`** for reference web data.
- (PARTIAL) Transkript — exists as a per-item file; needs per-run jsonb + collapsible viewer (todo #7).
- (PARTIAL) Änderungen — **reuse `AgenticSnapshotsPanel`** diff; extend to instance fields.
- (EXISTS) Review & Verlauf — review state/decisions already tracked; add spawned-rework link.

**C. Reconciliation object (Abgleich tab — the interactive heart, mostly NEW)**
- (NEW) Field-comparison table: measured │ ref │ verdict │ confidence │ evidence link.
- (NEW) Findings list with severity.
- (NEW) Operator actions: **approve → ref rework** (reuse existing rework path `onReworkSubmit`),
  **relink Artikelnummer** (reuse the intake candidate picker / `searchItemReferences`),
  acknowledge/dismiss + status.
- (NEW) Data-quality score badge (informational).

**D. Item-level surfaces**
- (EXISTS) `ItemKiTab` — already hosts snapshots panel, search sources, rework modal, run actions; add
  a reconciliation summary card + deep-link.
- (NEW) "Reconcile jetzt" trigger button (MVP entry), disabled when reconciliation is fresh.
- (EXISTS/EXTEND) `ItemInstanceTab` — add instance-spec provenance + open-conflict finding inline.
- (NEW) Optional item-list badge: `AiDataQuality` / open-findings column.

**E. Admin / config**
- (EXISTS pattern) Admin flag cards (reuse `AgenticDispatchCard`): later `AUTO_RECONCILE`; kill switch
  already exists.
- (EXISTS) KI-queue admin card → link to / graduate into the KI-Runs list.

**F. Cross-cutting**
- (NEW) Shared scope/mode/status chip component.
- (LATER) Operator notification on reconcile finishing with `wrong_ref`.

## 16. Data inventory & candidate flow steps (for prompt design)

### Collected today (grounded in `docs/detailed/intake-image.http`)
- **Structured scan** (`items.IntakeScan`): serial, mac, vendor, model, `cpu` (string), `ramMb`,
  `disks[]` (name/sizeGb/type/serial/wwn/model), `components[]` (gpu/nic vendor/model/slotKey),
  `batteryPercent`.
- **Derived instance specs** (`deriveInstanceSpecsFromScan`): `Prozessor`, `RAM`, `Speicher`,
  `Speichertyp` (canonicalized) → merged into `InstanceSpecs`.
- **Quality answers** (`InstanceSpecs` + `quality_assessments`): cosmetic, keyboard layout/condition,
  display, swollen battery, hinges, fan-dusty, battery_condition, …
- **Phase-2 raw files** (serial-keyed, `intake-scans` dir): `memtest.txt`, `battery.txt`, per-drive
  `smart-*.txt`, `wipe-certificate-*.txt`.

### Missing vs. what was assumed
- **dmidecode / lspci / CPU stress-test are NOT collected** — only their parsed equivalents (cpu
  string, ramMb, disks, gpu/nic) exist as structured fields. No raw board/BIOS dump, no DIMM
  slot/speed breakdown, no thermal/stability result.
- Also absent: panel/display model, integrated-GPU line, network link speed.
- **Two build options:** (A, MVP) reconcile from current data; (B, later) extend the netboot image +
  `.http` contract to upload dmidecode/lspci/stress. Write the prompt so added evidence slots in.

### Comparison target
- The reference's web-derived `Langtext` + its stored sources (`LastSearchLinksJson`, surfaced by
  `AgenticSearchSources`). The instance flow does **not** search the web itself.

### Candidate flow steps (basis for prompt)
1. **Assemble evidence** (deterministic) — load scan/specs/quality + parse Phase-2 files to a digest.
2. **Normalize** to contract keys via `measuredSignal` + canonicalization (deterministic).
3. **Per-field compare** measured vs. ref `Langtext` (deterministic; LLM only for fuzzy equivalence
   like "i5-8350U" ≈ "Core i5 8th gen").
4. **Big-picture reconcile** (the one LLM call) — findings, `wrong_ref` classification, proposed
   actions, informational quality score; grounded by the #917 anchor block.
5. **Emit the reconciliation object** (deterministic) — stamp version/timestamp, persist.

One LLM step inside an otherwise deterministic pipeline → cheap and safe to backfill.
**Open:** MVP evidence scope (A vs B); one LLM step vs. splitting per-field fuzzy compare out.

## 17. Plan re-validation vs. shipped agentic work (2026-09)

Checked the plan against `main` after the "new pipeline" agentic work merged. **The spine holds;
the contract foundation shifted.**

**Holds unchanged:** the problem statement; reconcile as an item-read-only, backfillable step;
operator-gated ref-rework (no auto-trigger); the KI-Runs list; reuse of shipped snapshots (#918),
search-sources (#916), grounding (#917); data stays on the item; MVP operator-initiated.

**Changed by shipped work:**

1. **Reference contracts were redefined around capabilities, not tagged with `scope`.** `102.json` now
   has `RAM-Slots`/`RAM-Kapazität`/`RAM-Typ` (model *supports*), `201.json` was stripped to
   `Prozessor`/`Display`/`Anschlüsse`. `SpecContractField` has **no `scope` field**. → §3 superseded.
2. **Revised contract approach: a separate instance-spec contract.** Define, per compute subcategory,
   the **installed** fields (RAM, storage, OS, battery health, …) that live in `InstanceSpecs`, paralleling
   the capability-focused reference contract. No `scope` tag on a mixed contract.
3. **Reconcile compares installed-value ↔ model-capability**, not equality: installed RAM ≤
   `RAM-Kapazität`, `RAM-Typ` ∈ supported, CPU/model identity matches. `wrong_ref` = installed config
   impossible for the model, or identity mismatch. Sharper than the original equality comparison.
4. **`INTAKE_TO_SPEC` is now orphaned** — it maps `ram_gb→RAM`/`storage_gb→Speicher`, but those keys
   were removed from `201.json`, so `buildSpecContext` injects nothing for them (silent no-op). Installed
   values already live in `InstanceSpecs` (via `deriveInstanceSpecsFromScan` + quality answers); the work
   is to *contract* them and reconcile against capabilities, not to rebind this map.
5. **New Phase 0 prerequisite: stabilize the reference contracts.** They are mid-refactor and
   inconsistent (`201` lacks the storage/RAM-capability fields `102` has). Reconcile needs a consistent
   capability model across compute subcategories first.
6. **Doc debt:** the contract restructure shipped undocumented (commits "new pipeline" / "cleanup and
   minor contract updates", no changelog Why). Close this regardless of this feature.

**Revised phasing (replaces §11 Phase 1):**
- **Phase 0** — stabilize + normalize the capability-oriented reference spec contracts across compute
  subcategories; document the restructure.
- **Phase 1′** — define the **instance-spec contract** per compute subcategory (installed fields +
  `measuredSignal` bindings); persist measured values into `InstanceSpecs` consistently (retire the
  orphaned `INTAKE_TO_SPEC` path). No LLM.
- Phases 2–6 as before, but reconcile (Phase 3) compares installed ↔ capability per (2)/(3) above and
  extends `agentic_run_snapshots` to instance scope (§8).
