// withTransaction must execute its callback immediately so the test resolves synchronously.
jest.mock('../../db-client', () => ({
  withTransaction: jest.fn((fn: (client: unknown) => Promise<unknown>) => fn({})),
  query: jest.fn(async () => ({ rows: [] })),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
}));

// Prevent module-level db imports from attempting Postgres connections.
jest.mock('../../db', () => ({
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

import { startAgenticRun } from '../index';
import type { AgenticServiceDependencies } from '../index';
import type { AgenticRunStartInput, AgenticRunReviewMetadata } from '../../../models';

function createDeps() {
  const upsertAgenticRun = jest.fn(async () => undefined);
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  const deps: AgenticServiceDependencies = {
    getAgenticRun: jest.fn(async () => null),
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: 'R-200' })),
    upsertAgenticRun,
    updateAgenticRunStatus: jest.fn(async () => 1),
    logEvent: jest.fn(async () => undefined),
    logger
  };
  return { deps, logger, upsertAgenticRun };
}

describe('agentic review metadata normalization', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('normalizes malformed review signal payloads safely', async () => {
    const { deps, logger, upsertAgenticRun } = createDeps();

    const input: AgenticRunStartInput = {
      itemId: 'R-200',
      searchQuery: 'sample query',
      review: {
        decision: ' Approve ',
        information_present: 'yes' as unknown as boolean,
        missing_spec: [' width ', 'width', '', 'height '.repeat(20)],
        unneeded_spec: [],
        bad_format: '0' as unknown as boolean,
        wrong_information: 1 as unknown as boolean,
        wrong_physical_dimensions: 'no' as unknown as boolean,
        notes: ' keep notes ',
        reviewedBy: ' reviewer '
      } as unknown as AgenticRunReviewMetadata
    };

    await startAgenticRun(input, deps);

    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        LastReviewDecision: 'approve',
        LastReviewNotes: 'keep notes',
        ReviewState: 'not_required'
      })
    );

    const normalizationLogCall = logger.info.mock.calls.find(
      ([msg]: [string]) => msg === '[agentic-service] Normalized review metadata'
    );
    expect(normalizationLogCall).toBeDefined();
    expect(normalizationLogCall?.[1]).toEqual(
      expect.objectContaining({
        normalizedSignals: expect.objectContaining({
          information_present: true,
          bad_format: false,
          wrong_information: true,
          wrong_physical_dimensions: false,
          missing_spec_count: 2
        })
      })
    );
  });

  test('keeps backward compatibility for legacy review payloads', async () => {
    const { deps, upsertAgenticRun } = createDeps();

    await startAgenticRun(
      {
        itemId: 'R-200',
        searchQuery: 'legacy query',
        review: {
          decision: 'reject',
          information_present: null,
          missing_spec: [],
          unneeded_spec: [],
          bad_format: null,
          wrong_information: null,
          wrong_physical_dimensions: null,
          notes: 'legacy notes',
          reviewedBy: 'legacy-user'
        }
      },
      deps
    );

    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        LastReviewDecision: 'reject',
        LastReviewNotes: 'legacy notes',
        ReviewedBy: 'legacy-user'
      })
    );
  });

  test('catches normalization errors and logs sanitized metadata only', async () => {
    const { deps, logger, upsertAgenticRun } = createDeps();

    const reviewWithThrowingGetter = {
      decision: 'approve',
      notes: 'sensitive reviewer note',
      reviewedBy: 'reviewer',
      get missing_spec(): string[] { throw new Error('boom'); }
    };

    await startAgenticRun(
      {
        itemId: 'R-200',
        searchQuery: 'error path query',
        review: reviewWithThrowingGetter as unknown as AgenticRunReviewMetadata
      },
      deps
    );

    expect(logger.warn).toHaveBeenCalledWith(
      '[agentic-service] Failed to normalize review metadata',
      expect.objectContaining({
        provided: true,
        reviewShape: expect.arrayContaining(['decision', 'missing_spec', 'notes', 'reviewedBy'])
      })
    );

    expect(upsertAgenticRun).toHaveBeenCalledWith(
      expect.objectContaining({
        LastReviewDecision: null,
        LastReviewNotes: null,
        ReviewedBy: null
      })
    );
  });
});
