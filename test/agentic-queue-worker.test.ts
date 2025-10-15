// import { processQueuedAgenticRuns, computeRetryDelayMs } from '../backend/agentic-queue-worker';
// import * as db from '../backend/db';
// import type { AgenticRunQueueUpdate } from '../backend/db';
// import * as agenticTrigger from '../backend/actions/agentic-trigger';
// import type { AgenticRun } from '../models';

// describe('agentic queue worker', () => {
//   test('retries failed dispatches with backoff and forwards after recovery', async () => {
//     const initialRun: AgenticRun = {
//       Id: 1,
//       ItemUUID: 'I-AGENTIC-001',
//       SearchQuery: 'Queued Artikel',
//       Status: 'queued',
//       LastModified: '2024-01-01T00:00:00.000Z',
//       ReviewState: 'not_required',
//       ReviewedBy: null,
//       RetryCount: 0,
//       NextRetryAt: null,
//       LastError: null,
//       LastAttemptAt: null
//     };

//     const queuedRuns: AgenticRun[][] = [[initialRun], [], []];
//     let fetchCall = 0;
//     const fetchSpy = jest.spyOn(db as any, 'fetchQueuedAgenticRuns');
//     fetchSpy.mockImplementation((limit?: number) => {
//       void limit;
//       const index = Math.min(fetchCall, queuedRuns.length - 1);
//       fetchCall += 1;
//       return queuedRuns[index];
//     });

//     const updates: AgenticRunQueueUpdate[] = [];
//     const updateSpy = jest.spyOn(db as any, 'updateQueuedAgenticRunQueueState');
//     updateSpy.mockImplementation((payload: AgenticRunQueueUpdate) => {
//       updates.push({ ...payload });
//     });

//     const logger = {
//       info: jest.fn(),
//       warn: jest.fn(),
//       error: jest.fn()
//     };

//     let triggerCalls = 0;
//     const triggerSpy = jest.spyOn(agenticTrigger as any, 'forwardAgenticTrigger');
//     triggerSpy.mockImplementation(async () => {
//       triggerCalls += 1;
//       if (triggerCalls === 1) {
//         return { ok: false, status: 503, body: { error: 'unavailable' } };
//       }
//       return { ok: true, status: 202 };
//     });

//     const attemptTimes = [
//       new Date('2024-01-01T00:00:00.000Z'),
//       new Date('2024-01-01T00:10:00.000Z'),
//       new Date('2024-01-01T00:20:00.000Z')
//     ];
//     let nowIndex = 0;
//     const nowFn = () => {
//       const value = attemptTimes[Math.min(nowIndex, attemptTimes.length - 1)];
//       nowIndex += 1;
//       return new Date(value.getTime());
//     };

//     try {
//       await processQueuedAgenticRuns({
//         agenticApiBase: 'http://agentic.test',
//         logger,
//         now: nowFn
//       });

//       expect(triggerSpy).toHaveBeenCalled();
//       expect(updates.length).toBe(1);
//       const failureUpdate = updates[0];
//       expect(failureUpdate.Status).toBe('queued');
//       expect(failureUpdate.RetryCount).toBe(1);
//       const expectedNextRetry = new Date(
//         attemptTimes[0].getTime() + computeRetryDelayMs(1)
//       ).toISOString();
//       expect(failureUpdate.NextRetryAt).toBe(expectedNextRetry);
//       expect(typeof failureUpdate.LastError).toBe('string');
//       expect(logger.error.mock.calls.length).toBeGreaterThan(0);

//       updates.length = 0;
//       queuedRuns[1] = [
//         {
//           ...initialRun,
//           RetryCount: failureUpdate.RetryCount,
//           NextRetryAt: new Date(attemptTimes[1].getTime() - 1000).toISOString(),
//           LastError: failureUpdate.LastError,
//           LastAttemptAt: failureUpdate.LastAttemptAt
//         }
//       ];

//       await processQueuedAgenticRuns({
//         agenticApiBase: 'http://agentic.test',
//         logger,
//         now: nowFn
//       });

//       expect(triggerSpy).toHaveBeenCalledTimes(2);
//       expect(updates.length).toBe(1);
//       const successUpdate = updates[0];
//       expect(successUpdate.Status).toBe('running');
//       expect(successUpdate.RetryCount).toBe(0);
//       expect(successUpdate.NextRetryAt).toBeNull();
//       expect(successUpdate.LastError).toBeNull();
//       expect(logger.info.mock.calls.length).toBeGreaterThan(0);
//     } finally {
//       fetchSpy.mockRestore();
//       updateSpy.mockRestore();
//       triggerSpy.mockRestore();
//     }
//   });
// });
