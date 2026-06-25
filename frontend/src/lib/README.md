# frontend/src/lib/

Frontend library layer — API client functions, formatting utilities, contract loaders, and storage helpers.

## Files
- `agentic.ts` — API calls for agentic run management (trigger, cancel, status)
- `agenticReviewMapping.ts` — maps review prompt sequences to submission payload fields
- `agenticStatusLabels.ts` — human-readable labels for agentic run status codes
- `categoryLookup.ts` — category/subcategory lookup helpers using `../data/itemCategories`
- `contractsApi.ts` — fetches quality/spec/assembly contracts from the backend
- `format.ts` — general formatting helpers (dates, numbers, labels)
- `itemDetailFormatting.tsx` — renders item field values for the detail panel
- `itemGrouping.ts` — groups item list results for display
- `itemListFiltersStorage.ts` — persists item list filter state in sessionStorage
- `langtext.ts` — parses and formats Langtext (rich product description) content
- `qualityContracts.ts` — loads and caches quality contracts, derives quality tags/scores
- `shelfLabel.ts` — formats shelf/location labels for display
- `specContracts.ts` — loads and caches spec contracts, derives spec field display
- `user.ts` — current user session helpers

## Relations
- Used by: `frontend/src/components/`
- Calls: backend `/api/*` endpoints
- See also: [`frontend/src/context/`](../context/README.md), [`frontend/src/data/`](../data/README.md)

## Scope
Pure functions and API wrappers. No React components, no direct DOM access.
