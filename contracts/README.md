# contracts/

## Purpose
Runtime-loaded JSON contract files — define quality assessment questions, item specification fields, and assembly (accessory/part) schemas by subcategory. Operator-editable without code changes.

## Contents
- `quality/` — quality assessment question sets, one JSON file per subcategory (e.g., `201.json` = laptops)
- `specs/` — item specification field definitions per subcategory
- `assembly/` — accessory/part slot definitions per subcategory (battery, RAM, storage, etc.); renamed from `disassembly/`
- `impact/` — CO₂ scoring thresholds and labels (high / medium / low)

## Relations
- Loaded at runtime by: `backend/lib/quality-contracts.ts` and `backend/contracts/registry.ts`
- Referenced by: `backend/agentic/` (extraction targets), `backend/actions/contracts.ts` (served to frontend + intake), `backend/actions/quality-review.ts`, `backend/actions/intake-answer.ts`
- Served over HTTP at `GET /api/contracts/{quality|specs|assembly}/…` (open, no token)
- TypeScript shapes in: `models/quality-contract.ts`, `models/spec-contract.ts`, `models/assembly-contract.ts`

## Scope
Data definitions only. No executable code. No imports.

## Rules
- File names match subcategory numbers used in the DB (`items.SubCategory`)
- Each contract file must validate against its TypeScript shape at startup (checked by `quality-contracts.ts`)
- Assembly contracts in `assembly/` carry a `question` (and optional `specQuestion`) per part — these feed quality scoring and spec derivation, not just the accessory UI

## Decisions
- **JSON files over hardcoded TypeScript**: operators can add a new subcategory contract by dropping a JSON file; no code change or rebuild required
- **Subcategory-keyed**: one file per subcategory keeps contracts isolated — changing laptop questions does not risk breaking tablet questions
- **Assembly merged into quality scoring**: assembly part questions generate a synthetic quality contract (`assemblyToQualityContract`) so the quality scoring function needs no changes for new part types
