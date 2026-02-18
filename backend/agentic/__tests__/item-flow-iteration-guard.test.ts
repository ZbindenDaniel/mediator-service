// TODO(agent): Extend iteration transition guard coverage once dispatcher handles partial-pass merges.
import type { ChatModel } from '../flow/item-flow-extraction';
import { runExtractionAttempts } from '../flow/item-flow-extraction';
import { AgentOutputSchema, TargetSchema, type AgenticTarget } from '../flow/item-flow-schemas';

jest.mock('../flow/item-flow-categorizer', () => ({
  runCategorizerStage: jest.fn(async () => ({}))
}));

jest.mock('../flow/item-flow-pricing', () => ({
  isUsablePrice: jest.fn(() => true),
  runPricingStage: jest.fn(async () => ({}))
}));

const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: 'item-1',
  Artikelbeschreibung: 'Widget',
  Verkaufspreis: 10,
  Kurzbeschreibung: 'Short description',
  Langtext: { Veröffentlicht: '', Stromversorgung: '' },
  Hersteller: 'Acme',
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
  Hauptkategorien_A: 1,
  Unterkategorien_A: 11,
  Hauptkategorien_B: 2,
  Unterkategorien_B: 22
});

describe('runExtractionAttempts iteration schema key guard', () => {
  it('preserves target schema keys across needs-more-search and completion transitions', async () => {
    const target = buildTarget();
    const extractionWithSearchRequest = JSON.stringify({
      ...target,
      __searchQueries: ['item-1 datasheet']
    });
    const extractionComplete = JSON.stringify(target);

    const responses = [
      { content: extractionWithSearchRequest },
      { content: extractionComplete },
      { content: 'pass' }
    ];

    const llm: ChatModel = {
      invoke: jest.fn(async () => responses.shift() ?? { content: 'pass' })
    };

    const result = await runExtractionAttempts({
      llm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 3,
      maxAgentSearchesPerRequest: 1,
      searchContexts: [{ query: 'initial', text: 'initial context', sources: [] }],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => 'initial context',
      extractPrompt: 'extract',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: 'extra context', sources: [] })),
      target,
      reviewNotes: null,
      skipSearch: false,
      transcriptWriter: null
    });

    expect(result.success).toBe(true);
    const schemaKeys = Object.keys(TargetSchema.shape).filter((key) => key !== 'reviewNotes');
    expect(schemaKeys.length).toBeGreaterThan(0);
    const extractionKeys = Object.keys(JSON.parse(extractionComplete));
    expect(extractionKeys.sort()).toEqual(schemaKeys.sort());
    expect(Object.keys(result.data).sort()).toEqual(schemaKeys.sort());
    expect(AgentOutputSchema.safeParse(result.data).success).toBe(true);
  });
});
