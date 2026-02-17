// TODO(agent): Expand correction coverage for nested array payloads once fixtures are available.
import type { ChatModel } from '../flow/item-flow-extraction';
import type { AgenticTarget } from '../flow/item-flow-schemas';
import { runExtractionAttempts } from '../flow/item-flow-extraction';

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

const asJsonBlock = (jsonText: string): string => `\`\`\`json\n${jsonText}\n\`\`\``;

describe('runExtractionAttempts JSON correction', () => {
  it('repairs invalid extractor JSON without altering payload fields', async () => {
    const target = buildTarget();
    const invalidExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null this is incomplete';
    const correctedExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null}';

    const responses = [{ content: asJsonBlock(invalidExtraction) }, { content: 'pass' }];
    const llm: ChatModel = { invoke: jest.fn(async () => responses.shift() ?? { content: '' }) };
    const correctionLlm: ChatModel = { invoke: jest.fn(async () => ({ content: correctedExtraction })) };

    const result = await runExtractionAttempts({
      llm,
      correctionModel: correctionLlm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 1,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
      target,
      reviewNotes: null,
      skipSearch: true,
      transcriptWriter: null
    });

    expect(correctionLlm.invoke).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(JSON.parse(correctedExtraction));
  });

  it('fails extraction when taxonomy fields are emitted by extraction output', async () => {
    const target = buildTarget();
    const extractionWithTaxonomy =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"langtext","Stromversorgung":"110V"},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1}';

    const responses = [{ content: asJsonBlock(extractionWithTaxonomy) }];
    const llm: ChatModel = { invoke: jest.fn(async () => responses.shift() ?? { content: '' }) };

    await expect(
      runExtractionAttempts({
        llm,
        logger: console,
        itemId: target.Artikel_Nummer,
        maxAttempts: 1,
        searchContexts: [],
        aggregatedSources: [],
        recordSources: jest.fn(),
        buildAggregatedSearchText: () => '',
        extractPrompt: 'extract',
        correctionPrompt: 'repair json',
        targetFormat: '{}',
        supervisorPrompt: 'supervisor',
        categorizerPrompt: 'categorizer',
        pricingPrompt: 'pricing',
        searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
        target,
        reviewNotes: null,
        skipSearch: true,
        transcriptWriter: null
      })
    ).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION_FAILED' });
  });

  it('does not let extraction supervision fail solely on downstream taxonomy requirements', async () => {
    const target = buildTarget();
    const extractionPayload =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"langtext","Stromversorgung":"110V"},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"requiresSecondCategory":true}';

    const responses = [{ content: asJsonBlock(extractionPayload) }, { content: 'pass' }];
    const llm: ChatModel = { invoke: jest.fn(async () => responses.shift() ?? { content: '' }) };

    const result = await runExtractionAttempts({
      llm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 1,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
      target,
      reviewNotes: null,
      skipSearch: true,
      transcriptWriter: null
    });

    expect(result.success).toBe(true);
  });
});
