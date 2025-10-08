// import type { AgenticRun } from '../models';
// import { cancelAgenticRun } from '../frontend/src/lib/agentic';
// import { performItemDetailAgenticCancel } from '../frontend/src/components/ItemDetail';

// describe('ItemDetail agentic cancellation workflow', () => {
//   const originalFetch = global.fetch;
//   let consoleErrorSpy: jest.SpyInstance;

//   beforeEach(() => {
//     jest.resetAllMocks();
//     consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
//   });

//   afterEach(() => {
//     if (consoleErrorSpy) {
//       consoleErrorSpy.mockRestore();
//     }
//     global.fetch = originalFetch;
//   });

//   function createAgenticRun(overrides: Partial<AgenticRun> = {}): AgenticRun {
//     return {
//       ItemUUID: 'agentic-123',
//       Status: 'running',
//       SearchQuery: 'Testsuche',
//       LastModified: new Date().toISOString(),
//       ReviewState: 'not_required',
//       ReviewedBy: null,
//       ...overrides
//     };
//   }

//   it('propagates external cancellation failures while preserving persistence results', async () => {
//     const agenticRun = createAgenticRun();
//     const persistenceMock = jest.fn().mockResolvedValue({
//       ok: true,
//       status: 200,
//       agentic: agenticRun
//     });

//     const jsonPayload = { message: 'kaputt' };
//     const response = {
//       ok: false,
//       status: 500,
//       clone: () => ({
//         json: async () => jsonPayload
//       })
//     } as const;

//     const fetchMock = jest.fn().mockResolvedValue(response);
//     // @ts-expect-error override fetch for testing
//     global.fetch = fetchMock;

//     const loggerMock = {
//       warn: jest.fn(),
//       error: jest.fn()
//     } as const;

//     const result = await performItemDetailAgenticCancel({
//       agentic: agenticRun,
//       actor: 'tester',
//       agenticCancelUrl: 'https://agentic.example/run/cancel',
//       persistCancellation: persistenceMock,
//       cancelExternalRun: cancelAgenticRun,
//       logger: loggerMock
//     });

//     expect(persistenceMock).toHaveBeenCalledWith({
//       itemId: 'agentic-123',
//       actor: 'tester',
//       context: 'item detail cancel persistence'
//     });
//     expect(fetchMock).toHaveBeenCalledTimes(1);
//     const [, requestInit] = fetchMock.mock.calls[0];
//     const payload = JSON.parse(String(requestInit?.body ?? '{}'));
//     expect(payload).toEqual({ itemUUid: 'agentic-123', actor: 'tester' });

//     expect(loggerMock.error).toHaveBeenCalledWith(
//       'Agentic external cancel failed',
//       expect.any(Error)
//     );
//     expect(loggerMock.warn).not.toHaveBeenCalled();
//     expect(consoleErrorSpy).toHaveBeenCalledWith(
//       'Agentic cancel failed during item detail cancel',
//       500,
//       jsonPayload
//     );
//     expect(result).toEqual({
//       updatedRun: agenticRun,
//       error: 'Agentic-Abbruch konnte extern nicht gestoppt werden.'
//     });
//   });
// });
