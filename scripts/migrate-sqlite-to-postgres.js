"use strict";
/**
 * One-time data migration: SQLite → PostgreSQL
 *
 * Usage:
 *   1. Set DATABASE_URL and DB_PATH (path to existing SQLite file) in your environment
 *   2. Run: npx ts-node scripts/migrate-sqlite-to-postgres.ts
 *   3. Verify row counts printed at the end match your SQLite totals
 *   4. Keep the SQLite file as a backup for 1–2 weeks
 *
 * Safe to run multiple times only if Postgres tables are empty first.
 * Sequences are reset after bulk insert so SERIAL columns continue correctly.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const pg_1 = require("pg");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
const sqlite = new better_sqlite3_1.default(resolvedDbPath, { readonly: true });
const pg = new pg_1.Pool({ connectionString: DATABASE_URL });
// Tables with a SERIAL primary key — sequences must be reset after insert
const SERIAL_TABLES = {
    label_queue: 'label_queue_id_seq',
    agentic_runs: 'agentic_runs_runid_seq',
    events: 'events_id_seq',
    quality_assessments: 'quality_assessments_id_seq',
    shopware_sync_queue: 'shopware_sync_queue_id_seq',
};
async function migrateTable(tableName, pgTable) {
    const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
    if (rows.length === 0) {
        console.log(`[migrate] ${tableName}: 0 rows (skipped)`);
        return 0;
    }
    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO "${pgTable}" (${colList}) VALUES (${placeholders})`;
    const client = await pg.connect();
    try {
        await client.query('BEGIN');
        for (const row of rows) {
            const values = cols.map(c => row[c] ?? null);
            await client.query(sql, values);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    console.log(`[migrate] ${tableName}: ${rows.length} rows inserted`);
    return rows.length;
}
async function resetSequence(seqName, tableName, idCol) {
    await pg.query(`SELECT setval('${seqName}', COALESCE((SELECT MAX("${idCol}") FROM "${tableName}"), 0) + 1, false)`);
}
async function main() {
    // Ordered to respect foreign key dependencies
    const tables = [
        'items',
        'item_references',
        'item_instances',
        'boxes',
        'locations',
        'label_queue',
        'events',
        'agentic_runs',
        'agentic_request_log',
        'quality_assessments',
        'shopware_sync_queue',
        'box_stubs',
        'erp_sync_state',
        'erp_sync_log',
    ];
    const counts = {};
    for (const table of tables) {
        // Some tables may not exist in older SQLite files — skip gracefully
        const exists = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        if (!exists) {
            console.log(`[migrate] ${table}: table not found in SQLite (skipped)`);
            continue;
        }
        try {
            counts[table] = await migrateTable(table, table);
        }
        catch (err) {
            console.error(`[migrate] ${table}: FAILED —`, err);
            process.exit(1);
        }
    }
    // Reset SERIAL sequences so new inserts don't collide
    const seqResets = [
        ['label_queue_id_seq', 'label_queue', 'Id'],
        ['agentic_runs_runid_seq', 'agentic_runs', 'RunId'],
        ['events_id_seq', 'events', 'Id'],
        ['quality_assessments_id_seq', 'quality_assessments', 'Id'],
        ['shopware_sync_queue_id_seq', 'shopware_sync_queue', 'Id'],
    ];
    for (const [seq, table, col] of seqResets) {
        try {
            await resetSequence(seq, table, col);
            console.log(`[migrate] reset sequence ${seq}`);
        }
        catch {
            // Sequence may have a different name depending on DDL; log and continue
            console.warn(`[migrate] could not reset ${seq} (may not exist yet)`);
        }
    }
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
