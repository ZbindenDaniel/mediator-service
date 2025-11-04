import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { logger } from './logger.js';

const db = new sqlite3.Database(process.env.DB_PATH || './data.db', (err) => {
  if (err) {
    logger.error({ err }, 'failed to open db');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS request_logs (
    uuid TEXT PRIMARY KEY,
    search TEXT,
    status TEXT,
    error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notified_at TEXT,
    last_notification_error TEXT,
    payload_json TEXT
  )`);

  const migrations = [
    'ALTER TABLE request_logs ADD COLUMN notified_at TEXT',
    'ALTER TABLE request_logs ADD COLUMN last_notification_error TEXT',
    'ALTER TABLE request_logs ADD COLUMN payload_json TEXT',
  ];

  for (const sql of migrations) {
    db.run(sql, (err) => {
      if (err && !/duplicate column/i.test(err.message)) {
        logger.error({ err, sql }, 'failed to migrate request_logs table');
      }
    });
  }
});

const run = promisify(db.run.bind(db));
const all = promisify(db.all.bind(db));

export async function logRequestStart(uuid, search) {
  try {
    await run('INSERT INTO request_logs (uuid, search, status) VALUES (?, ?, ?)', [uuid, search, 'RUNNING']);
  } catch (err) {
    logger.error({ err, uuid }, 'log start failed');
  }
}

export async function logRequestEnd(uuid, status, error = null) {
  try {
    await run('UPDATE request_logs SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?', [status, error, uuid]);
  } catch (err) {
    logger.error({ err, uuid }, 'log end failed');
  }
}

export async function saveRequestPayload(uuid, payload) {
  try {
    const payloadJson = JSON.stringify(payload ?? null);
    await run(
      'UPDATE request_logs SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
      [payloadJson, uuid],
    );
  } catch (err) {
    logger.error({ err, uuid }, 'failed to persist payload');
  }
}

export async function markNotificationSuccess(uuid) {
  try {
    await run(
      'UPDATE request_logs SET notified_at = CURRENT_TIMESTAMP, last_notification_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
      [uuid],
    );
  } catch (err) {
    logger.error({ err, uuid }, 'failed to mark notification success');
  }
}

export async function markNotificationFailure(uuid, errorMessage) {
  try {
    await run(
      'UPDATE request_logs SET last_notification_error = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
      [errorMessage, uuid],
    );
  } catch (err) {
    logger.error({ err, uuid }, 'failed to mark notification failure');
  }
}

export async function getPendingNotifications(limit = 10) {
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;

  try {
    const rows = await all(
      `SELECT uuid, payload_json
         FROM request_logs
        WHERE status = 'SUCCESS'
          AND notified_at IS NULL
          AND payload_json IS NOT NULL
        ORDER BY updated_at ASC
        LIMIT ?`,
      [resolvedLimit],
    );

    return rows
      .map((row) => {
        try {
          return { uuid: row.uuid, payload: JSON.parse(row.payload_json) };
        } catch (err) {
          logger.error({ err, uuid: row.uuid }, 'failed to parse stored payload_json');
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    logger.error({ err, limit: resolvedLimit }, 'failed to fetch pending notifications');
    return [];
  }
}
