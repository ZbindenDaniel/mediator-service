import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { ItemCategoryDefinition } from '../../models/item-categories';
import { buildItemCategoryLookups } from '../../models/item-category-lookups';
import type { ItemCategoryLookups } from '../../models/item-category-lookups';

// Backend-only runtime source for the category taxonomy. Lives here (not in
// models/) because it reads a file at startup — models/ is also compiled into the
// browser bundle, which cannot readFileSync. The frontend gets the taxonomy over
// GET /api/taxonomy instead (Phase 2). See docs/PLANNING_TAXONOMY_EXTERNALIZATION.md.

export interface TaxonomySeedSubcategory {
  code: number;
  labelExternal: string;
  labelInternal?: string;
  parentCode?: number;
  sortOrder?: number;
  active?: boolean;
  categorizerDescription?: string;
  intakeEnabled?: boolean;
  intakeLabel?: string;
  intakeSortOrder?: number;
  aliases?: string[];
}

export interface TaxonomySeedCategory {
  code: number;
  labelExternal: string;
  labelInternal?: string;
  sortOrder?: number;
  active?: boolean;
  subcategories: TaxonomySeedSubcategory[];
}

export interface TaxonomySeed {
  version: number;
  categories: TaxonomySeedCategory[];
}

let cache: ItemCategoryDefinition[] | null = null;

function resolveSeedPath(): string {
  const fromEnv = (process.env.TAXONOMY_SEED_FILE || '').trim();
  if (fromEnv) return resolve(fromEnv);
  // dev (ts-node): backend/lib -> repo/config; dist: dist/backend/lib -> dist/config.
  const candidates = [
    resolve(__dirname, '../../config/taxonomy.seed.json'),
    resolve(process.cwd(), 'config/taxonomy.seed.json')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/** Validates a raw seed and maps it to the in-memory ItemCategoryDefinition[]. Throws on invalid shape. */
export function parseTaxonomySeed(raw: unknown): ItemCategoryDefinition[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as TaxonomySeed).categories)) {
    throw new Error('[taxonomy] seed must be an object with a "categories" array');
  }
  const seed = raw as TaxonomySeed;

  const seenCategoryCodes = new Set<number>();
  const seenSubCodes = new Set<number>();
  let prevCategoryCode = -Infinity;

  const categories: ItemCategoryDefinition[] = seed.categories.map((cat) => {
    if (typeof cat.code !== 'number') throw new Error('[taxonomy] category missing numeric code');
    if (!cat.labelExternal) throw new Error(`[taxonomy] category ${cat.code} missing labelExternal`);
    if (seenCategoryCodes.has(cat.code)) throw new Error(`[taxonomy] duplicate category code ${cat.code}`);
    if (cat.code <= prevCategoryCode) throw new Error(`[taxonomy] category codes must ascend (${cat.code} after ${prevCategoryCode})`);
    seenCategoryCodes.add(cat.code);
    prevCategoryCode = cat.code;

    let prevSubCode = -Infinity;
    const subcategories = (cat.subcategories || []).map((sub) => {
      if (typeof sub.code !== 'number') throw new Error(`[taxonomy] subcategory under ${cat.code} missing numeric code`);
      if (!sub.labelExternal) throw new Error(`[taxonomy] subcategory ${sub.code} missing labelExternal`);
      if (seenSubCodes.has(sub.code)) throw new Error(`[taxonomy] duplicate subcategory code ${sub.code}`);
      if (sub.code <= prevSubCode) throw new Error(`[taxonomy] subcategory codes must ascend within a parent (${sub.code} after ${prevSubCode})`);
      const parentCode = sub.parentCode ?? cat.code;
      if (parentCode !== cat.code) throw new Error(`[taxonomy] subcategory ${sub.code} parentCode ${parentCode} != containing category ${cat.code}`);
      seenSubCodes.add(sub.code);
      prevSubCode = sub.code;
      return {
        code: sub.code,
        // Compat: existing consumers read `.label`; treat labelExternal as the display label.
        label: sub.labelExternal,
        labelExternal: sub.labelExternal,
        labelInternal: sub.labelInternal,
        parentCode,
        sortOrder: sub.sortOrder,
        active: sub.active,
        categorizerDescription: sub.categorizerDescription,
        intakeEnabled: sub.intakeEnabled,
        intakeLabel: sub.intakeLabel,
        intakeSortOrder: sub.intakeSortOrder,
        aliases: sub.aliases
      };
    });

    return {
      code: cat.code,
      label: cat.labelExternal,
      labelExternal: cat.labelExternal,
      labelInternal: cat.labelInternal,
      sortOrder: cat.sortOrder,
      active: cat.active,
      subcategories
    };
  });

  return categories;
}

/** Loads the taxonomy from the seed file into the in-memory cache (once). */
export function loadTaxonomy(force = false): ItemCategoryDefinition[] {
  if (cache && !force) return cache;
  const path = resolveSeedPath();
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  cache = parseTaxonomySeed(raw);
  return cache;
}

/** Synchronous accessor for backend consumers; lazy-loads on first use. */
export function getItemCategories(): ItemCategoryDefinition[] {
  return cache ?? loadTaxonomy();
}

/** Lookups built over the loaded taxonomy. */
export function getTaxonomyLookups(): ItemCategoryLookups {
  return buildItemCategoryLookups(getItemCategories());
}

/** Test/hot-reload seam. */
export function resetTaxonomyCache(): void {
  cache = null;
}

// Verbatim numbering-convention line from docs/data_struct.md, kept here so the
// categorizer reference can be rendered from the loaded taxonomy instead of
// parsing the markdown file. Must stay identical to the md intro so the rendered
// reference matches the previous compacted output (guarded by a parity test).
const CATEGORIZER_REFERENCE_INTRO =
  'Die folgenden Codes werden für Haupt- und Unterkategorien verwendet. Die Hauptkategorien sind in Zehnerschritten nummeriert, die Unterkategorien hängen sich mit laufenden Nummern an (z.B. 10 → 101, 102, ...).';

/**
 * Renders the compact taxonomy reference the categorizer prompt uses, from the
 * loaded taxonomy — replacing the read+compaction of docs/data_struct.md. Output
 * format matches compactTaxonomyReference(): intro line, blank line, then one
 * `code Name: subcode Name; …` line per category (semicolon-joined because some
 * names contain commas). An optional per-subcategory categorizerDescription is
 * appended when present; absent in the default seed, so parity is preserved.
 */
export function renderCategorizerReference(categories: ItemCategoryDefinition[] = getItemCategories()): string {
  const lines = categories.map((cat) => {
    const subs = cat.subcategories.map((sub) => {
      const label = sub.labelExternal ?? sub.label;
      return sub.categorizerDescription
        ? `${sub.code} ${label} (${sub.categorizerDescription})`
        : `${sub.code} ${label}`;
    });
    const catLabel = cat.labelExternal ?? cat.label;
    const subsText = subs.length > 0 ? `: ${subs.join('; ')}` : ' (keine Unterkategorien)';
    return `${cat.code} ${catLabel}${subsText}`;
  });
  return [CATEGORIZER_REFERENCE_INTRO, '', ...lines].join('\n').trim();
}
