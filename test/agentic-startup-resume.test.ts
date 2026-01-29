import type Database from 'better-sqlite3';
import {
  resumeStaleAgenticRuns,
  type AgenticRunResumeResult,
  type AgenticServiceDependencies
} from '../backend/agentic';
import type { AgenticRun } from '../models';

// TODO(agentic-resume): Extend coverage when persisted request context becomes available.

describe('resumeStaleAgenticRuns', () => {
  function createDependencies(runs: AgenticRun[], overrides: Partial<{ invokeResult: { ok: boolean } }> = {}) {
    const statementMock = { all: jest.fn(() => runs) };
    const prepareMock = jest.fn(() => statementMock);
    const db = { prepare: prepareMock } as unknown as Database.Database;

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const invokeModel = jest.fn().mockResolvedValue(overrides.invokeResult ?? { ok: true });

    const deps: AgenticServiceDependencies = {
      db,
      getAgenticRun: { get: jest.fn(() => runs[0] ?? null) } as unknown as Database.Statement,
      upsertAgenticRun: { run: jest.fn() } as unknown as Database.Statement,
      updateAgenticRunStatus: { run: jest.fn(() => ({ changes: 1 })) } as unknown as Database.Statement,
      logEvent: jest.fn(),
      invokeModel,
      logger,
      now: () => new Date('2024-01-01T00:00:00.000Z')
    };

    return { deps, invokeModel, logger, prepareMock, statementMock };
  }

  test('schedules stale queued runs for asynchronous invocation', async () => {
    const staleRun: AgenticRun = {
      Id: 10,
      Artikel_Nummer: 'resume-item-1',
      SearchQuery: 'Resumable Item',
      Status: 'queued',
      LastModified: '2024-01-01T00:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };

    const { deps, invokeModel } = createDependencies([staleRun]);

    const result: AgenticRunResumeResult = await resumeStaleAgenticRuns(deps);
    expect(result).toEqual({ resumed: 1, skipped: 0, failed: 0 });

    await new Promise((resolve) => setImmediate(resolve));

    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: staleRun.Artikel_Nummer,
        searchQuery: staleRun.SearchQuery,
        context: null,
        review: null,
        requestId: null
      })
    );
  });

  test('skips runs missing search queries and logs warning', async () => {
    const staleRun: AgenticRun = {
      Id: 11,
      Artikel_Nummer: 'resume-item-2',
      SearchQuery: '   ',
      Status: 'running',
      LastModified: '2024-01-01T01:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };

    const { deps, invokeModel, logger } = createDependencies([staleRun]);

    const result = await resumeStaleAgenticRuns(deps);
    expect(result).toEqual({ resumed: 0, skipped: 1, failed: 0 });
    expect(logger.warn).toHaveBeenCalledWith(
      '[agentic-service] Skipping stale agentic run without search query',
      expect.objectContaining({ itemId: staleRun.Artikel_Nummer, status: staleRun.Status })
    );
    expect(invokeModel).not.toHaveBeenCalled();
  });

  test('reports failure when database query throws', async () => {
    const error = new Error('db down');
    const db = {
      prepare: jest.fn(() => {
        throw error;
      })
    } as unknown as Database.Database;

    const deps: AgenticServiceDependencies = {
      db,
      getAgenticRun: { get: jest.fn(() => null) } as unknown as Database.Statement,
      upsertAgenticRun: { run: jest.fn() } as unknown as Database.Statement,
      updateAgenticRunStatus: { run: jest.fn(() => ({ changes: 1 })) } as unknown as Database.Statement,
      logEvent: jest.fn(),
      invokeModel: jest.fn(),
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      now: () => new Date('2024-01-01T00:00:00.000Z')
    };

    const result = await resumeStaleAgenticRuns(deps);
    expect(result).toEqual({ resumed: 0, skipped: 0, failed: 1 });
    expect(deps.logger?.error).toHaveBeenCalledWith(
      '[agentic-service] Failed to query stale agentic runs during resume',
      expect.objectContaining({ error: 'db down' })
    );
  });
});
