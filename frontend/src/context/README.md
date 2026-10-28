# frontend/src/context/

React contexts for cross-component state that doesn't belong to a single component tree.

## Files
- `FeaturesContext.tsx` — deployment feature flags from `GET /api/app-config`; `useFeature()`, `<Feature name>`. Components are gated where they mount (not hidden with CSS) so disabled features never call their blocked APIs
- `IdentityContext.tsx` — the logged-in Authentik identity from `GET /api/whoami` (username, tenant, role); feeds `getUser()` and role-based admin UI. Anonymous when not logged in
- `BulkSelectionContext.tsx` — tracks which items are selected for bulk operations (move, delete, agentic trigger)
- `PanelContext.tsx` — tracks which entity (item/box/stub) is open in the detail panel and its navigation history
- `UserMarksContext.tsx` — tracks operator bookmarks/marks on items for personal follow-up

## Relations
- Consumed by: `frontend/src/components/` (most top-level components)
- Provided by: `frontend/src/components/App.tsx` (wraps the whole app)

## Scope
Global UI state only — no persistence beyond sessionStorage. Exceptions that fetch once at boot: `TaxonomyContext` (`/api/taxonomy`), `IdentityContext` (`/api/whoami`) and `FeaturesContext` (`/api/app-config`).

## Decisions
- Three separate contexts (not one combined store) so components only re-render when their specific slice changes
