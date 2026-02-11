// import {
//   AGENTIC_RUN_STATUS_QUEUED,
//   type AgenticRun,
//   type AgenticRunStartInput
// } from '../../../models';
// import { startAgenticRun } from '../index';

// function createDeps(loggerOverrides: Partial<Console> = {}) {
//   const runByItem = new Map<string, AgenticRun>();
//   const upsertAgenticRun = {
//     run: jest.fn((payload: Record<string, unknown>) => {
//       const artikelNummer = String(payload.Artikel_Nummer ?? '');
//       runByItem.set(artikelNummer, {
//         Id: 1,
//         Artikel_Nummer: artikelNummer,
//         SearchQuery: String(payload.SearchQuery ?? ''),
//         Status: String(payload.Status ?? AGENTIC_RUN_STATUS_QUEUED),
//         LastModified: String(payload.LastModified ?? new Date(0).toISOString()),
//         ReviewState: String(payload.ReviewState ?? 'not_required'),
//         ReviewedBy: (payload.ReviewedBy as string | null | undefined) ?? null,
//         LastReviewDecision: (payload.LastReviewDecision as string | null | undefined) ?? null,
//         LastReviewNotes: (payload.LastReviewNotes as string | null | undefined) ?? null,
//         RetryCount: 0,
//         NextRetryAt: null,
//         LastError: null,
//         LastAttemptAt: null,
//         TranscriptUrl: null
//       });
//       return { changes: 1 };
//     })
//   };

//   const logger = {
//     info: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn(),
//     ...loggerOverrides
//   };

//   const deps = {
//     db: { prepare: jest.fn() } as any,
//     getAgenticRun: {
//       get: jest.fn((itemId: string) => runByItem.get(itemId))
//     } as any,
//     getItemReference: {
//       get: jest.fn(() => ({ Artikel_Nummer: 'R-200' }))
//     } as any,
//     upsertAgenticRun: upsertAgenticRun as any,
//     updateAgenticRunStatus: { run: jest.fn() } as any,
//     logEvent: jest.fn(),
//     logger
//   };

//   return { deps, logger, upsertAgenticRun };
// }

// // TODO(agentic-review-normalization-tests): Keep malformed payload coverage aligned with upstream review contract revisions.
// describe('agentic review metadata normalization', () => {
//   test('normalizes malformed review signal payloads safely', async () => {
//     const { deps, logger, upsertAgenticRun } = createDeps();

//     const input: AgenticRunStartInput = {
//       itemId: 'R-200',
//       searchQuery: 'sample query',
//       review: {
//         decision: ' Approve ',
//         information_present: 'yes',
//         missing_spec: [' width ', 'width', '', 'height '.repeat(20)],
//         bad_format: '0',
//         wrong_information: 1,
//         wrong_physical_dimensions: 'no',
//         notes: ' keep notes ',
//         reviewedBy: ' reviewer '
//       } as unknown as AgenticRunStartInput['review']
//     };

//     await startAgenticRun(input, deps as any);

//     expect(upsertAgenticRun.run).toHaveBeenCalledWith(
//       expect.objectContaining({
//         LastReviewDecision: 'approve',
//         LastReviewNotes: 'keep notes',
//         ReviewState: 'not_required'
//       })
//     );

//     const queuedPayload = upsertAgenticRun.run.mock.calls[0]?.[0] as Record<string, unknown>;
//     expect(queuedPayload).toEqual(
//       expect.objectContaining({
//         LastReviewDecision: 'approve',
//         LastReviewNotes: 'keep notes'
//       })
//     );

//     // // TODO (agent): fix this issue
//   //Property 'mock' does not exist on type 'Mock<any, any, any> | { (...data: any[]): void; (message?: any, ...optionalParams: any[]): void; }'.
//   // Property 'mock' does not exist on type '{ (...data: any[]): void; (message?: any, ...optionalParams: any[]): void; }'.
//     const normalizationLogCall = logger.info.mock.calls.find(
//       (call) => call[0] === '[agentic-service] Normalized review metadata'
//     );
//     expect(normalizationLogCall?.[1]).toEqual(
//       expect.objectContaining({
//         normalizedSignals: expect.objectContaining({
//           information_present: true,
//           bad_format: false,
//           wrong_information: true,
//           wrong_physical_dimensions: false,
//           missing_spec_count: 2
//         })
//       })
//     );
//   });

//   test('keeps backward compatibility for legacy review payloads', async () => {
//     const { deps, upsertAgenticRun } = createDeps();

//     await startAgenticRun(
//       {
//         itemId: 'R-200',
//         searchQuery: 'legacy query',
//         review: {
//           decision: 'reject',
//           notes: 'legacy notes',
//           reviewedBy: 'legacy-user'
//         } as AgenticRunStartInput['review']
//       },
//       deps as any
//     );

//     expect(upsertAgenticRun.run).toHaveBeenCalledWith(
//       expect.objectContaining({
//         LastReviewDecision: 'reject',
//         LastReviewNotes: 'legacy notes',
//         ReviewedBy: 'legacy-user'
//       })
//     );
//   });

//   test('catches normalization errors and logs sanitized metadata only', async () => {
//     const { deps, logger, upsertAgenticRun } = createDeps();

//     const reviewWithThrowingGetter = {
//       decision: 'approve',
//       notes: 'sensitive reviewer note',
//       reviewedBy: 'reviewer',
//       get missing_spec() {
//         throw new Error('boom');
//       }
//     };

//     await startAgenticRun(
//       {
//         itemId: 'R-200',
//         searchQuery: 'error path query',
//         review: reviewWithThrowingGetter as unknown as AgenticRunStartInput['review']
//       },
//       deps as any
//     );

//     expect(logger.warn).toHaveBeenCalledWith(
//       '[agentic-service] Failed to normalize review metadata',
//       expect.objectContaining({
//         provided: true,
//         reviewShape: expect.arrayContaining(['decision', 'missing_spec', 'notes', 'reviewedBy'])
//       })
//     );

//     expect(upsertAgenticRun.run).toHaveBeenCalledWith(
//       expect.objectContaining({
//         LastReviewDecision: null,
//         LastReviewNotes: null,
//         ReviewedBy: null
//       })
//     );
//   });
// });
