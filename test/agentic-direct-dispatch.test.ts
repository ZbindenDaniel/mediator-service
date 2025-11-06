import type Database from 'better-sqlite3';
import { startAgenticRun, type AgenticServiceDependencies } from '../backend/agentic';
import type { AgenticRun } from '../models';

// TODO(agent): Revisit requestId propagation assertions if the dispatch queue batching strategy changes.

describe('agentic direct dispatch', () => {
  function createDeps(options: {
    existing?: AgenticRun | null;
    refreshed?: AgenticRun | null;
    invokeResult?: { ok: boolean; message?: string | null };
  }): {
    deps: AgenticServiceDependencies;
    invokeModel: jest.Mock;
    upsertAgenticRun: jest.Mock;
    logEvent: jest.Mock;
    getAgenticRun: jest.Mock;
    logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  } {
    const existing = options.existing ?? null;
    const refreshed = options.refreshed ?? existing ?? null;
    const getAgenticRun = jest.fn<AgenticRun | null, [string]>(() => refreshed);
    getAgenticRun.mockImplementationOnce(() => existing);

    const upsertAgenticRun = jest.fn();
    const updateAgenticRunStatus = { run: jest.fn() };
    const logEvent = jest.fn();
    const invokeModel = jest.fn().mockResolvedValue(options.invokeResult ?? { ok: true, message: null });
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const deps: AgenticServiceDependencies = {
      db: { transaction: (fn: unknown) => fn } as unknown as Database.Database,
      getAgenticRun: { get: getAgenticRun } as unknown as Database.Statement,
      upsertAgenticRun: { run: upsertAgenticRun } as unknown as Database.Statement,
      updateAgenticRunStatus: updateAgenticRunStatus as unknown as Database.Statement,
      logEvent: logEvent as unknown as (payload: any) => void,
      invokeModel,
      logger,
      now: () => new Date('2024-01-01T00:00:00.000Z')
    };

    return { deps, invokeModel, upsertAgenticRun, logEvent, getAgenticRun, logger };
  }

  test('startAgenticRun invokes the model immediately for new runs', async () => {
    const createdRun: AgenticRun = {
      Id: 1,
      ItemUUID: 'item-new-1',
      SearchQuery: 'Neuer Artikel',
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

    const { deps, invokeModel, upsertAgenticRun, logEvent } = createDeps({ existing: null, refreshed: createdRun });

    const result = await startAgenticRun(
      {
        itemId: createdRun.ItemUUID,
        searchQuery: createdRun.SearchQuery ?? '',
        actor: 'unit-test',
        context: 'direct-dispatch',
        request: { id: 'req-start-direct' }
      },
      deps
    );

    expect(result.queued).toBe(true);
    expect(result.created).toBe(true);
    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: createdRun.ItemUUID,
        searchQuery: createdRun.SearchQuery,
        context: 'direct-dispatch',
        requestId: 'req-start-direct',
        review: {
          decision: null,
          notes: null,
          reviewedBy: null
        }
      })
    );
    expect(upsertAgenticRun).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticRunQueued', EntityId: createdRun.ItemUUID })
    );
  });

  test('startAgenticRun requeues existing runs and forwards stored review metadata', async () => {
    const existingRun: AgenticRun = {
      Id: 2,
      ItemUUID: 'item-existing-1',
      SearchQuery: 'Vorhandener Artikel',
      Status: 'running',
      LastModified: '2024-01-01T12:00:00.000Z',
      ReviewState: 'approved',
      ReviewedBy: 'qa.user',
      LastReviewDecision: 'approved',
      LastReviewNotes: 'OK',
      RetryCount: 1,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: '2024-01-01T12:05:00.000Z'
    };

    const { deps, invokeModel, logEvent, upsertAgenticRun } = createDeps({ existing: existingRun });

    const result = await startAgenticRun(
      {
        itemId: existingRun.ItemUUID,
        searchQuery: existingRun.SearchQuery ?? '',
        actor: 'qa.user',
        request: { id: 'req-requeue' }
      },
      deps
    );

    expect(result.queued).toBe(true);
    expect(result.created).toBe(false);
    expect(upsertAgenticRun).toHaveBeenCalledTimes(1);
    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-requeue',
        review: {
          decision: 'approved',
          notes: 'OK',
          reviewedBy: 'qa.user'
        }
      })
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticRunRequeued', EntityId: existingRun.ItemUUID })
    );
  });
});
