import Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'http';
import agenticHealthAction from '../backend/actions/agentic-health';
import { checkAgenticHealth } from '../backend/agentic';
import { ensureAgenticRunSchema } from '../backend/db';
import { AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_RUNNING } from '../models';

function createMockResponse() {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: (status: number, responseHeaders: Record<string, string>) => {
      statusCode = status;
      headers = { ...responseHeaders };
      return res;
    },
    end: (chunk?: any) => {
      if (chunk !== undefined && chunk !== null) {
        body = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
      }
      return res;
    }
  } as unknown as ServerResponse;

  return {
    res,
    getStatus: () => statusCode,
    getHeaders: () => headers,
    getBody: () => body
  };
}

function createAgenticContext(database: Database.Database) {
  const noopStatement = database.prepare('SELECT 1');
  return {
    db: database,
    getAgenticRun: database.prepare('SELECT * FROM agentic_runs WHERE ItemUUID = ?'),
    getItemReference: noopStatement,
    upsertAgenticRun: noopStatement,
    updateAgenticRunStatus: noopStatement,
    logEvent: jest.fn(),
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  };
}

describe('agentic health action', () => {
  test('responds with aggregated queue metrics from the in-process orchestrator', async () => {
    const database = new Database(':memory:');
    ensureAgenticRunSchema(database);

    const insert = database.prepare(`
      INSERT INTO agentic_runs (
        ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy, RetryCount, NextRetryAt, LastError, LastAttemptAt
      ) VALUES (
        @ItemUUID, @SearchQuery, @Status, @LastModified, 'not_required', NULL, @RetryCount, NULL, NULL, NULL
      )
    `);

    insert.run({
      ItemUUID: 'queued-1',
      SearchQuery: 'Lokale Suche',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: '2024-01-01T00:00:00.000Z',
      RetryCount: 0
    });
    insert.run({
      ItemUUID: 'queued-2',
      SearchQuery: 'Weitere Suche',
      Status: AGENTIC_RUN_STATUS_QUEUED,
      LastModified: '2024-01-02T00:00:00.000Z',
      RetryCount: 1
    });
    insert.run({
      ItemUUID: 'running-1',
      SearchQuery: 'Aktive Suche',
      Status: AGENTIC_RUN_STATUS_RUNNING,
      LastModified: '2024-01-03T12:34:56.000Z',
      RetryCount: 0
    });

    const ctx = createAgenticContext(database);
    const { res, getStatus, getBody } = createMockResponse();

    try {
      await agenticHealthAction.handle?.({} as IncomingMessage, res, ctx);

      expect(getStatus()).toBe(200);
      const payload = JSON.parse(getBody());
      expect(payload).toEqual({
        ok: true,
        details: {
          ok: true,
          queuedRuns: 2,
          runningRuns: 1,
          lastUpdatedAt: '2024-01-03T12:34:56.000Z'
        }
      });
    } finally {
      database.close();
    }
  });
});

describe('checkAgenticHealth', () => {
  test('returns failure payload and logs when the database query throws', () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const failingDeps = {
      db: {
        prepare: () => {
          throw new Error('prepare failed');
        }
      } as unknown as Database.Database,
      getAgenticRun: { get: jest.fn() },
      getItemReference: { get: jest.fn() },
      upsertAgenticRun: { run: jest.fn() },
      updateAgenticRunStatus: { run: jest.fn() },
      logEvent: jest.fn(),
      logger
    };

    const result = checkAgenticHealth(failingDeps as any);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('prepare failed');
    expect(logger.error).toHaveBeenCalledWith(
      '[agentic-service] Failed to compute agentic health',
      expect.objectContaining({ error: 'prepare failed' })
    );
  });
});
