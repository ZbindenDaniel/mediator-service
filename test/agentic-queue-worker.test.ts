import { processQueuedAgenticRuns, computeRetryDelayMs } from '../backend/agentic-queue-worker';
import * as dbModule from '../backend/db';
import * as agenticTrigger from '../backend/actions/agentic-trigger';
import type { AgenticRun } from '../models';

describe('agentic queue worker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('retries failed dispatches with backoff and transitions to running after recovery', async () => {
    const initialRun: AgenticRun = {
      Id: 1,
      ItemUUID: 'I-AGENTIC-001',
      SearchQuery: 'Queued Artikel',
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

    const queuedRuns: AgenticRun[][] = [[initialRun], [], []];
    let fetchCall = 0;
    const fetchSpy = jest.spyOn(dbModule, 'fetchQueuedAgenticRuns').mockImplementation(() => {
      const index = Math.min(fetchCall, queuedRuns.length - 1);
      fetchCall += 1;
      return queuedRuns[index];
    });

    const updates: dbModule.AgenticRunQueueUpdate[] = [];
    const updateSpy = jest
      .spyOn(dbModule, 'updateQueuedAgenticRunQueueState')
      .mockImplementation((payload: dbModule.AgenticRunQueueUpdate) => {
        updates.push({ ...payload });
      });

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    let triggerCalls = 0;
    const forwardSpy = jest.spyOn(agenticTrigger, 'forwardAgenticTrigger').mockImplementation(async () => {
      triggerCalls += 1;
      if (triggerCalls === 1) {
        return { ok: false, status: 503, body: { error: 'unavailable' }, rawBody: null };
      }
      return { ok: true, status: 202, body: null, rawBody: null };
    });

    const attemptTimes = [
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2024-01-01T00:10:00.000Z'),
      new Date('2024-01-01T00:20:00.000Z')
    ];
    let nowIndex = 0;
    const now = () => {
      const value = attemptTimes[Math.min(nowIndex, attemptTimes.length - 1)];
      nowIndex += 1;
      return new Date(value.getTime());
    };

    try {
      await processQueuedAgenticRuns({
        logger,
        now,
        service: {} as any
      });

      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(updates).toHaveLength(1);

      const failureUpdate = updates[0];
      expect(failureUpdate.Status).toBe('queued');
      expect(failureUpdate.RetryCount).toBe(1);
      const expectedNextRetry = new Date(attemptTimes[0].getTime() + computeRetryDelayMs(1)).toISOString();
      expect(failureUpdate.NextRetryAt).toBe(expectedNextRetry);
      expect(failureUpdate.LastError).toContain('unavailable');
      expect(logger.error).toHaveBeenCalledWith(
        '[agentic-worker] Failed to forward agentic run',
        expect.objectContaining({ itemId: 'I-AGENTIC-001' })
      );

      updates.length = 0;
      queuedRuns[1] = [
        {
          ...initialRun,
          RetryCount: failureUpdate.RetryCount,
          NextRetryAt: new Date(attemptTimes[1].getTime() - 1000).toISOString(),
          LastError: failureUpdate.LastError,
          LastAttemptAt: failureUpdate.LastAttemptAt
        }
      ];

      await processQueuedAgenticRuns({
        logger,
        now,
        service: {} as any
      });

      expect(forwardSpy).toHaveBeenCalledTimes(2);
      expect(updates).toHaveLength(1);

      const successUpdate = updates[0];
      expect(successUpdate.Status).toBe('running');
      expect(successUpdate.RetryCount).toBe(0);
      expect(successUpdate.NextRetryAt).toBeNull();
      expect(successUpdate.LastError).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        '[agentic-worker] Forwarded queued agentic run',
        expect.objectContaining({ itemId: 'I-AGENTIC-001' })
      );
    } finally {
      fetchSpy.mockRestore();
      updateSpy.mockRestore();
      forwardSpy.mockRestore();
    }
  });

  test('records retry metadata when trigger forwarding throws', async () => {
    const run: AgenticRun = {
      Id: 2,
      ItemUUID: 'I-AGENTIC-002',
      SearchQuery: 'Retry Artikel',
      Status: 'queued',
      LastModified: '2024-02-01T00:00:00.000Z',
      ReviewState: 'not_required',
      ReviewedBy: null,
      LastReviewDecision: null,
      LastReviewNotes: null,
      RetryCount: 2,
      NextRetryAt: null,
      LastError: null,
      LastAttemptAt: null
    };

    const fetchSpy = jest.spyOn(dbModule, 'fetchQueuedAgenticRuns').mockReturnValue([run]);
    const updates: dbModule.AgenticRunQueueUpdate[] = [];
    const updateSpy = jest
      .spyOn(dbModule, 'updateQueuedAgenticRunQueueState')
      .mockImplementation((payload: dbModule.AgenticRunQueueUpdate) => {
        updates.push({ ...payload });
      });

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const forwardSpy = jest
      .spyOn(agenticTrigger, 'forwardAgenticTrigger')
      .mockRejectedValue(new Error('Trigger network failure'));

    const attemptTime = new Date('2024-02-01T05:00:00.000Z');

    try {
      await processQueuedAgenticRuns({
        logger,
        now: () => new Date(attemptTime.getTime()),
        service: {} as any
      });

      expect(forwardSpy).toHaveBeenCalledTimes(1);
      expect(updates).toHaveLength(1);

      const retryUpdate = updates[0];
      expect(retryUpdate.Status).toBe('queued');
      expect(retryUpdate.RetryCount).toBe(run.RetryCount + 1);
      expect(retryUpdate.LastError).toBe('Trigger network failure');
      const expectedNextRetry = new Date(attemptTime.getTime() + computeRetryDelayMs(run.RetryCount + 1)).toISOString();
      expect(retryUpdate.NextRetryAt).toBe(expectedNextRetry);
      expect(logger.error).toHaveBeenCalledWith(
        '[agentic-worker] Failed to forward agentic run',
        expect.objectContaining({ itemId: 'I-AGENTIC-002' })
      );
    } finally {
      fetchSpy.mockRestore();
      updateSpy.mockRestore();
      forwardSpy.mockRestore();
    }
  });
});
