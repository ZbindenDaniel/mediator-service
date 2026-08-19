// dispatchQueuedAgenticRuns / startAgenticRun call db-client directly; mock it to avoid DATABASE_URL
jest.mock('../../db-client', () => ({
  withTransaction: jest.fn(async (fn: (client: any) => Promise<any>) => {
    const client = { query: jest.fn(async () => ({ rows: [] })) };
    return fn(client);
  }),
  query: jest.fn(async () => []),
  queryOne: jest.fn(async () => null),
  execute: jest.fn(async () => 0),
}));

import type { AgenticRun } from '../../../models';
import { AGENTIC_RUN_STATUS_QUEUED, AGENTIC_RUN_STATUS_RUNNING } from '../../../models';
import { dispatchQueuedAgenticRuns, startAgenticRun, type AgenticServiceDependencies } from '../index';
import * as agenticDb from '../../db';
import * as dbClientMod from '../../db-client';

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

function createDeps(): AgenticServiceDependencies {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  return {
    getAgenticRun: jest.fn(async () => null),
    getItemReference: jest.fn(async () => ({ Artikel_Nummer: 'R-1' })),
    upsertAgenticRun: jest.fn(async () => undefined),
    updateAgenticRunStatus: jest.fn(async () => 1),
    logEvent: jest.fn(async () => undefined),
    logger,
    now: () => new Date('2024-01-01T00:00:00.000Z')
  };
}

// ─── dispatchQueuedAgenticRuns ───────────────────────────────────────────────

describe('dispatchQueuedAgenticRuns concurrency gating', () => {
  beforeEach(() => {
    // Reset withTransaction to the standard pass-through between tests
    (dbClientMod.withTransaction as jest.Mock).mockImplementation(async (fn: (client: any) => Promise<any>) => {
      const client = { query: jest.fn(async () => ({ rows: [] })) };
      return fn(client);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not dispatch queued runs when all 3 slots are occupied', async () => {
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 3 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([makeRun()]);

    const result = await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(result).toEqual({ scheduled: 0, skipped: 0, failed: 0 });
    expect(fetchQueuedSpy).not.toHaveBeenCalled();
  });

  it('limits queued fetch to 1 available slot when 2 runs are already running', async () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 2 = 1
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 2 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    // Second arg is the running cap, passed so the claim self-limits to free slots atomically.
    expect(fetchQueuedSpy).toHaveBeenCalledWith(1, 3);
  });

  it('limits queued fetch to all 3 available slots when nothing is running', async () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 0 = 3; limit = 5 → min(5, 3) = 3
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 0 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([]);
    // The auto-feeder also runs; stub it out so it doesn't hit the mocked db.
    jest.spyOn(agenticDb, 'claimNotStartedAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(3, 3);
  });

  it('limits queued fetch to effective limit when limit is less than available slots', async () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3; limit = 2 → min(2, 3) = 2
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 0 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([]);
    // The auto-feeder also runs; stub it out so it doesn't hit the mocked db.
    jest.spyOn(agenticDb, 'claimNotStartedAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 2 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(2, 3);
  });

  it('auto-feeder promotes notStarted runs into the waiting queue up to the cap, without invoking the model', async () => {
    // The demoted keep-busy feeder only tops up the WAITING queue ('notStarted' → 'queued'); it never
    // promotes straight to running or invokes the model, and it never touches failed/cancelled runs.
    const deps = createDeps();
    const invokeModel = jest.fn().mockResolvedValue({ ok: true, message: null });
    deps.invokeModel = invokeModel;

    // runningcount:0 for every queryOne read (running count AND queued/waiting count → 0).
    (dbClientMod.queryOne as jest.Mock).mockResolvedValue({ runningcount: 0 });
    jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([]);
    const feedSpy = jest
      .spyOn(agenticDb, 'claimNotStartedAgenticRuns')
      .mockResolvedValue([makeRun({ Status: AGENTIC_RUN_STATUS_QUEUED, SearchQuery: 'fed query' })]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });
    // Allow any background microtasks to settle.
    await new Promise((resolve) => setImmediate(resolve));

    // Waiting cap = MAX_WAITING_RUNS (3); current waiting = 0 → feed up to 3.
    expect(feedSpy).toHaveBeenCalledWith(3);
    // The feeder does not invoke the model — the newly-queued run runs on a later tick via the
    // queued→running claim.
    expect(invokeModel).not.toHaveBeenCalled();
  });

  it('does not auto-feed when the auto-dispatch kill switch is off', async () => {
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValue({ runningcount: 0 });
    jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([]);
    // Kill switch: getSystemSetting('agentic_auto_dispatch_enabled') === 'false'
    jest.spyOn(agenticDb, 'getSystemSetting').mockResolvedValue('false');
    const feedSpy = jest.spyOn(agenticDb, 'claimNotStartedAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(feedSpy).not.toHaveBeenCalled();
  });

  it('requeues over-cap running runs to wait instead of cancelling them', async () => {
    // Regression: an over-claim (overlapping ticks / racing instances) once left >cap runs 'running';
    // the safety net cancelled the excess to 'failed', so a just-promoted queued run appeared to be
    // "moved to running then cancelled immediately". It must be pushed back to 'queued' to wait instead.
    const deps = createDeps();
    const updateSpy = jest.fn(async () => undefined);
    deps.updateQueuedAgenticRunQueueState = updateSpy;

    // The over-cap SELECT (via db-client.query) returns two excess running runs; every other query is [].
    (dbClientMod.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes("\"Status\" = 'running'") && sql.includes('OFFSET')) {
        return [
          { Artikel_Nummer: 'R-EXCESS-1', RetryCount: 0, LastAttemptAt: '2024-01-01T00:00:00.000Z' },
          { Artikel_Nummer: 'R-EXCESS-2', RetryCount: 2, LastAttemptAt: '2024-01-01T00:00:01.000Z' }
        ];
      }
      return [];
    });
    (dbClientMod.queryOne as jest.Mock).mockResolvedValue({ runningcount: 3 });
    jest.spyOn(agenticDb, 'claimQueuedAgenticRuns').mockResolvedValue([]);
    jest.spyOn(agenticDb, 'claimNotStartedAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    // Both excess runs are requeued (not failed/cancelled), preserving RetryCount and clearing LastError.
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-EXCESS-1', Status: AGENTIC_RUN_STATUS_QUEUED, LastError: null, RetryCount: 0 })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ Artikel_Nummer: 'R-EXCESS-2', Status: AGENTIC_RUN_STATUS_QUEUED, LastError: null, RetryCount: 2 })
    );
    // No terminal-failure event was emitted for the requeued runs.
    expect(deps.logEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'AgenticRunFailed' })
    );
  });
});

