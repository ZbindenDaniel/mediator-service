# Planning: Onboarding a New Use Case

**Status:** Discovery / readiness assessment (no code changes yet)
**Purpose:** Inventory every place that is coupled to the current use case (IT
refurbishment / revamp‑it) so a new use case can be scoped against it and gaps
identified. This is the "list" to compare requirements against.

> **Deployment decision (resolved):** the new use case runs as a **separate
> instance / deployment** — not alongside IT refurbishment in one runtime. This
> means the goal is **not** multi-use-case scoping inside a shared namespace, but
> **externalizing the use-case-specific data so one codebase deploys with a
> different taxonomy / contracts / branding without a code fork.** See
> [§5](#5-decision--remaining-input).
>
> **Still needed:** *what the new use case actually is* — its category taxonomy
> and quality/spec requirements — to fill in the requirements column and finish
> the gap analysis.

---

## 1. TL;DR readiness verdict

| Layer | Ready for a new use case? | Why |
|---|---|---|
| **Contracts** (quality/specs/assembly/impact) | ✅ **Mostly ready** | Runtime‑loaded JSON, auto‑discovered by filename (`<subcode>.json`). Drop in a file, no rebuild. |
| **Categories** (taxonomy) | ⚠️ **Not ready** | Hardcoded in TypeScript, duplicated across **4 representations** that must be hand‑synced; requires a code change + rebuild. |
| **Config** | ❌ **No concept exists** | There is **no "use case" / domain / tenant switch anywhere**. "Change the config for the first time" has no existing surface — it must be designed. |

**Bottom line:** We are *not* ready to cleanly "switch on" a new use case today.
Contracts are the one layer built for extension. Categories are editable but
brittle (4 copies, manual sync). Config has no use‑case dimension at all — if
the new use case must **coexist** with IT refurbishment, that is a genuine
architectural gap, not a config edit.

---

## 2. Categories (taxonomy) — the coupling hotspot

The category taxonomy is the single most use‑case‑specific data in the system,
and it exists in **four** places that are only kept in sync by hand:

| # | Representation | Path | Role | Change cost |
|---|---|---|---|---|
| 1 | **Source of truth** | `models/item-categories.ts` (≈321 lines, codes 10–200 + ~130 subcodes) | Canonical TS array; label lookups built from it | Code change + **rebuild** |
| 2 | Frontend taxonomy | `frontend/src/data/itemCategories.ts` | Thin re‑export of #1 (no duplication — good) | Follows #1 |
| 3 | **LLM taxonomy reference** | `docs/data_struct.md` (212 lines) | Hand‑maintained markdown; `scripts/build.js` copies it to `dist/.../docs/data_struct.md`; the categorizer reads it at runtime (`item-flow-categorizer.ts:12`, `CATEGORY_REFERENCE_PATH`) | **Manual sync** — no generator ties it to #1 |
| 4 | **Intake device list** | `backend/actions/intake-categories.ts` (`INTAKE_CATEGORIES`) | Hardcoded Laptop/Desktop/Server/AiO/Tablet with codes inlined | Code change + rebuild |

### Downstream consumers of category codes (~16 files)
Category codes are woven through core flows, so a taxonomy change ripples:
- **ERP export / import:** `backend/actions/export-items.ts`, `backend/actions/import-item.ts`, `backend/importer.ts`
- **Printing:** `backend/actions/print-unified.ts`
- **Default storage location:** `backend/lib/defaultLocation.ts`
- **Frontend forms/lists:** `ItemBasicInfoForm.tsx`, `ItemDetail.tsx`, `ItemListPage.tsx`, `forms/itemFormShared.tsx`, `frontend/src/lib/categoryLookup.ts`
- **Lookups/models:** `models/item-category-lookups.ts`, `models/index.ts`, `backend/lib/categoryLabelLookup.ts`

### Category gaps
- **G‑C1** No single source of truth: taxonomy lives in TS (#1) *and* markdown (#3) *and* an intake list (#4). A new use case must update all three; nothing enforces consistency. **Fix candidate:** generate `docs/data_struct.md` and the intake list from `models/item-categories.ts` at build time.
- **G‑C2** Taxonomy is global, not scoped. There is no way to have two taxonomies coexist (IT + new use case) — codes are a flat global namespace.
- **G‑C3** Not operator‑editable. Unlike contracts, adding a category needs a developer + rebuild + redeploy.

---

## 3. Contracts — the layer that *is* built for extension

`contracts/` holds runtime‑loaded JSON, operator‑editable, no rebuild required.
This is the ready layer.

| Dir | Purpose | Loader | Keying |
|---|---|---|---|
| `contracts/quality/` | Quality assessment questions (`general.json` + `<subcode>.json`) | `backend/lib/quality-contracts.ts` (`loadSubCategoryContract` → reads `${subCatCode}.json`) | By subcategory code, auto‑discovered by filename |
| `contracts/specs/` | Spec field definitions per subcategory | `backend/lib/quality-contracts.ts` | Same |
| `contracts/assembly/` | Zerlegen (disassembly) slot definitions | assembly‑contract loader | Same |
| `contracts/impact/` | CO₂ scoring thresholds (`co2.json`, v2) | impact loader | Global |

**Current coverage** (partial, `general.json` is the fallback for anything uncovered):
- quality: `102, 103, 105, 201, 204, 301, 302, 401, 701, 1802` + `general`
- specs: `102, 103, 105, 201, 204, 301, 401, 601, 701`
- assembly: `102, 201, 301`

### Contract gaps
- **G‑K1** Contracts are keyed to **subcategory codes**. They are "ready" only if the new use case reuses that keying. A use case that does not fit the numeric subcategory model has no contract dimension to hang off.
- **G‑K2** Same global‑namespace problem as categories: contract files are global, not scoped per use case. Two use cases sharing an instance would collide on `<subcode>.json`.
- **G‑K3** Doc drift: `contracts/README.md` refers to a `disassembly/` folder, but the directory on disk is `assembly/`. Update the README when touching this area.

---

## 4. Config — no use‑case dimension exists

`config.js` (root) → `backend/config.ts` → `.env` is **infrastructure and
integration only**. There is no "use case", "domain", "profile", or "tenant"
selector anywhere.

**What config currently covers:** HTTP/TLS ports, Postgres (`DATABASE_URL`),
printer queues (CUPS), ERP/kivitendo import (`ERP_IMPORT_*`), model provider
(`AGENTIC_MODEL_PROVIDER`, Ollama/OpenAI), media storage (`MEDIA_*`), Shopware,
Authentik, event‑log filters. None of it selects *what kind of items the system
is for*.

**Other domain‑coupled hardcodes** (not in config, worth listing for a new use case):
- `models/shelf-locations.ts` — physical sites `revamp` / `Badenerstr.` / `Hubertus` (revamp‑it specific)
- `backend/config.ts:366` — ERP default booking group `453` (kivitendo/refurbishment specific)
- `.env.example` `ERP_IMPORT_FORM_*` — kivitendo‑specific import form contract
- `contracts/impact/co2.json` — CO₂ recovery scoring, a refurbishment‑specific concept

### Config gaps
- **G‑F1** "Change the config for a use case" is greenfield — no field, file, or switch represents a use case today. It must be designed (env var? a `contracts/usecase.json`? a build profile?).
- **G‑F2** No isolation mechanism: even if a use‑case selector existed, categories (§2) and contracts (§3) are global, so config alone cannot switch domains.

---

## 5. Decision & remaining input

**Decided — separate instance / deployment.** The new use case is its own
deployment of the same codebase. Consequences:
- The coexist‑scoping gaps (G‑C2 / G‑K2) are **out of scope** — a single
  deployment only ever serves one use case at a time, so a flat global namespace
  is fine *within* an instance.
- The problem shifts to **avoiding a code fork**: the use‑case‑specific data
  (taxonomy, contracts, domain hardcodes, branding) should be **selectable per
  deployment** — ideally mounted/loaded like `contracts/` already are, driven by
  config — so both deployments track the same code and only their data differs.
- This makes G‑C1 (single source of truth for the taxonomy) and G‑F1
  (a config surface for use‑case data) the **critical path**, because a separate
  deployment that still hardcodes the taxonomy in TS forces either a fork or a
  rebuild‑per‑use‑case.

**Still needed before the gap‑closure plan can be written:**
1. **What is the new use case?** Its category taxonomy, quality questions, and
   spec fields are the "requirements" to compare this inventory against.
2. **Does it fit the numeric Haupt/Unterkategorie model?** If yes, contracts are
   largely ready. If no, the contract keying (G‑K1) needs rework.
3. **Integration reuse:** does it reuse kivitendo ERP, the CUPS label pipeline,
   and the media mounts, or need its own? (Drives which §4 hardcodes must become
   config.)

---

## 6. Suggested next steps (given "separate deployment")

The strategic aim is **one codebase, per‑deployment data** — move use‑case data
out of code so a new deployment is a config/data change, not a fork.

1. **Externalize the taxonomy (closes G‑C1 + enables per‑deployment swap).**
   Make `models/item-categories.ts` load from a data file (or generate the TS,
   `docs/data_struct.md`, and `INTAKE_CATEGORIES` from one source) so a
   deployment supplies its own taxonomy without editing/rebuilding code. This is
   the single highest‑leverage change for the separate‑deployment model.
2. **Author the new use case's `contracts/*.json`** once its subcategories are
   defined — this layer already supports per‑deployment data via mounted files.
3. **Turn the remaining §4 domain hardcodes into config** as needed:
   shelf locations, ERP booking group / import‑form fields, CO₂ scoring — only
   those the new use case actually diverges on.
4. **Cheap wins regardless:** fix the `disassembly/` vs `assembly/` doc drift
   (G‑K3); add the taxonomy generator (step 1) since it de‑risks any category
   change even for the existing deployment.
