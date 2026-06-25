# frontend/src/data/

Static lookup data used by the frontend — category trees, metadata key lists, shelf location constants.

## Files
- `itemCategories.ts` — hierarchical category/subcategory tree (Hauptkategorie → Unterkategorie codes and labels)
- `metaDataKeys.ts` — canonical field keys for item metadata display
- `shelfLocations.ts` — known shelf location identifiers for autocomplete

## Relations
- Used by: `frontend/src/components/` (forms, filters, display)
- Source of truth: these mirror the category/location data in the DB; keep in sync when categories change

## Scope
Read-only static data. No API calls. Data that changes frequently should be fetched from the backend instead.
