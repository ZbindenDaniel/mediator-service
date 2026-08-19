# Instance Agentic Flow — Planning

Status: **design agreed, not yet built.** A per-**instance** agentic flow that consumes intake data
to fill instance specs and reconcile a physical device against its reference (`item_refs`) —
enriching items and surfacing bad references. It **never mutates reference data directly**: its only
route to change a ref is to *trigger a `rework` run* on that ref, which flows through the existing
review / auto-approve gate.

Related: intake changelog (auto-resolve #903, complete-item #900), agentic README, todo #2
(reference-keyed runs), #47 (cpu persistence), #48 (ambiguous fields), #50 (rework agent),
#51 (auto-approve). Deferred todo: "Intake: scan.txt augmentation of agentic extraction."

---

## 1. Organizing principle — one engine, typed by `(scope, mode)`

To add this capability without a second pipeline, everything is a point in one grid, not a new flow:

- **scope** ∈ `reference` | `instance` — what the run reads and *owns* (may write).
- **mode** ∈ `extract` (full, web-search) | `rework` (partial, grounded, cat/pricing skipped) |
  `reconcile` (instance → ref evidence).

| | reference | instance |
|---|---|---|
| **extract** | today's flow (web search → ref `Langtext`) | — |
| **rework** | targeted ref fix (#893, exists) | fill instance specs from measured data |
| **reconcile** | — | **new**: compare device ↔ ref, emit verdicts, spawn ref-`rework` proposals |

The "instance flow" is just **scope=instance** running `rework`(fill) then `reconcile`(compare). It
writes **only** `items.InstanceSpecs` directly. Its ref-facing output is **always** a triggered
`rework` run on the reference — never a direct `item_refs` write.

Key reuse fact: `rework` is already a *mode* of the one pipeline (`reworkSpecFields` /
`reworkInstructions` in `runItemFlow` → `applyReworkPartialUpdate`, cat/pricing skipped). Runs are
`Artikel_Nummer`-keyed today. We add an instance-keyed scope, not a parallel engine.

## 2. The reference-change rule (resolves the propose-only ↔ auto-update tension)

> The instance flow never mutates `item_refs`. When it finds evidence a ref field is wrong or
> missing, it **enqueues a `rework` run on the ref** (existing Artikelnummer machinery, existing
> gate) with the evidence in `reworkInstructions`. Whether that proposal auto-applies or waits for an
> operator is the **auto-approve gate's** decision (#51), per confidence.

"Automatic, based on evidence" = automatically *produce an evidence-backed rework proposal that
flows through the trusted path.* No second ref-writing code path exists.

## 3. Data available after intake (mostly unused today)

| Source | Column / location | Read by AI pipeline today? |
|---|---|---|
| Raw scan | `items.IntakeScan` (JSON: vendor, model, cpu, ramMb, batteryPercent, serial, mac, components[]) | **No** — written, never read |
| Quality-derived specs | `items.InstanceSpecs` (JSON) | Partial — 3 keys via `INTAKE_TO_SPEC` |
| Quality assessment | `quality_assessments.derived_specs` + condition answers | **No** |
| Phase-2 test files | `{intake-scans}/{serial}/` (+ MAC fallback, `lib/external-docs.ts`) | **No** (deferred todo) |

## 4. Contract approach — `scope` on the spec contract

Add optional fields to `SpecContractField` (`models/spec-contract.ts`):

```jsonc
{ "key": "RAM", "required": true, "scope": "instance",
  "measuredSignal": "ram", "description": "Installed memory in GB" }
```

- `scope`: `"reference"` (default — full back-compat) | `"instance"`.
- `measuredSignal`: generalizes today's hardcoded `INTAKE_TO_SPEC` into the contract (JSON, not code).

The quality/assembly contracts already target instances and produce `InstanceSpecs` — they stay the
**fill sources**. The spec contract's `scope` tag is the **reconciliation authority**: it names which
fields are comparable between an instance's measured value and the reference `Langtext`. One
comparison map, no duplicated contract.

**Migration (agreed):** update contracts, leave stored data as-is. Reference `Langtext` may still
carry old instance-varying values; instances win at read time. Operators + the rework agent (#50)
correct drift. No backfill.

## 5. The instance flow

Keyed on **`ItemUUID`**. Does **not** hit the web (grounded → cheap, safe to auto-trigger).

1. **Gather**: `IntakeScan` (measured), `InstanceSpecs`, quality condition answers, Phase-2 files
   (via `lib/external-docs.ts` serial/MAC resolver).
2. **Fill** `scope:"instance"` fields deterministically from `measuredSignal` + quality/assembly
   answers. LLM used only to reconcile genuinely ambiguous cases. Writes `InstanceSpecs`.
3. **Reconcile** measured facts against reference `Langtext` → typed verdicts (§6). A `wrong_ref` /
   `missing_on_ref` verdict enqueues a ref `rework` run (§2).

Reuses `flow/transcript.ts`, `result-handler.ts` (instance write path), `flow/schema-contract.ts`.
A new flow module, sharing infra — not a fork of `runItemFlow`.

## 6. Reconciliation verdicts

| Verdict | Meaning | Action |
|---|---|---|
| `match` | Instance agrees with ref | none |
| `missing_on_ref` | A **reference**-scoped field the ref lacks, consistently evidenced by instances | enqueue ref `rework` (fill field) |
| `wrong_ref` | Instance's measured **reference**-scoped attribute contradicts the ref (scan says AMD, ref says Intel; scanned model ≠ ref model) | proposal: "wrong reference?" → relink / correct Artikelnummer (suggest via intake matcher `searchItemReferences`, #913) |
| `instance_variance` | Field differs across instances of one ref | none — confirms it belongs in instance scope |

Only **reference**-scoped fields may ever propose a ref change; instance-scoped divergence is
`instance_variance`, never `wrong_ref`.

## 7. Triggers

Intake `/complete` (first), item creation, and instance change (`InstanceSpecs` / quality edits).
Reuse the `notStarted → queued` feeder discipline from the #913 incident fix (debounced, capped) so
we never repeat the search-token burst. Instance runs carry no web search, so auto-triggering is
affordable.

## 8. Audit / versioning (kept lean)

No general spec-versioning subsystem. The *proposal* is already audited by the run + review-history +
transcript. Log the *applied* change as an `events` row
(`InstanceSpecsUpdated { before, after, evidence, runId }`). Add real version history / rollback only
if a concrete need appears.

## 9. Run identity change (required)

`agentic_runs` keys on `Artikel_Nummer`. Instance runs need identity by `ItemUUID`. Recommended: a
nullable `ItemUUID` column + a `RunScope` discriminator on `agentic_runs`, reusing the existing
claim/dispatch/cancel machinery (`claimQueuedAgenticRuns`, `FOR UPDATE SKIP LOCKED`), rather than a
separate table. Overlaps todo #2. **[confirm one-table vs. two at build time]**

## 10. UI — a new `KI-Runs` list type

Reuses the established list/detail/tab shell (`ItemListPage` / `BoxListPage` / `RecentActivitiesPage`).
There is no dedicated runs list today — runs surface only per-item (`ItemKiTab`) and in scattered
admin cards (`AgenticOverviewCard`, `AgenticDispatchCard`).

- **List**: all runs (reference + instance), filterable by scope / mode / status. Graduates the admin
  "KI queue" card into a navigable list.
- **Detail tabs**:
  - `Transkript` — the run transcript (existing observability).
  - `Vorgeschlagene Änderungen` — the proposed diff (current → proposed, evidence, confidence) with
    accept / reject / edit; auto-applied changes show as applied with undo.
  - `Abgleich` — reconciliation verdicts + the relink / correct-Artikelnummer action.
- **Per-item quick trigger** stays in `ItemKiTab`; its *output* renders via the same run-detail model.

## 11. Phasing

- **Phase 1 — contract `scope`/`measuredSignal` + deterministic instance fill (no LLM, no new run
  type).** Extend `SpecContractField`; retag `201.json` instance fields; replace `INTAKE_TO_SPEC`
  with contract-driven binding; read `IntakeScan` in the fill path; persist scanned `cpu` (#47).
  Shippable; de-risks the schema first.
- **Phase 2 — instance run identity.** `agentic_runs` `RunScope` + `ItemUUID`; dispatcher wiring.
- **Phase 3 — the instance flow + reconciliation.** New flow module, typed verdicts, transcript,
  instance write path, ref-`rework` trigger. Auto-trigger on intake `/complete`.
- **Phase 4 — `KI-Runs` list type + run-detail tabs** (transcript / proposed changes / reconciliation)
  + auto-approve hard gate on `wrong_ref`.
- **Phase 5 (later) — Phase-2 test-file summarization** (the deferred "scan.txt augmentation" item);
  reconciliation → aggregate auto-approve signals; rework-agent auto-correction of drifted refs;
  additional triggers (creation, instance edits) if not already in Phase 3.

## 12. Complexity guardrails (committed)

1. Reuse `rework` mode for every ref change — no new ref-writer.
2. Instance flow never hits the web — grounded, cheap, safe to auto-trigger.
3. One `KI-Runs` surface (reused list/detail/tab shell), not per-capability widgets.
4. Confidence gating reuses auto-approve (#51), not a new policy engine.
5. Applied changes logged as `events` diffs — no speculative versioning subsystem.

## 13. Open questions (carry into build)

1. Run identity: one `agentic_runs` table + `RunScope`, or a separate instance-run table? (rec: one.)
2. `wrong_ref` confidence: how many corroborating instances (or how strong a single scan signal)
   before surfacing "wrong reference" vs. staying silent to avoid false alarms?
3. Auto-approve on ref-`rework` from reconciliation: allowed to auto-apply at high confidence, or
   always stop at an operator card for ref changes specifically? (Gate *may* auto-apply per #51 —
   confirm the confidence bar for ref changes.)

## Resolved decisions

- Instance flow may **only trigger a `rework`** on a ref; it never mutates `item_refs` directly.
- Propose-only to the ref, but a proposal may auto-apply through the existing auto-approve gate.
- Contracts updated; existing stored data left as-is (operators + rework agent correct drift).
- Auto-trigger on intake `/complete` (first trigger).
- `InstanceText` (custom per-instance prose) is **out of scope** — not planned.
- UI is a new `KI-Runs` list type, not a separate "proposals" abstraction.
