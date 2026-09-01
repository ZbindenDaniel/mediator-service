# Planning: Externalize the Category Taxonomy

**Status:** Phased implementation plan (no code yet)
**Parent:** [`docs/PLANNING_NEW_USE_CASE.md`](PLANNING_NEW_USE_CASE.md) §2, §6 (gap **G‑C1**)
**Goal:** Turn the category taxonomy into a **runtime data object** — loaded at
startup, stored in the DB, and editable — so a single shipped image can run any
deployment's taxonomy, and labels/categories can change without a rebuild.

---

## 1. Why runtime, not build-time

The taxonomy lives in **four hand‑synced places** today (parent plan §2):
`models/item-categories.ts` (source), its frontend re‑export, `docs/data_struct.md`
(the LLM reference), and `INTAKE_CATEGORIES`. Only #1 is authoritative.

**Rejected — build-time codegen.** Generating the TS/markdown/intake list from a
single `taxonomy.json` at build time closes the drift, but the taxonomy would be
**baked into the image**. Since we ship one image to every deployment, that would
force **one image per taxonomy** — a non‑starter. It also can't satisfy "update
labels / add categories easily" without a redeploy.

**Chosen — runtime, DB‑backed data object.** The taxonomy is loaded at startup
into an in‑memory cache, persisted in the DB (seeded from a shipped default file),
served to the frontend over an API, and editable through an admin API. One image,
per‑deployment data, live edits. This is more work than codegen — the cost is a
frontend that fetches the taxonomy at boot instead of importing it, and a backend
whose taxonomy becomes lazily loaded rather than a compile‑time constant — but it
is the correct shape for the requirement.

---

## 2. Consumer surface (what the refactor touches)

The taxonomy is read through a small, known set of call sites:

- **Backend — direct `itemCategories` const:** `backend/actions/print-unified.ts`,
  `backend/lib/categoryLabelLookup.ts`, `backend/lib/defaultLocation.ts` (iterate
  the array). Plus the label helpers (`getCategoryLabelFromCode`, …) and
  `buildItemCategoryLookups()`.
- **Frontend — direct import:** `ItemBasicInfoForm.tsx`, `ItemListPage.tsx`,
  `forms/itemFormShared.tsx` (dropdowns), and `lib/categoryLookup.ts` →
  `buildItemCategoryLookups()`.
- **LLM categorizer:** reads the static `docs/data_struct.md`
  (`item-flow-categorizer.ts`, `CATEGORY_REFERENCE_PATH` →
  `compactTaxonomyReference`).
- **Intake:** the hardcoded `INTAKE_CATEGORIES` subset.

**Strategy to keep this small:**
- **Backend stays synchronous.** Replace the eager `export const itemCategories`
  (and the label maps it builds *at module load*) with an in‑memory cache
  populated once at startup and a `getItemCategories()` / lazy‑rebuilt lookups
  accessor. The 3 const consumers switch `itemCategories` → `getItemCategories()`;
  the label/lookup function signatures are unchanged. Requests never race the load
  because startup populates the cache before the server accepts traffic.
- **Frontend becomes context‑driven.** A `TaxonomyProvider` fetches
  `GET /api/taxonomy` once at boot and holds it; the ~4 consumers read from a
  hook/context instead of the static import. This is the one genuine refactor.
- **Categorizer** renders its taxonomy reference from the live cache instead of
  reading the static file (the compaction logic is reused on the in‑memory data).
- **Intake** derives its list from the taxonomy (an `intakeEnabled` flag) instead
  of a hardcoded array.

---

## 3. Target shape

```
config/taxonomy.seed.json          ← shipped DEFAULT seed (current taxonomy verbatim)
DB: taxonomy_categories            ← the fields below
    taxonomy_subcategories         ← the fields below (+ parentCode, categorizer, intake)
backend startup: loadTaxonomy()    ← seed-if-empty from file → read DB → cache in memory
GET  /api/taxonomy                 ← read model for the frontend (+ anyone)
POST/PATCH/DELETE /api/admin/taxonomy/…  ← editing (admin-gated), invalidates cache
```

