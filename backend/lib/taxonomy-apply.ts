import { withTransaction } from '../db-client';
import type { ItemCategoryDefinition } from '../../models/item-categories';

// Makes the DB taxonomy match a seed file on an EXISTING database (startup only seeds an empty one,
// so switching a deployment to e.g. the catalogue taxonomy needs this). Everything in the file is
// inserted or updated; everything else is soft-deactivated (hidden from pickers) — never deleted,
// because items may still reference those codes. Codes and parents are immutable, so a code that
// exists under another parent aborts the whole run instead of silently reparenting.

export interface TaxonomyApplyResult {
  categoriesUpserted: number;
  subcategoriesUpserted: number;
  categoriesDeactivated: number[];
  subcategoriesDeactivated: number[];
}

export async function applyTaxonomy(
  categories: ItemCategoryDefinition[],
  opts: { deactivateMissing?: boolean } = {}
): Promise<TaxonomyApplyResult> {
  const deactivateMissing = opts.deactivateMissing ?? true;
  return withTransaction(async (client) => {
    let subCount = 0;
    for (const c of categories) {
      await client.query(
        `INSERT INTO taxonomy_categories (code, label_internal, label_external, sort_order, active)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (code) DO UPDATE SET label_internal = EXCLUDED.label_internal, label_external = EXCLUDED.label_external,
           sort_order = EXCLUDED.sort_order, active = EXCLUDED.active`,
        [c.code, c.labelInternal ?? c.label, c.labelExternal ?? c.label, c.sortOrder ?? 0, c.active ?? true]
      );
      for (const s of c.subcategories) {
        const existing = await client.query(`SELECT parent_code FROM taxonomy_subcategories WHERE code = $1`, [s.code]);
        const existingParent = existing.rows?.[0]?.parent_code;
        if (existingParent !== undefined && existingParent !== null && Number(existingParent) !== c.code) {
          throw new Error(`subcategory ${s.code} exists under ${existingParent}, file puts it under ${c.code} (reparenting is not supported)`);
        }
        await client.query(
          `INSERT INTO taxonomy_subcategories
             (code, parent_code, label_internal, label_external, sort_order, active,
              categorizer_description, intake_enabled, intake_label, intake_sort_order, aliases)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (code) DO UPDATE SET label_internal = EXCLUDED.label_internal, label_external = EXCLUDED.label_external,
             sort_order = EXCLUDED.sort_order, active = EXCLUDED.active, categorizer_description = EXCLUDED.categorizer_description,
             intake_enabled = EXCLUDED.intake_enabled, intake_label = EXCLUDED.intake_label,
             intake_sort_order = EXCLUDED.intake_sort_order, aliases = EXCLUDED.aliases`,
          [
            s.code, c.code, s.labelInternal ?? s.label, s.labelExternal ?? s.label,
            s.sortOrder ?? 0, s.active ?? true, s.categorizerDescription ?? null,
            s.intakeEnabled ?? false, s.intakeLabel ?? null, s.intakeSortOrder ?? null,
            s.aliases ? JSON.stringify(s.aliases) : null
          ]
        );
        subCount++;
      }
    }

    let categoriesDeactivated: number[] = [];
    let subcategoriesDeactivated: number[] = [];
    if (deactivateMissing) {
      const catCodes = categories.map((c) => c.code);
      const subCodes = categories.flatMap((c) => c.subcategories.map((s) => s.code));
      const subs = await client.query(
        `UPDATE taxonomy_subcategories SET active = FALSE WHERE active AND NOT (code = ANY($1::int[])) RETURNING code`,
        [subCodes]
      );
      const cats = await client.query(
        `UPDATE taxonomy_categories SET active = FALSE WHERE active AND NOT (code = ANY($1::int[])) RETURNING code`,
        [catCodes]
      );
      subcategoriesDeactivated = (subs.rows ?? []).map((r: { code: number }) => Number(r.code));
      categoriesDeactivated = (cats.rows ?? []).map((r: { code: number }) => Number(r.code));
    }
    return { categoriesUpserted: categories.length, subcategoriesUpserted: subCount, categoriesDeactivated, subcategoriesDeactivated };
  });
}
