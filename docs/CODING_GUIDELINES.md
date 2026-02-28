# Coding Guidelines

These guidelines complement the short rules in [`../AGENTS.md`](../AGENTS.md).

## 1) Scope and change size
- Prefer the smallest possible change that satisfies the requirement.
- Avoid broad refactors unless explicitly requested.
- Keep related edits grouped by feature/domain for easy review.

## 2) Architecture and reuse
- Follow existing backend mediator/service/action patterns.
- Reuse shared helpers before introducing new abstractions.
- Keep route/action behaviour aligned with current architecture docs.

## 3) Data contracts
- Treat `models/` and `backend/src/models/` contracts as shared API surface.
- When changing structures, verify frontend/backend compatibility in the same change.
- Avoid silent schema drift; document any intentional contract changes.

## 4) Logging and error handling
- Add or refine logs at transition points and failure boundaries.
- Use structured context where possible (`phase`, entity IDs, action names).
- Add try/catch only where errors can be handled, translated, or enriched.
- Do not swallow errors; surface actionable messages to callers.

## 5) Documentation and TODO hygiene
- Update docs when behaviour or operational expectations change.
- Resolve stale TODOs near touched code/docs.
- Track notable progress in [`../OVERVIEW.md`](../OVERVIEW.md).

## 6) Testing and validation
- Run targeted checks for the changed area.
- Prefer focused tests over large, indirect suites when time is limited.
- If a check cannot run due to environment constraints, document the limitation.

## 7) Frontend change notes
- For visible UI changes, capture a screenshot artifact when tooling is available.
- Keep accessibility and existing interaction patterns intact.
