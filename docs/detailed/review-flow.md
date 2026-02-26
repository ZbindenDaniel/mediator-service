# Review Flow

> [!NOTE]
> **Authoring rules**
> - Prefer links over duplicated schema definitions.
> - Keep each section short and contract-focused.
> - Explicitly call out where data structures must stay synchronized across `models/`, `backend/src/models/`, and frontend types/usages.

## Why this exists
- Business goal:
- User value:

## Scope
- In scope:
- Out of scope:

## Core concepts
- Manual review decision points and required reviewer inputs.
- Spec pruning and feedback capture propagated into later runs.
- Pricing and publication checks integrated into the approval path.
- Final outcome transitions: approved, needs changes, rejected.

## Data contracts
- Canonical model links:
  - `models/...`
  - `backend/src/models/...`
  - `frontend/...` (if applicable)
- Key fields:
- Enums:
- Sync requirements across layers:

## Likely code locations
- `backend/actions/*review*`
- `backend/agentic/flow/*review*`
- `backend/src/models/agentic*`
- `frontend/src/components/*Review*`
- `frontend/src/routes/review*`

## API/actions
- Endpoint/action names:
- Request shape:
- Response shape:
- Error cases:

## UI components & routes
- Routes:
- Key components:
- User flows:

## State machine / workflow
1. Step 1:
2. Step 2:
3. Step 3:

## Logging & error handling
- Log identifiers/events:
- Warning conditions:
- Error conditions:
- try/catch boundaries:

## Config & environment flags
- Required flags:
- Optional flags:
- Defaults/constraints:

## Dependencies & integrations
- Database:
- Device integrations (printer/camera):
- External services:

## Failure modes & troubleshooting
- Known failure mode:
- Detection signals:
- Operator/developer recovery steps:

## Test/validation checklist
- Static checks:
- Runtime checks:
- Contract sync verification:

## Open questions / TODO
- [ ] TODO:

## Changelog
- YYYY-MM-DD: Initial draft.
