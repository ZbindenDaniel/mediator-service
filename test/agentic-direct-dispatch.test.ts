jest.mock('../backend/db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => {
    const client = {
      query: jest.fn(async () => ({ rows: [{ runningcount: 0 }] }))
    };
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

import { startAgenticRun, dispatchQueuedAgenticRuns, type AgenticServiceDependencies } from '../backend/agentic';
import * as dbClient from '../backend/db-client';
import type { AgenticRun } from '../models';

const mockQuery = dbClient.query as jest.Mock;
const mockWithTransaction = dbClient.withTransaction as jest.Mock;

// TODO(agent): Revisit requestId propagation assertions if the dispatch queue batching strategy changes.

describe('agentic direct dispatch', () => {
  function createDeps(options: {
    existing?: AgenticRun | null;
    queued?: AgenticRun | null;
    invokeResult?: { ok: boolean; message?: string | null };
    invokeMock?: jest.Mock;
  }): {
    deps: AgenticServiceDependencies;
    invokeModel: jest.Mock;
    upsertAgenticRun: jest.Mock;
    updateAgenticRunStatus: jest.Mock;
    logEvent: jest.Mock;
    getAgenticRun: jest.Mock;
    logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  } {
    const existing = options.existing ?? null;
    const queued = options.queued ?? null;
    const getAgenticRun = jest.fn(async (_id: string) => queued);
    getAgenticRun.mockReturnValueOnce(Promise.resolve(existing));

    const upsertAgenticRun = jest.fn(async () => undefined);
    const updateAgenticRunStatus = jest.fn(async () => ({ changes: 1 }));
    const logEvent = jest.fn();
    const invokeModel =
      options.invokeMock ?? jest.fn().mockResolvedValue(options.invokeResult ?? { ok: true, message: null });
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const deps: AgenticServiceDependencies = {
      getAgenticRun,
      upsertAgenticRun,
      updateAgenticRunStatus,
      logEvent,
      invokeModel,
      logger,
      now: () => new Date('2024-01-01T00:00:00.000Z'),
      getItemReference: async (id: string) => ({ Artikel_Nummer: id, Artikelbeschreibung: 'Test item' })
    };

    return { deps, invokeModel, upsertAgenticRun, updateAgenticRunStatus, logEvent, getAgenticRun, logger };
  }

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
    jest.clearAllMocks();
  });

  test('startAgenticRun queues a new run and dispatch invokes the model', async () => {
    const queuedRun: AgenticRun = {
      Id: 1,
      Artikel_Nummer: 'item-new-1',
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

    const { deps, invokeModel, upsertAgenticRun, logEvent } = createDeps({ existing: null, queued: queuedRun });

    // startAgenticRun should queue the run but NOT immediately invoke model
    const result = await startAgenticRun(
      {
        itemId: queuedRun.Artikel_Nummer,
        searchQuery: queuedRun.SearchQuery ?? '',
        actor: 'unit-test',
        context: 'direct-dispatch',
        request: { id: 'req-start-direct' }
      },
      deps
    );

    expect(result.queued).toBe(true);
    expect(result.created).toBe(true);
    expect(upsertAgenticRun).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticRunQueued', EntityId: queuedRun.Artikel_Nummer })
    );

    // Now dispatch queued runs — mock query to return the queued run
    mockQuery.mockResolvedValue([queuedRun]);
    await dispatchQueuedAgenticRuns(deps);
    await new Promise((resolve) => setImmediate(resolve));

    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: queuedRun.Artikel_Nummer,
        searchQuery: queuedRun.SearchQuery
      })
    );
  });

  test('startAgenticRun declines when a run already exists (deduplicated)', async () => {
    const existingRun: AgenticRun = {
      Id: 2,
      Artikel_Nummer: 'item-existing-1',
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

    const { deps, logEvent, upsertAgenticRun } = createDeps({ existing: existingRun, queued: existingRun });

    const result = await startAgenticRun(
      {
        itemId: existingRun.Artikel_Nummer,
        searchQuery: existingRun.SearchQuery ?? '',
        actor: 'qa.user',
        request: { id: 'req-requeue' }
      },
      deps
    );

    // New behavior: if run already exists, startAgenticRun declines (returns queued: false)
    // Re-queueing existing runs is now handled via restartAgenticRun
    expect(result.queued).toBe(false);
    expect(result.created).toBe(false);
    expect(result.reason).toBe('already-exists');
    expect(upsertAgenticRun).not.toHaveBeenCalled();
  });

  test('auto-cancels run when dispatch invocation reports failure', async () => {
    const existingRun: AgenticRun = {
      Id: 3,
      Artikel_Nummer: 'item-fail-1',
      SearchQuery: 'Fehlgeschlagen',
      Status: 'queued',
      LastModified: '2024-01-02T10:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };

    const failingInvoke = jest.fn().mockResolvedValue({ ok: false, message: 'flow-failed' });
    const { deps, getAgenticRun, logEvent, updateAgenticRunStatus } = createDeps({
      existing: null,
      queued: existingRun,
      invokeMock: failingInvoke
    });

    // Mock query to return the queued run for dispatch
    mockQuery.mockResolvedValue([existingRun]);
    await dispatchQueuedAgenticRuns(deps);

    await new Promise((resolve) => setImmediate(resolve));

    expect(failingInvoke).toHaveBeenCalledTimes(1);
    expect(getAgenticRun).toHaveBeenCalled();
    const updateCalls = updateAgenticRunStatus.mock.calls;
    expect(updateCalls.some((call: any[]) => call?.[0]?.Status === 'cancelled')).toBe(true);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticRunCancelled', EntityId: existingRun.Artikel_Nummer })
    );
  });
});