### 3.1 Fields (the data object)

**Why three identity fields, not one:** `code` is the immutable machine key
(`items.SubCategory` stores it). But labels currently do double duty — the UI
shows the label *and* `canonicalizeCategoryLabel()` turns it into an identifier
used by **CSV import name‑matching and export columns**. So renaming a label today
silently changes an interface. Split them.

Common to categories and subcategories:

| Field | Type | Editable? | Purpose |
|---|---|---|---|
| `code` | int (PK) | **never** | Immutable stable key; what items reference. |
| `labelInternal` | text | rarely (it's an interface) | Canonical identifier for **machine interfaces** — CSV import name‑matching, export column values. Replaces today's `canonicalizeCategoryLabel(label)`. |
| `labelExternal` | text | **freely** | Human display name in the UI. Rename without breaking anything; natural future i18n seam. |
| `sortOrder` | int | yes | Display order (defaults to code order). |
| `active` | bool | yes | **Soft‑deactivate** — hide from new‑item pickers without breaking existing items that still reference the code. This is how "remove a category" works safely. |

Subcategory‑only:

| Field | Type | Purpose |
|---|---|---|
| `parentCode` | int (FK) | Hauptkategorie link. |
| `categorizerDescription` | text? | **Optional** hint handed to the categorizer agent — what the category is, notable inclusions/exclusions — to map an item description → this code. |
| `intakeEnabled` | bool | Whether this subcategory appears in the intake device list. |
| `intakeLabel` | text? | Intake‑specific display (e.g. "All‑in‑One" for 302). |
| `aliases` | text[]? | Optional alternate names for import matching (partner exports use varied names). |

**On `categorizerDescription` — mind the prompt budget.** The categorizer today
sees only `code + label`, and its prompt already hit context‑window limits
(changelogs #874/#932 trimmed the taxonomy reference). So descriptions must be
**short and optional**, and the in‑memory reference renderer includes one **only
when present** — accuracy gain traded against tokens, opt‑in per category. Good
candidates: ambiguous or overlapping codes (e.g. Mainboard vs CPU vs Steckkarte).

- **Storage choice — structured tables over a JSON blob.** Two small tables (code
  as PK) give referential clarity with `items.SubCategory`, clean per‑row edits,
  and easy "add a category". (A single JSON‑document row is simpler to load but
  worse for integrity and partial edits — noted as the fallback if an editing UI
  is far off.)
- **Seed, don't hardcode.** The shipped `taxonomy.seed.json` is only a *default*:
  `loadTaxonomy()` seeds the DB from it when the taxonomy tables are empty; after
  that the DB is authoritative. A deployment can also point at a different seed
  (`TAXONOMY_SEED_FILE`) for first init.
- **Codes are the stable key.** Labels are freely editable; codes are immutable
  and are what `items.SubCategory` references.

**Invariants the loader/validator must enforce** (load‑bearing elsewhere):
- Hauptkategorie codes ascending; subcategory codes unique (reuse the checks
  currently in `item-category-lookups.ts`).
- The **numeric convention** (Hauptkategorie in tens; subcategory = parent + a
  running suffix) — the categorizer relies on it.
- Empty subcategory lists allowed (e.g. `Non_IT`/200).

---

## 4. Phases

### Phase 1 — Runtime source + in‑memory cache (backend), behavior unchanged  ✅ DONE

**Shipped (8 increments):** extended taxonomy types with the full field model
(additive); generated `config/taxonomy.seed.json` from the current taxonomy
(round‑trip verified); `backend/lib/taxonomy.ts` loads + validates + caches it
(`getItemCategories()` synchronous accessor); `GET /api/taxonomy` + startup
warm/fail‑fast; routed the backend lookup consumers (`print-unified`,
`defaultLocation`, `categoryLabelLookup`), the categorizer reference
(`renderCategorizerReference`, byte‑for‑byte parity‑tested vs the old
`data_struct.md` output), and the intake list (derived from `intakeEnabled` /
`intakeSortOrder`) through the loader; build ships the seed to `dist/config`.
Also fixed a bug the work surfaced — intake mapped "All‑in‑One" to code 302 (a
printer) → added `109 All‑in‑One` under Computer. No new test failures (the 3
pre‑existing failing suites are todo #52). `data_struct.md` is no longer the
categorizer's LLM source (rendered from the taxonomy now) but is kept as human
doc, held in sync by the parity test.


- Extract the current taxonomy to `config/taxonomy.seed.json`.
- Add `loadTaxonomy()` that (for now) reads the seed file into an in‑memory cache
  at startup; convert the eager module‑load computations in `item-categories.ts`
  to lazy/rebuilt‑on‑load; expose `getItemCategories()` + keep the lookup/label
  function signatures.
- Switch the 3 backend const consumers to the accessor. Add `GET /api/taxonomy`.
- Point the **categorizer** and **intake** at the cache (render the LLM reference
  in memory; derive the intake subset from an `intakeEnabled` flag).
- **Acceptance:** everything reads through the runtime path; behavior identical;
  suite green. No DB yet.

### Phase 2 — Frontend consumes the endpoint
- Add `TaxonomyProvider` (boot fetch of `/api/taxonomy`, loading/error state);
  migrate `ItemBasicInfoForm`, `ItemListPage`, `itemFormShared`, and the
  `categoryLookup` wrapper off the static import; delete
  `frontend/src/data/itemCategories.ts`.
- **Acceptance:** the frontend no longer imports the taxonomy at build time; a
  changed `/api/taxonomy` response changes the UI with no rebuild.

### Phase 3 — Persist to DB (seed‑on‑init)
- Add `taxonomy_categories` / `taxonomy_subcategories` tables (additive migration).
- `loadTaxonomy()` seeds them from the file when empty, then reads the DB into the
  cache. File becomes the default seed only.
- **Acceptance:** a fresh DB self‑seeds; editing a row in the DB and restarting
  changes the taxonomy; existing `items.SubCategory` codes still resolve.

### Phase 4 — Editing (the "data object" payoff)
- Admin CRUD API (`/api/admin/taxonomy/…`, admin‑gated) to edit labels and add
  categories/subcategories; cache invalidation on write (no restart).
- Integrity guards: codes immutable; block delete/deactivate of a code that has
  items (offer soft‑deactivate instead).
- Minimal admin UI (a section on the existing `/admin` page).
- **Acceptance:** an operator edits a label / adds a category and it appears
  everywhere (UI dropdowns, categorizer reference, intake) without a redeploy.

### Phase 5 — Deferred: per‑tenant taxonomy
- Only if a requirement appears. Deployment‑wide is the decision (parent §10.1 —
  the shared catalogue implies one taxonomy). Would add tenant scoping to the
  tables + the cache key.

---

## 5. Risk & effort

- **Effort: medium** (was small for codegen). The unavoidable core is: backend
  eager→lazy taxonomy + `getItemCategories()` accessor; the frontend boot‑fetch
  provider; the categorizer/intake source switch. DB + editing (Phases 3–4) add
  more but are cleanly phaseable — Phases 1–2 already deliver the runtime
  decoupling.
- **Risk: moderate, contained.** Backend stays synchronous via the startup‑loaded
  cache, so the 3 backend consumers barely change. The real care points are: (a)
  the startup ordering (load before serving); (b) the frontend boot state (guard
  the app while taxonomy loads); (c) referential integrity on category delete
  (Phase 4). All are local and testable.
- **No blast on `items` data:** codes stay the key; only labels/rows move to the
  DB.

---

## 6. Relationship to the rest of the plan

Still the **independent, no‑blockers** workstream and a prerequisite for the
redefined spare‑part categories (parent §6.1) — and now it doubles as the
first piece of runtime‑configurable, operator‑editable data, which the
feature‑flag manifest (parent §12.2) and, later, other per‑deployment config can
follow the same pattern (`GET /api/*-config` at boot). It does not depend on the
feature‑flag system or tenancy, and it de‑risks category changes for the existing
IT‑refurbishment deployment too.
