# Domain Switching

The enrichment pipeline is domain-agnostic by design. All domain-specific
knowledge lives in the `domains/` folder at the repository root. Switching
the application from IT/electronics to a different topic (antiques, books,
clothing, …) requires changes only inside that folder plus two small wiring
steps in the backend.

---

## Folder structure

```
domains/
  loader.ts                   ← active-domain resolver (reads DOMAIN env var)
  it-electronics/             ← built-in domain: IT & electronics
    categories.ts             ← full taxonomy (ItemCategoryDefinition[])
    example-item.ts           ← static LLM fallback example (STATIC_EXAMPLE_ITEM_BLOCK)
    prompts/
      categorizer.md          ← domain example injected into the categorizer prompt
      extract.md              ← domain hints injected into the extraction prompt
  antiques/                   ← example alternative domain
    categories.ts
    example-item.ts
    prompts/
      categorizer.md
      extract.md
```

Each domain folder is self-contained. The `loader.ts` module picks the right
folder at startup based on the `DOMAIN` environment variable and caches the
result for the lifetime of the process.

---

## What is domain-specific

| Asset | File | What it contains |
|---|---|---|
| **Taxonomy** | `<domain>/categories.ts` | Complete tree of main and sub-categories with numeric codes |
| **Categorizer example** | `<domain>/prompts/categorizer.md` | One concrete input/output example that teaches the LLM the correct codes |
| **Extraction hints** | `<domain>/prompts/extract.md` | Domain-specific `Spezifikationen` keys, value formats, and `Artikelbeschreibung` prefix guidance |
| **Static example item** | `<domain>/example-item.ts` | `STATIC_EXAMPLE_ITEM_BLOCK` string used as in-context learning fallback when no reviewed items exist in the database |

Everything else — the orchestration flow, pricing, search planning, Shopware
integration, database, printing, frontend — is shared across domains and
requires no changes.

---

## How to activate a domain

Set the `DOMAIN` environment variable before starting the application:

```bash
# .env or shell
DOMAIN=antiques          # use the antiques domain
DOMAIN=it-electronics    # use IT/electronics (default when DOMAIN is not set)
```

`domains/loader.ts` reads this variable, validates it against its registry,
and returns the `DomainConfig` object. The rest of the application consumes
the config through `getActiveDomain()`.

---

## Wiring the loader into the application (remaining steps)

The domain folder and loader are in place. Two existing files still need to
delegate to the loader instead of their current hardcoded values:

### 1. `models/item-categories.ts` → use domain taxonomy

The file currently exports `itemCategories` as a hard-coded constant. Replace
that export with a delegation to the domain loader so every consumer that
already imports from `models` picks up the active domain automatically:

```typescript
// models/item-categories.ts  (changed section only)
import { getActiveDomain } from '../domains/loader';

// Replace the hardcoded array with:
export const itemCategories: ItemCategoryDefinition[] = getActiveDomain().itemCategories;
```

The lookup maps (`categoryLabelLookup`, `subcategoryLabelLookup`) and helper
functions (`getCategoryLabelLookups`, `getCategoryLabelFromCode`, etc.) remain
unchanged — they still build from `itemCategories`.

All downstream consumers (`backend/lib/categoryLabelLookup.ts`,
`backend/lib/defaultLocation.ts`, `backend/actions/print-unified.ts`,
`frontend/src/data/itemCategories.ts`) continue to import from `models` and
need no changes.

### 2. `backend/agentic/example-selector.ts` → use domain example block

The file hard-codes `STATIC_EXAMPLE_ITEM_BLOCK` with IT/electronics specs.
Replace the constant with a delegation to the loader:

```typescript
// backend/agentic/example-selector.ts  (changed section only)
import { getActiveDomain } from '../../domains/loader';

export const STATIC_EXAMPLE_ITEM_BLOCK: string = getActiveDomain().staticExampleItemBlock;
```

### 3. `backend/agentic/flow/prompts.ts` → inject domain prompt overrides

The prompt loader in `prompts.ts` reads all prompts from
`backend/agentic/prompts/`. The categorizer and extract prompts there are
domain-agnostic except for their `<examples>` sections. The domain-specific
example fragments live in `<domain>/prompts/categorizer.md` and
`<domain>/prompts/extract.md`.

The cleanest approach is to inject the domain example as an additional
placeholder (`{{DOMAIN_CATEGORIZER_EXAMPLE}}` / `{{DOMAIN_EXTRACT_HINTS}}`),
which the base prompts already contain as insertion points via the existing
`<examples>` and `<domain_hints>` XML blocks:

**`backend/agentic/prompts/categorizer.md`** — replace the static `<examples>`
block with:

```md
{{DOMAIN_CATEGORIZER_EXAMPLE}}
```

**`backend/agentic/prompts/extract.md`** — replace the static `<domain_hints>`
or add before `<output_format>`:

```md
{{DOMAIN_EXTRACT_HINTS}}
```

In `prompts.ts`, extend `loadPrompts()` to read the domain prompt files and
substitute those placeholders:

```typescript
import { getActiveDomain } from '../../../domains/loader';
import fs from 'fs/promises';

// Inside loadPrompts():
const domain = getActiveDomain();
const [domainCategorizerExample, domainExtractHints] = await Promise.all([
  fs.readFile(path.join(domain.promptsDir, 'categorizer.md'), 'utf8').catch(() => ''),
  fs.readFile(path.join(domain.promptsDir, 'extract.md'), 'utf8').catch(() => '')
]);

// Then replace placeholders in the assembled strings:
const categorizer = composedCategorizerTemplate
  .replace('{{DOMAIN_CATEGORIZER_EXAMPLE}}', domainCategorizerExample)
  .replace('{{DOMAIN_EXTRACT_HINTS}}', domainExtractHints);
```

---

## Adding a new domain

1. Create `domains/<slug>/` (e.g. `domains/books/`).
2. Add `categories.ts` — export `itemCategories: ItemCategoryDefinition[]`
   with numeric codes and German (or English) labels.
3. Add `example-item.ts` — export `STATIC_EXAMPLE_ITEM_BLOCK: string`
   with one or two representative `Spezifikationen` examples.
4. Add `prompts/categorizer.md` — one input/output categorization example
   using real items from the new domain.
5. Add `prompts/extract.md` — bullet list of domain-relevant `Spezifikationen`
   keys and value formats.
6. Register the domain in `domains/loader.ts` inside `DOMAIN_REGISTRY`.
7. Set `DOMAIN=<slug>` in `.env`.

No other files need to change.

---

## Scope summary

| File | Change type | Effort |
|---|---|---|
| `domains/loader.ts` | **New** — already created | Done |
| `domains/it-electronics/*` | **New** — already created | Done |
| `domains/antiques/*` | **New** — already created (reference) | Done |
| `models/item-categories.ts` | **Edit** — delegate to loader (3 lines) | Trivial |
| `backend/agentic/example-selector.ts` | **Edit** — delegate to loader (2 lines) | Trivial |
| `backend/agentic/flow/prompts.ts` | **Edit** — inject domain prompt fragments | Small |
| `backend/agentic/prompts/categorizer.md` | **Edit** — replace `<examples>` with placeholder | Small |
| `backend/agentic/prompts/extract.md` | **Edit** — add `{{DOMAIN_EXTRACT_HINTS}}` | Small |
| `.env.example` | **Edit** — document `DOMAIN` variable | Trivial |
| All other files | **No change** | — |
