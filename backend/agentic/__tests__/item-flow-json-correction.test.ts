// TODO(agent): Expand correction coverage for nested array payloads once fixtures are available.
import type { ChatModel } from '../flow/item-flow-extraction';
import type { AgenticTarget } from '../flow/item-flow-schemas';
import { runExtractionAttempts } from '../flow/item-flow-extraction';

// TODO(agent): Extend Langtext defaults once schema scaffolding captures additional structured hints.
const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: 'item-1',
  Artikelbeschreibung: 'Widget',
  Verkaufspreis: null,
  Kurzbeschreibung: 'Short description',
  Langtext: { Veröffentlicht: '', Stromversorgung: '' },
  Hersteller: 'Acme',
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
  Hauptkategorien_A: null,
  Unterkategorien_A: null,
  Hauptkategorien_B: null,
  Unterkategorien_B: null
});

describe('runExtractionAttempts JSON correction', () => {
  it('repairs invalid extractor JSON without altering payload fields', async () => {
    const target = buildTarget();
    const invalidExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":null,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":null,"Unterkategorien_A":null,"Hauptkategorien_B":null,' +
      '"Unterkategorien_B":null this is incomplete';
    const correctedExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":null,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":null,"Unterkategorien_A":null,"Hauptkategorien_B":null,' +
      '"Unterkategorien_B":null}';

    const responses = [
      { content: invalidExtraction },
      { content: '{}' },
      { content: 'pass' }
    ];
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
    expect(result.success).toBe(true);
    expect(result.data).toEqual(JSON.parse(correctedExtraction));
  });
});
