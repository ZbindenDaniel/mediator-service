// import { jest } from '@jest/globals';
// import { runExtractionAttempts, type ChatModel, type ExtractionLogger } from '../flow/item-flow-extraction';

// describe('runExtractionAttempts supervisor normalization', () => {
//   const baseLogger: ExtractionLogger = {
//     debug: jest.fn(),
//     info: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
//   };

//   class StubChatModel implements ChatModel {
//     private callIndex = 0;

//     constructor(private readonly responses: Array<{ content: unknown }>) {}

//     async invoke(): Promise<{ content: unknown }> {
//       const response = this.responses[this.callIndex];
//       if (!response) {
//         throw new Error(`unexpected llm invocation at index ${this.callIndex}`);
//       }
//       this.callIndex += 1;
//       return response;
//     }
//   }

//   afterEach(() => {
//     jest.clearAllMocks();
//   });

//   test('treats quoted PASS supervisor response as success', async () => {
//     const extractionPayload = {
//       Artikelbeschreibung: 'Widget 3000',
//       Verkaufspreis: 199,
//       Kurzbeschreibung: 'Compact widget',
//       Langtext: 'A compact widget suitable for small spaces.',
//       Hersteller: 'Acme',
//       Länge_mm: 10,
//       Breite_mm: 20,
//       Höhe_mm: 30,
//       Gewicht_kg: 2.5,
//       itemUUid: 'item-quoted-pass'
//     };

//     const llm = new StubChatModel([
//       { content: JSON.stringify(extractionPayload) },
//       { content: '"PASS"' }
//     ]);

//     const result = await runExtractionAttempts({
//       llm,
//       logger: baseLogger,
//       itemId: 'item-quoted-pass',
//       maxAttempts: 2,
//       maxAgentSearchesPerRequest: 1,
//       searchContexts: [{ query: 'seed', text: 'context', sources: [] }],
//       aggregatedSources: [],
//       recordSources: jest.fn(),
//       buildAggregatedSearchText: () => 'context',
//       extractPrompt: 'extract',
//       targetFormat: 'format',
//       supervisorPrompt: 'supervisor',
//       searchInvoker: jest.fn(),
//       target: {
//         Artikelbeschreibung: '',
//         Verkaufspreis: null,
//         Kurzbeschreibung: '',
//         Langtext: '',
//         Hersteller: '',
//         Länge_mm: null,
//         Breite_mm: null,
//         Höhe_mm: null,
//         Gewicht_kg: null,
//         itemUUid: 'item-quoted-pass'
//       }
//     });

//     expect(result.success).toBe(true);
//     expect(result.supervisor).toBe('PASS');
//   });
// });
