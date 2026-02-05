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

// TODO(agent): Extend Langtext defaults once schema scaffolding captures additional structured hints.
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
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22 this is incomplete';
    const correctedExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22}';

    const responses = [{ content: asJsonBlock(invalidExtraction) }, { content: 'pass' }];
    const llm: ChatModel = {
      invoke: jest.fn(async () => responses.shift() ?? { content: '' })
    };

    const correctionLlm: ChatModel = {
      invoke: jest.fn(async () => ({ content: correctedExtraction }))
    };

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
    const extractionMessages = (llm.invoke as jest.Mock).mock.calls[0]?.[0];
    const extractionPromptPreview = JSON.stringify(extractionMessages);
    expect(extractionPromptPreview).toContain('Spezifikationen');
    expect(extractionPromptPreview).not.toContain('\"Langtext\"');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(JSON.parse(correctedExtraction));
  });

  it('remaps Spezifikationen alias into Langtext before schema validation', async () => {
    const target = buildTarget();
    const extractionOnlyAlias =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Spezifikationen":{"Veröffentlicht":"ja","Stromversorgung":"230V"},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22}';

    const responses = [{ content: asJsonBlock(extractionOnlyAlias) }, { content: 'pass' }];
    const llm: ChatModel = {
      invoke: jest.fn(async () => responses.shift() ?? { content: '' })
    };
    const logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() };

    const result = await runExtractionAttempts({
      llm,
      logger,
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
    expect(result.data.Langtext).toEqual({ Veröffentlicht: 'ja', Stromversorgung: '230V' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'remapping Spezifikationen alias to Langtext before schema validation',
        itemId: target.Artikel_Nummer,
        attempt: 1
      })
    );
  });

  it('keeps Langtext when both Langtext and Spezifikationen are present', async () => {
    const target = buildTarget();
    const extractionBothKeys =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"langtext","Stromversorgung":"110V"},"Spezifikationen":{"Veröffentlicht":"alias","Stromversorgung":"230V"},' +
      '"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,' +
      '"Unterkategorien_A":11,"Hauptkategorien_B":2,"Unterkategorien_B":22}';

    const responses = [{ content: asJsonBlock(extractionBothKeys) }, { content: 'pass' }];
    const llm: ChatModel = {
      invoke: jest.fn(async () => responses.shift() ?? { content: '' })
    };

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
    expect(result.data.Langtext).toEqual({ Veröffentlicht: 'langtext', Stromversorgung: '110V' });
  });
});
