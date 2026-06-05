jest.mock('../backend/db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => {
    const client = { query: jest.fn(async () => ({ rows: [{ runningcount: 0 }] })) };
    return fn(client);
  }),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 1),
  insert: jest.fn(async () => ({})),
  namedQuery: jest.fn(async () => []),
  namedQueryOne: jest.fn(async () => null),
  namedExecute: jest.fn(async () => 0),
  execBatch: jest.fn(async () => undefined),
  namedToPositional: jest.fn((sql: string, params: Record<string, unknown>) => ({ text: sql, values: Object.values(params) })),
  getPoolInstance: jest.fn(() => null),
  closePool: jest.fn(async () => undefined),
}));

import {
  resumeStaleAgenticRuns,
  type AgenticRunResumeResult,
  type AgenticServiceDependencies
} from '../backend/agentic';
import * as dbClient from '../backend/db-client';
import type { AgenticRun } from '../models';

const mockQuery = dbClient.query as jest.Mock;

// TODO(agentic-resume): Extend coverage when persisted request context becomes available.
// TODO(agentic-resume-logging): Add assertions for resume path selection logging if external orchestrator is added.

describe('resumeStaleAgenticRuns', () => {
  function createDependencies(runs: AgenticRun[], overrides: Partial<{ invokeResult: { ok: boolean } }> = {}) {
    mockQuery.mockResolvedValue(runs);

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const invokeModel = jest.fn().mockResolvedValue(overrides.invokeResult ?? { ok: true });

    const deps: AgenticServiceDependencies = {
      getAgenticRun: jest.fn(async () => runs[0] ?? null),
      upsertAgenticRun: jest.fn(async () => undefined),
      updateAgenticRunStatus: jest.fn(async () => ({ changes: 1 })),
      logEvent: jest.fn(),
      invokeModel,
      logger,
      now: () => new Date('2024-01-01T00:00:00.000Z'),
      getItemReference: async (id: string) => ({ Artikel_Nummer: id })
    };

    return { deps, invokeModel, logger };
  }

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
  });

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
      expect.objectContaining({ artikelNummer: staleRun.Artikel_Nummer, status: staleRun.Status })
    );
    expect(invokeModel).not.toHaveBeenCalled();
  });

  test('reports failure when database query throws', async () => {
    const error = new Error('db down');
    mockQuery.mockRejectedValue(error);

    const deps: AgenticServiceDependencies = {
      getAgenticRun: jest.fn(async () => null),
      upsertAgenticRun: jest.fn(async () => undefined),
      updateAgenticRunStatus: jest.fn(async () => ({ changes: 1 })),
      logEvent: jest.fn(),
      invokeModel: jest.fn(),
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      now: () => new Date('2024-01-01T00:00:00.000Z'),
      getItemReference: async (id: string) => ({ Artikel_Nummer: id })
    };

    const result = await resumeStaleAgenticRuns(deps);
    expect(result).toEqual({ resumed: 0, skipped: 0, failed: 1 });
    expect(deps.logger?.error).toHaveBeenCalledWith(
      '[agentic-service] Failed to query stale agentic runs during resume',
      expect.objectContaining({ error: 'db down' })
    );
  });
});
