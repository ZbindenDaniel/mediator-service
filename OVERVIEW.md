# Project Overview & Task Tracker

## Current focus
- Stabilize ERP sync by removing unproven continuation heuristics and preserving only behavior backed by known request evidence.
- Harden pricing-agent JSON reliability by repairing malformed model output before schema validation.

## Next steps
1. ✅ Remove non-essential import continuation fallback probe logic that has not been proven against browser request captures.
2. ✅ Align browser-parity action contract for preview/import (`CsvImport/test` + `CsvImport/import`) and remove legacy action flag emission in browser-parity mode.
3. ⏳ Re-validate parser and completion criteria with deterministic logs and minimal branching.
4. ✅ Refine extraction iteration logging/outcome handling for additional context requests (single-query append).
5. ⏳ Add explicit browser-parity mapping emission (`mappings[+].from` / `mappings[].to`) based on captured HAR payloads.
6. ✅ Add pricing-stage JSON repair fallback when the pricing model emits narrative text instead of contract JSON.

## Notes
- ✅ Extraction iteration dispatcher: parse/correction/validation/evaluation now emit explicit outcomes with centralized transition handling and decision-path logging.
- Browser request captures indicate `CsvImport/import` probe requests without multipart context are insufficient to recover continuation identifiers.
- Changes should stay minimal and reuse existing request assembly/polling structures.

- ✅ ERP CSV HTML formatting refinement: `Langtext` HTML export now renders as a table and `Kurzbeschreibung` is wrapped in `<p>` for future styling hooks.
- Pricing stage now retries malformed responses through a constrained JSON-repair pass before dropping the pricing update.
- Pricing prompt now explicitly forbids prose/markdown and requires a single contract JSON object to reduce parser failures before repair fallback.

- ✅ Extraction follow-up query contract now enforces a single `__searchQueries` entry per iteration while preserving truncation telemetry (`requestedCount`, `usedCount=1`) and supervisor-driven attempt progression.
