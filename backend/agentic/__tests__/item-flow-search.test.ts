// import { collectSearchContexts, type SearchInvoker } from '../flow/item-flow-search';
// import type { SearchResult } from '../tools/tavily-client';

// describe('collectSearchContexts', () => {
//   it('accepts partial logger implementations', async () => {
//     const info = jest.fn();
//     const searchInvoker: SearchInvoker = jest.fn(async (query: string): Promise<SearchResult> => ({
//       text: `result for ${query}`,
//       sources: [
//         {
//           title: 'Example source',
//           url: 'https://example.com',
//           description: 'Description',
//           content: 'Content'
//         }
//       ]
//     }));

//     const result = await collectSearchContexts({
//       searchTerm: 'Widget',
//       searchInvoker,
//       logger: { info },
//       itemId: 'item-123'
//     });

//     expect(searchInvoker).toHaveBeenCalledWith(
//       expect.stringContaining('Widget'),
//       10,
//       expect.objectContaining({ context: 'primary' })
//     );
//     expect(result.searchContexts).toHaveLength(1);
//     expect(result.aggregatedSources).toHaveLength(1);
//     expect(info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'search start' }));
//   });

//   it('uses enriched item metadata to diversify search queries', async () => {
//     const calls: string[] = [];
//     const searchInvoker: SearchInvoker = jest.fn(async (query: string, _limit: number, metadata): Promise<SearchResult> => {
//       calls.push(query);
//       return {
//         text: `result for ${query}`,
//         sources: [
//           {
//             title: `Source for ${metadata?.context ?? 'unknown'}`,
//             url: `https://example.com/${metadata?.context ?? 'unknown'}`,
//             description: `Content for ${query}`
//           }
//         ]
//       };
//     });

//     const target = {
//       itemUUid: 'item-456',
//       Artikelbeschreibung: 'Widget Deluxe',
//       Marktpreis: 199.99,
//       Kurzbeschreibung: 'Premium widget for labs',
//       Langtext: 'Extended description',
//       Hersteller: 'Acme Industries',
//       'Länge_mm': 10,
//       Breite_mm: 20,
//       'Höhe_mm': 30,
//       Gewicht_kg: 2,
//       __locked: ['Artikelnummer'],
//       Artikelnummer: 'AC-123'
//     } as unknown as Record<string, unknown>;

//     const result = await collectSearchContexts({
//       searchTerm: 'Widget Deluxe',
//       searchInvoker,
//       logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
//       itemId: 'item-456',
//       target
//     });

//     expect(searchInvoker).toHaveBeenCalledTimes(4);
//     expect(calls).toEqual([
//       'Gerätedaten Widget Deluxe',
//       'Gerätedaten Acme Industries Widget Deluxe',
//       'Gerätedaten Premium widget for labs Acme Industries',
//       'Gerätedaten Widget Deluxe Artikelnummer:AC-123'
//     ]);
//     expect(result.searchContexts).toHaveLength(4);
//     expect(result.aggregatedSources).toHaveLength(4);
//   });

//   it('parses serialized target json before generating search queries', async () => {
//     const searchInvoker: SearchInvoker = jest.fn(async (_query: string, _limit: number, metadata): Promise<SearchResult> => ({
//       text: `result for ${metadata?.context ?? 'unknown'}`,
//       sources: [
//         {
//           title: 'Example source',
//           url: 'https://example.com/source',
//           description: 'Description'
//         }
//       ]
//     }));

//     const targetJson = JSON.stringify({
//       itemUUid: 'item-789',
//       Artikelbeschreibung: 'Sensor Basic',
//       Marktpreis: 89.99,
//       Kurzbeschreibung: '',
//       Langtext: '',
//       Hersteller: 'Beta GmbH',
//       'Länge_mm': 12,
//       Breite_mm: 8,
//       'Höhe_mm': 4,
//       Gewicht_kg: 1.2,
//       __locked: ['SKU'],
//       SKU: 'SKU-001'
//     });

//     const result = await collectSearchContexts({
//       searchTerm: 'Sensor Basic',
//       searchInvoker,
//       logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
//       itemId: 'item-789',
//       target: targetJson
//     });

//     expect(searchInvoker).toHaveBeenCalledTimes(3);
//     const contexts = searchInvoker.mock.calls.map(([, , metadata]) => metadata?.context);
//     expect(contexts).toEqual(['primary', 'manufacturer_enriched', 'locked_fields_enriched']);
//     expect(result.searchContexts).toHaveLength(3);
//   });
// });
