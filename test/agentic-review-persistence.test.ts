import Database from 'better-sqlite3';
import { ensureAgenticRunSchema } from '../backend/db';
import { processQueuedAgenticRuns } from '../backend/agentic-queue-worker';
import type { AgenticRun } from '../models';
import * as agenticTrigger from '../backend/actions/agentic-trigger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbModule = require('../backend/db');

describe('agentic review metadata persistence', () => {
  test('ensureAgenticRunSchema adds review columns and backfills decisions', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE agentic_runs (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        ItemUUID TEXT NOT NULL UNIQUE,
        SearchQuery TEXT,
        Status TEXT NOT NULL,
        LastModified TEXT NOT NULL DEFAULT (datetime('now')),
        ReviewState TEXT NOT NULL DEFAULT 'not_required',
        ReviewedBy TEXT,
        RetryCount INTEGER NOT NULL DEFAULT 0,
        NextRetryAt TEXT,
        LastError TEXT,
        LastAttemptAt TEXT
      );
    `);
    const insert = database.prepare(
      `INSERT INTO agentic_runs (ItemUUID, SearchQuery, Status, LastModified, ReviewState, ReviewedBy)
       VALUES (@ItemUUID, @SearchQuery, @Status, @LastModified, @ReviewState, @ReviewedBy)`
    );
    insert.run({
      ItemUUID: 'item-1',
      SearchQuery: 'Initial search',
      Status: 'completed',
      LastModified: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      ReviewState: 'approved',
      ReviewedBy: 'tester'
    });

    ensureAgenticRunSchema(database);

    const columns = database.prepare(`PRAGMA table_info(agentic_runs)`).all() as Array<{ name: string }>;
    const columnNames = columns.map((column) => column.name);
    expect(columnNames).toContain('LastReviewDecision');
    expect(columnNames).toContain('LastReviewNotes');

    const row = database
      .prepare(`SELECT LastReviewDecision, LastReviewNotes FROM agentic_runs WHERE ItemUUID = ?`)
      .get('item-1') as { LastReviewDecision: string | null; LastReviewNotes: string | null } | undefined;

    expect(row).toEqual({ LastReviewDecision: 'approved', LastReviewNotes: null });

    database.close();
  });

  test('queue worker forwards stored review metadata with trigger payload', async () => {
    const run: AgenticRun = {
      Id: 1,
      ItemUUID: 'item-review-1',
      SearchQuery: 'Search term',
      Status: 'queued',
      LastModified: new Date('2024-01-02T00:00:00.000Z').toISOString(),
      ReviewState: 'approved',
      ReviewedBy: 'jane.doe',
      LastReviewDecision: 'approved',
      LastReviewNotes: 'Looks good',
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };

    const fetchSpy = jest.spyOn(dbModule, 'fetchQueuedAgenticRuns').mockReturnValue([run]);
    const updateSpy = jest.spyOn(dbModule, 'updateQueuedAgenticRunQueueState').mockImplementation(() => undefined);

    const forwardSpy = jest
      .spyOn(agenticTrigger, 'forwardAgenticTrigger')
      .mockResolvedValue({ ok: true, status: 202, body: null, rawBody: null });

    try {
      await processQueuedAgenticRuns({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        now: () => new Date('2024-01-02T01:00:00.000Z'),
        service: {} as any
      });

      expect(forwardSpy).toHaveBeenCalledTimes(1);
      const [payload] = forwardSpy.mock.calls[0];
      expect(payload).toMatchObject({
        itemId: 'item-review-1',
        artikelbeschreibung: 'Search term',
        review: {
          decision: 'approved',
          notes: 'Looks good',
          reviewedBy: 'jane.doe'
        }
      });
    } finally {
      fetchSpy.mockRestore();
      updateSpy.mockRestore();
      forwardSpy.mockRestore();
    }
  });
});
