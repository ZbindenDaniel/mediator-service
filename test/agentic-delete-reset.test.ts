// deleteAgenticRun deletes the run row inside a transaction, then re-inserts a reset
// notStarted record. The client passed to withTransaction must expose query() returning a
// rowCount so the DELETE guard passes.
const deleteClientQuery = jest.fn(async () => ({ rowCount: 1 }));

jest.mock('../backend/db-client', () => ({
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({ query: deleteClientQuery })),
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
  claimQueuedAgenticRuns: jest.fn(async () => []),
  fetchIdleFillAgenticRuns: jest.fn(async () => []),
  updateQueuedAgenticRunQueueState: jest.fn(),
  listAgenticRunReviewHistory: jest.fn(async () => []),
}));

import { deleteAgenticRun } from '../backend/agentic';
import type { AgenticServiceDependencies } from '../backend/agentic';
import type { AgenticRun } from '../models';

function createDeps(existing: Partial<AgenticRun> | null) {
  const upsertAgenticRun = jest.fn(async () => undefined);
  const logEvent = jest.fn(async () => undefined);
  const deps: AgenticServiceDependencies = {
    getAgenticRun: jest.fn(async () => (existing ? (existing as AgenticRun) : null)),
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: 'R-300' })),
    upsertAgenticRun,
    updateAgenticRunStatus: jest.fn(async () => 1),
    logEvent,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  };
  return { deps, upsertAgenticRun, logEvent };
}

describe('deleteAgenticRun reset', () => {
  afterEach(() => jest.clearAllMocks());

  test('clears SearchQuery and LastSearchLinksJson so idle-fill cannot re-promote the deleted run', async () => {
    const { deps, upsertAgenticRun } = createDeps({
      Artikel_Nummer: 'R-300',
      SearchQuery: 'stale query',
      LastSearchLinksJson: '[{"url":"https://example.com"}]',
      Status: 'cancelled',
      ReviewState: 'not_required'
    } as Partial<AgenticRun>);

    const result = await deleteAgenticRun(
      { itemId: 'R-300', actor: 'tester', reason: 'user reset' },
      deps
    );

    expect(result.deleted).toBe(true);
    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikel_Nummer: 'R-300',
        Status: 'notStarted',
        SearchQuery: null,
        LastSearchLinksJson: null,
        ReviewState: 'not_required'
      })
    );
  });

  test('declines to delete a run that is not started', async () => {
    const { deps, upsertAgenticRun } = createDeps({
      Artikel_Nummer: 'R-300',
      SearchQuery: 'q',
      Status: 'notStarted',
      ReviewState: 'not_required'
    } as Partial<AgenticRun>);

    const result = await deleteAgenticRun(
      { itemId: 'R-300', actor: 'tester', reason: null },
      deps
    );

    expect(result.deleted).toBe(false);
    expect(result.reason).toBe('not-started');
    expect(upsertAgenticRun).not.toHaveBeenCalled();
  });
});
