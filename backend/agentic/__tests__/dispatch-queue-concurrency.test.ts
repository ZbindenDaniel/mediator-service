import type { AgenticRun } from '../../../models';
import { AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_RUNNING } from '../../../models';
import { dispatchQueuedAgenticRuns, type AgenticServiceDependencies } from '../index';
import * as agenticDb from '../../db';

function makeRun(overrides: Partial<AgenticRun> = {}): AgenticRun {
  return {
    Id: 1,
    Artikel_Nummer: 'R-1',
    SearchQuery: 'queued query',
    LastSearchLinksJson: null,
    Status: AGENTIC_RUN_STATUS_QUEUED,
    LastModified: '2024-01-01T00:00:00.000Z',
    ReviewState: 'not_required',
    ReviewedBy: null,
    LastReviewDecision: null,
    LastReviewNotes: null,
    RetryCount: 0,
    NextRetryAt: null,
    LastError: null,
    LastAttemptAt: null,
    TranscriptUrl: null,
    ...overrides
  };
}

function createDeps(runningCount: number): AgenticServiceDependencies {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  return {
    db: {
      prepare: jest.fn(() => ({
        get: jest.fn(() => ({ runningCount }))
      }))
    } as any,
    getAgenticRun: {
      get: jest.fn(() => makeRun({ Status: AGENTIC_RUN_STATUS_RUNNING }))
    } as any,
    getItemReference: { get: jest.fn(() => ({ Artikel_Nummer: 'R-1' })) } as any,
    upsertAgenticRun: { run: jest.fn() } as any,
    updateAgenticRunStatus: { run: jest.fn(() => ({ changes: 1 })) } as any,
    updateQueuedAgenticRunQueueState: jest.fn(),
    logEvent: jest.fn(),
    logger,
    invokeModel: jest.fn(async () => ({ ok: true })),
    now: () => new Date('2024-01-01T00:00:00.000Z')
  };
}

describe('dispatchQueuedAgenticRuns concurrency gating', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not dispatch queued runs when another run is already running', () => {
    const deps = createDeps(1);
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockReturnValue([makeRun()]);

    const result = dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(result).toEqual({ scheduled: 0, skipped: 0, failed: 0 });
    expect(fetchQueuedSpy).not.toHaveBeenCalled();
  });

  it('limits queued fetch to one available running slot', () => {
    const deps = createDeps(0);
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockReturnValue([]);

    dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(1);
  });
});
