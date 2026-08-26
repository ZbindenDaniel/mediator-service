"use strict";
import { Pool } from "pg";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[normalize] DATABASE_URL is required");
  process.exit(1);
}
const pg = new Pool({ connectionString: DATABASE_URL });
const CATEGORY_COLUMNS = [
  "Hauptkategorien_A",
  "Unterkategorien_A",
  "Hauptkategorien_B",
  "Unterkategorien_B"
];
async function main() {
  let total = 0;
  for (const col of CATEGORY_COLUMNS) {
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
  console.log(`
[normalize] Done. ${total} value(s) normalized.`);
  await pg.end();
}
main().catch((err) => {
  console.error("[normalize] Fatal:", err);
  process.exit(1);
});
