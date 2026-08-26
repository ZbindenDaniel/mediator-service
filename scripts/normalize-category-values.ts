/**
 * One-time repair: normalize the category TEXT columns on item_refs whose
 * values were stored as float-formatted strings (e.g. "201.0" instead of
 * "201"). PostgreSQL's integer parser rejects a decimal point, so a direct
 * CAST("Unterkategorien_A" AS INTEGER) on such a value throws
 * "invalid input syntax for type integer: 201.0" at runtime.
 *
 * These columns are TEXT by design (they round-trip through the ERP/CSV
 * import unchanged), so we do NOT re-type them — we canonicalize the string
 * contents in place to the rounded integer form.
 *
 * Usage (run from the project root):
 *   DATABASE_URL=postgres://mediator:mediator@localhost:5432/mediator \
 *   node scripts/normalize-category-values.js
 *
 * Safe to run on a live database — the update only touches rows whose value
 * is a numeric string that differs from its canonical integer form; NULL,
 * empty, and non-numeric values are left untouched, and re-running is a no-op.
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[normalize] DATABASE_URL is required');
  process.exit(1);
}

const pg = new Pool({ connectionString: DATABASE_URL });

const CATEGORY_COLUMNS = [
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B',
];

async function main(): Promise<void> {
  let total = 0;

  for (const col of CATEGORY_COLUMNS) {
    // Only rewrite genuinely numeric strings that aren't already canonical, so
    // non-numeric junk never reaches the NUMERIC cast and clean rows are skipped.
    const res = await pg.query(
      `UPDATE item_refs
         SET "${col}" = ROUND(NULLIF(TRIM("${col}"), '')::NUMERIC)::TEXT
       WHERE "${col}" IS NOT NULL
         AND TRIM("${col}") <> ''
         AND TRIM("${col}") ~ '^-?[0-9]+(\\.[0-9]+)?$'
         AND "${col}" <> ROUND(NULLIF(TRIM("${col}"), '')::NUMERIC)::TEXT`
    );
    console.log(`[normalize] item_refs."${col}": ${res.rowCount ?? 0} row(s) normalized`);
    total += res.rowCount ?? 0;
  }

  console.log(`\n[normalize] Done. ${total} value(s) normalized.`);
  await pg.end();
}

main().catch((err) => {
  console.error('[normalize] Fatal:', err);
  process.exit(1);
});
