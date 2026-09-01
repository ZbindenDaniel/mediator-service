// Dev utility: produce config/taxonomy.seed.json from the current hardcoded
// taxonomy so the runtime/DB-backed source starts as a faithful snapshot.
// Run: npx ts-node --transpile-only scripts/generate-taxonomy-seed.ts
// One-off / regeneratable; the seed file is the shipped default (see
// docs/PLANNING_TAXONOMY_EXTERNALIZATION.md §3).
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { itemCategories, canonicalizeCategoryLabel } from '../models/item-categories';

// Mirror of the current INTAKE_CATEGORIES (backend/actions/intake-categories.ts),
// which is a non-exported const — captured here (in its original order) so the
// seed carries the same intake subset via intakeEnabled/intakeLabel/intakeSortOrder.
const INTAKE_ORDER: Array<{ code: number; label: string }> = [
  { code: 201, label: 'Laptop' },
  { code: 102, label: 'Desktop-PC' },
  { code: 103, label: 'Server' },
  { code: 109, label: 'All-in-One' },
  { code: 204, label: 'Tablet' }
];
const INTAKE_BY_SUBCODE: Record<number, { label: string; order: number }> = Object.fromEntries(
  INTAKE_ORDER.map((e, i) => [e.code, { label: e.label, order: i }])
);

const seed = {
  // Version lets the loader/migration reason about seed shape over time.
  version: 1,
  categories: itemCategories.map((cat, ci) => ({
    code: cat.code,
    labelExternal: cat.label,
    labelInternal: canonicalizeCategoryLabel(cat.label),
    sortOrder: ci,
    active: true,
    subcategories: cat.subcategories.map((sub, si) => {
      const entry: Record<string, unknown> = {
        code: sub.code,
        labelExternal: sub.label,
        labelInternal: canonicalizeCategoryLabel(sub.label),
        parentCode: cat.code,
        sortOrder: si,
        active: true
      };
      const intake = INTAKE_BY_SUBCODE[sub.code];
      if (intake) {
        entry.intakeEnabled = true;
        entry.intakeLabel = intake.label;
        entry.intakeSortOrder = intake.order;
      }
      return entry;
    })
  }))
};

const outPath = resolve(__dirname, '..', 'config', 'taxonomy.seed.json');
writeFileSync(outPath, JSON.stringify(seed, null, 2) + '\n', 'utf8');

const catCount = seed.categories.length;
const subCount = seed.categories.reduce((n, c) => n + c.subcategories.length, 0);
const intakeCount = seed.categories.reduce(
  (n, c) => n + c.subcategories.filter((s: any) => s.intakeEnabled).length,
  0
);
console.log(`[taxonomy-seed] wrote ${outPath}`);
console.log(`[taxonomy-seed] ${catCount} categories, ${subCount} subcategories, ${intakeCount} intake-enabled`);
