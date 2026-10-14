# contracts/

> **Start here:** [docs/detailed/taxonomy-and-contracts.md](../docs/detailed/taxonomy-and-contracts.md) — the practical guide.

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
- Every contract must pass `npm run contracts:check` (`backend/contracts/validate.ts`; also run by Jest over the shipped set and by the admin upload). Startup only parses JSON — it does not validate
- Question types: `select`, `boolean`, `text`, `multi` (several values, stored as a JSON array; `"[]"` = checked, none)
- Quality scoring (`models/quality-score.ts`, all deployments): a question is scored when it has `weight`, `states` or legacy `qualityImpact` (weight defaults to 1). Answers map to fractions via the question's `states`, else the `scale` in `general.json`; `null` excludes, no value = uncertainty. `knockout: {below, cap}` caps the whole item on a certain defect. `general.json` also carries `grading` (bands + `maxUncertainty`) for the derived 1–5 grade
- `quality/group-<haupt>.json` is merged before every subcategory of that Hauptkategorie (201 → `group-20`, 2101 → `group-210`); don't redefine its question ids in the subcategory file
- New contracts use `states`, not `qualityImpact` (still read as (v−1)/4 for not-yet-migrated overlay files)
- Assembly contracts in `assembly/` carry a `question` (and optional `specQuestion`) per part — these feed quality scoring and spec derivation, not just the accessory UI

## Decisions
- **JSON files over hardcoded TypeScript**: operators can add a new subcategory contract by dropping a JSON file; no code change or rebuild required
- **Subcategory-keyed**: one file per subcategory keeps contracts isolated — changing laptop questions does not risk breaking tablet questions
- **One quality system** (2026-10-14, #980/#982): weighted components with named states give a "60–85 %" range (unchecked = uncertainty); the 1–5 grade is derived pessimistically from the lower bound and only for narrow ranges. Replaced "worst answer wins": severe answers became knock-outs, everything else is weighted — see `docs/PLANNING_PARTS_CATALOGUE.md` §5 (incl. the band calibration still open, C1)
- **Assembly merged into quality scoring**: assembly part questions generate a synthetic quality contract (`assemblyToQualityContract`) so the quality scoring function needs no changes for new part types
