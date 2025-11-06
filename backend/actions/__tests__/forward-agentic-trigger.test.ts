// import Database from 'better-sqlite3';

// process.env.DB_PATH = ':memory:';

// jest.mock('../../db', () => {
//   const original = jest.requireActual('../../db');
//   return {
//     ...original,
//     logAgenticRequestStart: jest.fn(),
//     logAgenticRequestEnd: jest.fn(),
//     saveAgenticRequestPayload: jest.fn(),
//     markAgenticRequestNotificationSuccess: jest.fn(),
//     markAgenticRequestNotificationFailure: jest.fn()
//   };
// });

// import { forwardAgenticTrigger } from '../agentic-trigger';
// import {
//   AGENTIC_RUN_STATUS_QUEUED,
//   AGENTIC_RUN_STATUS_RUNNING,
//   type AgenticModelInvocationResult
// } from '../../../models';
// import * as agenticDb from '../../db';

// const mockedDb = agenticDb as jest.Mocked<typeof agenticDb>;

// describe('forwardAgenticTrigger', () => {
//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   it('queues runs immediately and continues background invocation asynchronously', async () => {
//     const db = new Database(':memory:');
//     db.exec(`
//       CREATE TABLE agentic_runs (
//         ItemUUID TEXT PRIMARY KEY,
//         SearchQuery TEXT,
//         Status TEXT,
//         LastModified TEXT,
//         ReviewState TEXT,
//         ReviewedBy TEXT,
//         LastReviewDecision TEXT,
//         LastReviewNotes TEXT
//       );
//     `);

//     const upsertAgenticRun = db.prepare(`
//       INSERT INTO agentic_runs (
//         ItemUUID,
//         SearchQuery,
//         Status,
//         LastModified,
//         ReviewState,
//         ReviewedBy,
//         LastReviewDecision,
//         LastReviewNotes
//       )
//       VALUES (
//         @ItemUUID,
//         @SearchQuery,
//         @Status,
//         @LastModified,
//         @ReviewState,
//         @ReviewedBy,
//         @LastReviewDecision,
//         @LastReviewNotes
//       )
//       ON CONFLICT(ItemUUID) DO UPDATE SET
//         SearchQuery=excluded.SearchQuery,
//         Status=excluded.Status,
//         LastModified=excluded.LastModified,
//         ReviewState=excluded.ReviewState,
//         ReviewedBy=excluded.ReviewedBy,
//         LastReviewDecision=excluded.LastReviewDecision,
//         LastReviewNotes=excluded.LastReviewNotes
//     `);

//     const updateAgenticRunStatus = {
//       run: jest.fn(() => ({ changes: 1 }))
//     };

//     let resolveInvocation:
//       | ((value: AgenticModelInvocationResult | PromiseLike<AgenticModelInvocationResult>) => void)
//       | null = null;
//     const invokeModel = jest.fn(
//       () =>
//         new Promise<AgenticModelInvocationResult>((resolve) => {
//           resolveInvocation = resolve;
//         })
//     );

//     const logger = {
//       info: jest.fn(),
//       warn: jest.fn(),
//       error: jest.fn()
//     };

//     const deps = {
//       db,
//       getAgenticRun: db.prepare('SELECT * FROM agentic_runs WHERE ItemUUID = ?'),
//       upsertAgenticRun,
//       updateAgenticRunStatus: updateAgenticRunStatus as any,
//       logEvent: jest.fn(),
//       logger,
//       invokeModel
//     };

//     const triggerPromise = forwardAgenticTrigger(
//       {
//         itemId: 'item-async',
//         artikelbeschreibung: 'Async Artikel'
//       },
//       {
//         context: 'test-suite',
//         logger,
//         service: deps as any
//       }
//     );

//     const result = await triggerPromise;

//     expect(result.ok).toBe(true);
//     expect(result.status).toBe(202);
//     expect(invokeModel).not.toHaveBeenCalled();

//     const stored = deps.getAgenticRun.get('item-async') as any;
//     expect(stored.Status).toBe(AGENTIC_RUN_STATUS_QUEUED);

//     expect(mockedDb.logAgenticRequestEnd).toHaveBeenCalledWith(
//       expect.any(String),
//       AGENTIC_RUN_STATUS_QUEUED,
//       null
//     );

//     await new Promise((resolve) => setImmediate(resolve));

//     expect(invokeModel).toHaveBeenCalledWith(
//       expect.objectContaining({ itemId: 'item-async', searchQuery: 'Async Artikel' })
//     );
//     expect(updateAgenticRunStatus.run).toHaveBeenCalledWith(
//       expect.objectContaining({ ItemUUID: 'item-async', Status: AGENTIC_RUN_STATUS_RUNNING })
//     );
//     expect(mockedDb.logAgenticRequestEnd).toHaveBeenCalledWith(
//       expect.any(String),
//       AGENTIC_RUN_STATUS_RUNNING,
//       null
//     );

//     resolveInvocation?.({ ok: true });
//     await new Promise((resolve) => setImmediate(resolve));

//     db.close();
//   });
// });
