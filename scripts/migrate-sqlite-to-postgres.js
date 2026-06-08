"use strict";
import Database from "better-sqlite3";
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
const DB_PATH = process.env.DB_PATH ?? "./data/mediator.sqlite";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is required");
  console.error("[migrate] Set it to your PostgreSQL connection string, e.g.:");
  console.error("[migrate]   export DATABASE_URL=postgres://mediator:mediator@localhost:5432/mediator");
  process.exit(1);
}
const resolvedDbPath = path.resolve(DB_PATH);
if (!fs.existsSync(resolvedDbPath)) {
  console.error(`[migrate] SQLite file not found: ${resolvedDbPath}`);
  console.error("[migrate] Set DB_PATH to the path of your existing SQLite database, e.g.:");
  console.error("[migrate]   export DB_PATH=/path/to/mediator.sqlite");
  process.exit(1);
}
const sqlite = new Database(resolvedDbPath, { readonly: true });
const pg = new Pool({ connectionString: DATABASE_URL });
const SERIAL_TABLES = {
  label_queue: "label_queue_id_seq",
  agentic_runs: "agentic_runs_runid_seq",
  events: "events_id_seq",
  quality_assessments: "quality_assessments_id_seq",
  shopware_sync_queue: "shopware_sync_queue_id_seq"
};
async function getIntegerColumns(pgTable) {
  const res = await pg.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND data_type IN ('integer', 'bigint', 'smallint')`,
    [pgTable]
  );
  return new Set(res.rows.map((r) => r.column_name));
}
async function migrateTable(tableName, pgTable) {
  const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
  if (rows.length === 0) {
    console.log(`[migrate] ${tableName}: 0 rows (skipped)`);
    return 0;
  }
  const intCols = await getIntegerColumns(pgTable);
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO "${pgTable}" (${colList}) VALUES (${placeholders})`;
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const values = cols.map((c) => {
        const v = row[c] ?? null;
        if (v !== null && intCols.has(c)) return Math.round(Number(v));
        return v;
      });
      await client.query(sql, values);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  console.log(`[migrate] ${tableName}: ${rows.length} rows inserted`);
  return rows.length;
}
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
async function fixColumnTypes() {
  for (const [table, col] of INTEGER_COLUMNS) {
    const exists = await pg.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
      [table]
    );
    if (!exists.rows[0].exists) continue;
    try {
      await pg.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE INTEGER USING ROUND(NULLIF(TRIM("${col}"::TEXT), '')::NUMERIC)::INTEGER`
      );
      console.log(`[migrate] fixed column type: ${table}."${col}" \u2192 INTEGER`);
    } catch (err) {
      console.warn(`[migrate] could not fix ${table}."${col}": ${err.message}`);
    }
  }
}
async function resetSequence(seqName, tableName, idCol) {
  await pg.query(
    `SELECT setval('${seqName}', COALESCE((SELECT MAX("${idCol}") FROM "${tableName}"), 0) + 1, false)`
  );
}
async function main() {
  const tables = [
    "item_refs",
    "boxes",
    "locations",
    "items",
    "item_instances",
    "label_queue",
    "events",
    "agentic_runs",
    "agentic_request_logs",
    "quality_assessments",
    "shopware_sync_queue",
    "box_stubs",
    "erp_sync_state",
    "erp_sync_log"
  ];
  const counts = {};
  for (const table of tables) {
    const exists = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table);
    if (!exists) {
      console.log(`[migrate] ${table}: table not found in SQLite (skipped)`);
      continue;
    }
    try {
      counts[table] = await migrateTable(table, table);
    } catch (err) {
      console.error(`[migrate] ${table}: FAILED \u2014`, err);
      process.exit(1);
    }
  }
  const seqResets = [
    ["label_queue_id_seq", "label_queue", "Id"],
    ["agentic_runs_runid_seq", "agentic_runs", "RunId"],
    ["events_id_seq", "events", "Id"],
    ["quality_assessments_id_seq", "quality_assessments", "Id"],
    ["shopware_sync_queue_id_seq", "shopware_sync_queue", "Id"]
  ];
  for (const [seq, table, col] of seqResets) {
    try {
      await resetSequence(seq, table, col);
      console.log(`[migrate] reset sequence ${seq}`);
    } catch {
      console.warn(`[migrate] could not reset ${seq} (may not exist yet)`);
    }
  }
  await fixColumnTypes();
  console.log("\n[migrate] Row counts:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(30)} ${count}`);
  }
  await pg.end();
  sqlite.close();
  console.log("\n[migrate] Done.");
}
main().catch((err) => {
  console.error("[migrate] Fatal:", err);
  process.exit(1);
});
