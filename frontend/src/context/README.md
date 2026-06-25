# frontend/src/context/

React contexts for cross-component state that doesn't belong to a single component tree.

## Files
- `BulkSelectionContext.tsx` — tracks which items are selected for bulk operations (move, delete, agentic trigger)
- `PanelContext.tsx` — tracks which entity (item/box/stub) is open in the detail panel and its navigation history
- `UserMarksContext.tsx` — tracks operator bookmarks/marks on items for personal follow-up

## Relations
- Consumed by: `frontend/src/components/` (most top-level components)
- Provided by: `frontend/src/components/App.tsx` (wraps the whole app)

## Scope
Global UI state only — no API calls, no persistence beyond sessionStorage.

## Decisions
- Three separate contexts (not one combined store) so components only re-render when their specific slice changes
