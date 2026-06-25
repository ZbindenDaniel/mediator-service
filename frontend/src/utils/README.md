# frontend/src/utils/

Frontend utility modules — event log display, print helpers, logging.

## Files
- `eventDescription.tsx` — renders human-readable descriptions for event log entries
- `eventLogLevels.ts` — maps event level codes to display styles
- `eventLogTopics.ts` — maps event topic codes to labels
- `logger.ts` — thin console wrapper with structured log objects
- `printLabelRequest.ts` — constructs label print request payloads
- `printSettings.ts` — reads/writes print preferences from localStorage

## Relations
- Used by: `frontend/src/components/` (event log cards, print buttons)
- See also: [`docs/changelogs/printing.md`](../../../../docs/changelogs/printing.md)
