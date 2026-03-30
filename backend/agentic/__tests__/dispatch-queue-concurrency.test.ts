import type { AgenticRun } from '../../../models';
import { AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_RUNNING } from '../../../models';
import { dispatchQueuedAgenticRuns, startAgenticRun, type AgenticServiceDependencies } from '../index';
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
      })),
      transaction: <T extends (...args: any[]) => any>(fn: T) =>
        (...args: Parameters<T>): ReturnType<T> => fn(...args)
    } as any,
    getAgenticRun: {
      get: jest.fn(() => undefined)
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

// ─── dispatchQueuedAgenticRuns ───────────────────────────────────────────────

describe('dispatchQueuedAgenticRuns concurrency gating', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not dispatch queued runs when all 3 slots are occupied', () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 3 = 0
    const deps = createDeps(3);
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockReturnValue([makeRun()]);

    const result = dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(result).toEqual({ scheduled: 0, skipped: 0, failed: 0 });
    expect(fetchQueuedSpy).not.toHaveBeenCalled();
  });

  it('limits queued fetch to 1 available slot when 2 runs are already running', () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 2 = 1
    const deps = createDeps(2);
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockReturnValue([]);

    dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(1);
  });

  it('limits queued fetch to all 3 available slots when nothing is running', () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 0 = 3; limit = 5 → min(5, 3) = 3
    const deps = createDeps(0);
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockReturnValue([]);

    dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(3);
  });

  it('limits queued fetch to effective limit when limit is less than available slots', () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3; limit = 2 → min(2, 3) = 2
    const deps = createDeps(0);
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockReturnValue([]);

    dispatchQueuedAgenticRuns(deps, { limit: 2 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(2);
  });
});

// ─── startAgenticRun ─────────────────────────────────────────────────────────

describe('startAgenticRun queuing behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a new run in queued status when none exists', async () => {
    const deps = createDeps(0);
    const upsertSpy = deps.upsertAgenticRun.run as jest.Mock;
    // getAgenticRun returns null first (inside transaction), then returns the newly created run
    let callCount = 0;
    (deps.getAgenticRun.get as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return undefined; // first call inside transaction: no existing run
      return makeRun({ Status: AGENTIC_RUN_STATUS_QUEUED }); // subsequent: newly persisted run
    });

    const result = await startAgenticRun({ itemId: 'R-1', searchQuery: 'test query' }, deps);

    expect(result.queued).toBe(true);
    expect(result.created).toBe(true);
    expect(result.reason).toBeFalsy();
    // Run was upserted with queued status
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ Status: AGENTIC_RUN_STATUS_QUEUED })
    );
  });

  it('does not create a second run when one already exists for the same Artikel_Nummer', async () => {
    const deps = createDeps(0);
    const existingRun = makeRun({ Status: AGENTIC_RUN_STATUS_RUNNING });
    (deps.getAgenticRun.get as jest.Mock).mockReturnValue(existingRun);

    const result = await startAgenticRun({ itemId: 'R-1', searchQuery: 'test query' }, deps);

    expect(result.queued).toBe(false);
    expect(result.created).toBe(false);
    expect(result.reason).toBe('already-exists');
    // upsert should NOT have been called
    expect((deps.upsertAgenticRun.run as jest.Mock)).not.toHaveBeenCalled();
  });

  it('concurrent starts for same Artikel_Nummer result in at most one queued run', async () => {
    // Simulate two concurrent startAgenticRun calls sharing the same in-memory state.
    // The transaction wraps check+create atomically, so only one should create a run.
    const deps = createDeps(0);
    let storedRun: AgenticRun | undefined;

    (deps.upsertAgenticRun.run as jest.Mock).mockImplementation(() => {
      storedRun = makeRun({ Status: AGENTIC_RUN_STATUS_QUEUED });
    });
    (deps.getAgenticRun.get as jest.Mock).mockImplementation(() => storedRun ?? undefined);

    const [r1, r2] = await Promise.all([
      startAgenticRun({ itemId: 'R-1', searchQuery: 'test query' }, deps),
      startAgenticRun({ itemId: 'R-1', searchQuery: 'test query' }, deps)
    ]);

    // Exactly one of the two calls should have created the run
    const createdCount = [r1, r2].filter((r) => r.created).length;
    const alreadyExistsCount = [r1, r2].filter((r) => r.reason === 'already-exists').length;
    expect(createdCount).toBe(1);
    expect(alreadyExistsCount).toBe(1);
  });
});
