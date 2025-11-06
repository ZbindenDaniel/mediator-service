// import { triggerAgenticRun } from '../frontend/src/lib/agentic';

// describe('triggerAgenticRun failure reasons', () => {
//   const payload = { itemId: 'item-123', artikelbeschreibung: 'Artikel' };

//   it('includes backend failure reason in the returned message when available', async () => {
//     const jsonMock = jest.fn().mockResolvedValue({ reason: 'missing-search-query' });
//     const response = {
//       ok: false,
//       status: 409,
//       clone: jest.fn().mockReturnValue({ json: jsonMock, text: jest.fn() }),
//       json: jsonMock,
//       text: jest.fn()
//     };
//     const fetchImpl = jest.fn().mockResolvedValue(response);

//     const result = await triggerAgenticRun({ payload, context: 'test', fetchImpl });

//     expect(fetchImpl).toHaveBeenCalledTimes(1);
//     expect(result.outcome).toBe('failed');
//     expect(result.reason).toBe('response-not-ok');
//     expect(result.message).toContain('Grund: Suchbegriff fehlt');
//     expect(jsonMock).toHaveBeenCalledTimes(1);
//   });

//   it('annotates network errors with a readable reason', async () => {
//     const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));

//     const result = await triggerAgenticRun({ payload, context: 'network-test', fetchImpl });

//     expect(fetchImpl).toHaveBeenCalledTimes(1);
//     expect(result.outcome).toBe('failed');
//     expect(result.reason).toBe('network-error');
//     expect(result.message).toContain('Grund: Netzwerkfehler');
//   });
// });
