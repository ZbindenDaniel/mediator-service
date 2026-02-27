# Glossary

Standalone terminology reference for docs, reviews, and agent prompts.

## In short
- Business goal: Remove ambiguous wording so contributors interpret workflow behavior and data contracts consistently.
- User value: Faster reviews, fewer contract mismatches, and clearer handoffs across backend/frontend/docs changes.

## Canonical terms

### Item domain
- **Item**: Runtime inventory record used in lists/details; combines an instance row with reference fields as available.
- **Item reference** (`ItemRef`): Shared catalog identity keyed by `Artikel_Nummer`.
- **Item instance** (`ItemInstance`): Physical/unit inventory identity keyed by `ItemUUID`.

### Storage domain
- **Box**: Container keyed by `BoxID` where items are placed.
- **Shelf**: Storage location represented by `BoxID` values with shelf format (`S-<location>-<floor>-<index>`).
- **Shelf location definition**: Allowed location/floor metadata used to validate and render shelf placements.

### Printing domain
- **Print label request**: API payload requesting preview/dispatch for one label type.
- **Print label type**: Canonical print target enum (`box`, `item`, `smallitem`, `shelf`).
- **Label job**: Persisted print execution record keyed by `Id` and bound to `ItemUUID`.

### Event domain
- **Event log**: Persisted operational event (`EventLog`) with severity and entity context.
- **Event label resource**: Static metadata entry (`EventResource`) mapping `key -> label/level/topic`.
- **QR scan event**: Event-log entry where `EntityType`, `Event`, and optional `Meta` capture scanner action context.

### Agentic domain
- **Agentic run**: Orchestration execution record keyed by `Id` and `Artikel_Nummer`.
- **Run status**: Canonical lifecycle state from `AgenticRunStatus` constants.
- **Review state**: UI/process-specific review sub-state stored on run and item projections.
- **Review outcome**: Final reviewer decision stored as `LastReviewDecision` / `ReviewDecision`.

## Use / Avoid pairs

| Use | Avoid |
| --- | --- |
| item reference | product master |
| item instance | SKU row |
| `Artikel_Nummer` | item id (ambiguous) |
| `ItemUUID` | item id (ambiguous) |
| box | bin (unless UI literally says bin) |
| shelf | rack / location row |
| print label request | print task (ambiguous with persisted jobs) |
| label job | print request log |
| QR scan event | QR action |
| event label resource | event dictionary |
| agentic run status | workflow phase |
| review outcome | review status |
| approved / rejected | accepted / denied (non-canonical synonyms) |

## Contract-sensitive terms

Terms below map directly to model fields and should stay verbatim in docs/reviews.

- **Item reference key** -> `ItemRef.Artikel_Nummer` in `models/item.ts`.
- **Item instance key** -> `ItemInstance.ItemUUID` in `models/item.ts`.
- **Box identifier** -> `Box.BoxID` in `models/box.ts`.
- **Shelf display label** -> `Box.ShelfLabel` in `models/box.ts`.
- **Print label type** -> `PrintLabelRequestBody.labelType` in `models/print-label.ts`.
- **Label job status** -> `LabelJob.Status` in `models/label-job.ts`.
- **Event key** -> `EventLog.Event` in `models/event-log.ts`.
- **Event topic metadata** -> `EventResource.topic` in `models/event-labels.ts`.
- **Run status** -> `AgenticRun.Status` + `AgenticRunStatus` constants in `models/agentic-run.ts` and `models/agentic-statuses.ts`.
- **Run review state** -> `AgenticRun.ReviewState` in `models/agentic-run.ts`.
- **Run review outcome** -> `AgenticRun.LastReviewDecision` and `AgenticRunReviewHistoryEntry.ReviewDecision` in `models/agentic-run.ts` and `models/agentic-run-review-history.ts`.

## Usage rules
- Prefer canonical terms in docs, code reviews, issue comments, and agent prompts.
- If a legacy synonym appears in code, mention canonical + legacy once (for migration clarity), then continue with canonical terminology.
- When proposing schema changes, re-check this glossary against `models/` before merging to avoid accidental field renames.

## Open questions / TODO
- [ ] TODO(glossary): Add frontend component-level term mapping examples after next UI copy refresh.
