# Instance Agentic Flow — Planning

Status: **design agreed, not yet built.** This document captures the converged design for a
per-**instance** agentic flow that consumes intake data to fill instance specs and reconcile a
physical device against its reference (`item_refs`) — enriching item data and surfacing bad
references, without ever writing to the reference itself.

Related: intake changelog (auto-resolve #903, complete-item #900), agentic README, todo #2
(reference-keyed runs), #47 (cpu persistence), #48 (ambiguous fields), #50 (rework agent),
#51 (auto-approve). Deferred todo: "Intake: scan.txt augmentation of agentic extraction."

---

## 1. Motivation — the modeling tension this resolves

`contracts/specs/<sub>.json` today declares fields as if they were all **reference-level** (shared
by every unit of an Artikelnummer). But several of them genuinely **vary per physical unit** —
`201.json` lists `RAM`, `Speicher`, `Akku`, `Betriebssystem` at reference level and its own
`guidance` admits *"those may vary inbetween the same model and can not be guaranteed."*

The codebase works around this with three bolted-on mechanisms in `backend/agentic/flow/item-flow.ts`:

- `INTAKE_TO_SPEC` — a 3-entry hardcoded map (`ram_gb→RAM`, `storage_gb→Speicher`, `drive_type→Speichertyp`),
- `ambiguousFields` — item-vs-intake conflict surfacing,
- `items.InstanceSpecs` — a parallel store the reference pipeline barely reads.

We replace all three with **one concept: field scope**, and a dedicated flow that treats measured
intake data as authoritative for instance-varying fields.

## 2. Data available after intake (mostly unused today)

| Source | Column / location | Read by AI pipeline today? |
|---|---|---|
| Raw scan | `items.IntakeScan` (JSON: vendor, model, cpu, ramMb, batteryPercent, serial, mac, components[]) | **No** — written, never read |
| Quality-derived specs | `items.InstanceSpecs` (JSON) | Partial — 3 keys via `INTAKE_TO_SPEC` |
| Quality assessment | `quality_assessments.derived_specs` + condition answers | **No** |
| Phase-2 test files | `{intake-scans}/{serial}/` (+ MAC fallback, `lib/external-docs.ts`) | **No** (deferred todo) |

## 3. Contract approach — `scope` on the spec contract

Add optional fields to `SpecContractField` (`models/spec-contract.ts`):

```jsonc
{ "key": "RAM", "required": true, "scope": "instance",
  "measuredSignal": "ram", "description": "Installed memory in GB" }
```

- `scope`: `"reference"` (default — full back-compat, existing fields unchanged) | `"instance"`.
- `measuredSignal`: generalizes today's hardcoded `INTAKE_TO_SPEC` into the contract, so binding an
  instance field to a scan signal is a JSON line, not code.

**Reuse note:** the quality and assembly contracts (`contracts/quality/*`, `contracts/assembly/*`)
already target instances and already produce `InstanceSpecs`. Those remain the **fill sources**. The
spec contract's `scope` tag is the **reconciliation authority** — it names which fields are
comparable between the instance's measured value and the reference `Langtext`. One comparison map, no
duplicated contract.

**Migration (agreed):** update the contracts, leave existing stored data as-is. Reference `Langtext`
may still carry old instance-varying values; instances win at read time. Operators correct drift
manually today; the rework agent (#50) can later automate it. No backfill.

## 4. The instance flow (new, lightweight)

Keyed on **`ItemUUID`**, not `Artikel_Nummer`. Unlike the reference flow it does **not** hit the
search provider — it is grounded in measured data.

1. **Gather** instance data: `IntakeScan` (measured), `InstanceSpecs`, quality condition answers,
   Phase-2 test files (via `lib/external-docs.ts` serial/MAC resolver).
2. **Fill** `scope:"instance"` fields deterministically from `measuredSignal` bindings + quality/
   assembly answers. LLM used only to (a) narrate real condition into a description and (b) reconcile
   genuinely ambiguous cases.
3. **Reconcile** the instance's measured facts against the reference `Langtext` → structured diff.

Reuses existing sub-pieces where possible: `flow/transcript.ts`, `result-handler.ts` (instance
write path only), `flow/schema-contract.ts`. It is a **new flow module**, not a fork of the heavy
`runItemFlow`.

## 5. Reconciliation output — enrich + detect bad references

The flow emits typed verdicts (never writes the ref — insights + proposed operator actions only):

| Verdict | Meaning | Proposed action |
|---|---|---|
| `match` | Instance agrees with ref | none |
| `missing_on_ref` | A **reference**-scoped field the ref lacks, consistently evidenced by instances | "Fill reference field" (operator applies) |
| `wrong_ref` | Instance's measured **reference**-scoped attribute contradicts the ref (scan says AMD, ref says Intel; scanned model ≠ ref model) | "Wrong reference?" → "Change reference" action |
| `instance_variance` | Field differs across instances of one ref | none — confirms it belongs in instance scope |

`wrong_ref` is the high-value signal: it catches a device physically reporting one model that got
cataloged under another Artikelnummer — ones that slipped past intake's up-front matcher (#913).

**Only reference-scoped fields may ever propose a ref change.** Instance-scoped divergence is
`instance_variance`, never `wrong_ref`.

## 6. Interplay with auto-approve (#51)

`review-automation-signals.ts` today aggregates reviewer answers per subcategory into approve/reject
triggers. The instance reconciliation adds a **per-instance hard gate**:

- A `wrong_ref` (or unresolved hard conflict) verdict **blocks auto-approve** for that instance —
  it must reach an operator regardless of subcategory confidence.
- A fully-`match` reconciliation is a positive signal (candidate to *raise* confidence later).

Start with the hard block only (deterministic, easy to reason about). Feeding reconciliation
outcomes into the aggregate signal window is a later refinement. **[OPEN — confirm gate vs. signal.]**

## 7. Run identity change (required)

`agentic_runs` keys on `Artikel_Nummer`. Instance runs need identity by `ItemUUID`. This is a schema
+ dispatcher change (overlaps with todo #2). Options to decide at build time: a nullable `ItemUUID`
column + a `RunScope` discriminator on `agentic_runs`, vs. a separate `agentic_instance_runs` table.
Recommendation: single table + discriminator, to reuse the existing claim/dispatch/cancel machinery
(`claimQueuedAgenticRuns`, `FOR UPDATE SKIP LOCKED`). **[OPEN — confirm one-table vs. two.]**

## 8. UI — triggers and outputs

- **Auto-trigger:** on intake `/complete` (first automatic trigger, agreed). Later: on-demand and
  on relevant instance edits.
- **Manual trigger + output surface:** the instance tab (`ItemInstanceTab`) and/or the KI tab
  (`ItemKiTab`), mirroring the existing per-reference agentic controls. Reconciliation verdicts
  render as a small insights panel with the proposed actions ("Change reference", "Fill ref field").
  **[OPEN — confirm ItemInstanceTab vs. ItemKiTab as the home.]**

## 9. Phasing

- **Phase 1 — contract `scope`/`measuredSignal` + deterministic instance fill (no LLM, no new run
  type).** Extend `SpecContractField`; retag `201.json` instance fields; replace `INTAKE_TO_SPEC`
  with contract-driven binding; read `IntakeScan` in the fill path; persist scanned `cpu` (#47).
  Shippable, de-risks the schema before any LLM/run-identity work.
- **Phase 2 — run identity for instances.** `agentic_runs` scope discriminator + dispatcher wiring.
- **Phase 3 — the instance flow + reconciliation.** New flow module, typed verdicts, transcript,
  instance write path. Auto-trigger on intake `/complete`.
- **Phase 4 — UI insights panel + operator actions** ("Change reference", "Fill ref field") and the
  auto-approve hard gate.
- **Phase 5 (later) — Phase-2 test-file summarization** into the flow; reconciliation → aggregate
  auto-approve signals; rework-agent auto-correction of drifted refs.

## 10. Open questions (carry into build)

1. Auto-approve: per-instance hard gate only (Phase 4), or also feed the aggregate signal window?
2. Run identity: one `agentic_runs` table + discriminator, or a separate instance-run table?
3. UI home for trigger + insights: `ItemInstanceTab`, `ItemKiTab`, or split?
4. `wrong_ref` confidence: how many corroborating instances (or how strong a single scan signal)
   before we surface "wrong reference" vs. staying silent to avoid false alarms?
