import Database from 'better-sqlite3';
import { ensureAgenticRunSchema } from '../backend/db';
import { startAgenticRun } from '../backend/agentic';
import type { AgenticRun } from '../models';

// TODO(agent): Keep requestId coverage aligned with review persistence regressions.

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

  test('direct dispatch forwards stored review metadata to the model invoker', async () => {
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

    const getAgenticRun = { get: jest.fn().mockReturnValue(run) };
    const upsertAgenticRun = { run: jest.fn() };
    const updateAgenticRunStatus = { run: jest.fn() };
    const logEvent = jest.fn();
    const invokeModel = jest.fn().mockResolvedValue({ ok: true, message: null });

    const deps = {
      db: { transaction: (fn: unknown) => fn } as unknown as Database.Database,
      getAgenticRun: getAgenticRun as unknown as Database.Statement,
      upsertAgenticRun: upsertAgenticRun as unknown as Database.Statement,
      updateAgenticRunStatus: updateAgenticRunStatus as unknown as Database.Statement,
      logEvent: logEvent as unknown as (payload: any) => void,
      invokeModel,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      now: () => new Date('2024-01-02T01:00:00.000Z')
    };

    const result = await startAgenticRun(
      {
        itemId: run.ItemUUID,
        searchQuery: run.SearchQuery,
        actor: 'unit-test',
        request: { id: 'request-123' }
      },
      deps as any
    );

    expect(result.queued).toBe(true);
    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-review-1',
        searchQuery: 'Search term',
        requestId: 'request-123',
        review: {
          decision: 'approved',
          notes: 'Looks good',
          reviewedBy: 'jane.doe'
        }
      })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticRunRequeued', EntityId: 'item-review-1' })
    );
  });
});
