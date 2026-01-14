// import { jest } from '@jest/globals';
// import type { AgenticResultPayload } from '../result-handler';
// import type { ChatModel } from '../flow/item-flow-extraction';
// import type { ShopwareMatchOptions, ShopwareMatchResult } from '../flow/item-flow-shopware';
// import type { SearchInvoker } from '../flow/item-flow-search';
// import type { SearchResult } from '../tools/tavily-client';

// const createMockLlm = (): ChatModel => {
//   const invoke: ChatModel['invoke'] = jest.fn().mockResolvedValue({ content: null });
//   return { invoke };
// };

// const createSearchInvokerMock = () => {
//   const searchInvoker: jest.MockedFunction<SearchInvoker> = jest.fn(async () => ({
//     text: 'mock search results',
//     sources: [] as SearchResult['sources']
//   }));
//   return searchInvoker;
// };

// const buildShopwareMatch = (overrides: Partial<ShopwareMatchResult> = {}): ShopwareMatchResult => ({
//   finalData: {
//     itemUUid: 'item-123',
//     Artikelbeschreibung: 'Example item',
//     Verkaufspreis: null,
//     Kurzbeschreibung: 'Kurzbeschreibung',
//     Langtext: 'Langtext',
//     Hersteller: 'Hersteller',
//     Länge_mm: null,
//     Breite_mm: null,
//     Höhe_mm: null,
//     Gewicht_kg: null,
//     ...(overrides.finalData ?? {})
//   },
//   sources: overrides.sources ?? [],
//   summary: overrides.summary ?? 'Shopware match',
//   reviewNotes: overrides.reviewNotes ?? 'Shopware review notes',
//   reviewedBy: overrides.reviewedBy ?? 'shopware-agent'
// });

// describe('runItemFlow result dispatch', () => {
//   beforeEach(() => {
//     jest.resetModules();
//   });

//   test('dispatches agentic result via the provided handler', async () => {
//     const runs = new Map<string, string>([['item-123', 'queued']]);
//     const applyAgenticResult: jest.MockedFunction<(payload: AgenticResultPayload) => void> = jest.fn((payload) => {
//       runs.set(payload.itemId, payload.status);
//     });
//     const markNotificationSuccess: jest.MockedFunction<(itemId: string) => void> = jest.fn();
//     const markNotificationFailure: jest.MockedFunction<(itemId: string, reason: string) => void> = jest.fn();
//     const saveRequestPayload: jest.MockedFunction<(itemId: string, payload: unknown) => void> = jest.fn();
//     const searchInvoker = createSearchInvokerMock();
//     const llm = createMockLlm();

//     await (jest as any).isolateModulesAsync(async () => {
//       jest.doMock('../config', () => ({
//         agentActorId: 'test-agent'
//       }));
//       const resolveShopwareMatch: jest.MockedFunction<
//         (options: ShopwareMatchOptions) => Promise<ShopwareMatchResult | null>
//       > = jest.fn(async () => buildShopwareMatch());
//       jest.doMock('../flow/item-flow-shopware', () => ({ resolveShopwareMatch }));

//       const { runItemFlow } = await import('../flow/item-flow');

//       const payload = await runItemFlow(
//         {
//           target: { itemUUid: 'item-123', Artikelbeschreibung: 'Example item' },
//           id: 'item-123',
//           search: 'Example item'
//         },
//         {
//           llm,
//           logger: console,
//           searchInvoker,
//           applyAgenticResult: (result) => applyAgenticResult(result),
//           saveRequestPayload,
//           markNotificationSuccess,
//           markNotificationFailure
//         }
//       );

//       expect(payload.status).toBe('completed');
//       expect(applyAgenticResult).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-123' }));
//       expect(runs.get('item-123')).toBe('completed');
//       expect(saveRequestPayload).toHaveBeenCalledWith('item-123', expect.any(Object));
//       expect(markNotificationSuccess).toHaveBeenCalledWith('item-123');
//       expect(markNotificationFailure).not.toHaveBeenCalled();
//     });
//   });

//   test('records notification failure when handler rejects', async () => {
//     const applyAgenticResult: jest.MockedFunction<
//       (payload: AgenticResultPayload) => Promise<void>
//     > = jest.fn(async () => {
//       throw new Error('dispatch failed');
//     });
//     const markNotificationSuccess: jest.MockedFunction<(itemId: string) => void> = jest.fn();
//     const markNotificationFailure: jest.MockedFunction<(itemId: string, reason: string) => void> = jest.fn();
//     const saveRequestPayload: jest.MockedFunction<(itemId: string, payload: unknown) => void> = jest.fn();
//     const searchInvoker = createSearchInvokerMock();
//     const llm = createMockLlm();

//     await (jest as any).isolateModulesAsync(async () => {
//       jest.doMock('../config', () => ({
//         agentActorId: 'test-agent'
//       }));
//       const resolveShopwareMatch: jest.MockedFunction<
//         (options: ShopwareMatchOptions) => Promise<ShopwareMatchResult | null>
//       > = jest.fn(async () =>
//         buildShopwareMatch({
//           finalData: {
//             itemUUid: 'item-xyz',
//             Artikelbeschreibung: 'Example item'
//           }
//         })
//       );
//       jest.doMock('../flow/item-flow-shopware', () => ({ resolveShopwareMatch }));

//       const { runItemFlow } = await import('../flow/item-flow');

//       await expect(
//         runItemFlow(
//           {
//             target: { itemUUid: 'item-xyz', Artikelbeschreibung: 'Example item' },
//             id: 'item-xyz',
//             search: 'Example item'
//           },
//           {
//             llm,
//             logger: console,
//             searchInvoker,
//             applyAgenticResult,
//             saveRequestPayload,
//             markNotificationSuccess,
//             markNotificationFailure
//           }
//         )
//       ).rejects.toThrow('dispatch failed');

//       expect(markNotificationSuccess).not.toHaveBeenCalled();
//       expect(markNotificationFailure).toHaveBeenCalledWith('item-xyz', 'dispatch failed');
//     });
//   });
// });
