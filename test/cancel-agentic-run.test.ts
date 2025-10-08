// import { cancelAgenticRun } from '../frontend/src/lib/agentic';

// describe('cancelAgenticRun helper', () => {
//   const originalFetch = global.fetch;
//   let errorSpy: jest.SpyInstance;
//   let warnSpy: jest.SpyInstance;

//   beforeEach(() => {
//     jest.resetAllMocks();
//     errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
//     warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
//   });

//   afterEach(() => {
//     if (errorSpy) {
//       errorSpy.mockRestore();
//     }
//     if (warnSpy) {
//       warnSpy.mockRestore();
//     }
//     global.fetch = originalFetch;
//   });

//   it('posts a flattened payload with the trimmed identifiers', async () => {
//     const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
//     // @ts-expect-error override fetch for testing
//     global.fetch = fetchMock;

//     await cancelAgenticRun({
//       cancelUrl: 'https://agentic.example/run/cancel',
//       itemId: '  abc-123  ',
//       actor: '  tester  ',
//       context: 'unit test payload'
//     });

//     expect(fetchMock).toHaveBeenCalledTimes(1);
//     const [url, options] = fetchMock.mock.calls[0];
//     expect(url).toBe('https://agentic.example/run/cancel');
//     expect(options?.method).toBe('POST');
//     expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
//     const body = JSON.parse(String(options?.body ?? '{}'));
//     expect(body).toEqual({
//       itemUUid: 'abc-123',
//       actor: 'tester'
//     });
//   });

//   it('throws with parsed error details when the agentic service responds with an error', async () => {
//     const jsonPayload = { error: 'kaputt' };
//     const response = {
//       ok: false,
//       status: 502,
//       clone: () => ({
//         json: async () => jsonPayload
//       })
//     } as const;
//     const fetchMock = jest.fn().mockResolvedValue(response);
//     // @ts-expect-error override fetch for testing
//     global.fetch = fetchMock;

//     await expect(
//       cancelAgenticRun({
//         cancelUrl: 'https://agentic.example/run/cancel',
//         itemId: 'item-err',
//         actor: 'tester',
//         context: 'unit test error'
//       })
//     ).rejects.toThrow('Agentic cancel failed during unit test error');

//     expect(fetchMock).toHaveBeenCalledTimes(1);
//     expect(errorSpy).toHaveBeenCalledWith(
//       'Agentic cancel failed during unit test error',
//       502,
//       jsonPayload
//     );
//     expect(warnSpy).not.toHaveBeenCalled();
//   });
// });
