#!/usr/bin/env node
/*
 * Migration verification script for agentic_runs schema.
 * Copies the provided SQLite database, migrates the copy, and checks for data integrity.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function usage() {
  console.error('Usage: node scripts/verify-agentic-migration.js <path-to-sqlite-db>');
}

function formatList(values) {
  return values.length ? values.join(', ') : '(none)';
}

(async () => {
  try {
    const [, , sourcePath] = process.argv;
    if (!sourcePath) {
      usage();
      process.exit(1);
    }

    const absoluteSource = path.resolve(sourcePath);
    if (!fs.existsSync(absoluteSource)) {
      console.error('Source database not found:', absoluteSource);
      process.exit(1);
    }

    const dir = path.dirname(absoluteSource);
    const base = path.basename(absoluteSource, path.extname(absoluteSource));
    const ext = path.extname(absoluteSource) || '.sqlite';
    const copyPath = path.join(dir, `${base}.agentic-migration-test${ext}`);

    fs.copyFileSync(absoluteSource, copyPath);
    console.log('Created migration test copy at', copyPath);

    const preDb = new Database(copyPath);
    const preInfo = preDb.prepare('PRAGMA table_info(agentic_runs)').all();
    const preColumns = preInfo.map((c) => c.name);
    const preCountRow = preDb.prepare('SELECT COUNT(*) AS c FROM agentic_runs').get();
    const preCount = preCountRow ? preCountRow.c : 0;
    preDb.close();

    process.env.DB_PATH = copyPath;
    const backendDbModule = require('../backend/db');
    const { ensureAgenticRunSchema, db: runtimeDb } = backendDbModule;

    const migratedDb = new Database(copyPath);
    ensureAgenticRunSchema(migratedDb);
    const postInfo = migratedDb.prepare('PRAGMA table_info(agentic_runs)').all();
    const postColumns = postInfo.map((c) => c.name);
    const postCountRow = migratedDb.prepare('SELECT COUNT(*) AS c FROM agentic_runs').get();
    const postCount = postCountRow ? postCountRow.c : 0;
    const sampleRows = migratedDb
      .prepare(
        'SELECT ItemUUID, Status, LastModified, ReviewState, ReviewedBy FROM agentic_runs ORDER BY ItemUUID LIMIT 5'
      )
      .all();
    migratedDb.close();

    const removedColumns = preColumns.filter((col) => !postColumns.includes(col));
    const newColumns = postColumns.filter((col) => !preColumns.includes(col));

    console.log('--- Migration Verification Report ---');
    console.log('Row count before migration:', preCount);
    console.log('Row count after migration:', postCount);
    console.log('Legacy columns removed:', formatList(removedColumns));
    console.log('New columns present:', formatList(newColumns));
    console.log('Sample migrated rows:', sampleRows);

    if (preCount !== postCount) {
      console.error('Row count mismatch detected between pre- and post-migration data.');
      process.exit(2);
    }

    const requiredColumns = ['LastModified', 'ReviewState'];
    const missingColumns = requiredColumns.filter((col) => !postColumns.includes(col));
    if (missingColumns.length) {
      console.error('Required columns missing after migration:', formatList(missingColumns));
      process.exit(3);
    }

    if (runtimeDb && typeof runtimeDb.close === 'function') {
      try {
        runtimeDb.close();
      } catch (closeErr) {
        console.warn('Failed to close runtime database handle', closeErr);
      }
    }

    console.log('Migration verification completed successfully.');
  } catch (err) {
    console.error('Migration verification failed:', err);
    process.exit(1);
  }
})();
