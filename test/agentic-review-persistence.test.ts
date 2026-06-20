// withTransaction must execute its callback immediately so the test resolves synchronously.
jest.mock('../backend/db-client', () => ({
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
  query: jest.fn(async () => ({ rows: [] })),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
}));

jest.mock('../backend/db', () => ({
  logAgenticRequestStart: jest.fn(),
  logAgenticRequestEnd: jest.fn(),
  saveAgenticRequestPayload: jest.fn(),
  markAgenticRequestNotificationSuccess: jest.fn(),
  markAgenticRequestNotificationFailure: jest.fn(),
  fetchQueuedAgenticRuns: jest.fn(async () => []),
  fetchIdleFillAgenticRuns: jest.fn(async () => []),
  updateQueuedAgenticRunQueueState: jest.fn(),
  listAgenticRunReviewHistory: jest.fn(async () => []),
}));

import { startAgenticRun } from '../backend/agentic';
import type { AgenticServiceDependencies } from '../backend/agentic';
import type { AgenticRun } from '../models';

function createDeps() {
  const upsertAgenticRun = jest.fn(async () => undefined);
  const logEvent = jest.fn(async () => undefined);
  const deps: AgenticServiceDependencies = {
    getAgenticRun: jest.fn(async () => null),
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: 'R-300' })),
    upsertAgenticRun,
    updateAgenticRunStatus: jest.fn(async () => 1),
    logEvent,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  };
  return { deps, upsertAgenticRun, logEvent };
}

describe('agentic review persistence', () => {
  afterEach(() => jest.clearAllMocks());

  test('AgenticRun model has required review columns', () => {
    // Compile-time guard: verify the shape is still in sync with persistence assertions
    const run = {
      Id: 1,
      Artikel_Nummer: 'R-300',
      SearchQuery: 'query',
      Status: 'queued',
      LastModified: '2024-01-01T00:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: 'approve',
      LastReviewNotes: 'good',
      RetryCount: 0,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    } satisfies AgenticRun;

    expect(run.LastReviewDecision).toBe('approve');
    expect(run.LastReviewNotes).toBe('good');
  });

  test('startAgenticRun with no review sets LastReviewDecision and LastReviewNotes to null', async () => {
    const { deps, upsertAgenticRun } = createDeps();

    await startAgenticRun({ itemId: 'R-300', searchQuery: 'no review query' }, deps);

    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        LastReviewDecision: null,
        LastReviewNotes: null,
        ReviewState: 'not_required'
      })
    );
  });

  test('startAgenticRun logs AgenticRunQueued event for new runs', async () => {
    const { deps, logEvent } = createDeps();

    await startAgenticRun({ itemId: 'R-300', searchQuery: 'queue event test', actor: 'tester' }, deps);

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        Event: 'AgenticRunQueued',
        EntityId: 'R-300',
        Actor: 'tester'
      })
    );
  });
});
