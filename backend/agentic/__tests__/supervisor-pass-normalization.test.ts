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

const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: 'item-quoted-pass',
  Artikelbeschreibung: 'Widget 3000',
  Verkaufspreis: 199,
  Kurzbeschreibung: 'Compact widget',
  Langtext: '',
  Hersteller: 'Acme',
  Länge_mm: 10,
  Breite_mm: 20,
  Höhe_mm: 30,
  Gewicht_kg: 2.5
});

// Full extraction JSON matching AgentOutputSchema
const VALID_EXTRACTION = JSON.stringify({
  Artikel_Nummer: 'item-quoted-pass',
  Artikelbeschreibung: 'Widget 3000',
  Verkaufspreis: 199,
  Kurzbeschreibung: 'Compact widget',
  Langtext: '',
  Hersteller: 'Acme',
  Länge_mm: 10,
  Breite_mm: 20,
  Höhe_mm: 30,
  Gewicht_kg: 2.5
});

describe('runExtractionAttempts supervisor normalization', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('treats quoted PASS supervisor response as success', async () => {
    const llm: ChatModel = {
      invoke: jest.fn()
        .mockResolvedValueOnce({ content: VALID_EXTRACTION })
        .mockResolvedValueOnce({ content: '"PASS"' })
    };

    const result = await runExtractionAttempts({
      llm,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      itemId: 'item-quoted-pass',
      maxAttempts: 2,
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
      target: buildTarget(),
      skipSearch: true,
      transcriptWriter: null
    });

    expect(result.success).toBe(true);
    expect(result.supervisor).toBe('PASS');
  });
});
