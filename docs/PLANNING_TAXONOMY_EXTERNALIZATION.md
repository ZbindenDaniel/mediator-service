# Planning: Externalize the Category Taxonomy

**Status:** Phased implementation plan (no code yet)
**Parent:** [`docs/PLANNING_NEW_USE_CASE.md`](PLANNING_NEW_USE_CASE.md) §2, §6 (gap **G‑C1**)
**Goal:** Make the category taxonomy come from **one data source** instead of
being hardcoded in TypeScript and hand‑copied into three other places, so a
deployment (e.g. the spare‑part use case) supplies its own taxonomy by editing
**data, not code** — and the four representations can never drift again.

---

## 1. Why, and the constraint that decides the approach

Today the taxonomy lives in **four hand‑synced places** (parent plan §2):
`models/item-categories.ts` (source), its frontend re‑export, `docs/data_struct.md`
(the LLM reference), and `INTAKE_CATEGORIES`. Only #1 is authoritative; the rest
are kept in sync by hand.

**The decisive constraint:** `models/item-categories.ts` is compiled into **both**
the backend (Node) **and** the frontend (browser bundle) — the FE imports the
shared `models/` TS directly (`frontend/src/data/itemCategories.ts`,
`frontend/src/lib/categoryLookup.ts`). A browser bundle cannot `readFileSync` a
file at runtime, so a naive "load `taxonomy.json` at runtime" breaks the frontend
and would force a `GET /api/taxonomy` fetch + an async refactor across every form
and list that reads categories.

**Therefore: build‑time codegen from a single `taxonomy.json`.** The JSON becomes
the source of truth; a generator emits the TS data module, the LLM markdown, and
the intake list. Everything stays synchronous, the browser bundle is unchanged in
shape, and — critically — the **public API of the taxonomy modules is preserved**,
so none of the ~16 consumers change.

> **Runtime hot‑swap is a non‑goal here.** Each deployment builds its own image,
> so "supply your taxonomy at build" already satisfies "no code fork." True
> change‑without‑rebuild (runtime load / operator editing) is deferred to §6.

---

## 2. The invariant: preserve the public API

The whole low‑risk strategy rests on keeping these exports byte‑for‑byte
compatible so consumers are untouched:

- From `models/item-categories.ts`: `ItemSubcategoryDefinition`,
  `ItemCategoryDefinition`, `canonicalizeCategoryLabel()`, **`itemCategories`**
  (the array — the only *data* export), `CategoryLabelLookups`,
  `getCategoryLabelLookups()`, `getCategoryLabelFromCode()`,
  `getSubcategoryLabelFromCode()`.
- From `models/item-category-lookups.ts`: `ItemSubcategoryWithParent`,
  `ItemCategoryLookups`, `buildItemCategoryLookups()`.
- Re‑exported via `models/index.ts` (`export * from './item-categories'`) and the
  two frontend wrappers.

**Only the `itemCategories` array becomes generated.** The functions
(`canonicalizeCategoryLabel`, the lookup builders, the validation) stay
hand‑written code — they are logic, not data.

---

## 3. Target shape

```
config/taxonomy.json                     ← single source of truth (data)
scripts/generate-taxonomy.js             ← reads JSON, validates, emits ↓
  models/item-categories.data.ts         ← GENERATED const itemCategories = [...]
  docs/data_struct.md                    ← GENERATED LLM reference (categorizer)
  backend/actions/intake-categories.*    ← intake codes validated against JSON
models/item-categories.ts                ← hand-written; imports the generated data,
                                            keeps all functions + exports unchanged
```

`taxonomy.json` schema (mirrors the current TS): an ordered list of
`{ code, label, subcategories: [{ code, label }] }`; empty `subcategories` allowed
(e.g. `Non_IT` / 200).

**Constraints the validator must enforce** (they are load‑bearing elsewhere):
- Hauptkategorie codes strictly ascending; subcategory codes ascending & unique
  (already checked in `item-category-lookups.ts` — move the checks into the
  generator so a bad file fails the build, not just logs a warning).
