# frontend/src/utils/

Frontend utility modules — event log display, print helpers, logging.

## Files
- `activityGroups.ts` — turns a newest-first event list into activities-page rows: day headers + folding of 3+ consecutive same event/actor events (≤10 min apart) into one expandable burst
- `eventDescription.tsx` — renders human-readable descriptions for event log entries
- `eventLogLevels.ts` — maps event level codes to display styles
- `eventLogTopics.ts` — maps event topic codes to labels
- `logger.ts` — thin console wrapper with structured log objects
- `printLabelRequest.ts` — constructs label print request payloads
- `printSettings.ts` — reads/writes print preferences from localStorage
- `scannerDetection.ts` — pure keystroke-timing state machine that flags a hardware barcode scanner's trailing Enter so it can be suppressed (wired via a capture-phase listener in `App.tsx`)

## Decisions
- **Burst folding runs client-side over all loaded rows**, not in SQL: page boundaries just re-join when the next page is appended, and the server stays a plain filtered cursor feed (the bulk floods themselves are handled by debug level + summary events on the backend).

## Relations
- Used by: `frontend/src/components/` (event log cards, print buttons)
- See also: [`docs/changelogs/printing.md`](../../../docs/changelogs/printing.md)
