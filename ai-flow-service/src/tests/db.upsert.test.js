import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sqlite3 from 'sqlite3';
import { promisify } from 'node:util';

function createSqliteClient(dbPath) {
  const database = new sqlite3.Database(dbPath);
  const get = promisify(database.get.bind(database));
  const run = promisify(database.run.bind(database));
  const close = promisify(database.close.bind(database));

  return { get, run, close };
}

export async function runDbUpsertTests() {
  const dbPath = path.resolve(`./request-log-test-${randomUUID()}.db`);
  await fs.rm(dbPath, { force: true });

  process.env.DB_PATH = dbPath;

  const dbModule = await import('../utils/db.js');
  const { logRequestStart, logRequestEnd, saveRequestPayload, markNotificationFailure } = dbModule;

  const { get, run, close } = createSqliteClient(dbPath);

  try {
    const uuid = randomUUID();

    await logRequestStart(uuid, 'initial search');

    const initialRow = await get('SELECT * FROM request_logs WHERE uuid = ?', [uuid]);
    assert(initialRow, 'log entry should be created for the initial request');
    assert.equal(initialRow.status, 'RUNNING');

    await logRequestEnd(uuid, 'SUCCESS', 'example error message');
    await saveRequestPayload(uuid, { foo: 'bar' });
    await markNotificationFailure(uuid, 'notification failed');
    await run('UPDATE request_logs SET notified_at = CURRENT_TIMESTAMP WHERE uuid = ?', [uuid]);

    const completedRow = await get('SELECT * FROM request_logs WHERE uuid = ?', [uuid]);
    assert.equal(completedRow.status, 'SUCCESS');
    assert.equal(completedRow.error, 'example error message');
    assert.ok(completedRow.notified_at, 'notified_at should be populated before reset');
    assert.equal(completedRow.last_notification_error, 'notification failed');
    assert.ok(completedRow.payload_json, 'payload_json should be populated before reset');

    const { created_at: firstCreatedAt, updated_at: firstUpdatedAt } = completedRow;

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await logRequestStart(uuid, 'second search');

    const resetRow = await get('SELECT * FROM request_logs WHERE uuid = ?', [uuid]);
    assert.equal(resetRow.status, 'RUNNING');
    assert.equal(resetRow.search, 'second search');
    assert.equal(resetRow.error, null);
    assert.equal(resetRow.notified_at, null);
    assert.equal(resetRow.last_notification_error, null);
    assert.equal(resetRow.payload_json, null);

    assert.notEqual(resetRow.updated_at, firstUpdatedAt, 'updated_at should change after restart');
    assert.notEqual(resetRow.created_at, firstCreatedAt, 'created_at should change after restart');
  } finally {
    await close();
    await fs.rm(dbPath, { force: true });
  }
}
