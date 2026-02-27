# Diagram Placeholders

This directory tracks optional diagram work for complex flows without introducing tooling dependencies or broad documentation rewrites.

## Goal
Improve comprehension of import/export, item-flow, review-flow, printing, and box movement by defining what each future diagram must capture before any visual asset is produced.

## TODO tracking
- [ ] Convert item lifecycle placeholder into a diagram when sequence gaps are closed.
- [ ] Convert box relocation placeholder into a diagram after relocation edge-case review.
- [ ] Convert import/export placeholder into a diagram once ERP handoff variance is finalized.
- [ ] Convert agentic item-flow placeholder into a diagram after orchestration loop stabilization.
- [ ] Convert review-flow placeholder into a diagram once retrigger policy is finalized.

## Placeholder backlog

### 1. Item lifecycle
- **Intended source doc:** [`docs/detailed/item-flow.md`](../item-flow.md)
- **Scope boundary:** From first item ingestion/extraction handoff through review completion and downstream export/print readiness.
- **Key state transitions to capture:**
  - extracted -> categorized
  - categorized -> priced
  - priced -> review_pending
  - review_pending -> approved/rejected

### 2. Box relocation
- **Intended source doc:** [`docs/detailed/boxes.md`](../boxes.md)
- **Scope boundary:** Physical or logical moves across box/shelf hierarchy, including validations that prevent illegal shelf/non-shelf assignments.
- **Key state transitions to capture:**
  - unassigned -> boxed
  - boxed -> moved_to_shelf
  - moved_to_shelf -> moved_to_box
  - boxed/shelved -> relocation_failed (validation or lookup errors)

### 3. Import/export sequence
- **Intended source doc:** [`docs/detailed/import_export.md`](../import_export.md)
- **Scope boundary:** Archive/csv ingest to persistence plus export staging through ERP handoff outcomes.
- **Key state transitions to capture:**
  - archive_received -> validated
  - validated -> ingested
  - ingested -> export_staged
  - export_staged -> export_dispatched/export_failed

### 4. Agentic item-flow
- **Intended source doc:** [`docs/detailed/agentic-basics.md`](../agentic-basics.md) and [`docs/detailed/item-flow.md`](../item-flow.md)
- **Scope boundary:** Agent run kickoff through extraction/categorization/pricing loop and reviewer escalation points.
- **Key state transitions to capture:**
  - run_created -> extraction_attempted
  - extraction_attempted -> extraction_corrected/failed
  - extraction_corrected -> categorization_completed
  - categorization_completed -> pricing_completed/review_required

### 5. Review-flow
- **Intended source doc:** [`docs/detailed/review-flow.md`](../review-flow.md)
- **Scope boundary:** Manual reviewer queue intake through decision application, optional retrigger, and audit completion.
- **Key state transitions to capture:**
  - queued -> in_review
  - in_review -> approved/rejected
  - rejected -> retriggered
  - approved/rejected -> audit_logged

## Implementation note
Diagrams remain optional for now. Start by refining these text placeholders and only add visual artifacts when they provide concrete operational value.
