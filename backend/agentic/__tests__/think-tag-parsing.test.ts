jest.mock('../../db', () => ({
  getItemReference: jest.fn(async () => null),
  listRecentAgenticRunReviewHistoryBySubcategory: jest.fn(async () => []),
}));

jest.mock('../flow/item-flow-categorizer', () => ({
  runCategorizerStage: jest.fn(async () => ({}))
}));

jest.mock('../flow/item-flow-pricing', () => ({
  isUsablePrice: jest.fn(() => true),
  runPricingStage: jest.fn(async () => ({}))
}));

jest.mock('../review-automation-signals', () => ({
  loadSubcategoryReviewAutomationSignals: jest.fn(() => ({
    sampleSize: 0,
    sampleTarget: 10,
    lowConfidence: true,
    badFormatTrueCount: 0,
    badFormatTruePct: 0,
    wrongInformationTrueCount: 0,
    wrongInformationTruePct: 0,
    wrongPhysicalDimensionsTrueCount: 0,
    wrongPhysicalDimensionsTruePct: 0,
    informationPresentFalseCount: 0,
    informationPresentFalsePct: 0,
    missingSpecTopKeys: [],
    bad_format_trigger: false,
    wrong_information_trigger: false,
    wrong_physical_dimensions_trigger: false,
    missing_spec_trigger: false,
    information_present_low_trigger: false
  }))
}));

import type { ChatModel } from '../flow/item-flow-extraction';
import type { AgenticTarget } from '../flow/item-flow-schemas';
import { runExtractionAttempts } from '../flow/item-flow-extraction';
import { resolveShopwareMatch } from '../flow/item-flow-shopware';

const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: 'item-123',
  Artikelbeschreibung: 'Example description',
  Verkaufspreis: 199,
  Kurzbeschreibung: 'Short text',
  Langtext: '',
  Hersteller: 'Acme',
  Länge_mm: 10,
  Breite_mm: 20,
  Höhe_mm: 30,
  Gewicht_kg: 2.5
});

// Full extraction JSON matching AgentOutputSchema required fields
const VALID_EXTRACTION = JSON.stringify({
  Artikel_Nummer: 'item-123',
  Artikelbeschreibung: 'Example description',
  Verkaufspreis: 199,
  Kurzbeschreibung: 'Short text',
  Langtext: '',
  Hersteller: 'Acme',
  Länge_mm: 10,
  Breite_mm: 20,
  Höhe_mm: 30,
  Gewicht_kg: 2.5
});

const baseExtractionOptions = {
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  itemId: 'item-123',
  maxAttempts: 1,
  searchContexts: [{ query: 'seed', text: 'context', sources: [] }],
  aggregatedSources: [],
  recordSources: jest.fn(),
  buildAggregatedSearchText: () => 'context',
  extractPrompt: 'extract',
  correctionPrompt: 'repair json',
  targetFormat: 'format',
  supervisorPrompt: 'supervisor',
  categorizerPrompt: 'categorizer',
  pricingPrompt: 'pricing',
  searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
  skipSearch: true,
  transcriptWriter: null
} as const;

// Full target for shopware decision — TargetSchema.partial({ Artikel_Nummer: true }) preserves strict mode
const buildDecisionTarget = () => ({
  Artikelbeschreibung: 'Updated description',
  Verkaufspreis: 175,
  Kurzbeschreibung: 'Short text',
  Langtext: '',
  Hersteller: 'Acme',
  Länge_mm: 10,
  Breite_mm: 20,
  Höhe_mm: 30,
  Gewicht_kg: 2.5
});

describe('think tag parsing resilience', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('runExtractionAttempts parses output without think tag metadata', async () => {
    const llm: ChatModel = {
      invoke: jest.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION })
        .mockResolvedValueOnce({ content: 'PASS: ok' })
    };

    const result = await runExtractionAttempts({
      ...baseExtractionOptions,
      llm,
      target: buildTarget()
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ Artikelbeschreibung: 'Example description', Hersteller: 'Acme' });
    expect(result.supervisor.toLowerCase().startsWith('pass')).toBe(true);
  });

  test('runExtractionAttempts parses output when think tag is malformed', async () => {
    // Malformed closing tag (missing >) causes regex not to match; extractBalancedJsonSegment
    // finds the first { in the raw content and extracts the JSON segment from it.
    const malformedResponse = `<think>analysis incomplete</think ${VALID_EXTRACTION}`;
    const llm: ChatModel = {
      invoke: jest.fn()
        .mockResolvedValueOnce({ content: malformedResponse })
        .mockResolvedValueOnce({ content: 'PASS: ok' })
    };

    const result = await runExtractionAttempts({
      ...baseExtractionOptions,
      llm,
      target: buildTarget()
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ Hersteller: 'Acme' });
  });

  test('resolveShopwareMatch parses decision without think tag metadata', async () => {
    const decisionTarget = buildDecisionTarget();
    const decision = {
      isMatch: true,
      confidence: 0.9,
      matchedProductId: 'prod-1',
      target: decisionTarget
    };

    const llm: ChatModel = {
      invoke: jest.fn().mockResolvedValueOnce({ content: JSON.stringify(decision) })
    };

    const result = await resolveShopwareMatch({
      llm,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      searchTerm: 'widget',
      targetFormat: 'json',
      shopwarePrompt: 'prompt',
      shopwareResult: {
        text: 'result',
        products: [{ id: 'prod-1', url: 'https://example.com/product', name: 'Product 1' }]
      },
      normalizedTarget: buildTarget(),
      itemId: 'item-123'
    });

    expect(result).not.toBeNull();
    expect(result?.finalData).toMatchObject({ Artikelbeschreibung: 'Updated description', Verkaufspreis: 175 });
  });

  test('resolveShopwareMatch parses decision when think tag is malformed', async () => {
    const decisionTarget = buildDecisionTarget();
    const decision = {
      isMatch: true,
      confidence: 0.75,
      matchedProductId: 'prod-1',
      target: decisionTarget
    };
    // Malformed closing tag causes regex not to match; extractBalancedJsonSegment extracts JSON from first {
    const malformedContent = `<think>analysis incomplete</think ${JSON.stringify(decision)}`;

    const llm: ChatModel = {
      invoke: jest.fn().mockResolvedValueOnce({ content: malformedContent })
    };

    const result = await resolveShopwareMatch({
      llm,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      searchTerm: 'widget',
      targetFormat: 'json',
      shopwarePrompt: 'prompt',
      shopwareResult: {
        text: 'result',
        products: [{ id: 'prod-1', url: 'https://example.com/product', name: 'Product 1' }]
      },
      normalizedTarget: buildTarget(),
      itemId: 'item-123'
    });

    expect(result).not.toBeNull();
    expect(result?.finalData).toMatchObject({ Artikelbeschreibung: 'Updated description', Verkaufspreis: 175 });
  });
});
