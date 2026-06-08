/**
 * One-time data migration: SQLite → PostgreSQL
 *
 * Usage (run from the project root on the host, with Postgres port 5432 exposed):
 *   DB_PATH=/path/to/mediator.sqlite \
 *   DATABASE_URL=postgres://mediator:mediator@localhost:5432/mediator \
 *   node scripts/migrate-sqlite-to-postgres.js
 *
 *   Verify row counts printed at the end match your SQLite totals.
 *   Keep the SQLite file as a backup for 1–2 weeks.
 *
 * Safe to run multiple times only if Postgres tables are empty first.
 * Sequences are reset after bulk insert so SERIAL columns continue correctly.
 */

import Database from 'better-sqlite3';
import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = process.env.DB_PATH ?? './data/mediator.sqlite';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is required');
  console.error('[migrate] Set it to your PostgreSQL connection string, e.g.:');
  console.error('[migrate]   export DATABASE_URL=postgres://mediator:mediator@localhost:5432/mediator');
  process.exit(1);
}

const resolvedDbPath = path.resolve(DB_PATH);
if (!fs.existsSync(resolvedDbPath)) {
  console.error(`[migrate] SQLite file not found: ${resolvedDbPath}`);
  console.error('[migrate] Set DB_PATH to the path of your existing SQLite database, e.g.:');
  console.error('[migrate]   export DB_PATH=/path/to/mediator.sqlite');
  process.exit(1);
}

const sqlite = new Database(resolvedDbPath, { readonly: true });
const pg = new Pool({ connectionString: DATABASE_URL });

// Tables with a SERIAL primary key — sequences must be reset after insert
const SERIAL_TABLES: Record<string, string> = {
  label_queue: 'label_queue_id_seq',
  agentic_runs: 'agentic_runs_runid_seq',
  events: 'events_id_seq',
  quality_assessments: 'quality_assessments_id_seq',
  shopware_sync_queue: 'shopware_sync_queue_id_seq',
};

// Returns a set of column names typed as integer/bigint in the given PG table.
async function getIntegerColumns(pgTable: string): Promise<Set<string>> {
  const res = await pg.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND data_type IN ('integer', 'bigint', 'smallint')`,
    [pgTable]
  );
  return new Set(res.rows.map(r => r.column_name));
}

async function migrateTable(tableName: string, pgTable: string): Promise<number> {
  const rows: Record<string, unknown>[] = sqlite.prepare(`SELECT * FROM "${tableName}"`).all() as any[];
  if (rows.length === 0) {
    console.log(`[migrate] ${tableName}: 0 rows (skipped)`);
    return 0;
  }

  // SQLite stores numeric values loosely; coerce to integer where PG requires it
  // (e.g. dimension fields like Länge_mm may hold "362.2" in older data)
  const intCols = await getIntegerColumns(pgTable);

  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO "${pgTable}" (${colList}) VALUES (${placeholders})`;

  const client = await pg.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const values = cols.map(c => {
        const v = row[c] ?? null;
        if (v !== null && intCols.has(c)) return Math.round(Number(v));
        return v;
      });
      await client.query(sql, values);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`[migrate] ${tableName}: ${rows.length} rows inserted`);
  return rows.length;
}

// Explicit INTEGER columns from the current schema. After inserting raw SQLite
// data the actual PG column type may be TEXT or NUMERIC (from an older schema),
// so we force each column to INTEGER regardless, rounding any float values.
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

async function fixColumnTypes(): Promise<void> {
  for (const [table, col] of INTEGER_COLUMNS) {
    // Check table exists before attempting ALTER
    const exists = await pg.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
      [table]
    );
    if (!exists.rows[0].exists) continue;

    try {
      // USING clause handles TEXT "100.0", NUMERIC 100.0, or already-integer values safely
      await pg.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE INTEGER ` +
        `USING ROUND(NULLIF(TRIM("${col}"::TEXT), '')::NUMERIC)::INTEGER`
      );
      console.log(`[migrate] fixed column type: ${table}."${col}" → INTEGER`);
    } catch (err: any) {
      console.warn(`[migrate] could not fix ${table}."${col}": ${err.message}`);
    }
  }
}

async function resetSequence(tableName: string, idCol: string): Promise<void> {
  // pg_get_serial_sequence resolves the correct sequence name regardless of column case
  await pg.query(
    `SELECT setval(
       pg_get_serial_sequence('"${tableName}"', '${idCol}'),
       COALESCE((SELECT MAX("${idCol}") FROM "${tableName}"), 0) + 1,
       false
     )`
  );
}

async function main(): Promise<void> {
  // Ordered to respect foreign key dependencies:
  //   item_refs, boxes  → must precede items (FK on both) and box_stubs (FK on boxes)
  //   item_refs         → must also precede agentic_runs
  const tables = [
    'item_refs',
    'boxes',
    'locations',
    'items',
    'item_instances',
    'label_queue',
    'events',
    'agentic_runs',
    'agentic_request_logs',
    'quality_assessments',
    'shopware_sync_queue',
    'box_stubs',
    'erp_sync_state',
    'erp_sync_log',
  ];

  const counts: Record<string, number> = {};

  for (const table of tables) {
    // Some tables may not exist in older SQLite files — skip gracefully
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
      console.error(`[migrate] ${table}: FAILED —`, err);
      process.exit(1);
    }
  }

  // Reset SERIAL sequences so new inserts don't collide with migrated IDs.
  // Uses pg_get_serial_sequence to resolve the correct name regardless of column case.
  const seqResets: Array<[table: string, col: string]> = [
    ['label_queue', 'Id'],
    ['agentic_runs', 'RunId'],
    ['events', 'Id'],
    ['quality_assessments', 'id'],
    ['shopware_sync_queue', 'Id'],
  ];

  for (const [table, col] of seqResets) {
    await resetSequence(table, col);
    console.log(`[migrate] reset sequence for ${table}."${col}"`);
  }

  // Force all schema-defined INTEGER columns to the correct PG type.
  // Guards against older DB schemas where these columns may be TEXT or NUMERIC.
  await fixColumnTypes();

  console.log('\n[migrate] Row counts:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(30)} ${count}`);
  }

  await pg.end();
  sqlite.close();
  console.log('\n[migrate] Done.');
}

main().catch(err => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});
