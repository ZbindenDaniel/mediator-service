import { jest } from '@jest/globals';
import { runExtractionAttempts, type ChatModel, type ExtractionLogger } from '../flow/item-flow-extraction';
import { resolveShopwareMatch, type ShopwareMatchOptions } from '../flow/item-flow-shopware';

describe('think tag parsing resilience', () => {
  const baseLogger: ExtractionLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  class StubChatModel implements ChatModel {
    private callIndex = 0;

    constructor(private readonly responses: Array<{ content: unknown }>) {}

    async invoke(): Promise<{ content: unknown }> {
      const response = this.responses[this.callIndex];
      if (!response) {
        throw new Error(`unexpected llm invocation at index ${this.callIndex}`);
      }
      this.callIndex += 1;
      return response;
    }
  }

  const extractionPayload = {
    Artikelbeschreibung: 'Example description',
    Marktpreis: 199,
    Kurzbeschreibung: 'Short text',
    Langtext: 'Long form text',
    Hersteller: 'Acme',
    Länge_mm: 10,
    Breite_mm: 20,
    Höhe_mm: 30,
    Gewicht_kg: 2.5,
    itemUUid: 'item-123'
  };

  const extractionOptions = {
    logger: baseLogger,
    itemId: 'item-123',
    maxAttempts: 1,
    maxAgentSearchesPerRequest: 1,
    searchContexts: [{ query: 'seed', text: 'context', sources: [] }],
    aggregatedSources: [],
    recordSources: jest.fn(),
    buildAggregatedSearchText: () => 'context',
    extractPrompt: 'extract',
    targetFormat: 'format',
    supervisorPrompt: 'supervisor',
    searchInvoker: jest.fn()
  } as const;

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('runExtractionAttempts parses output without think tag metadata', async () => {
    const llm = new StubChatModel([
      { content: JSON.stringify(extractionPayload) },
      { content: 'PASS: ok' }
    ]);

    const result = await runExtractionAttempts({
      ...extractionOptions,
      llm
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ Artikelbeschreibung: 'Example description', itemUUid: 'item-123' });
    expect(result.supervisor.toLowerCase().startsWith('pass')).toBe(true);
  });

  test('runExtractionAttempts parses output when think tag is malformed', async () => {
    const malformedResponse = `<think>analysis incomplete</think {"Artikelbeschreibung":"Example description","Marktpreis":199,"Kurzbeschreibung":"Short text","Langtext":"Long form text","Hersteller":"Acme","Länge_mm":10,"Breite_mm":20,"Höhe_mm":30,"Gewicht_kg":2.5,"itemUUid":"item-123"}`;
    const llm = new StubChatModel([
      { content: malformedResponse },
      { content: 'PASS: ok' }
    ]);

    const result = await runExtractionAttempts({
      ...extractionOptions,
      llm
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ Hersteller: 'Acme', itemUUid: 'item-123' });
  });

  const shopwareBaseOptions: Omit<ShopwareMatchOptions, 'llm'> = {
    logger: baseLogger,
    searchTerm: 'widget',
    targetFormat: 'json',
    shopwarePrompt: 'prompt',
    shopwareResult: {
      text: 'result',
      products: [
        { id: 'prod-1', url: 'https://example.com/product', name: 'Product 1' }
      ]
    },
    normalizedTarget: {
      itemUUid: 'item-123',
      Artikelbeschreibung: 'Existing item',
      Marktpreis: 150,
      Kurzbeschreibung: 'Short existing',
      Langtext: 'Existing long form',
      Hersteller: 'Acme',
      Länge_mm: 10,
      Breite_mm: 20,
      Höhe_mm: 30,
      Gewicht_kg: 2.5
    },
    itemId: 'item-123'
  };

  test('resolveShopwareMatch parses decision without think tag metadata', async () => {
    const decision = {
      isMatch: true,
      confidence: 0.9,
      matchedProductId: 'prod-1',
      target: { Artikelbeschreibung: 'Updated description', Marktpreis: 175 }
    };
    const llm: ChatModel = {
      async invoke() {
        return { content: JSON.stringify(decision) };
      }
    };

    const result = await resolveShopwareMatch({
      ...shopwareBaseOptions,
      llm
    });

    expect(result).not.toBeNull();
    expect(result?.finalData).toMatchObject({ Artikelbeschreibung: 'Updated description', Marktpreis: 175 });
  });

  test('resolveShopwareMatch parses decision when think tag is malformed', async () => {
    const decision = `<think>analysis incomplete</think {"isMatch":true,"confidence":0.75,"matchedProductId":"prod-1","target":{"Artikelbeschreibung":"Recovered","Marktpreis":160}}`;
    const llm: ChatModel = {
      async invoke() {
        return { content: decision };
      }
    };

    const result = await resolveShopwareMatch({
      ...shopwareBaseOptions,
      llm
    });

    expect(result).not.toBeNull();
    expect(result?.finalData).toMatchObject({ Artikelbeschreibung: 'Recovered', Marktpreis: 160 });
  });
});
