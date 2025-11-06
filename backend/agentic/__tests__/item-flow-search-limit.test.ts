// import { jest } from '@jest/globals';
// import { collectSearchContexts } from '../flow/item-flow-search';

// describe('collectSearchContexts search plan limiting', () => {
//   test('limits search invocations to the configured maximum', async () => {
//     const searchInvoker = jest.fn().mockResolvedValue({ text: 'result', sources: [] });
//     const logger = {
//       info: jest.fn(),
//       warn: jest.fn(),
//       error: jest.fn()
//     };

//     const target = {
//       Hersteller: 'Acme',
//       Kurzbeschreibung: 'Widget 3000',
//       Artikelbeschreibung: 'Detailed info about the widget',
//       __locked: ['Artikelbeschreibung']
//     };

//     const result = await collectSearchContexts({
//       searchTerm: 'Widget 3000',
//       searchInvoker,
//       logger,
//       itemId: 'item-123',
//       target
//     });

//     expect(searchInvoker).toHaveBeenCalledTimes(3);
//     expect(result.searchContexts).toHaveLength(3);
//     expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
//       msg: 'search plan limit applied',
//       itemId: 'item-123',
//       limit: 3
//     }));
//     expect(logger.error).not.toHaveBeenCalled();
//   });
// });
