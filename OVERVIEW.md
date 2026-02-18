# Project Overview & Task Tracker

## Current focus
- Stabilize ERP sync by removing unproven continuation heuristics and preserving only behavior backed by known request evidence.

## Next steps
1. ✅ Remove non-essential import continuation fallback probe logic that has not been proven against browser request captures.
2. ✅ Align browser-parity action contract for preview/import (`CsvImport/test` + `CsvImport/import`) and remove legacy action flag emission in browser-parity mode.
3. ⏳ Re-validate parser and completion criteria with deterministic logs and minimal branching.
4. ⏳ Add explicit browser-parity mapping emission (`mappings[+].from` / `mappings[].to`) based on captured HAR payloads.

## Notes
- Browser request captures indicate `CsvImport/import` probe requests without multipart context are insufficient to recover continuation identifiers.
- Changes should stay minimal and reuse existing request assembly/polling structures.