// ─── startAgenticRun ─────────────────────────────────────────────────────────

describe('startAgenticRun queuing behavior', () => {
  beforeEach(() => {
    (dbClientMod.withTransaction as jest.Mock).mockImplementation(async (fn: (client: any) => Promise<any>) => {
      const client = { query: jest.fn(async () => ({ rows: [] })) };
      return fn(client);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a new run in queued status when none exists', async () => {
    const deps = createDeps();
    let callCount = 0;
    // first call (inside transaction): no existing run; second call (fetchAgenticRun after upsert): returns persisted run
    (deps.getAgenticRun as jest.Mock).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return null;
      return makeRun({ Status: AGENTIC_RUN_STATUS_QUEUED });
    });

    const result = await startAgenticRun({ itemId: 'R-1', searchQuery: 'test query' }, deps);

    expect(result.queued).toBe(true);
    expect(result.created).toBe(true);
    expect(result.reason).toBeFalsy();
    expect(deps.upsertAgenticRun as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ Status: AGENTIC_RUN_STATUS_QUEUED })
    );
  });

  it('does not create a second run when one already exists for the same Artikel_Nummer', async () => {
    const deps = createDeps();
    const existingRun = makeRun({ Status: AGENTIC_RUN_STATUS_RUNNING });
    (deps.getAgenticRun as jest.Mock).mockResolvedValue(existingRun);

    const result = await startAgenticRun({ itemId: 'R-1', searchQuery: 'test query' }, deps);

    expect(result.queued).toBe(false);
    expect(result.created).toBe(false);
    expect(result.reason).toBe('already-exists');
    expect(deps.upsertAgenticRun as jest.Mock).not.toHaveBeenCalled();
  });

  it('concurrent starts for same Artikel_Nummer result in at most one queued run', async () => {
    // Serialize transactions so the atomic check+create cannot interleave, mirroring DB-level isolation.
    const deps = createDeps();
    let storedRun: AgenticRun | undefined;
    let txnLock = Promise.resolve();
    (dbClientMod.withTransaction as jest.Mock).mockImplementation(async (fn: (client: any) => Promise<any>) => {
      return (txnLock = txnLock.then(() => fn({ query: jest.fn(async () => ({ rows: [] })) })));
    });

    (deps.upsertAgenticRun as jest.Mock).mockImplementation(async () => {
      storedRun = makeRun({ Status: AGENTIC_RUN_STATUS_QUEUED });
    });
    (deps.getAgenticRun as jest.Mock).mockImplementation(async () => storedRun ?? null);

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
