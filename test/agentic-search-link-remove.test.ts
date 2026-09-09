// removeAgenticSearchLink prunes one entry from a run's LastSearchLinksJson and persists the
// remainder via updateAgenticRunStatus, leaving the run's status/review untouched.

jest.mock('../backend/db-client', () => ({
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({ query: jest.fn(async () => ({ rowCount: 1 })) })),
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
  claimIdleFillAgenticRuns: jest.fn(async () => []),
  updateQueuedAgenticRunQueueState: jest.fn(),
  listAgenticRunReviewHistory: jest.fn(async () => []),
}));

import { removeAgenticSearchLink } from '../backend/agentic';
import type { AgenticServiceDependencies } from '../backend/agentic';
import type { AgenticRun } from '../models';

function createDeps(existing: Partial<AgenticRun> | null) {
  const updateAgenticRunStatus = jest.fn(async () => 1);
  const logEvent = jest.fn(async () => undefined);
  const deps: AgenticServiceDependencies = {
    getAgenticRun: jest.fn(async () => (existing ? (existing as AgenticRun) : null)),
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: 'R-300' })),
    upsertAgenticRun: jest.fn(async () => undefined),
    updateAgenticRunStatus,
    logEvent,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  };
  return { deps, updateAgenticRunStatus, logEvent };
}

const TWO_LINKS = JSON.stringify([
  { url: 'https://good.example.com', title: 'Good' },
  { url: 'https://bad.example.com', title: 'Bad' }
]);

describe('removeAgenticSearchLink', () => {
  afterEach(() => jest.clearAllMocks());

  test('removes the matching link and persists the remaining sources without touching status', async () => {
    const { deps, updateAgenticRunStatus, logEvent } = createDeps({
      Artikel_Nummer: 'R-300',
      SearchQuery: 'q',
      LastSearchLinksJson: TWO_LINKS,
      Status: 'review',
      ReviewState: 'pending'
    } as Partial<AgenticRun>);

    const result = await removeAgenticSearchLink(
      { itemId: 'R-300', actor: 'tester', url: 'https://bad.example.com' },
      deps
    );

    expect(result.removed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(updateAgenticRunStatus).toHaveBeenCalledTimes(1);
    const persisted = updateAgenticRunStatus.mock.calls[0][0] as Record<string, unknown>;
    // Status/ReviewState echoed back unchanged; only LastSearchLinksJson is flagged for update.
    expect(persisted.Status).toBe('review');
    expect(persisted.ReviewState).toBe('pending');
    expect(persisted.LastSearchLinksJsonIsSet).toBe(1);
    expect(JSON.parse(persisted.LastSearchLinksJson as string)).toEqual([
      { url: 'https://good.example.com', title: 'Good' }
    ]);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticSearchLinkRemoved', EntityId: 'R-300' })
    );
  });

  test('persists null when the last remaining link is removed', async () => {
    const { deps, updateAgenticRunStatus } = createDeps({
      Artikel_Nummer: 'R-300',
      LastSearchLinksJson: JSON.stringify([{ url: 'https://only.example.com' }]),
      Status: 'review',
      ReviewState: 'pending'
    } as Partial<AgenticRun>);

    const result = await removeAgenticSearchLink(
      { itemId: 'R-300', actor: 'tester', url: 'https://only.example.com' },
      deps
    );

    expect(result.removed).toBe(true);
    expect(result.remaining).toBe(0);
    const persisted = updateAgenticRunStatus.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.LastSearchLinksJson).toBeNull();
    expect(persisted.LastSearchLinksJsonIsSet).toBe(1);
  });

  test('declines when the url is not among the stored links', async () => {
    const { deps, updateAgenticRunStatus } = createDeps({
      Artikel_Nummer: 'R-300',
      LastSearchLinksJson: TWO_LINKS,
      Status: 'review',
      ReviewState: 'pending'
    } as Partial<AgenticRun>);

    const result = await removeAgenticSearchLink(
      { itemId: 'R-300', actor: 'tester', url: 'https://missing.example.com' },
      deps
    );

    expect(result.removed).toBe(false);
    expect(result.reason).toBe('link-not-found');
    expect(updateAgenticRunStatus).not.toHaveBeenCalled();
  });

  test('declines when no run exists', async () => {
    const { deps, updateAgenticRunStatus } = createDeps(null);

    const result = await removeAgenticSearchLink(
      { itemId: 'R-300', actor: 'tester', url: 'https://bad.example.com' },
      deps
    );

    expect(result.removed).toBe(false);
    expect(result.reason).toBe('not-found');
    expect(updateAgenticRunStatus).not.toHaveBeenCalled();
  });

  test('declines when the url is missing from the request', async () => {
    const { deps, updateAgenticRunStatus } = createDeps({
      Artikel_Nummer: 'R-300',
      LastSearchLinksJson: TWO_LINKS,
      Status: 'review',
      ReviewState: 'pending'
    } as Partial<AgenticRun>);

    const result = await removeAgenticSearchLink(
      { itemId: 'R-300', actor: 'tester', url: '   ' },
      deps
    );

    expect(result.removed).toBe(false);
    expect(result.reason).toBe('missing-url');
    expect(updateAgenticRunStatus).not.toHaveBeenCalled();
  });
});
