/**
 * One-time repair: fix INTEGER columns that were stored as TEXT or NUMERIC
 * in older PostgreSQL schemas, causing "invalid input syntax for type integer"
 * errors at runtime.
 *
 * Usage (run from the project root):
 *   DATABASE_URL=postgres://mediator:mediator@localhost:5432/mediator \
 *   node scripts/fix-integer-columns.js
 *
 * Safe to run on a live database — each ALTER is independent and idempotent.
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[fix] DATABASE_URL is required');
  process.exit(1);
}

const pg = new Pool({ connectionString: DATABASE_URL });

// All schema-defined INTEGER columns. If a column is already INTEGER the
// ALTER is effectively a no-op; if it is TEXT or NUMERIC the USING expression
// rounds the value and re-types the column.
const INTEGER_COLUMNS: Array<[table: string, column: string]> = [
  ['item_refs', 'Länge_mm'],
  ['item_refs', 'Breite_mm'],
  ['item_refs', 'Höhe_mm'],
  ['item_refs', 'Quality'],
  ['item_refs', 'Shopartikel'],
  ['items', 'Auf_Lager'],
  ['items', 'Quality'],
  ['items', 'QualityId'],
  ['box_stubs', 'NumberLooseItems'],
  ['box_stubs', 'NumberLooseBoxes'],
  ['box_stubs', 'IsActive'],
  ['shopware_sync_queue', 'RetryCount'],
  ['quality_assessments', 'value'],
  ['quality_assessments', 'is_complete'],
  ['quality_assessments', 'has_defects'],
  ['quality_assessments', 'is_functional'],
];

async function main(): Promise<void> {
  let fixed = 0;
  let skipped = 0;

  for (const [table, col] of INTEGER_COLUMNS) {
    const exists = await pg.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
      [table]
    );
    if (!exists.rows[0].exists) {
      console.log(`[fix] ${table}: table not found (skipped)`);
      skipped++;
      continue;
    }

    try {
      await pg.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE INTEGER ` +
        `USING ROUND(NULLIF(TRIM("${col}"::TEXT), '')::NUMERIC)::INTEGER`
      );
      console.log(`[fix] ${table}."${col}" → INTEGER ✓`);
      fixed++;
    } catch (err: any) {
      console.warn(`[fix] ${table}."${col}": ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n[fix] Done. ${fixed} columns fixed, ${skipped} skipped.`);
  await pg.end();
}

main().catch(err => {
  console.error('[fix] Fatal:', err);
  process.exit(1);
});
