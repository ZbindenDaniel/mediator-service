# contracts/

## Purpose
Runtime-loaded JSON contract files — define quality assessment questions, item specification fields, and disassembly schemas by subcategory. Operator-editable without code changes.

## Contents
- `quality/` — quality assessment question sets, one JSON file per subcategory (e.g., `201.json` = laptops)
- `specs/` — item specification field definitions per subcategory
- `disassembly/` — spare-parts slot definitions per subcategory (battery, RAM, storage, etc.)
- `impact/` — CO₂ scoring thresholds and labels (high / medium / low)

## Relations
- Loaded at runtime by: `backend/lib/quality-contracts.ts`
- Referenced by: `backend/agentic/` (extraction targets), `backend/actions/contracts.ts` (served to frontend), `backend/actions/quality-review.ts`
- TypeScript shapes in: `models/quality-contract.ts`, `models/spec-contract.ts`, `models/disassembly-contract.ts`

## Scope
Data definitions only. No executable code. No imports.

## Rules
- File names match subcategory numbers used in the DB (`items.SubCategory`)
- Each contract file must validate against its TypeScript shape at startup (checked by `quality-contracts.ts`)
- Disassembly contracts in `disassembly/` include a `qualityQuestion` per slot — this feeds into quality scoring, not just disassembly UI

## Decisions
- **JSON files over hardcoded TypeScript**: operators can add a new subcategory contract by dropping a JSON file; no code change or rebuild required
- **Subcategory-keyed**: one file per subcategory keeps contracts isolated — changing laptop questions does not risk breaking tablet questions
- **Disassembly merged into quality scoring**: disassembly slot questions generate a synthetic quality contract so the quality scoring function needs no changes for new part types
