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
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockResolvedValue([makeRun()]);

    const result = await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(result).toEqual({ scheduled: 0, skipped: 0, failed: 0 });
    expect(fetchQueuedSpy).not.toHaveBeenCalled();
  });

  it('limits queued fetch to 1 available slot when 2 runs are already running', async () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 2 = 1
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 2 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(1);
  });

  it('limits queued fetch to all 3 available slots when nothing is running', async () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3 - 0 = 3; limit = 5 → min(5, 3) = 3
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 0 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockResolvedValue([]);
    // idle-fill runs when scheduled=0 and remainingSlots = 3-0-0-1 = 2 > 0
    jest.spyOn(agenticDb, 'fetchIdleFillAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 5 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(3);
  });

  it('limits queued fetch to effective limit when limit is less than available slots', async () => {
    // MAX_CONCURRENT_RUNNING_RUNS = 3; availableSlots = 3; limit = 2 → min(2, 3) = 2
    const deps = createDeps();
    (dbClientMod.queryOne as jest.Mock).mockResolvedValueOnce({ runningcount: 0 });
    const fetchQueuedSpy = jest.spyOn(agenticDb, 'fetchQueuedAgenticRuns').mockResolvedValue([]);
    // idle-fill also called when scheduled=0 and remainingSlots > 0
    jest.spyOn(agenticDb, 'fetchIdleFillAgenticRuns').mockResolvedValue([]);

    await dispatchQueuedAgenticRuns(deps, { limit: 2 });

    expect(fetchQueuedSpy).toHaveBeenCalledWith(2);
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