- The **numeric convention** — Hauptkategorie in tens, subcategory = parent + a
  running suffix — because `item-flow-categorizer.ts` / `compactTaxonomyReference`
  parse and rely on it.

---

## 4. Phases

### Phase 1 — Single source + generator (no behavior change)
- Extract the current taxonomy verbatim into `config/taxonomy.json`.
- Add `scripts/generate-taxonomy.js` that validates the JSON and emits
  `models/item-categories.data.ts` (a `GENERATED — do not edit` const).
- Split `models/item-categories.ts`: it now `import`s the generated array and
  re‑exports it as `itemCategories`, keeping every other export identical.
- **Acceptance:** generated array deep‑equals the old literal; typecheck + full
  suite green; no consumer touched. This phase alone kills the drift risk for #1.

### Phase 2 — Generate the derived copies (removes #3 and #4)
- Generator also emits `docs/data_struct.md` (same format the categorizer's
  `compactTaxonomyReference` already parses — keep the CSV‑import preamble as a
  static template, generate only the code list).
- **Intake:** `INTAKE_CATEGORIES` is a *curated subset* (bootable devices, custom
  labels), not a full projection — so **validate** its codes against the taxonomy
  (build fails if a code is absent) rather than fully generating it. (Optional
  later: mark `intake:true` + an intake label in `taxonomy.json` and generate the
  list; low value since intake is opted out for the spare‑part deployment.)
- **Acceptance:** `data_struct.md` regenerates identically to the current file;
  categorizer still loads it; intake codes validated.

### Phase 3 — Wire generation into build + guard against drift
- `scripts/build.js` runs the generator **before** tsc/esbuild; add an
  `npm run generate:taxonomy` for local use.
- CI/pre‑commit check: fail if committed generated files differ from a fresh
  generation (or generate‑and‑commit so they're never hand‑edited). This is what
  makes G‑C1 *permanently* closed.
- **Acceptance:** a taxonomy edit that forgets to regenerate fails CI.

### Phase 4 — Make the source path per‑deployment (the payoff)
- `TAXONOMY_FILE` env (default `config/taxonomy.json`), read by the generator —
  mirrors the existing `ALT_DOC_DIRS_FILE` pattern. A deployment mounts/commits
  its own taxonomy and its build generates everything from it.
- Document in `.env.example` + `docs/ENVIRONMENT.md`.
- **Acceptance:** pointing `TAXONOMY_FILE` at an alternate file produces a
  correspondingly different build with zero code edits.

---

## 5. Risk & effort

- **Risk: low.** The generated TS keeps the exact exported API; consumers
  untouched. Main hazards are build **ordering** (generator must precede compile)
  and **path resolution** dev‑vs‑dist — both already solved for `contracts/` and
  `data_struct.md` (`resolve(__dirname, …)` + `build.js` copy).
- **Effort: small‑to‑medium** — mostly the generator + validation + build wiring +
  a drift‑guard test. No data‑model or DB change.
- **Blast radius if wrong:** a bad taxonomy fails the build (fail‑fast), rather
  than shipping silently — strictly safer than the current hand‑sync.

---

## 6. Deferred (only if a real requirement appears)

- **Runtime load / no rebuild:** `GET /api/taxonomy` served from the JSON; FE
  fetches at boot into a context. Enables changing taxonomy without a rebuild, at
  the cost of an async refactor across category consumers.
- **Operator‑editable:** seed a `categories`/`subcategories` DB table from the file
  and add CRUD UI. Turns the taxonomy into live data like contracts.
- **Per‑tenant taxonomy:** out of scope by decision (parent §10.1 — the shared
  catalogue implies one deployment‑wide taxonomy).

---

## 7. Relationship to the rest of the plan

This is the **independent, no‑blockers** workstream and a prerequisite for the
redefined spare‑part categories (parent §6.1). It does **not** depend on the
feature‑flag system or tenancy, and it de‑risks category changes for the existing
IT‑refurbishment deployment too — so it's safe to do first regardless of when the
spare‑part taxonomy content is finalized.
