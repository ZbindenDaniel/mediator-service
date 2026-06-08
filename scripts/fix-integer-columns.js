"use strict";
import { Pool } from "pg";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[fix] DATABASE_URL is required");
  process.exit(1);
}
const pg = new Pool({ connectionString: DATABASE_URL });
const INTEGER_COLUMNS = [
  ["item_refs", "L\xE4nge_mm"],
  ["item_refs", "Breite_mm"],
  ["item_refs", "H\xF6he_mm"],
  ["item_refs", "Quality"],
  ["item_refs", "Shopartikel"],
  ["items", "Auf_Lager"],
  ["items", "Quality"],
  ["items", "QualityId"],
  ["box_stubs", "NumberLooseItems"],
  ["box_stubs", "NumberLooseBoxes"],
  ["box_stubs", "IsActive"],
  ["shopware_sync_queue", "RetryCount"],
  ["quality_assessments", "value"],
  ["quality_assessments", "is_complete"],
  ["quality_assessments", "has_defects"],
  ["quality_assessments", "is_functional"]
];
async function main() {
  let fixed = 0;
  let skipped = 0;
  for (const [table, col] of INTEGER_COLUMNS) {
    const exists = await pg.query(
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
        `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE INTEGER USING ROUND(NULLIF(TRIM("${col}"::TEXT), '')::NUMERIC)::INTEGER`
      );
      console.log(`[fix] ${table}."${col}" \u2192 INTEGER \u2713`);
      fixed++;
    } catch (err) {
      console.warn(`[fix] ${table}."${col}": ${err.message}`);
      skipped++;
    }
  }
  console.log(`
[fix] Done. ${fixed} columns fixed, ${skipped} skipped.`);
  await pg.end();
}
main().catch((err) => {
  console.error("[fix] Fatal:", err);
  process.exit(1);
});
